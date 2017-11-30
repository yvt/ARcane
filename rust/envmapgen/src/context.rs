/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
use cgmath::{Vector4, Matrix4};
use cgmath::prelude::*;
use Image;
use stamp::stamp_camera_image;
use cubemap::CUBE_FACES;

const LOG_SIZE: usize = 8;
const SIZE: usize = 1 << LOG_SIZE;

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
}

pub struct Context {
    /// Captured environmental image.
    raw_cube: Vec<Image<Vec<Vector4<f32>>>>,

    /// Processed (or intermediate) environmental cube map image in the RGB + weight format.
    env_cube_levels: Vec<Vec<Image<Vec<Vector4<f32>>>>>,

    /// Processed environmental cube map image, converted to the target format.
    converted_cube_levels: Vec<Vec<Image<Vec<Vector4<u8>>>>>,
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
        }
    }

    pub fn image_size(&self) -> usize {
        SIZE
    }

    pub fn stamp(&mut self, image: &Image<&[Vector4<u8>]>, camera_matrix: Matrix4<f32>) {
        for (i, env_image) in self.raw_cube.iter_mut().enumerate() {
            let face_inv_view_proj_mat = CUBE_FACES[i].info().inv_view_proj_mat;
            stamp_camera_image(
                &mut env_image.as_mut(),
                face_inv_view_proj_mat,
                image,
                camera_matrix,
            );
        }
    }

    pub fn process(&mut self) {
        // Fill the base mip level
        for (src_face, dst_face) in self.raw_cube.iter().zip(self.env_cube_levels[0].iter_mut()) {
            for (src, dst) in src_face.data.iter().zip(dst_face.data.iter_mut()) {
                *dst = *src;
            }
        }

        // TODO: generate mip levels

        // Convert to the target image format
        let table = &DELINEARIZE_TABLE[0..0x10000];
        for (src_level, dst_level) in
            self.env_cube_levels.iter().zip(
                self.converted_cube_levels
                    .iter_mut(),
            )
        {
            for (src_face, dst_face) in src_level.iter().zip(dst_level.iter_mut()) {
                for (src, dst) in src_face.data.iter().zip(dst_face.data.iter_mut()) {
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
