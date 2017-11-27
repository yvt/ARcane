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

import { Blitter } from './subpasses/blit';

import { WorkDataVersion, GRID_SIZE } from '../model/work';

/**
 * Defines the layout of voxel data.
 *
 * The layout of the base mip level is pretty much the same as the one described
 * in `Storing 3D Data Inside a 2D Texture.lyx`.
 *
 * The rest of levels have slightly modified layout to make lookup operations
 * more efficient. Specifically, all levels use the same values of `D1` and `D2`
 * while having different values of `SIZE` (`W` and `H` in the equation)
 * according to its mip level.
 *
 * However, mip-mapping is still done on the Z direction. This means some depth
 * slices are unused on the non-base mip levels. For example, the mip level `n`
 * has `(SIZE >> n) ** 3` elements of data. The depth slices `0` through
 * `(SIZE >> n) - 1` are filled with valid data, but slices `SIZE >> n` through
 * `SIZE - 1` are left unused.
 *
 * The texture coordinate and the index for the element `(mip, x, y, z)` where
 * (`0 <= x, y, z < SIZE >> mip`) can be found using the following expressions:
 *
 *  - `(x + (SIZE >> mip) * (z % D1), y * D2 + (z / D1))`
 *  - `x + (z + y * D1 * D2) * (SIZE >> mip)`
 *    - Or with bit operations, `x + (z + (y << LOG_D1 + LOG_D2) << LOG_SIZE - mip)`
 */
export const enum Layout
{
    LOG_SIZE = 8,
    LOG_D1 = 4,
    LOG_D2 = 4,
    SIZE = 1 << LOG_SIZE,
    D1 = 1 << LOG_D1,
    D2 = 1 << LOG_D2,
}

assertEq(Layout.SIZE, GRID_SIZE);
assertEq(Layout.D1 * Layout.D2, GRID_SIZE);

// We only support little endian systems
assertEq(new Uint32Array(new Uint8Array([1, 2, 3, 4]).buffer)[0], 0x04030201);

export interface VoxelDataContext
{
    readonly context: GLContext;
    readonly blitter: Blitter;
}

export class VoxelDataManager implements IDisposable
{
    constructor(public readonly context: VoxelDataContext)
    {
    }

    dispose(): void
    {
    }

    createVoxelData(): VoxelData
    {
        return new VoxelDataImpl(this.context);
    }
}

export abstract class VoxelData implements IDisposable
{
    densityTex: WebGLTexture;
    materialTex: WebGLTexture;

    abstract dispose(): void;
    abstract updateFrom(workDataVersion: WorkDataVersion): void;
}

class VoxelDataImpl extends VoxelData
{
    private densityData: Uint8Array[] = [];
    private materialData = new Uint32Array(Layout.SIZE * Layout.D1 * Layout.SIZE * Layout.D2);
    private materialDataBytes: Uint8Array;

