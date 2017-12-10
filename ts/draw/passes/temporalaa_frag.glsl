/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports

// varyings
#pragma global v_TexCoord1      // varying highp vec2
#pragma global v_TexCoord2      // varying highp vec2

// imports
#pragma global historyTexture   // (highp vec2) -> mediump vec4
#pragma global inputTexture     // (highp vec2) -> mediump vec4

// private
#pragma global rctEncode
#pragma global rctDecode

// code
varying highp vec2 v_TexCoord1;
varying highp vec4 v_TexCoord2;

// JPEG2000 Reversible Color Transform (RCT)
mediump vec3 rctEncode(mediump vec3 rgb) {
    // Y = R + 2G + B, Cr = R - G, Cb = B - G
    return vec3(dot(rgb, vec3(1.0, 2.0, 1.0)), rgb.xz - rgb.y);
}
mediump vec3 rctDecode(mediump vec3 ycrcb) {
    // G = 0.25 * (Y - Cr - Cb)
    mediump float g = 0.25 * dot(ycrcb, vec3(1.0, -1.0, -1.0));
    return vec3(ycrcb.y + g, g, ycrcb.z + g);
}

void main() {
    // Temporal Antialiasing, based on the implementation available here:
    // https://www.shadertoy.com/view/lt3SWj

    mediump vec4 last_value = texture2D(historyTexture, v_TexCoord1);
    mediump float mix_rate = last_value.w;

    mediump vec3 in0 = texture2D(inputTexture, v_TexCoord1).xyz;

    // YUV bounding box clamping
    mediump vec3 in1 = texture2D(inputTexture, vec2(v_TexCoord1.x, v_TexCoord2.y)).xyz;
    mediump vec3 in2 = texture2D(inputTexture, vec2(v_TexCoord1.x, v_TexCoord2.w)).xyz;
    mediump vec3 in3 = texture2D(inputTexture, vec2(v_TexCoord2.x, v_TexCoord1.y)).xyz;
    mediump vec3 in4 = texture2D(inputTexture, vec2(v_TexCoord2.z, v_TexCoord1.y)).xyz;
    mediump vec3 in5 = texture2D(inputTexture, vec2(v_TexCoord2.x, v_TexCoord2.y)).xyz;
    mediump vec3 in6 = texture2D(inputTexture, vec2(v_TexCoord2.x, v_TexCoord2.w)).xyz;
    mediump vec3 in7 = texture2D(inputTexture, vec2(v_TexCoord2.z, v_TexCoord2.y)).xyz;
    mediump vec3 in8 = texture2D(inputTexture, vec2(v_TexCoord2.z, v_TexCoord2.w)).xyz;

    in0 = rctEncode(in0);
    in1 = rctEncode(in1); in2 = rctEncode(in2); in3 = rctEncode(in3); in4 = rctEncode(in4);
    in5 = rctEncode(in5); in6 = rctEncode(in6); in7 = rctEncode(in7); in8 = rctEncode(in8);

    mediump vec3 aa_mixed = mix(rctEncode(last_value.xyz), in0, mix_rate);

    mediump vec3 min_color = min(min(min(in0, in1), min(in2, in3)), in4);
    mediump vec3 max_color = max(max(max(in0, in1), max(in2, in3)), in4);
    min_color = mix(min_color, min(min(min(in5, in6), min(in7, in8)), min_color), 0.5);
    max_color = mix(max_color, max(max(max(in5, in6), max(in7, in8)), max_color), 0.5);

    mediump vec3 aa_clamped = clamp(aa_mixed, min_color, max_color);

    // Update the mix rate according to the clamping result
    mix_rate = 1.0 / (1.0 / mix_rate + 1.0);

    mediump float clamp_amount = dot(abs(aa_clamped - aa_mixed), vec3(1.0));
    mix_rate = clamp(mix_rate + clamp_amount * 16.0, 0.125, 0.5);

    // Generate output
    gl_FragColor.xyz = rctDecode(aa_clamped);
    gl_FragColor.w = mix_rate;
}
