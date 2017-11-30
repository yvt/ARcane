/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
#![feature(allocator_api)]

extern crate cgmath;
extern crate rand;

mod context;

use std::heap::{Heap, Alloc, Layout};
use std::{ptr, mem};
use context::Context;

#[no_mangle]
pub fn hello() -> u32 {
    use rand::Rng;
    rand::OsRng::new().unwrap().next_u32()
}

#[no_mangle]
pub unsafe fn emg_malloc(size: usize) -> *mut u8 {
    let layout = Layout::from_size_align(size + mem::size_of::<Layout>(), 4).unwrap();
    Heap.alloc(layout).unwrap()
}

#[no_mangle]
pub unsafe fn emg_free(p: *mut u8) {
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
