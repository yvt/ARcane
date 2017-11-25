/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global fetchVoxelData

// imports
#pragma global densityTextureSampler fetchVoxel

mediump float fetchVoxelData(highp vec3 voxel, mediump float lod) {
    return fetchVoxel(
        densityTextureSampler,
        voxel,
        lod
    );
}