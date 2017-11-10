import { GLContext } from "./globjs/context";
import { GLConstants } from "./globjs/constants";

export class QuadRenderer
{
    private buffer: WebGLBuffer;
    private indexBuffer: WebGLBuffer;
    private capacity: number;

    constructor(private context: GLContext)
    {
        const gl = context.gl;
        this.buffer = gl.createBuffer()!;
        this.indexBuffer = gl.createBuffer()!;

        this.capacity = 0;
        this.reserve(256);
    }

    private reserve(size: number): void
    {
        const {gl} = this.context;

        if (size < this.capacity) {
            return;
        }

        let newSize = Math.max(this.capacity, 1);
        while (newSize < size) {
            newSize <<= 1;
        }
        this.capacity = newSize;

        if (newSize >= 0x1000) {
            throw new Error("Index overflow");
        }

        const vertices = new Int16Array(newSize * 16);
        const indices = new Uint16Array(newSize * 5);

        for (let i = 0; i < newSize; ++i) {
            vertices[i * 16] = -1;
            vertices[i * 16 + 1] = -1;
            vertices[i * 16 + 2] = i;

            vertices[i * 16 + 4] = 1;
            vertices[i * 16 + 5] = -1;
            vertices[i * 16 + 6] = i;

            vertices[i * 16 + 8] = -1;
            vertices[i * 16 + 9] = 1;
            vertices[i * 16 + 10] = i;

            vertices[i * 16 + 12] = 1;
            vertices[i * 16 + 13] = 1;
            vertices[i * 16 + 14] = i;

            indices[i * 5] = i * 4;
            indices[i * 5 + 1] = i * 4 + 1;
            indices[i * 5 + 2] = i * 4 + 2;
            indices[i * 5 + 3] = i * 4 + 3;
            indices[i * 5 + 4] = 0xffff; // primitive restart
        }

        gl.bindBuffer(GLConstants.ARRAY_BUFFER, this.buffer);
        gl.bufferData(GLConstants.ARRAY_BUFFER, vertices, GLConstants.STATIC_DRAW);

        gl.bindBuffer(GLConstants.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(GLConstants.ELEMENT_ARRAY_BUFFER, indices, GLConstants.STATIC_DRAW);
    }

    dispose(): void
    {
        const {gl} = this.context;
        gl.deleteBuffer(this.buffer);
        gl.deleteBuffer(this.indexBuffer);
    }

    render(attr: number, start?: number, count?: number)
    {
        if (start == null) {
            start = 0;
        }
        if (count == null) {
            count = 1;
        }
        if (count === 0) {
            return;
        }

        this.reserve(start + count);

        const {gl} = this.context;
        this.context.vertexAttribs.toggleAllWithTrueIndex(attr);
        gl.bindBuffer(GLConstants.ARRAY_BUFFER, this.buffer);
        gl.bindBuffer(GLConstants.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.vertexAttribPointer(attr, 4, GLConstants.SHORT, false, 8, 0);
        gl.drawElements(GLConstants.TRIANGLE_STRIP, 5 * count - 1, GLConstants.UNSIGNED_SHORT, start * 10);
    }
}