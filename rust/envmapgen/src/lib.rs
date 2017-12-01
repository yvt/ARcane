/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
#![feature(allocator_api)]

extern crate cgmath;
#[macro_use]
extern crate lazy_static;
extern crate arcane_gfx;

mod context;

use std::heap::{Heap, Alloc, Layout};
use std::{ptr, mem};
use cgmath::{Vector4, Matrix4};

use arcane_gfx::Image;

use context::Context;

#[no_mangle]
pub unsafe fn emg_malloc(size: usize) -> *mut u8 {
    let layout = Layout::from_size_align(size + mem::size_of::<Layout>(), 4).unwrap();
    let p = Heap.alloc(layout.clone()).unwrap();
    ptr::write(p as *mut Layout, layout);
    for i in 0..size / 4 {
        ptr::write(
            p.offset(mem::size_of::<Layout>() as isize + (i * 4) as isize) as *mut u32,
            0xdeadbeef,
        );
    }
    p.offset(mem::size_of::<Layout>() as isize)
}

#[no_mangle]
pub unsafe fn emg_free(p: *mut u8) {
    let p = p.offset(-(mem::size_of::<Layout>() as isize));
    let layout = ptr::read(p as *mut _);
    Heap.dealloc(p, layout);
}

#[no_mangle]
pub unsafe fn emg_context_new() -> *mut Context {
    Box::into_raw(Box::new(Context::new()))
}

#[no_mangle]
pub unsafe fn emg_context_destroy(this: *mut Context) {
    Box::from_raw(this);
}

#[no_mangle]
pub unsafe fn emg_context_stamp(
    this: *mut Context,
    image: *const Vector4<u8>,
    width: usize,
    height: usize,
    camera_matrix: *const Matrix4<f32>,
) {
    use std::slice::from_raw_parts;

    let context: &mut Context = &mut *this;
    context.stamp(
        &Image {
            data: from_raw_parts(image, width * height),
            width,
            height,
        },
        *camera_matrix,
    );
}

#[no_mangle]
pub unsafe fn emg_context_get_image_size(this: *mut Context) -> usize {
    let context: &Context = &*this;
    context.image_size()
}

#[no_mangle]
pub unsafe fn emg_context_process(this: *mut Context) {
    let context: &mut Context = &mut *this;
    context.process()
}

#[no_mangle]
pub unsafe fn emg_context_get_output_image_data(
    this: *mut Context,
    mip_level: usize,
    cube_face: usize,
) -> *const Vector4<u8> {
    let context: &Context = &*this;
    context.output_image(mip_level, cube_face).data.as_ptr()
}
