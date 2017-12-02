/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

// exports
#pragma global u_DepthRange
#pragma global u_WorldToEnvMatrix

// varyings
#pragma global v_TexCoord
#pragma global v_CameraTexCoord
#pragma global v_WSView

// imports
#pragma global ENABLE_AR
#pragma global g1Texture
#pragma global ssaoTexture
#pragma global cameraTexture
#pragma global envTexture
#pragma global fetchVoxelDensity
#pragma global fetchVoxelMaterial
#pragma global PI

// private
#pragma global fetchEnvImage

varying highp vec2 v_TexCoord;
varying highp vec3 v_WSView;

#if ENABLE_AR
varying highp vec2 v_CameraTexCoord;
uniform mediump mat4 u_WorldToEnvMatrix;
#endif

uniform highp vec2 u_DepthRange;

void main() {
    mediump vec3 scene_color = vec3(0.1, 0.12, 0.2);
    mediump vec3 floor_color = (scene_color + 0.05) * 0.8;
    mediump vec3 ws_light_dir = normalize(vec3(0.3, 1.0, 0.3));

#if ENABLE_AR
    mediump vec3 camera_image = texture2D(cameraTexture, v_CameraTexCoord).xyz;
#endif

    // # Fetch GBuffer 1
    mediump vec4 g1 = texture2D(g1Texture, v_TexCoord);

    if (g1.x == u_DepthRange.y) {
        // If the depth value indicates the far plane, render the background (gradient)
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

    mediump vec3 hit_voxel = floor(g1.yzw);

    // # Fetch and decode material data
    mediump vec4 material = fetchVoxelMaterial(hit_voxel);
    mediump vec3 base_color = material.xyz * material.xyz;
    mediump float rough_metal = floor(material.w * 255.0 + 0.5);
    mediump float gloss = fract(rough_metal / 16.0);
    mediump float metalness = floor(rough_metal / 16.0) / 15.0;
    mediump float rf_0 = 0.04;

    // # Derive the normal using the partial derivatives
    mediump vec3 neighbor1 = vec3(
        fetchVoxelDensity(hit_voxel + vec3(1.0, 0.0, 0.0), 0.0),
        fetchVoxelDensity(hit_voxel + vec3(0.0, 1.0, 0.0), 0.0),
        fetchVoxelDensity(hit_voxel + vec3(0.0, 0.0, 1.0), 0.0)
    );
    mediump vec3 neighbor2 = vec3(
        fetchVoxelDensity(hit_voxel - vec3(1.0, 0.0, 0.0), 0.0),
        fetchVoxelDensity(hit_voxel - vec3(0.0, 1.0, 0.0), 0.0),
        fetchVoxelDensity(hit_voxel - vec3(0.0, 0.0, 1.0), 0.0)
    );
    mediump vec3 ws_normal = normalize(neighbor2 - neighbor1);

    // # Perform shading
    mediump vec3 ws_view = -normalize(v_WSView); // Oriented so that dot(ws_view, ws_normal) >= 0
    mediump vec3 accumulated = vec3(0.0);
    mediump float dot_nv = dot(ws_normal, ws_view);

    // ## Punctual light
    mediump float dot_nl = dot(ws_normal, ws_light_dir);
    if (dot_nl >= 0.0) {
        // ### Distribute the energy to diffuse and specular BRDF
        mediump vec3 ws_half = normalize(ws_view + ws_light_dir);
        mediump float fresnel = pow(1.0 - dot(ws_half, ws_light_dir), 5.0);
        mediump vec4 specular_diffuse_mix = mix(
            mix(vec4(rf_0), vec4(base_color, 1.0), metalness),
            vec4(1.0),
            fresnel
        );
        mediump vec3 specular_mix = specular_diffuse_mix.xyz;
        mediump float diffuse_mix = 1.0 - specular_diffuse_mix.w;

        // ### Diffuse: Lambert
        accumulated += base_color * (diffuse_mix * dot_nl);

        // ### Specular
        //
        // I chose the following building blocks:
        //
        //  - Distribution term: Blinn Phong distribution
        //    Rather easy to implement and costs little
        //
        //  - Fresnel term: Schlick
        //    (Already multiplied in the previous stage)
        //
        //  - Geometry term: Schlick-Smith
        //
        mediump float power = exp2(13.0 * gloss);
        mediump float k = (2.0 / sqrt(PI)) / sqrt(power + 2.0);
        mediump float brdf_v_rcp = mix(dot_nl, 1.0, k) * mix(dot_nv, 1.0, k);
        mediump float brdf_d = (power + 2.0) / 8.0 * pow(dot(ws_normal, ws_half), power);
        mediump float brdf = dot_nl * brdf_d / brdf_v_rcp;
        accumulated += specular_mix * brdf;
    }
#if ENABLE_AR
    // Attenuate the punctual light so environmental light is more emphasized
    accumulated *= 0.3;
#endif

    // ## Ambient light

    // ### Specular
    //
    // Use the split sum approximation with analytical environmental BRDF
    // approximation for specular reflection [Kar13]:
    //
    //     ∫Env(l)BRDF(l, v, h)cos(ω)dω
    //     → (4∫Env(l)Denv(h)cos(ω)dω)(∫BRDFenv(l, v, h)cos(ω)dω)
    //
    // [Kar13]: http://blog.selfshadow.com/publications/s2013-shading-course/
    mediump vec3 env_image = mix(floor_color * 0.4, scene_color * 0.6, ws_normal.y * 0.5 + 0.5);
    mediump vec4 env_t = vec4(0.0, 0.0, -0.015625, 0.75) +
        vec4(1.0 / 0.96, 0.475, 0.0182292, 0.25) * gloss;
    mediump float env_a0 = env_t.x * min(env_t.y, exp2(-9.28 * dot_nv)) + env_t.z;
    mediump float env_a1 = env_t.w;
    mediump float env_specular_dielectric = mix(env_a0, env_a1, rf_0);
    mediump vec3 env_specular = vec3(env_specular_dielectric) +
        base_color * (metalness * (1.0 - env_specular_dielectric));
#if ENABLE_AR
    mediump vec3 ws_reflection = reflect(-ws_view, ws_normal);
    mediump vec3 es_reflection = (u_WorldToEnvMatrix * vec4(ws_reflection, 0.0)).xyz;
    // env_image_spec_lod = log2(1024 / (power * 0.25)) / 2 = 6 - log2(power) * 0.5 = 6 - 6.5 * gloss
    mediump float env_image_spec_lod = min(6.0 - 6.5 * gloss, 4.0);
    mediump vec3 env_image_specular = textureCubeLodEXT(envTexture, es_reflection, env_image_spec_lod).xyz;
    env_image_specular *= env_image_specular; // gamma correction
    accumulated += env_image_specular * env_specular;
#else
    accumulated += env_image * env_specular;
#endif

    // ### Diffuse
    mediump vec3 env_diffuse = base_color * ((1.0 - metalness) * (1.0 - env_specular_dielectric) * ssao);
#if ENABLE_AR
    mediump vec3 es_normal = (u_WorldToEnvMatrix * vec4(ws_normal, 0.0)).xyz;
    mediump vec3 es_img_diffuse = textureCubeLodEXT(envTexture, es_normal, 4.0).xyz;
    es_img_diffuse *= es_img_diffuse; // gamma correction
    accumulated += es_img_diffuse * env_diffuse;
#else
    // (Use the same `env_image` for now...)
    accumulated += env_image * env_diffuse;
#endif

    gl_FragColor = vec4(sqrt(accumulated), 1.0);
}

