/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global u_InvProjMat             // uniform highp mat4
#pragma global u_DitherTexCoordFactor   // uniform highp vec2
#pragma global a_Position               // attribute highp vec2

// varyings
#pragma global v_TexCoord               // varying highp vec2
#pragma global v_VSPosBase              // varying highp vec4
#pragma global v_DitherTexCoord         // varying highp vec4

attribute highp vec2 a_Position;

uniform highp mat4 u_InvProjMat;
uniform highp vec2 u_DitherTexCoordFactor;

varying highp vec2 v_TexCoord;
varying highp vec4 v_VSPosBase;
varying highp vec4 v_DitherTexCoord;

void main() {
    gl_Position = vec4(a_Position, 0.0, 1.0);

    v_TexCoord = a_Position * 0.5 + 0.5;
    v_VSPosBase = u_InvProjMat * vec4(a_Position, 0.0, 1.0);

    v_DitherTexCoord.xy = u_DitherTexCoordFactor * v_TexCoord;
    v_DitherTexCoord.wz = v_DitherTexCoord.xy;
}
