// exports
#pragma global v_TexCoord       // varying highp vec2
#pragma global v_ScreenCoord    // varying highp vec4
#pragma global v_Color          // varying mediump vec4

// imports
#pragma global inputTexture     // (highp vec2) -> mediump vec4
#pragma global g1Texture        // (highp vec2) -> mediump vec4

varying highp vec2 v_TexCoord;
varying highp vec4 v_ScreenCoord;
varying mediump vec4 v_Color;

void main() {
    highp vec3 screen_coords = v_ScreenCoord.xyz /* / v_ScreenCoord.w */;
    highp vec2 ts_screen = screen_coords.xy;
    mediump float cs_depth = screen_coords.z;

    // Z bias (to tackle with the Z fighting problem)
    cs_depth = cs_depth * 1.01;

    // Fetch GBuffer 1
    mediump vec4 g1 = texture2D(g1Texture, ts_screen);

    // Generate output color value
    mediump vec4 texture_value = texture2D(inputTexture, v_TexCoord);

    // Convert to pre-multiplied alpha
    texture_value.xyz *= texture_value.w;

    gl_FragColor = texture_value * v_Color;

    // Depth test
    if (cs_depth < g1.x) {
        // ... but the floor does not involve in occlusion
        if (g1.z != -1.0) {
            gl_FragColor *= 0.1;
        }
    }
}
