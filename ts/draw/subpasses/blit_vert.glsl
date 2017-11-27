/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global a_Position
#pragma global u_Input
#pragma global u_Output

// varyings
#pragma global v_TexCoord

attribute highp vec2 a_Position;

uniform highp vec4 u_Input;
uniform highp vec4 u_Output;

varying highp vec2 v_TexCoord;

void main() {
    highp vec2 pos = a_Position * 0.5 + 0.5;
    gl_Position = vec4(mix(u_Output.xy, u_Output.zw, pos), 0.0, 1.0);
    v_TexCoord = mix(u_Input.xy, u_Input.zw, pos);
}