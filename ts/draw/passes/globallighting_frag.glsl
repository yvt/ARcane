// exports
#pragma global v_TexCoord

// imports
#pragma global g1Texture
#pragma global ssaoTexture
#pragma global fetchVoxelData

varying highp vec2 v_TexCoord;

void main() {
    mediump vec3 scene_color = vec3(0.1, 0.12, 0.2);

    // Fetch GBuffer 1
    mediump vec4 g1 = texture2D(g1Texture, v_TexCoord);

    if (g1.w == 1.0) {
        // Render the background
        gl_FragColor = vec4(sqrt(scene_color), 1.0);
        return;
    }

    mediump vec3 hitVoxel = floor(g1.yzw);

    // Derive the normal using the partial derivatives
    mediump float val1 = fetchVoxelData(hitVoxel, 0.0);
    mediump vec3 neighbor = vec3(
        fetchVoxelData(hitVoxel + vec3(1.0, 0.0, 0.0), 0.0),
        fetchVoxelData(hitVoxel + vec3(0.0, 1.0, 0.0), 0.0),
        fetchVoxelData(hitVoxel + vec3(0.0, 0.0, 1.0), 0.0)
    );
    mediump vec3 normal = normalize(val1 - neighbor);

    // Diffuse shading
    mediump vec3 lightDir = normalize(vec3(0.3, 1.0, 0.3));
    mediump vec3 diffuse = max(dot(normal, lightDir), 0.0) * vec3(1.0, 0.97, 0.93);
    mediump float ssao = texture2D(ssaoTexture, v_TexCoord).x;
    diffuse += scene_color * ssao;

    gl_FragColor = vec4(sqrt(diffuse * 0.9), 1.0);
}

