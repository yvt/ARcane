import { IDisposable } from "../utils/interfaces";
import { GLContext } from './globjs/context';
import { GLConstants } from './globjs/constants';

import { Blitter } from './subpasses/blit';

export interface VoxelDataContext
{
    readonly context: GLContext;
    readonly blitter: Blitter;
}

export class VoxelDataManager implements IDisposable
{
    /** Temporary image storage used to generate a mip pyramid. */
    private readonly tempTex: WebGLTexture;

    constructor(public readonly context: VoxelDataContext)
    {
        const {gl} = context.context;

        this.tempTex = gl.createTexture()!;
        gl.bindTexture(GLConstants.TEXTURE_2D, this.tempTex);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MAG_FILTER, GLConstants.NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MIN_FILTER, GLConstants.NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_S, GLConstants.CLAMP_TO_EDGE);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_T, GLConstants.CLAMP_TO_EDGE);

        gl.texImage2D(GLConstants.TEXTURE_2D, 0, GLConstants.ALPHA, 2048, 2048, 0,
            GLConstants.ALPHA, GLConstants.UNSIGNED_BYTE, null);
    }

    dispose(): void
    {
        const {gl} = this.context.context;
        gl.deleteTexture(this.tempTex);
    }

    createVoxelData(): VoxelData
    {
        return new VoxelDataImpl(this.context);
    }
}

export abstract class VoxelData implements IDisposable
{
    densityTex: WebGLTexture;

    abstract dispose(): void;
}

class VoxelDataImpl extends VoxelData
{
    constructor(private readonly context: VoxelDataContext)
    {
        super();

        const {gl} = context.context;

        this.densityTex = gl.createTexture()!;
        gl.bindTexture(GLConstants.TEXTURE_2D, this.densityTex);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MAG_FILTER, GLConstants.NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MIN_FILTER, GLConstants.NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_S, GLConstants.CLAMP_TO_EDGE);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_T, GLConstants.CLAMP_TO_EDGE);

        for (let i = 0; i < 12; ++i) {
            gl.texImage2D(GLConstants.TEXTURE_2D, i, GLConstants.ALPHA, 4096 >> i, 4096 >> i, 0,
                GLConstants.ALPHA, GLConstants.UNSIGNED_BYTE, null);
        }

        // Initialize it with a random data
        const dens = new Uint8Array(256 * 256 * 256);

        for (let x = 0; x < 256; ++x) {
            for (let y = 0; y < 256; ++y) {
                for (let z = 0; z < 256; ++z) {
                    let v = Math.sin(x / 20) + Math.sin(y / 20) + Math.cos(z / 20) + Math.sin((x ^ y ^ z) * .1) * 0.5;
                    v *= Math.max(0, 128 * 128 - Math.pow(x - 128, 2) - Math.pow(y - 128, 2) - Math.pow(z - 128, 2)) / 128 / 128;
                    v += (v - 0.5) * 5;
                    v = Math.max(Math.min(v * 255 | 0, 255), 0);

                    const sz1 = z & 15;
                    const sz2 = z >> 4;
                    dens[x + (sz1 * 256) + (y + (sz2 * 256)) * 4096] = v;
                }
            }
        }

        gl.texImage2D(GLConstants.TEXTURE_2D, 0, GLConstants.ALPHA, 4096, 4096, 0,
            GLConstants.ALPHA, GLConstants.UNSIGNED_BYTE, dens);
    }

    dispose(): void
    {
        const {gl} = this.context.context;
        gl.deleteTexture(this.densityTex);
    }
}
