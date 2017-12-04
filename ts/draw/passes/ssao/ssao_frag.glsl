/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global u_ProjMat                // uniform highp mat4
#pragma global u_InvProjMat             // uniform highp mat4
#pragma global u_TSPixelOffset          // uniform highp vec2
#pragma global u_TSSampleOffsetFactor   // uniform highp vec2

// varyings
#pragma global v_TexCoord               // varying highp vec2
#pragma global v_VSPosBase              // varying highp vec4
#pragma global v_DitherTexCoord         // varying highp vec4

// imports
#pragma global g1Texture        // (highp vec2) -> mediump vec4
#pragma global ditherTexture    // (highp vec2) -> mediump vec4
#pragma global colorTexture     // (highp vec2) -> mediump vec4
#pragma global complexMultiply  // (mediump vec2, mediump vec2) -> mediump vec2
#pragma global PI               // {float literal}

// private
#pragma global minabs fetchZ

// code
uniform highp mat4 u_ProjMat;
uniform highp mat4 u_InvProjMat;
uniform highp vec2 u_TSPixelOffset;
uniform mediump vec2 u_TSSampleOffsetFactor;

varying highp vec4 v_VSPosBase;
varying highp vec2 v_TexCoord;
varying highp vec4 v_DitherTexCoord;

/// Returns the value having the least absolute value.
mediump float minabs(mediump float a, mediump float b) {
    return abs(a) < abs(b) ? a : b;
}

/// Returns the clip space Z value at the specified UV coordinate.
mediump float fetchZ(highp vec2 coord) {
    return texture2D(g1Texture, coord).x;
}

