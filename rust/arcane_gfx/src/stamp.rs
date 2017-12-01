/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
use cgmath::{vec4, Vector4, Matrix4};
use Image;

pub fn stamp_camera_image(
    dst_image: &mut Image<&mut [Vector4<f32>]>,
    dst_inv_view_proj_mat: Matrix4<f32>,
    src_image: &Image<&[Vector4<u8>]>,
    src_view_proj_mat: Matrix4<f32>,
) {
    assert!(dst_image.data.len() >= dst_image.width * dst_image.height);
    assert!(src_image.data.len() >= src_image.width * src_image.height);

    let m = src_view_proj_mat * dst_inv_view_proj_mat;
    let v_base = m * vec4(0.0, 0.0, 1.0, 1.0);
    let v_u = m * vec4(1.0, 0.0, 0.0, 0.0);
    let v_v = m * vec4(0.0, 1.0, 0.0, 0.0);

    let src_width = src_image.width;
    let src_height = src_image.height;
    let src_data = &src_image.data[0..src_width * src_height];

    let dst_width = dst_image.width;
    let dst_height = dst_image.height;
    let dst_data = &mut dst_image.data[0..dst_width * dst_height];

    for y in 0..dst_image.height {
        // The Y coordinate in the dstination image's clip space
        let cs1_y = (y as f32 + 0.5) * (2.0 / dst_height as f32) - 1.0;

        let line1 = v_base - v_u + v_v * cs1_y;
        let line2 = v_base + v_u + v_v * cs1_y;

        if line1.w <= 0.0 && line2.w <= 0.0 {
            // Cull the scanline
            continue;
        }

        let mut cs2 = line1;
        let dcs2 = (line2 - line1) * (1.0 / dst_width as f32);
        cs2 += dcs2 * 0.5;

        let out_line = &mut dst_data[y * dst_width..(y + 1) * dst_width];

        for x in 0..dst_width {
            if cs2.w > 0.0 && cs2.x.abs() < cs2.w && cs2.y.abs() < cs2.w {
                // Perform perspective division & map them to the source image's viewport space
                let rcp_w = 1.0 / cs2.w;
                let vp_x = ((cs2.x * rcp_w + 1.0) * (0.5 * src_width as f32)) as usize;
                let vp_y = ((cs2.y * rcp_w + 1.0) * (0.5 * src_height as f32)) as usize;

                // Flip the Y coordinate
                let vp_y = (src_height - 1).wrapping_sub(vp_y);

                if let Some(src) = src_data.get(vp_x + vp_y * src_width) {
                    let mut pixel = src.cast::<u32>();
                    pixel.x *= pixel.x;
                    pixel.y *= pixel.y;
                    pixel.z *= pixel.z;
                    pixel.w = 1;
                    out_line[x] = pixel.cast();
                }
            }
            cs2 += dcs2;
        }
    }
}
