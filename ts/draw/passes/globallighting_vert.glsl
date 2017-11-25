/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global a_Position
#pragma global v_TexCoord
#pragma global v_CameraTexCoord
#pragma global u_CameraTexMatrix

// imports
#pragma global ENABLE_AR

attribute highp vec2 a_Position;

varying highp vec2 v_TexCoord;

#if ENABLE_AR
varying highp vec2 v_CameraTexCoord;
uniform highp mat4 u_CameraTexMatrix;
#endif

void main() {
    gl_Position = vec4(a_Position, 0.0, 1.0);

    v_TexCoord = a_Position * 0.5 + 0.5;

    #if ENABLE_AR
    v_CameraTexCoord = (u_CameraTexMatrix * vec4(a_Position, 0.0, 1.0)).xy;
    #endif
}
