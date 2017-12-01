/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
use cgmath::{Vector4, Matrix4};
use cgmath::prelude::*;
use smallvec::SmallVec;

use arcane_gfx::Image;
use arcane_gfx::{stamp, blur};
use arcane_gfx::cubemap::CUBE_FACES;

const LOG_SIZE: usize = 6;
const SIZE: usize = 1 << LOG_SIZE;

static BLUR_KERNEL_SIGMA: f32 = 8.0;
static BLUR_KERNEL_RATIO: f32 = 2.0;

lazy_static! {
    static ref DELINEARIZE_TABLE: Vec<u8> = (0..65536).map(|i| {
        let norm = (i as f32) * (1.0 / 255.0 / 255.0);
        let srgb = if norm < 0.0031308 {
            norm * 12.92
        } else {
            1.055 * norm.powf(0.41666) - 0.055
        };
        (srgb * 255.0).min(255.0) as u8
    }).collect();

    static ref BLUR_KERNEL: Vec<f32> = blur::gaussian_kernel(
        (BLUR_KERNEL_SIGMA * BLUR_KERNEL_RATIO) as usize,
        BLUR_KERNEL_SIGMA
    );

    static ref BLUR_TABLE: Vec<(f32, usize)> = {
        let mut last_variance = 0.0;
        (0..5u8).map(|i| {
            let size = SIZE >> i;
            let sigma = (i as f32 - 4.0).exp2();

            // The amount of blur applied on this stage
            let res_sigma = (sigma * sigma - last_variance).sqrt();
            last_variance = sigma * sigma;

            // Upper bound of blur amount that can be applied by a single run of
            // `spherical_blur_phase(..., {0, 1, 2}, ...)`
            let sigma_limit = 0.5 / BLUR_KERNEL_RATIO;
            let num_passes = (res_sigma * res_sigma / (sigma_limit * sigma_limit)).ceil();

            let level_sigma = (res_sigma * res_sigma / num_passes).sqrt() *
                size as f32 / BLUR_KERNEL_SIGMA;

            (level_sigma, num_passes as usize)
        }).collect()
    };
}

pub struct Context {
    /// Captured environmental image.
    raw_cube: Vec<Image<Vec<Vector4<f32>>>>,

    /// Processed (or intermediate) environmental cube map image in the RGB + weight format.
    env_cube_levels: Vec<Vec<Image<Vec<Vector4<f32>>>>>,

    /// Processed environmental cube map image, converted to the target format.
    converted_cube_levels: Vec<Vec<Image<Vec<Vector4<u8>>>>>,

    /// Temporary storage
    temp1: Vec<Vec<Vector4<f32>>>,
    temp2: Vec<Vec<Vector4<f32>>>,
}

impl Context {
    pub fn new() -> Self {
        Context {
            raw_cube: (0..6)
                .map(|_| {
                    Image {
                        data: vec![Vector4::zero(); SIZE * SIZE],
                        width: SIZE,
                        height: SIZE,
                    }
                })
                .collect(),
            env_cube_levels: (0..LOG_SIZE + 1)
                .map(|lod| {
                    let size = SIZE >> lod;
                    (0..6)
                        .map(|_| {
                            Image {
                                data: vec![Vector4::zero(); size * size],
                                width: size,
                                height: size,
                            }
                        })
                        .collect()
                })
                .collect(),
            converted_cube_levels: (0..LOG_SIZE + 1)
                .map(|lod| {
                    let size = SIZE >> lod;
                    (0..6)
                        .map(|_| {
                            Image {
                                data: vec![Vector4::zero(); size * size],
                                width: size,
                                height: size,
                            }
                        })
                        .collect()
                })
                .collect(),
            temp1: (0..6).map(|_| vec![Vector4::zero(); SIZE * SIZE]).collect(),
            temp2: (0..6).map(|_| vec![Vector4::zero(); SIZE * SIZE]).collect(),
        }
    }

    pub fn image_size(&self) -> usize {
        SIZE
    }

    pub fn stamp(&mut self, image: &Image<&[Vector4<u8>]>, camera_matrix: Matrix4<f32>) {
        for (i, env_image) in self.raw_cube.iter_mut().enumerate() {
            let face_inv_view_proj_mat = CUBE_FACES[i].info().inv_view_proj_mat;
            stamp::stamp_camera_image(
                &mut env_image.as_mut(),
                face_inv_view_proj_mat,
                image,
                camera_matrix,
            );
        }
    }

