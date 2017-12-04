/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global u_ReprojectionMatrix

// varyings
#pragma global v_TexCoord
#pragma global v_CS2Base

// imports
#pragma global g1Texture
#pragma global inputTexture

varying highp vec2 v_TexCoord;
varying highp vec4 v_CS2Base;

uniform highp mat4 u_ReprojectionMatrix;

void main() {
    // Fetch the Z value from GBuffer 1
    mediump vec4 g1 = texture2D(g1Texture, v_TexCoord);
    mediump float cs1_depth = g1.x;

    // Reproject the point
    highp vec4 cs2 = v_CS2Base + u_ReprojectionMatrix * vec4(0.0, 0.0, cs1_depth, 1.0);

    cs2.xy = cs2.xy + cs2.w * 0.5;

    // Output the projected color value
    gl_FragColor = texture2DProj(inputTexture, cs2.xyw);
}