    constructor(private readonly context: VoxelDataContext)
    {
        super();

        const {gl} = context.context;

        this.densityTex = gl.createTexture()!;
        gl.bindTexture(GLConstants.TEXTURE_2D, this.densityTex);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MAG_FILTER, GLConstants.NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MIN_FILTER, GLConstants.NEAREST_MIPMAP_NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_S, GLConstants.REPEAT);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_T, GLConstants.REPEAT);

        for (let i = 0; i <= Layout.LOG_SIZE + Math.max(Layout.LOG_D1, Layout.LOG_D2); ++i) {
            gl.texImage2D(
                GLConstants.TEXTURE_2D,
                i,
                GLConstants.LUMINANCE,
                (Layout.SIZE * Layout.D1) >> i,
                (Layout.SIZE * Layout.D2) >> i,
                0,
                GLConstants.LUMINANCE,
                GLConstants.UNSIGNED_BYTE,
                null
            );
        }

        for (let i = 0; i <= Layout.LOG_SIZE; ++i) {
            const size = Layout.SIZE >> i;
            const width = size * Layout.D1;
            const height = Layout.D2 * size;
            this.densityData.push(new Uint8Array(width * height));
        }

        this.materialTex = gl.createTexture()!;
        gl.bindTexture(GLConstants.TEXTURE_2D, this.materialTex);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MAG_FILTER, GLConstants.NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MIN_FILTER, GLConstants.NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_S, GLConstants.REPEAT);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_T, GLConstants.REPEAT);
        gl.texImage2D(
            GLConstants.TEXTURE_2D,
            0,
            GLConstants.RGBA,
            Layout.SIZE * Layout.D1,
            Layout.SIZE * Layout.D2,
            0,
            GLConstants.RGBA,
            GLConstants.UNSIGNED_BYTE,
            null
        );
        this.materialDataBytes = new Uint8Array(this.materialData.buffer);
    }

    /** Used by `updateFrom`. */
    private dirtyLines = new Uint32Array((Layout.SIZE + 31) >> 5);

    /** Used by `updateFrom` to minimize the area of the updated region. */
    private lastVersion: WorkDataVersion | null;

    updateFrom(workDataVersion: WorkDataVersion)
    {
        const {data} = workDataVersion;
        if (data == null) {
            throw new Error("The given WorkDataVersion is not the latest version (its successor is not null).");
        }

        const {dirtyLines} = this;

        // Is the given version is a transitive successor of the last known
        // version?
        if (!this.lastVersion || this.lastVersion.head !== workDataVersion) {
            // The given version has no relationship with the last known version.
            // This means we have to upload entire the data.
            setBitArrayRange(dirtyLines, 0, Layout.SIZE);
        } else {
            if (this.lastVersion === workDataVersion) {
                // No updates
                return;
            }

            for (let i = 0; i < dirtyLines.length; ++i) {
                dirtyLines[i] = 0;
            }

            // We can track the history to find out the exact modified region.
            for (let ver: WorkDataVersion | null = this.lastVersion; ver; ver = ver.successor) {
                const {dirtyRegion} = ver;
                if (!dirtyRegion) {
                    break;
                }
                setBitArrayRange(dirtyLines, dirtyRegion.min[1], dirtyRegion.max[1]);
            }
        }
        this.lastVersion = workDataVersion;

        const {gl} = this.context.context;

        // Update the material texture
        const {materialTex, materialData, materialDataBytes} = this;
        const {material} = data;

        for (let startY = 0; startY < Layout.SIZE;) {
            // Find the successive dirty rows
            let endY: number;
            startY = findOneInBitArray(dirtyLines, startY);
            if (startY < 0) {
                break;
            }
            endY = findZeroInBitArray(dirtyLines, startY);
            if (endY < 0) {
                endY = Layout.SIZE;
            }

            // Copy from `WorkData.material` (with swizzling)
            let outIndex = startY << Layout.LOG_D1 + Layout.LOG_D2 + Layout.LOG_SIZE;
            for (let y = startY; y < endY; ++y) {
                let inIndex = y << Layout.LOG_SIZE;
                for (let z = 0; z < Layout.SIZE; ++z) {
                    let inIndex2 = inIndex;
                    for (let x = 0; x < Layout.SIZE; ++x) {
                        materialData[outIndex++] = material[inIndex2++];
                    }
                    inIndex += 1 << Layout.LOG_SIZE * 2;
                }
            }

            // Record a copy command
            gl.texSubImage2D(
                GLConstants.TEXTURE_2D,
                0,
                0,
                startY << Layout.LOG_D2,
                Layout.SIZE * Layout.D1,
                (endY - startY) << Layout.LOG_D2,
                GLConstants.RGBA,
                GLConstants.UNSIGNED_BYTE,
                materialDataBytes.subarray(
                    startY << Layout.LOG_D1 + Layout.LOG_D2 + Layout.LOG_SIZE + 2,
                    endY << Layout.LOG_D1 + Layout.LOG_D2 + Layout.LOG_SIZE + 2,
                ),
            );

            startY = endY;
        }

        // Update each mip level of the density texture
        const {densityTex, densityData} = this;
        const {density} = data;
        gl.bindTexture(GLConstants.TEXTURE_2D, densityTex);

        for (let i = 0; i <= Layout.LOG_SIZE; ++i) {
            const densCur = densityData[i];
            for (let startY = 0; startY < Layout.SIZE;) {
                // Find the successive dirty rows
                let endY: number;
                if (i < 5) {
                    startY = findOneInBitArray(dirtyLines, startY);
                    if (startY < 0) {
                        break;
                    }
                    endY = findZeroInBitArray(dirtyLines, startY);
                    if (endY < 0) {
                        endY = Layout.SIZE;
                    }
                } else {
                    while (startY < Layout.SIZE && !dirtyLines[startY >> 5]) {
                        startY += 1 << i;
                    }
                    if (startY >= Layout.SIZE) {
                        break;
                    }
                    for (endY = startY; endY < Layout.SIZE && dirtyLines[endY >> 5];) {
                        endY += 1 << i;
                    }
                }

                const startY2 = startY >> i;
                const endY2 = endY >> i;

                if (i === 0) {
                    // Copy from `WorkData.density` (with swizzling)
                    let outIndex = startY << Layout.LOG_D1 + Layout.LOG_D2 + Layout.LOG_SIZE;
                    for (let y = startY; y < endY; ++y) {
                        let inIndex = y << Layout.LOG_SIZE;
                        for (let z = 0; z < Layout.SIZE; ++z) {
                            let inIndex2 = inIndex;
                            for (let x = 0; x < Layout.SIZE; ++x) {
                                densCur[outIndex++] = density[inIndex2++];
                            }
                            inIndex += 1 << Layout.LOG_SIZE * 2;
                        }
                    }
                } else {
                    const densPrev = densityData[i - 1];
                    for (let y = startY2; y < endY2; ++y) {
                        let outIndex = y << Layout.LOG_D1 + Layout.LOG_D2 + Layout.LOG_SIZE - i; // (i, 0, y, 0)
                        let inIndex = outIndex << 2; // (i - 1, 0, y << 1, 0)

                        const offX = 1; // (i - 1, 1, 0, 0)
                        const offY = 1 << Layout.LOG_D1 + Layout.LOG_D2 + Layout.LOG_SIZE - (i - 1); // (i - 1, 0, 1, 0)
                        const offZ = 1 << Layout.LOG_SIZE - (i - 1); // (i - 1, 0, 0, 1)

                        for (let z = 0; z < Layout.SIZE >> i; ++z) {
                            let inIndex2 = inIndex;
                            for (let x = 0; x < Layout.SIZE >> i; ++x) {
                                const val1 = densPrev[inIndex2];
                                const val2 = densPrev[inIndex2 + offX];
                                const val3 = densPrev[inIndex2 + offY];
                                const val4 = densPrev[inIndex2 + offX + offY];
                                const val5 = densPrev[inIndex2 + offZ];
                                const val6 = densPrev[inIndex2 + offX + offZ];
                                const val7 = densPrev[inIndex2 + offY + offZ];
                                const val8 = densPrev[inIndex2 + offX + offY + offZ];
                                densCur[outIndex++] = Math.max(val1, val2, val3, val4, val5, val6, val7, val8);
                                inIndex2 += 2;
                            }
                            inIndex += offZ << 1;
                        }
                    }
                }

                // Record a copy command
                gl.texSubImage2D(
                    GLConstants.TEXTURE_2D,
                    i,
                    0,
                    startY2 << Layout.LOG_D2,
                    (Layout.SIZE * Layout.D1) >> i,
                    (endY2 - startY2) << Layout.LOG_D2,
                    GLConstants.LUMINANCE,
                    GLConstants.UNSIGNED_BYTE,
                    densCur.subarray(
                        startY2 << Layout.LOG_D1 + Layout.LOG_D2 + Layout.LOG_SIZE - i,
                        endY2 << Layout.LOG_D1 + Layout.LOG_D2 + Layout.LOG_SIZE - i,
                    ),
                );

                startY = endY;
            }

            // Modifiy the dirty row map for next mip level
            if (i < 5) {
                let mask;
                switch (i) {
                    case 0:
                        mask = 0x55555555; // {16{2'b01}}
                        break;
                    case 1:
                        mask = 0x33333333; // {8{4'b0011}}
                        break;
                    case 2:
                        mask = 0x0f0f0f0f; // {4{8'b00001111}}
                        break;
                    case 3:
                        mask = 0x00ff00ff;
                        break;
                    case 4:
                        mask = 0x0000ffff;
                        break;
                    default:
                        throw new Error();
                }
                for (let y = 0; y < dirtyLines.length; ++y) {
                    let t = dirtyLines[y];
                    t = (t & ~mask) | ((t & mask) << (1 << i));
                    t |= t >> (1 << i);
                    dirtyLines[y] = t;
                }
            } else {
                let pitch = 1 << (i - 5);
                for (let y = pitch; y < dirtyLines.length; y += pitch << 1) {
                    dirtyLines[y - pitch] |= dirtyLines[y];
                }
            }
        }
    }

    dispose(): void
    {
        const {gl} = this.context.context;
        gl.deleteTexture(this.densityTex);
    }
}
