// exports
#pragma global v_TexCoord

// imports
#pragma global g1Texture
#pragma global fetchVoxelData

varying highp vec2 v_TexCoord;

void main() {
    // Fetch GBuffer 1
    mediump vec4 g1 = texture2D(g1Texture, v_TexCoord);

    if (g1.z == 1.0) {
        // Render the background
        gl_FragColor = vec4(vec3(0.2), 1.0);
        return;
    }

    mediump vec3 hitVoxel = floor(g1.xyz);

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
    mediump float diffuse = max(dot(normal, lightDir), 0.0);
    diffuse += 0.03;

    gl_FragColor = vec4(vec3(1.0) * sqrt(diffuse), 1.0);
}

