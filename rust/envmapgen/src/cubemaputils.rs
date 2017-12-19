/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
use cgmath::Vector4;
use hyperenvmap::ltasgblur;

lazy_static! {
    pub static ref DELINEARIZE_TABLE: Vec<u8> = (0..65536).map(|i| {
        let norm = (i as f32) * (1.0 / 255.0 / 255.0);
        let srgb = if norm < 0.0031308 {
            norm * 12.92
        } else {
            1.055 * norm.powf(0.41666) - 0.055
        };
        (srgb * 255.0).min(255.0) as u8
    }).collect();
}

pub fn downsample_2x(dst: &mut [Vector4<f32>], src: &[Vector4<f32>], size: usize) {
    for y in 0..size {
        let src1 = &src[(y * 2) * (size * 2)..][0..size * 2];
        let src2 = &src[(y * 2 + 1) * (size * 2)..][0..size * 2];
        for (x, d) in dst[y * size..][0..size].iter_mut().enumerate() {
            *d = (src1[x * 2] + src1[x * 2 + 1] + src2[x * 2] + src2[x * 2 + 1]) * 0.25;
        }
    }
}

pub fn upsample_fill_hole_2x(dst: &mut [Vector4<f32>], src: &[Vector4<f32>], size: usize) {
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

pub struct MipPyramidGenParams {
    /// Specifies the resolution of the Gaussian kernel by the number of pixels
    /// contained in an interval `[0, ±σ]` of the corresponding Gaussian
    /// distribution.
    pub kernel_resolution: f32,

    /// Specifies the size of the Gaussian kernel by the ratio to the σ value.
    pub kernel_width: f32,

    /// Specifies the base 2 logarithm of the minimum (base mip level) σ value.
    pub log2_min_sigma: f32,

    pub high_quality: bool,

    pub num_levels: usize,

    pub size: usize,
}

pub struct MipPyramidGenSetup {
    pub kernel: Vec<f32>,
    pub levels: Vec<(f32, usize)>,
}

impl MipPyramidGenParams {
    pub fn setup(&self) -> MipPyramidGenSetup {
        let kernel = ltasgblur::gaussian_kernel(
            (self.kernel_resolution * self.kernel_width) as usize,
            self.kernel_resolution,
        );
        let mut last_variance = 0.0;
        let levels = (0..self.num_levels)
            .map(|i| {
                let size = self.size >> i;
                let sigma = (i as f32 + self.log2_min_sigma).exp2();

                // The amount of blur applied on this stage
                let res_sigma = (sigma * sigma - last_variance).sqrt();
                last_variance = sigma * sigma;

                // Upper bound of blur amount that can be applied by a single run of
                // `spherical_blur_phase(..., {0, 1, 2}, ...)`
                let sigma_limit = 0.5 / self.kernel_width;
                let mut num_passes = (res_sigma * res_sigma / (sigma_limit * sigma_limit))
                    .ceil() as usize;

                let level_sigma = (res_sigma * res_sigma / num_passes as f32).sqrt() *
                    size as f32 / self.kernel_resolution;

                if self.high_quality && num_passes == 1 {
                    num_passes = 2;
                }

                (level_sigma, num_passes)
            })
            .collect();
        MipPyramidGenSetup { kernel, levels }
    }
}
