/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global a_Position
#pragma global u_DepthRange
#pragma global u_InvViewProjMat
#pragma global u_CameraTexMatrix

// varyings
#pragma global v_TexCoord
#pragma global v_CameraTexCoord
#pragma global v_WSView

// imports
#pragma global ENABLE_AR

attribute highp vec2 a_Position;

varying highp vec2 v_TexCoord;
varying highp vec3 v_WSView;

uniform highp vec2 u_DepthRange;
uniform highp mat4 u_InvViewProjMat;

#if ENABLE_AR
varying highp vec2 v_CameraTexCoord;
uniform highp mat4 u_CameraTexMatrix;
#endif

void main() {
    gl_Position = vec4(a_Position, 0.0, 1.0);

    v_TexCoord = a_Position * 0.5 + 0.5;

    // Supply the world space direction
    // (This method should work as long as the `w` of transformed vector is not
    // dependent on the input `x` or `y`, I guess)
    vec4 ws_near = u_InvViewProjMat * vec4(a_Position, u_DepthRange.x, 1.0);
    vec4 ws_far = u_InvViewProjMat * vec4(a_Position, u_DepthRange.y, 1.0);
    v_WSView = ws_far.xyz / ws_far.w - ws_near.xyz / ws_near.w;

    #if ENABLE_AR
    v_CameraTexCoord = (u_CameraTexMatrix * vec4(a_Position, 0.0, 1.0)).xy;
    #endif
}
