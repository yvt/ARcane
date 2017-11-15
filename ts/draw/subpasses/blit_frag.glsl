// exports
#pragma global u_Lod
#pragma global inputTexture
#pragma global v_TexCoord

varying highp vec2 v_TexCoord;
uniform highp float u_Lod;

void main() {
    gl_FragColor = texture2DLodEXT(inputTexture, v_TexCoord, u_Lod);
}