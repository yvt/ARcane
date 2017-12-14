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

use cubemaputils;

const LOG_SIZE: usize = 6;
const SIZE: usize = 1 << LOG_SIZE;

lazy_static! {
    static ref BLUR_SETUP: cubemaputils::MipPyramidGenSetup =
        cubemaputils::MipPyramidGenParams {
            kernel_resolution: 4.0,
            kernel_width: 2.0,
            log2_min_sigma: -5.0,
            num_levels: 5,
            size: SIZE,
            high_quality: false,
        }.setup();
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

        // Generate mip levels
        let kernel = &BLUR_SETUP.kernel[..];
        for (i, &(kernel_scale, num_passes)) in BLUR_SETUP.levels.iter().enumerate() {
            let size = SIZE >> i;
            if i > 0 {
                let (prev, cur) = env_cube_levels[i - 1..i + 1].split_first_mut().unwrap();
                for (src_face, dst_face) in prev.iter().zip(cur[0].iter_mut()) {
                    cubemaputils::downsample_2x(&mut dst_face.data, &src_face.data, size);
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
        for i in (1..BLUR_SETUP.levels.len()).rev() {
            let size = SIZE >> i;
            let (prev, cur) = env_cube_levels[i - 1..i + 1].split_first_mut().unwrap();
            for (src_face, dst_face) in cur[0].iter_mut().zip(prev.iter_mut()) {
                cubemaputils::upsample_fill_hole_2x(&mut dst_face.data, &src_face.data, size);
            }
        }

        // Convert to the target image format
        let table = &cubemaputils::DELINEARIZE_TABLE[0..0x10000];
        for (src_level, dst_level) in
            env_cube_levels[0..BLUR_SETUP.levels.len()].iter().zip(
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