    pub fn process(&mut self) {
        let ref mut env_cube_levels = self.env_cube_levels;
        let ref mut raw_cube = self.raw_cube;
        let ref mut temp1 = self.temp1;
        let ref mut temp2 = self.temp2;

        // Fill the base mip level
        for (src_face, dst_face) in raw_cube.iter().zip(env_cube_levels[0].iter_mut()) {
            for (src, dst) in src_face.data.iter().zip(dst_face.data.iter_mut()) {
                *dst = *src;
            }
        }

        fn downsample_2x(dst: &mut [Vector4<f32>], src: &[Vector4<f32>], size: usize) {
            for y in 0..size {
                let src1 = &src[(y * 2) * (size * 2)..][0..size * 2];
                let src2 = &src[(y * 2 + 1) * (size * 2)..][0..size * 2];
                for (x, d) in dst[y * size..][0..size].iter_mut().enumerate() {
                    *d = (src1[x * 2] + src1[x * 2 + 1] + src2[x * 2] + src2[x * 2 + 1]) * 0.25;
                }
            }
        }

        fn upsample_fill_hole_2x(dst: &mut [Vector4<f32>], src: &[Vector4<f32>], size: usize) {
            for y in 0..size {
                let dst12 = &mut dst[(y * 2) * (size * 2)..][0..size * 4];
                let (dst1, dst2) = dst12.split_at_mut(size * 2);
                for (x, &s) in src[y * size..][0..size].iter().enumerate() {
                    {
                        let w = dst1[x * 2].w;
                        dst1[x * 2] += s * (1.0 - w);
                    }
                    {
                        let w = dst1[x * 2 + 1].w;
                        dst1[x * 2 + 1] += s * (1.0 - w);
                    }
                    {
                        let w = dst2[x * 2].w;
                        dst2[x * 2] += s * (1.0 - w);
                    }
                    {
                        let w = dst2[x * 2 + 1].w;
                        dst2[x * 2 + 1] += s * (1.0 - w);
                    }
                }
            }
        }

        // Generate mip levels
        let kernel = &BLUR_KERNEL[..];
        for (i, &(kernel_scale, num_passes)) in BLUR_TABLE.iter().enumerate() {
            let size = SIZE >> i;
            if i > 0 {
                let (prev, cur) = env_cube_levels[i - 1..i + 1].split_first_mut().unwrap();
                for (src_face, dst_face) in prev.iter().zip(cur[0].iter_mut()) {
                    downsample_2x(&mut dst_face.data, &src_face.data, size);
                }
            }

            let ref mut cur = env_cube_levels[i];
            for _ in 0..num_passes {
                blur::spherical_blur_phase(
                    temp1
                        .iter_mut()
                        .map(Vec::as_mut_slice)
                        .collect::<SmallVec<[_; 6]>>()
                        .as_mut_slice(),
                    cur.iter()
                        .map(|face| &face.data[..])
                        .collect::<SmallVec<[_; 6]>>()
                        .as_slice(),
                    size,
                    kernel,
                    kernel_scale,
                    0,
                    blur::StandardCubeMapTrait,
                );

                blur::spherical_blur_phase(
                    temp2
                        .iter_mut()
                        .map(Vec::as_mut_slice)
                        .collect::<SmallVec<[_; 6]>>()
                        .as_mut_slice(),
                    temp1
                        .iter()
                        .map(Vec::as_slice)
                        .collect::<SmallVec<[_; 6]>>()
                        .as_slice(),
                    size,
                    kernel,
                    kernel_scale,
                    1,
                    blur::StandardCubeMapTrait,
                );

                blur::spherical_blur_phase(
                    cur.iter_mut()
                        .map(|face| &mut face.data[..])
                        .collect::<SmallVec<[_; 6]>>()
                        .as_mut_slice(),
                    temp2
                        .iter()
                        .map(Vec::as_slice)
                        .collect::<SmallVec<[_; 6]>>()
                        .as_slice(),
                    size,
                    kernel,
                    kernel_scale,
                    2,
                    blur::StandardCubeMapTrait,
                );
            }
        }

        // Fill in the holes
        for i in (1..BLUR_TABLE.len()).rev() {
            let size = SIZE >> i;
            let (prev, cur) = env_cube_levels[i - 1..i + 1].split_first_mut().unwrap();
            for (src_face, dst_face) in cur[0].iter_mut().zip(prev.iter_mut()) {
                upsample_fill_hole_2x(&mut dst_face.data, &src_face.data, size);
            }
        }

        // Convert to the target image format
        let table = &DELINEARIZE_TABLE[0..0x10000];
        for (src_level, dst_level) in
            env_cube_levels[0..BLUR_TABLE.len()].iter().zip(
                self.converted_cube_levels.iter_mut(),
            )
        {
            for (src_face, dst_face) in src_level.iter().zip(dst_level.iter_mut()) {
                for (src, dst) in src_face.data.iter().zip(dst_face.data.iter_mut()) {
                    let mut src = *src;
                    src *= 1.0 / (src.w + 1.0e-10);
                    *dst = Vector4::new(
                        table[(src.x as usize) & 0xffff],
                        table[(src.y as usize) & 0xffff],
                        table[(src.z as usize) & 0xffff],
                        255,
                    );
                }
            }
        }
    }

    pub fn output_image(&self, mip_level: usize, cube_face: usize) -> Image<&[Vector4<u8>]> {
        self.converted_cube_levels[mip_level][cube_face].as_ref()
    }
}
