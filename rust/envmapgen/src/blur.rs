/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
use std::mem::{uninitialized, swap};
use std::slice::from_raw_parts_mut;

use cgmath::Vector4;
use smallvec::SmallVec;
use hyperenvmap::ltasgblur;

use cubemaputils;

const NUM_LEVELS: usize = 5;

pub unsafe fn apply_spherical_blur(size: usize, mut images: *mut Vector4<u8>) {
    // Extract each level/face as a slice
    let mut image_levels = (0..NUM_LEVELS)
        .map(|level| {
            let level_size = size >> level;
            assert_ne!(level_size, 0);

            (0..6)
                .map(|_| {
                    let slice = from_raw_parts_mut(images, level_size * level_size);
                    images = images.offset((level_size * level_size) as isize);
                    slice
                })
                .collect::<SmallVec<[_; 6]>>()
        })
        .collect::<SmallVec<[_; NUM_LEVELS]>>();

    // Convert `SV<SV<&mut[T]>>` to `SV<&mut[&mut[T]]>`
    let mut image_levels = image_levels
        .iter_mut()
        .map(SmallVec::as_mut_slice)
        .collect::<SmallVec<[_; 6]>>();

    apply_spherical_blur_inner(size, image_levels.as_mut_slice())
}

fn apply_spherical_blur_inner(size: usize, image_levels: &mut [&mut [&mut [Vector4<u8>]]]) {
    // Allocate the temporary buffers (for each cube face)
    let mut tmp_buf1 = (0..6)
        .map(|_| {
            vec![unsafe { uninitialized::<Vector4<f32>>() }; size * size]
        })
        .collect::<SmallVec<[_; 6]>>();
    let mut tmp_buf2 = (0..6)
        .map(|_| {
            vec![unsafe { uninitialized::<Vector4<f32>>() }; size * size]
        })
        .collect::<SmallVec<[_; 6]>>();
    let mut tmp_buf1 = &mut tmp_buf1;
    let mut tmp_buf2 = &mut tmp_buf2;

    // Generate a blur kernel
    // This fucntion is used for the one-time generation of the environmental
    // cube map, so we can turn up the quality a little bit
    let params = cubemaputils::MipPyramidGenParams {
        kernel_resolution: 4.0,
        kernel_width: 2.0,
        log2_min_sigma: -5.0,
        num_levels: NUM_LEVELS,
        size,
        high_quality: true,
    };
    let setup = params.setup();

    // FIXME: disregard the alpha channel? But that'll inhibit SIMD optimization
    // planned in the future?

    // Fill the first level
    for (in_image, out_image) in image_levels[0].iter().zip(tmp_buf1.iter_mut()) {
        for (x, y) in in_image.iter().zip(out_image.iter_mut()) {
            let mut pixel = x.cast::<f32>();
            pixel.x *= pixel.x;
            pixel.y *= pixel.y;
            pixel.z *= pixel.z;
            *y = pixel;
        }
    }

    // Generate each mip level
    let kernel = &setup.kernel[..];
    for ((i, &(kernel_scale, num_passes)), out_level) in
        setup.levels.iter().enumerate().zip(image_levels.iter_mut())
    {
        let size = size >> i;
        if i > 0 {
            {
                for (src_face, mut dst_face) in tmp_buf1.iter().zip(tmp_buf2.iter_mut()) {
                    cubemaputils::downsample_2x(&mut dst_face, &src_face, size);
                }
            }
            swap(&mut tmp_buf1, &mut tmp_buf2);
        }

        for _ in 0..num_passes {
            for phase in 0..3 {
                ltasgblur::ltasg_single(
                    tmp_buf2
                        .iter_mut()
                        .map(Vec::as_mut_slice)
                        .collect::<SmallVec<[_; 6]>>()
                        .as_mut_slice(),
                    tmp_buf1
                        .iter()
                        .map(|face| &face[..])
                        .collect::<SmallVec<[_; 6]>>()
                        .as_slice(),
                    size,
                    kernel,
                    kernel_scale,
                    phase,
                    ltasgblur::StandardCubeMapTrait,
                );
                swap(&mut tmp_buf1, &mut tmp_buf2);
            }
        }

        // Convert to the target image format
        let table = &cubemaputils::DELINEARIZE_TABLE[0..0x10000];

        for (out_image, in_image) in out_level.iter_mut().zip(tmp_buf1.iter()) {
            for (x, y) in in_image.iter().zip(out_image.iter_mut()) {
                let src = *x;
                *y = Vector4::new(
                    table[(src.x as usize) & 0xffff],
                    table[(src.y as usize) & 0xffff],
                    table[(src.z as usize) & 0xffff],
                    255,
                );
            }
        }
    }
}
