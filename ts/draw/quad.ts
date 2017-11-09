import { GLContext } from "./globjs/context";
import { GLConstants } from "./globjs/constants";

export class QuadRenderer
{
    private buffer: WebGLBuffer;

    constructor(private context: GLContext)
    {
        const gl = context.gl;
        this.buffer = gl.createBuffer()!;

        gl.bindBuffer(GLConstants.ARRAY_BUFFER, this.buffer);
        const vertices = new Uint8Array([
            -1, -1, 1, -1, -1, 1, 1, 1
        ]);
        gl.bufferData(GLConstants.ARRAY_BUFFER, vertices, GLConstants.STATIC_DRAW);
    }

    dispose(): void
    {
        const {gl} = this.context;
        gl.deleteBuffer(this.buffer);
    }

    render(attr: number)
    {
        const {gl} = this.context;
        this.context.vertexAttribs.toggleAllWithTrueIndex(attr);
        gl.bindBuffer(GLConstants.ARRAY_BUFFER, this.buffer);
        gl.vertexAttribPointer(attr, 2, GLConstants.BYTE, false, 2, 0);
        gl.drawArrays(GLConstants.TRIANGLE_STRIP, 0, 4);
    }
}