/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
use cgmath::{Vector3, Matrix4};
use cgmath::num_traits::NumCast;
use cgmath::prelude::*;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum CubeFace {
    PositiveX = 0,
    NegativeX = 1,
    PositiveY = 2,
    NegativeY = 3,
    PositiveZ = 4,
    NegativeZ = 5,
}

pub static CUBE_FACES: [CubeFace; 6] = [
    CubeFace::PositiveX,
    CubeFace::NegativeX,
    CubeFace::PositiveY,
    CubeFace::NegativeY,
    CubeFace::PositiveZ,
    CubeFace::NegativeZ,
];

impl CubeFace {
    pub fn u_vec<T: NumCast>(&self) -> Vector3<T> {
        match self {
            &CubeFace::PositiveX => Vector3::new(0, 0, -1),
            &CubeFace::NegativeX => Vector3::new(0, 0, 1),
            &CubeFace::PositiveY => Vector3::new(1, 0, 0),
            &CubeFace::NegativeY => Vector3::new(1, 0, 0),
            &CubeFace::PositiveZ => Vector3::new(1, 0, 0),
            &CubeFace::NegativeZ => Vector3::new(-1, 0, 0),
        }.cast()
    }

    pub fn v_vec<T: NumCast>(&self) -> Vector3<T> {
        match self {
            &CubeFace::PositiveX => Vector3::new(0, -1, 0),
            &CubeFace::NegativeX => Vector3::new(0, -1, 0),
            &CubeFace::PositiveY => Vector3::new(0, 0, 1),
            &CubeFace::NegativeY => Vector3::new(0, 0, -1),
            &CubeFace::PositiveZ => Vector3::new(0, -1, 0),
            &CubeFace::NegativeZ => Vector3::new(0, -1, 0),
        }.cast()
    }

    pub fn normal<T: NumCast>(&self) -> Vector3<T> {
        match self {
            &CubeFace::PositiveX => Vector3::new(1, 0, 0),
            &CubeFace::NegativeX => Vector3::new(-1, 0, 0),
            &CubeFace::PositiveY => Vector3::new(0, 1, 0),
            &CubeFace::NegativeY => Vector3::new(0, -1, 0),
            &CubeFace::PositiveZ => Vector3::new(0, 0, 1),
            &CubeFace::NegativeZ => Vector3::new(0, 0, -1),
        }.cast()
    }

    pub fn info(&self) -> &'static CubeFaceInfo {
        &CUBE_FACE_INFOS[*self as usize]
    }
}

pub struct CubeFaceInfo {
    pub view_proj_mat: Matrix4<f32>,
    pub inv_view_proj_mat: Matrix4<f32>,
}

lazy_static! {
    pub static ref CUBE_FACE_INFOS: Vec<CubeFaceInfo> = CUBE_FACES.iter()
        .map(|face| {
            let u = face.u_vec();
            let v = face.v_vec();
            let n = face.normal();
            let view_proj_mat = Matrix4::new(
                u[0], v[0], 0.0, n[0],
                u[1], v[1], 0.0, n[1],
                u[2], v[2], 0.0, n[2],
                0.0, 0.0, 1.0, 0.0,
            );
            let inv_view_proj_mat = view_proj_mat.invert().unwrap();
            CubeFaceInfo {
                view_proj_mat,
                inv_view_proj_mat,
            }
        })
        .collect();
}
