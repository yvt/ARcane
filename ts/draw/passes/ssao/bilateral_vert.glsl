/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global v_TexCoord   // varying highp vec2
#pragma global a_Position   // attribute highp vec2

attribute highp vec2 a_Position;

varying highp vec2 v_TexCoord;

void main() {
    gl_Position = vec4(a_Position, 0.0, 1.0);

    v_TexCoord = a_Position * 0.5 + 0.5;
}
