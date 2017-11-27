/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global a_Position
#pragma global u_InvViewProjMat
#pragma global u_DepthRange

// varyings
#pragma global v_RayStart
#pragma global v_RayEnd

attribute highp vec2 a_Position;

uniform highp mat4 u_InvViewProjMat;
uniform highp vec2 u_DepthRange;

varying highp vec4 v_RayStart;
varying highp vec4 v_RayEnd;

void main() {
    gl_Position = vec4(a_Position, 0.0, 1.0);

    v_RayStart = u_InvViewProjMat * vec4(a_Position, u_DepthRange.x, 1.0);
    v_RayEnd =   u_InvViewProjMat * vec4(a_Position, u_DepthRange.y, 1.0);
}
