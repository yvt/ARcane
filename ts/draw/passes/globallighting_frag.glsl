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
#pragma global u14fp16Decode
#pragma global cubeFaceToNormal

// private
#pragma global fetchEnvImage

varying highp vec2 v_TexCoord;
varying highp vec3 v_WSView;

#if ENABLE_AR
varying highp vec2 v_CameraTexCoord;
uniform mediump mat4 u_WorldToEnvMatrix;
#endif

uniform highp vec2 u_DepthRange;

// DEBUG
#pragma global traceSphere
bool traceSphere(highp vec3 start, highp vec3 dir, out highp vec3 normal) {
    highp float t = pow(dot(dir, start), 2.0) - dot(start, start) + 1.0;
    if (t >= 0.0) {
        highp float d = -dot(dir, start) - sqrt(t);
        normal = start + dir * d;
        return true;
    }
    return false;
}

// DEBUG
#pragma global acesToneMapping
mediump vec3 acesToneMapping(mediump vec3 x)
{
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
    mediump vec3 scene_color = vec3(0.1, 0.12, 0.2);
    mediump vec3 floor_color = (scene_color + 0.05) * 0.8;
    mediump vec3 ws_light_dir = normalize(vec3(0.8, 1.0, 0.4));

    // DEBUG
    mediump vec4 ssao_radiosity = texture2D(ssaoTexture, v_TexCoord);
    mediump float ssao = 1.0;
    mediump vec3 radiosity = vec3(0.0);

    mediump vec3 ws_view = -normalize(v_WSView); // Oriented so that dot(ws_view, ws_normal) >= 0

    mediump vec3 rayStart = vec3(0.0, 0.0, 16.0);
    mediump vec3 rayDir = -ws_view;

    mediump vec3 ws_normal;

    // # Fetch and decode material data
    mediump vec3 base_color = vec3(0.8);
    mediump float gloss = -0.1;
    mediump float material_id = 1.0;
    mediump float rf_0 = 0.04;
    bool receieve_light = false;

    for (mediump float y = 0.0; y <= 1.0; y += 1.0) {
        for (mediump float x = 0.0; x <= 8.0; x += 1.0) {
            if (traceSphere(rayStart + vec3(x - 4.0, (y - 0.5), 0.0) * 2.5, rayDir, ws_normal)) {
                gloss = x / 8.0 * 0.8 + 0.1;
                material_id = y;
                if (y == 0.0) {
                    base_color = vec3(0.4, 0.6, 0.9);
                }
                break;
            }
        }
    }

    if (gloss < 0.0) {
        gl_FragColor.xyz = textureCubeLodEXT(envTexture, -ws_view, 1.0).xyz * 2.0;
        gl_FragColor.xyz = sqrt(acesToneMapping(gl_FragColor.xyz));
        gl_FragColor.w = 1.0;
        return;
    }

    bool metallic = material_id != 0.0;

    // # Perform shading
    mediump vec3 accumulated = vec3(0.0);
    mediump float dot_nv = dot(ws_normal, ws_view);

    // ## Punctual light
    mediump float dot_nl = dot(ws_normal, ws_light_dir);
    if (dot_nl >= 0.0 && !receieve_light) {
        // ### Distribute the energy to diffuse and specular BRDF
        mediump vec3 ws_half = normalize(ws_view + ws_light_dir);
        mediump float fresnel = pow(1.0 - dot(ws_half, ws_light_dir), 5.0);
        mediump vec4 specular_diffuse_mix = mix(
            metallic ? vec4(base_color, 1.0) : vec4(rf_0),
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
    accumulated *= 0.1;
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
    mediump vec4 env_t = vec4(0.0, 0.0, -0.015625, 0.75) +
        vec4(1.0 / 0.96, 0.475, 0.0182292, 0.25) * gloss;
    mediump float env_a0 = env_t.x * min(env_t.y, exp2(-9.28 * dot_nv)) + env_t.z;
    mediump float env_a1 = env_t.w;
    mediump float env_specular_dielectric = mix(env_a0, env_a1, rf_0);
    mediump vec3 env_specular = vec3(env_specular_dielectric);
    if (metallic) {
        env_specular += base_color * (1.0 - env_specular_dielectric);
    }
    mediump vec3 ws_reflection = reflect(-ws_view, ws_normal);
#if ENABLE_AR
    mediump vec3 es_reflection = (u_WorldToEnvMatrix * vec4(ws_reflection, 0.0)).xyz;
#else
    mediump vec3 es_reflection = ws_reflection;
#endif
    // env_image_spec_lod = log2(1024 / (power * 0.25)) / 2 = 6 - log2(power) * 0.5 = 6 - 6.5 * gloss
    mediump float env_image_spec_lod = min(6.0 - 6.5 * gloss, 4.0);
    mediump vec3 env_image_specular = textureCubeLodEXT(envTexture, es_reflection, env_image_spec_lod).xyz;
#if !ENABLE_AR
    env_image_specular *= 2.0; // exposure adjustment (because env map is not HDR)
#endif
    env_image_specular *= env_image_specular; // gamma correction
    accumulated += (env_image_specular * ssao + radiosity) * env_specular;

    // ### Diffuse
    if (!metallic) {
        mediump vec3 env_diffuse = base_color * (1.0 - env_specular_dielectric);
#if ENABLE_AR
        mediump vec3 es_normal = (u_WorldToEnvMatrix * vec4(ws_normal, 0.0)).xyz;
#else
        mediump vec3 es_normal = ws_normal;
#endif
        mediump vec3 es_img_diffuse = textureCubeLodEXT(envTexture, es_normal, 4.0).xyz;
#if !ENABLE_AR
        es_img_diffuse *= 2.0; // exposure adjustment (because env map is not HDR)
#endif
        es_img_diffuse *= es_img_diffuse; // gamma correction
        accumulated += (es_img_diffuse * ssao + radiosity) * env_diffuse;
    }

    gl_FragColor = vec4(sqrt(acesToneMapping(accumulated)), 1.0);
}

