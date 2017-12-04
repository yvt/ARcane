/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

//
// # U14-on-FP16 format
//
// This format encodes an integer in the range [0, 16383] using a half precision
// floating point value.
//
//  | Value | Encoded  | Binary Representation |
//  | ----- | -------- | --------------------- |
//  |     0 |        1 | 0 01111 0000000000    |
//  | 16383 |    65504 | 0 11110 1111111111    |
//
#pragma global u14fp16Encode
mediump float u14fp16Encode(highp float x)
{
    highp float lowPart  = fract(x / 1024.0);
    highp float highPart = floor(x / 1024.0);
    return exp2(highPart) * (lowPart + 1.0);
}

#pragma global u14fp16Decode
highp float u14fp16Decode(highp float x)
{
    highp float highPart = floor(log2(x));
    x /= exp2(highPart);
    highp float lowPart = x - 1.0;
    return (lowPart + highPart) * 1024.0;
}

//
// # Cube face encoding
//
// This format encodes one of cube faces in a way that the value can be easily
// converted to the actual normal vector without a presence of dynamic indexing
// support. (Actually, it is faster than using a face index and an array on
// PowerVR Rogue)
//
//  | Index | Normal     | Encoded |
//  | ----- | ---------- | ------- |
//  |     0 | (+1, 0, 0) |       1 |
//  |     1 | (-1, 0, 0) |      -1 |
//  |     2 | (0, +1, 0) |       2 |
//  |     3 | (0, -1, 0) |      -2 |
//  |     4 | (0, 0, +1) |       3 |
//  |     5 | (0, 0, -1) |      -3 |
//
#pragma global cubeFaceFromIndex
mediump float cubeFaceFromIndex(mediump float x)
{
    mediump float axis = floor(x * 0.5);
    mediump float sgn = 1.0 - fract(x * 0.5) * 4.0;
    return sgn * (axis + 1.0);
}

#pragma global cubeFaceToNormal
mediump vec3 cubeFaceToNormal(mediump float x)
{
    mediump float sgn = clamp(x, 0.0, 1.0) * 2.0 - 1.0;

    // -1 for pos-/neg-z, 0 for pos-/neg-y, 1 for pos-/neg-x
    mediump float t = 2.0 - abs(x);

    return vec3(
        clamp(t, 0.0, 1.0),
        (1.0 - abs(t)),
        clamp(-t, 0.0, 1.0)
    ) * sgn;
}