void main() {
    // CS = clip space, VS = view space, TS = texture space
    // HC = homogeneous coordinates
    //
    // ## Surface normal estimation
    //
    // We estimate the surface normal using the depth information from the G
    // Buffer 1.
    //
    // First we compute the partial derivatives (or gradient) of the Z value on the
    // clip space. To make this work on the edges, we compute two derivative
    // values for each direction and choose the candidate having a smaller
    // absolute value. (Which is also why we do not use dFdx/dFdy here)
    mediump float cs_z1 = fetchZ(v_TexCoord);

    mediump float cs_z2 = fetchZ(v_TexCoord + u_TSPixelOffset * vec2(1.0, 0.0));
    mediump float cs_z3 = fetchZ(v_TexCoord - u_TSPixelOffset * vec2(1.0, 0.0));
    mediump float cs_dz_dx = minabs(cs_z2 - cs_z1, cs_z1 - cs_z3);

    mediump float cs_z4 = fetchZ(v_TexCoord + u_TSPixelOffset * vec2(0.0, 1.0));
    mediump float cs_z5 = fetchZ(v_TexCoord - u_TSPixelOffset * vec2(0.0, 1.0));
    mediump float cs_dz_dy = minabs(cs_z4 - cs_z1, cs_z1 - cs_z5);

    highp vec4 vs_pos_hc = v_VSPosBase + u_InvProjMat * vec4(0.0, 0.0, cs_z1, 0.0);
    mediump vec3 vs_pos = vs_pos_hc.xyz / vs_pos_hc.w;

    // There are two routes to derive the view-space surface normal from this
    // gradient value:
    //
    //   1. Compute the surface normal in the clip space, and then convert it to
    //      the view space directly.
    //   2. Derive tangent vectors from the gradient value, convert them to
    //      the view space, and then compute the surface normal.
    //
    // I chose the second option because the first option requires a calculation
    // of the Jacobian matrix of the transform represented by the inverse of the
    // projection matrix and the inverse matrix of that Jacobian matrix for
    // every fragment.
    //
    // First compute the tangent vectors in the clip space.
    // Use adequate scaling factors to make sure no underflow occurs during
    // the computation.
    mediump vec2 cs_pixel_offset = u_TSPixelOffset * 2.0;
    mediump vec3 cs_tan1 = vec3(1.0, 0.0, cs_dz_dx / cs_pixel_offset.x);
    mediump vec3 cs_tan2 = vec3(0.0, 1.0, cs_dz_dy / cs_pixel_offset.y);

    // And then transform them to the view space (with disregarding the
    // magnitude. See `Dealing with Homogeneous Coordinates.lyx` for the
    // derivation):
    mediump vec4 vs_tan1_tmp = u_InvProjMat * vec4(cs_tan1, 0.0);
    mediump vec3 vs_tan1 = vs_tan1_tmp.xyz - vs_pos * vs_tan1_tmp.w;

    mediump vec4 vs_tan2_tmp = u_InvProjMat * vec4(cs_tan2, 0.0);
    mediump vec3 vs_tan2 = vs_tan2_tmp.xyz - vs_pos * vs_tan2_tmp.w;

    // Finally, compute the surface normal using these tangent vectors.
    mediump vec3 vs_normal = normalize(cross(vs_tan1, vs_tan2));

    // ## Sampling pattern
    //
    // Use elements from the dithering matrix as the parameters for sampling
    // pattern generation. These values should be distributed uniformly over the
    // real interval [0, 1]. We use a dithering matrix instead of uniform noise
    // because of its lower local discrepancy.
    mediump float dither1 = texture2D(ditherTexture, v_DitherTexCoord.xy).x;
    mediump float dither2 = texture2D(ditherTexture, v_DitherTexCoord.zw).x;

    // The generalization of the sequence x[n+1] = x[n] * 1.3 + 1, x[0] = 1:
    //    10⁻ⁿ * 13ⁿ⁺¹ * 1/3 - 10/3
    // Derive the sample distance using n = dither1 + i (for i-th sample) so
    // n is spatially uniformly distributed over the real interval [0, N].
    //
    // I chose this sequence because each successive value can be derived just
    // by one FMA operation. Still, we have to evaluate the above expression
    // explicitly to obtain the first value (i = 0). We use a polynomial
    // approximation for that.
    mediump float sample_dist = 1.0 + dither1 * (1.13713 + dither1 * (0.147928 + dither1 * 0.0149391));

    // Use a monotonically increasing sequence to derive the sample directions.
    const mediump float unit_angle = 2.114514;
    mediump vec2 unit_rot = vec2(sin(unit_angle), cos(unit_angle));

    dither2 *= PI * 2.0;
    mediump vec2 rot = vec2(sin(dither2), cos(dither2));

    // ## Sampling Loop
    const mediump float depth_decay_scale = 0.4;
    const mediump float decay_factor = 0.92;

    mediump float result = 0.0;
    mediump float decay = 1.0;

    mediump vec3 result_gi = vec3(0.0);

    for (lowp int i = 0; i < 8; ++i) {
        // The kernel size is constant in the texture space.
        mediump vec2 ts_sample_rel = rot * sample_dist * u_TSSampleOffsetFactor;
        highp vec2 ts_sample = v_TexCoord + ts_sample_rel;

        mediump float cs_sample_z = fetchZ(ts_sample);

        // Transform the point to the view space.
        mediump vec2 cs_sample_rel = ts_sample_rel * 2.0;
        highp vec4 vs_sample_hc = v_VSPosBase + u_InvProjMat * vec4(cs_sample_rel, cs_sample_z, 0.0);
        highp vec3 vs_sample = vs_sample_hc.xyz / vs_sample_hc.w;

        // Compute the elevation of the sample. (With a slight compensation to
        // reduce the false occlusion)
        mediump vec3 vs_sample_rel = vs_sample - vs_pos;
        vs_sample_rel -= vs_normal * 0.1;
        mediump float sample_cos = dot(normalize(vs_sample_rel), vs_normal);
        mediump float depth_decay = exp2(-depth_decay_scale * abs(vs_sample_rel.z));

        // Actually, this is not a correct way to approximate the ambient
        // occlusion... It nonetheless does produces a somewhat visually
        // pleasant result.
        // (This SSAO implementation is based on Hyper3D, by the way.)
        mediump float effect = (max(result, sample_cos) - result) * decay * depth_decay;
        result += effect;

        // Radiosity approximation
        mediump vec3 color = texture2D(colorTexture, ts_sample).xyz;
        result_gi += effect * (color * color);

        // Move on to the next sample.
        sample_dist += 1.0 + sample_dist * 0.3;
        rot = complexMultiply(rot, unit_rot);
        decay *= decay_factor;
    }

    gl_FragColor.w = 1.0 - result;
    gl_FragColor.xyz = sqrt(result_gi);
}
