import { BitArray } from '../../utils/bitarray';

export class VertexAttribState extends BitArray
{
    constructor(private gl: WebGLRenderingContext)
    {
        super();
    }

    onToggledTrue(index: number): void
    {
        this.gl.enableVertexAttribArray(index);
    }
    onToggledFalse(index: number): void
    {
        this.gl.disableVertexAttribArray(index);
    }
}
