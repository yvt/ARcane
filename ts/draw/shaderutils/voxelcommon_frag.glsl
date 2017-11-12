// exports
#pragma global fetchVoxel

mediump float fetchVoxel(mediump sampler2D tex, highp vec3 voxel, mediump float lod) {
    highp float mipScale = exp2(lod);
    highp vec2 mapped =
        voxel.xy * vec2(1.0 / 4096.0, 1.0 / 256.0) +
        voxel.z  * vec2(256.0 / 4096.0, mipScale / 4096.0 / 16.0);
    return texture2DLodEXT(tex, mapped, lod).w;
}