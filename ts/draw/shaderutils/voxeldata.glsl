/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global fetchVoxelDensity
#pragma global fetchVoxelMaterial

// imports
#pragma global densityTextureSampler
#pragma global materialTextureSampler
#pragma global fetchVoxelDensityCommon
#pragma global fetchVoxelMaterialCommon

mediump float fetchVoxelDensity(highp vec3 voxel, mediump float lod) {
    return fetchVoxelDensityCommon(
        densityTextureSampler,
        voxel,
        lod
    );
}

mediump vec4 fetchVoxelMaterial(highp vec3 voxel) {
    return fetchVoxelMaterialCommon(
        materialTextureSampler,
        voxel
    );
}