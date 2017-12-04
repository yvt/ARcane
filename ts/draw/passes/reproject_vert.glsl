/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global a_Position
#pragma global u_ReprojectionMatrix

// varyings
#pragma global v_TexCoord
#pragma global v_CS2Base

attribute highp vec2 a_Position;

uniform highp mat4 u_ReprojectionMatrix;

varying highp vec2 v_TexCoord;
varying highp vec4 v_CS2Base;

void main() {
    gl_Position = vec4(a_Position, 0.0, 1.0);

    v_TexCoord = a_Position * 0.5 + 0.5;

    v_CS2Base = u_ReprojectionMatrix * vec4(a_Position, 0.0, 1.0);
}
