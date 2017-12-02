/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
#![feature(test)]
extern crate test;
extern crate arcane_gfx;
use arcane_gfx::blur;

fn run_single(b: &mut test::Bencher, size: usize, pass: usize) {
    let kernel = blur::gaussian_kernel(8, 4.0);
    let count = size * size;
    let src = vec![vec![0f32; count]; 6];
    let mut dst = vec![vec![0f32; count]; 6];
    b.iter(move || {
        blur::spherical_blur_phase(
            dst.iter_mut()
                .map(Vec::as_mut_slice)
                .collect::<Vec<_>>()
                .as_mut_slice(),
            src.iter().map(Vec::as_slice).collect::<Vec<_>>().as_slice(),
            size,
            &kernel,
            0.5,
            pass,
            blur::StandardCubeMapTrait,
        );
    })
}

#[bench]
fn blur1_16(b: &mut test::Bencher) {
    run_single(b, 16, 0)
}

#[bench]
fn blur1_32(b: &mut test::Bencher) {
    run_single(b, 32, 0)
}

#[bench]
fn blur1_64(b: &mut test::Bencher) {
    run_single(b, 64, 0)
}

#[bench]
fn blur1_128(b: &mut test::Bencher) {
    run_single(b, 128, 0)
}

#[bench]
fn blur2_16(b: &mut test::Bencher) {
    run_single(b, 16, 1)
}

#[bench]
fn blur2_32(b: &mut test::Bencher) {
    run_single(b, 32, 1)
}

#[bench]
fn blur2_64(b: &mut test::Bencher) {
    run_single(b, 64, 1)
}

#[bench]
fn blur2_128(b: &mut test::Bencher) {
    run_single(b, 128, 1)
}

#[bench]
fn blur3_16(b: &mut test::Bencher) {
    run_single(b, 16, 2)
}

#[bench]
fn blur3_32(b: &mut test::Bencher) {
    run_single(b, 32, 2)
}

#[bench]
fn blur3_64(b: &mut test::Bencher) {
    run_single(b, 64, 2)
}

#[bench]
fn blur3_128(b: &mut test::Bencher) {
    run_single(b, 128, 2)
}
