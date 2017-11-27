/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global fetchVoxelMaterial

mediump vec4 fetchVoxelMaterial(mediump sampler2D tex, highp vec3 voxel) {
    highp vec2 mapped =
        voxel.xy * vec2(1.0 / 4096.0, 1.0 / 256.0) +
        voxel.z  * vec2(256.0 / 4096.0, 1.0 / 4096.0 / 16.0);
    return texture2D(tex, mapped);
}
