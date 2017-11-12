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
