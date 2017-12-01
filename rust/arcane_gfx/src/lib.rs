/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
extern crate cgmath;
#[macro_use]
extern crate lazy_static;

pub mod blur;
pub mod cubemap;
pub mod stamp;

#[derive(Debug, Copy, Clone)]
pub struct Image<T> {
    pub data: T,
    pub width: usize,
    pub height: usize,
}

impl<T> Image<T> {
    pub fn as_ref<S: ?Sized>(&self) -> Image<&S>
    where
        T: AsRef<S>,
    {
        Image {
            data: self.data.as_ref(),
            width: self.width,
            height: self.height,
        }
    }

    pub fn as_mut<S: ?Sized>(&mut self) -> Image<&mut S>
    where
        T: AsMut<S>,
    {
        Image {
            data: self.data.as_mut(),
            width: self.width,
            height: self.height,
        }
    }
}
