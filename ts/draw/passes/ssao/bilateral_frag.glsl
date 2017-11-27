/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global u_TSSweepOffset  // uniform highp vec2

// varyings
#pragma global v_TexCoord       // varying highp vec2

// imports
#pragma global g1Texture        // (highp vec2) -> mediump vec4
#pragma global inputTexture     // (highp vec2) -> mediump vec4

// private
#pragma global minabs fetchZ

// code
uniform highp vec2 u_TSSweepOffset;

varying highp vec2 v_TexCoord;

/// Returns the value having the least absolute value.
mediump float minabs(mediump float a, mediump float b) {
    return abs(a) < abs(b) ? a : b;
}

/// Returns the clip space Z value at the specified UV coordinate.
mediump float fetchZ(highp vec2 coord) {
    return texture2D(g1Texture, coord).x;
}

void main() {
    highp vec2 ts_pos[8];
    mediump float cs_depths[8];

    // Fetch the Z values along a line
    for (lowp int i = 0; i < 8; ++i) {
        mediump float x = float(i - 4);
        ts_pos[i] = v_TexCoord + x * u_TSSweepOffset;
        cs_depths[i] = fetchZ(ts_pos[i]);
    }

    // Estimate the clip space gradient
    mediump float cs_dz_dx = minabs(cs_depths[5] - cs_depths[4], cs_depths[4] - cs_depths[3]);

    // Compute the result
    mediump vec2 sum = vec2(0.00000001);

    const mediump float depth_coef = 1.0;
    const mediump float position_coef = 0.2;

    for (lowp int i = 0; i < 8; ++i) {
        mediump float x = float(i - 4);
        mediump float cs_plane_depth = cs_depths[4] + x * cs_dz_dx;
        mediump float cs_depth = cs_depths[i];
        mediump float diff = (cs_plane_depth - cs_depth) * depth_coef;
        mediump float weight = exp2(-diff * diff - x * x * position_coef);
        mediump float color = texture2D(inputTexture, ts_pos[i]).x;
        sum += vec2(color, 1.0) * weight;
    }

    mediump float average = sum.x / sum.y;
    gl_FragColor.xyz = vec3(average);
    gl_FragColor.w = 1.0;
}
