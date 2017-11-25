/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { IDisposable } from '../utils/interfaces';
import { assertEq } from '../utils/utils';
import { setBitArrayRange, findOneInBitArray, findZeroInBitArray } from '../utils/bits';

import { GLContext } from './globjs/context';
import { GLConstants } from './globjs/constants';

export class CameraImage implements IDisposable
{
    readonly texture: WebGLTexture;
    width = 1;
    height = 1;

    constructor(private context: GLContext)
    {
        const {gl} = context;

        this.texture = gl.createTexture()!;
        gl.bindTexture(GLConstants.TEXTURE_2D, this.texture);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MAG_FILTER, GLConstants.LINEAR);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MIN_FILTER, GLConstants.LINEAR);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_S, GLConstants.CLAMP_TO_EDGE);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_T, GLConstants.CLAMP_TO_EDGE);

        // Fill it with dummy data
        gl.texImage2D(GLConstants.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    }

    updateWith(image: HTMLCanvasElement): void
    {
        const {gl} = this.context;
        gl.bindTexture(GLConstants.TEXTURE_2D, this.texture);
        gl.texImage2D(GLConstants.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        this.width = image.width;
        this.height = image.height;
    }

    dispose(): void
    {
        const {gl} = this.context;
        gl.deleteTexture(this.texture);
    }
}
