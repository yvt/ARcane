/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global u_ViewProjMat
#pragma global u_DepthRange
#pragma global SKIP_MODEL

// imports
#pragma global fetchVoxelDensity
#pragma global u14fp16Encode
#pragma global cubeFaceFromIndex
#pragma global cubeFaceToNormal

// varyings
#pragma global v_RayStart
#pragma global v_RayEnd

// private
#pragma global clipRay
#pragma global voxelTrace
#pragma global antialiasedHatch

uniform highp mat4 u_ViewProjMat;
uniform highp vec2 u_DepthRange;

varying highp vec4 v_RayStart;
varying highp vec4 v_RayEnd;

void clipRay(
    inout highp vec3 rayStart,
    inout highp vec3 rayEnd,
    highp vec3 rayDir,
    highp vec3 planeNormal,
    highp float planeDistance
) {
    if (dot(rayDir, planeNormal) > 0.0) {
        highp float distance = dot(rayStart, planeNormal) + planeDistance;
        if (distance > 0.0) {
            return;
        }
        distance /= dot(rayDir, planeNormal);
        rayStart -= distance * rayDir;
    } else {
        highp float distance = dot(rayEnd, planeNormal) + planeDistance;
        if (distance > 0.0) {
            return;
        }
        distance /= dot(rayDir, planeNormal);
        rayEnd -= distance * rayDir;
    }
}

// Coordinates are specified in the voxel data space
bool voxelTrace(
    highp vec3 rayStart,
    highp vec3 rayEnd,
    out highp vec3 hitVoxel,
    out highp vec3 hitPosition,
    out mediump float hitNormalIndex
) {
#if SKIP_MODEL
    return false;
#endif
    highp vec3 rayDir = normalize(rayEnd - rayStart);

    clipRay(rayStart, rayEnd, rayDir, vec3(1.0, 0.0, 0.0), 0.0);
    clipRay(rayStart, rayEnd, rayDir, vec3(-1.0, 0.0, 0.0), 256.0);
    clipRay(rayStart, rayEnd, rayDir, vec3(0.0, 1.0, 0.0), 0.0);
    clipRay(rayStart, rayEnd, rayDir, vec3(0.0, -1.0, 0.0), 256.0);
    clipRay(rayStart, rayEnd, rayDir, vec3(0.0, 0.0, 1.0), 0.0);
    clipRay(rayStart, rayEnd, rayDir, vec3(0.0, 0.0, -1.0), 256.0);

    hitNormalIndex = -16.0;

    if (dot(rayEnd - rayStart, rayDir) <= 0.0) {
        return false;
    }

    highp float rayLen = length(rayEnd - rayStart);
    mediump float dens = 0.0;

    /// The current mip level.
    mediump float mip = 8.0;

    /// The current voxel. (fractional part does not have a significance)
    mediump vec3 voxel = rayStart + rayDir * 0.001;

    for (mediump int i = 0; i < 256; ++i) {
        // Algebraically exp2(-mip) = 1 / exp(mip) must hold (as well as in FP arithmetics), but using
        // "exp2(-mip)" in place of "1.0 / mipScale" generates imprecise results on Apple A10, messing up
        // entire the algorithm
        mediump float mipScale = exp2(mip);
        mediump float mipScaleRcp = 1.0 / mipScale;

        mediump vec3 voxelRoundedB = floor(voxel * mipScaleRcp);

        /// "voxel" rounded according to the current mip level
        mediump vec3 voxelRounded = voxelRoundedB * mipScale;

        mediump float dens = fetchVoxelDensity(vec3(voxelRounded.xy, voxelRoundedB.z), mip);
        if (dens > 0.5) {
            if (mip <= 0.0) {
                hitVoxel = floor(voxel);
                hitPosition = rayStart;
                return true;
            } else {
                // We need to go deeper
                mip -= 1.0;
                continue;
            }
        }

        // The X, Y, and Z coordinates of the next X, Y, and Z planes that the ray collides, respectively.
        mediump vec3 nextPlane = voxelRounded + max(sign(rayDir), vec3(0.0)) * mipScale;

        /// The time at which the ray intersects each plane indicated by "nextPlane".
        // hack: Flicker appears when rayDir.x < 0 || rayDir.z < 0 if we change the last value to vec3(0.001).
        //       I just don't know why.
        highp vec3 nextPlaneT = max((nextPlane - rayStart) / rayDir, vec3(0.001));

        highp float minPlaneT = min(min(nextPlaneT.x, nextPlaneT.y), nextPlaneT.z);
        rayStart += minPlaneT * rayDir;

        mediump float minPlaneCoord;

        // Figure out which voxel the ray has entered
        // (with a correct rounding for each possible intersecting plane)
        voxel = rayStart;
        if (minPlaneT == nextPlaneT.x) {
            voxel.x = nextPlane.x + min(sign(rayDir.x), 0.0);
            minPlaneCoord = nextPlane.x;
            hitNormalIndex = rayDir.x >= 0.0
                ? cubeFaceFromIndex(1.0)
                : cubeFaceFromIndex(0.0); // neg-/pos-x
        } else if (minPlaneT == nextPlaneT.y) {
            voxel.y = nextPlane.y + min(sign(rayDir.y), 0.0);
            minPlaneCoord = nextPlane.y;
            hitNormalIndex = rayDir.y >= 0.0
                ? cubeFaceFromIndex(3.0)
                : cubeFaceFromIndex(2.0); // neg-/pos-y
        } else /* if (minPlaneT == nextPlaneT.z) */ {
            voxel.z = nextPlane.z + min(sign(rayDir.z), 0.0);
            minPlaneCoord = nextPlane.z;
            hitNormalIndex = rayDir.z >= 0.0
                ? cubeFaceFromIndex(5.0)
                : cubeFaceFromIndex(4.0); // neg-/pos-z
        }

        // Go back to the higher mip level as needed
        // (I wish I had leading_zeros in WebGL 1.0 SL)
        //
        // The number of mip levels to go back is limited to 2 because
        // it runs faster when I limit it for some reason. Maybe loop
        // overhead?
        minPlaneCoord += 256.0; // limit "mip <= 8"
        minPlaneCoord *= mipScaleRcp;
        for (mediump int k = 0; k < 2; ++k) {
            if (floor(minPlaneCoord * 0.5) != minPlaneCoord * 0.5) {
                break;
            }
            minPlaneCoord *= 0.5;
            mip += 1.0;
        }

        rayLen -= minPlaneT;
        if (rayLen < 0.0) {
            break;
        }
    }

    return false;
}

