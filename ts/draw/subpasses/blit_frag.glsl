/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global u_Lod
#pragma global inputTexture

// varyings
#pragma global v_TexCoord

varying highp vec2 v_TexCoord;
uniform highp float u_Lod;

void main() {
    gl_FragColor = texture2DLodEXT(inputTexture, v_TexCoord, u_Lod);
}