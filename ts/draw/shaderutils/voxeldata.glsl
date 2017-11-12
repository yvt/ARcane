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