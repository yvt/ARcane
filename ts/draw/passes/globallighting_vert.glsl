// exports
#pragma global a_Position
#pragma global v_TexCoord

attribute highp vec2 a_Position;

varying highp vec2 v_TexCoord;

void main() {
    gl_Position = vec4(a_Position, 0.0, 1.0);

    v_TexCoord = a_Position * 0.5 + 0.5;
}