mediump float antialiasedHatch(mediump float fraction, mediump float width) {
    mediump float lineWidth = 0.05;
    return clamp((fraction - lineWidth) / width + 0.5, 0.0, 1.0);
}

void main() {
    // Render a cube
    highp vec3 rayStart = v_RayStart.xyz / v_RayStart.w;
    highp vec3 rayEnd = v_RayEnd.xyz / v_RayEnd.w;

    highp vec3 hitVoxel, hitPosition;
    mediump float hitNormalIndex;
    if (voxelTrace(
        rayStart,
        rayEnd,
        /* out */ hitVoxel,
        /* out */ hitPosition,
        /* out */ hitNormalIndex
    )) {
        // Make sure the integral part of hit position is inside the voxel
        // (with FP16 precision)
        highp vec3 hitPositionRounded = clamp(hitPosition, hitVoxel, hitVoxel + (1.0 - 1.0 / 8.0));

        // Construct the GBuffer1 data
        // `u14a[7:0] = hitVoxel.x, u14a[13:10] = hitVoxel.y[3:0]`
        gl_FragColor.y = u14fp16Encode(hitVoxel.x + fract(hitVoxel.y / 16.0) * 16.0 * 1024.0);
        // `u14b[7:0] = hitVoxel.z, u14b[13:10] = hitVoxel.y[7:4]`
        gl_FragColor.z = u14fp16Encode(hitVoxel.z + floor(hitVoxel.y / 16.0) * 1024.0);

        gl_FragColor.w = hitNormalIndex;

        // Punctual light shadow ray tracing
        mediump vec3 ws_light_dir = normalize(vec3(0.3, 1.0, 0.3));
        mediump vec3 dummy;
        if (voxelTrace(
            hitPosition + cubeFaceToNormal(hitNormalIndex) * 0.01,
            hitPosition + ws_light_dir * 400.0,
            /* out */ hitVoxel,
            /* out */ dummy,
            /* out */ hitNormalIndex
        )) {
            gl_FragColor.w += 8.0;
        }
    } else {
        mediump vec3 rayDir = normalize(rayEnd - rayStart);
        const mediump float horizon = -0.01;
        const highp float floor_z = 1.0;
        if (rayDir.y < horizon && rayStart.y > floor_z) {
            // Floor
            hitPosition.xz = mix(rayStart.xz, rayEnd.xz, (rayStart.y - floor_z) / (rayStart.y - rayEnd.y));
            hitPosition.y = 0.0;

            // Hatch pattern
            mediump float pattern = antialiasedHatch(abs(fract(hitPosition.x - 0.5) - 0.5) * 2.0, fwidth(hitPosition.x) * 4.0);
            pattern = min(pattern, antialiasedHatch(abs(fract(hitPosition.z - 0.5) - 0.5) * 2.0, fwidth(hitPosition.z) * 4.0));
            gl_FragColor.y = pattern;
            gl_FragColor.z = -1.0;
        } else {
            // Sky
            gl_FragColor = vec4(u_DepthRange.y, rayDir);

            // Skip Z value computation (since there is no actual ray intersection)
            return;
        }
    }

    // Compute the Z value
    highp vec4 clipCoord = u_ViewProjMat * vec4(hitPosition, 1.0);
    gl_FragColor.x = clipCoord.z / clipCoord.w;
}