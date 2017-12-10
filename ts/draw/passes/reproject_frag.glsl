/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global u_ReprojectionMatrix
#pragma global DILATE

// varyings
#pragma global v_TexCoord1
#pragma global v_TexCoord2
#pragma global v_CS2Base

// imports
#pragma global g1Texture
#pragma global inputTexture

varying highp vec2 v_TexCoord1;
varying highp vec4 v_TexCoord2;
varying highp vec4 v_CS2Base;

uniform highp mat4 u_ReprojectionMatrix;

void main() {
    // Fetch the Z value from GBuffer 1
    mediump vec4 g1 = texture2D(g1Texture, v_TexCoord1);
    mediump float cs1_depth = g1.x;

#if DILATE
    mediump float cs1_depth1 = texture2D(g1Texture, vec2(v_TexCoord1.x, v_TexCoord2.y)).x;
    mediump float cs1_depth2 = texture2D(g1Texture, vec2(v_TexCoord1.x, v_TexCoord2.w)).x;
    mediump float cs1_depth3 = texture2D(g1Texture, vec2(v_TexCoord2.x, v_TexCoord1.y)).x;
    mediump float cs1_depth4 = texture2D(g1Texture, vec2(v_TexCoord2.z, v_TexCoord1.y)).x;
    cs1_depth = max(cs1_depth, max(max(cs1_depth1, cs1_depth2), max(cs1_depth3, cs1_depth4)));
#endif

    // Reproject the point
    highp vec4 cs2 = v_CS2Base + u_ReprojectionMatrix * vec4(0.0, 0.0, cs1_depth, 0.0);

    cs2.xy = cs2.xy * 0.5 + cs2.w * 0.5;

    // Output the projected color value
    gl_FragColor = texture2DProj(inputTexture, cs2.xyw);
}

