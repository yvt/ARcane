// exports
#pragma global v_TexCoord
#pragma global v_CameraTexCoord

// imports
#pragma global ENABLE_AR
#pragma global g1Texture
#pragma global ssaoTexture
#pragma global cameraTexture
#pragma global fetchVoxelData

varying highp vec2 v_TexCoord;

#if ENABLE_AR
varying highp vec2 v_CameraTexCoord;
#endif

void main() {
    mediump vec3 scene_color = vec3(0.1, 0.12, 0.2);
    mediump vec3 floor_color = (scene_color + 0.05) * 0.8;

#if ENABLE_AR
    mediump vec3 camera_image = texture2D(cameraTexture, v_CameraTexCoord).xyz;
#endif

    // Fetch GBuffer 1
    mediump vec4 g1 = texture2D(g1Texture, v_TexCoord);

    if (g1.x == 0.0) {
        // Render the background (gradient)
#if ENABLE_AR
        gl_FragColor = vec4(camera_image, 1.0);
#else
        mediump vec3 color = scene_color * (g1.z * 0.5 + 0.5);
        gl_FragColor = vec4(sqrt(color), 1.0);
#endif
        return;
    }

    mediump float ssao = texture2D(ssaoTexture, v_TexCoord).x;
    const mediump float floor_diffuse = 0.1;

    if (g1.z == -1.0) {
        // Floor
#if ENABLE_AR
        gl_FragColor = vec4(camera_image * sqrt(ssao), 1.0);
#else
        mediump vec3 color = floor_color * (ssao * mix(0.2, 0.5, g1.y));
        gl_FragColor = vec4(sqrt(color), 1.0);
#endif
        return;
    }

    mediump vec3 hitVoxel = floor(g1.yzw);

    // Derive the normal using the partial derivatives
    mediump vec3 neighbor1 = vec3(
        fetchVoxelData(hitVoxel + vec3(1.0, 0.0, 0.0), 0.0),
        fetchVoxelData(hitVoxel + vec3(0.0, 1.0, 0.0), 0.0),
        fetchVoxelData(hitVoxel + vec3(0.0, 0.0, 1.0), 0.0)
    );
    mediump vec3 neighbor2 = vec3(
        fetchVoxelData(hitVoxel - vec3(1.0, 0.0, 0.0), 0.0),
        fetchVoxelData(hitVoxel - vec3(0.0, 1.0, 0.0), 0.0),
        fetchVoxelData(hitVoxel - vec3(0.0, 0.0, 1.0), 0.0)
    );
    mediump vec3 normal = normalize(neighbor2 - neighbor1);

    // Diffuse shading
    mediump vec3 lightDir = normalize(vec3(0.3, 1.0, 0.3));
    mediump vec3 diffuse = max(dot(normal, lightDir), 0.0) * vec3(1.0, 0.97, 0.93);
    diffuse += ssao * mix(floor_color * 0.4, scene_color * 0.6, normal.y * 0.5 + 0.5);

    gl_FragColor = vec4(sqrt(diffuse * 0.9), 1.0);
}

