/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
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
