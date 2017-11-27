/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global a_Position       // attribute highp vec4
#pragma global a_TexCoord       // attribute highp vec2
#pragma global a_Color          // attribute mediump vec4

// varyings
#pragma global v_TexCoord       // varying highp vec2
#pragma global v_ScreenCoord    // varying highp vec4
#pragma global v_Color          // varying mediump vec4

varying highp vec2 v_TexCoord;
varying highp vec4 v_ScreenCoord;
varying mediump vec4 v_Color;

attribute highp vec4 a_Position;
attribute highp vec2 a_TexCoord;
attribute highp vec4 a_Color;

void main() {
    gl_Position = a_Position;

    v_TexCoord = a_TexCoord;
    v_ScreenCoord = a_Position;
    v_Color = a_Color;

    // (currently we assume this)
    v_ScreenCoord.w = 1.0;

    // `v_ScreenCoord.xy` is UV coordinates
    v_ScreenCoord.xy = v_ScreenCoord.xy * 0.5 + v_ScreenCoord.w * 0.5;

    // Squash the Z coordinate (we do depth testing and clipping by ourselves)
    gl_Position.z = 0.0;
}
