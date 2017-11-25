/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec3 } from 'gl-matrix';

export interface Work
{
    /** The latest `WorkDataVersion` (i.e., its `successor` is `null`). */
    readonly data: WorkDataVersion;
}

export interface WorkDataMutateContext
{
    readonly data: WorkData;

    markDirty(min: ReadonlyArray<number>, max: ReadonlyArray<number>): void;
}

/**
 * Represents a version of the work data.
 *
 * The amount of the work data is usually very large, making it prohibitive to
 * employ immutablility on that. `WorkDataVersion` simulates immutability by creating
 * a new instance of `WorkDataVersion` for each version and transfering the ownership
 * of the contained data between its instances.
 */
export class WorkDataVersion
{
    private _successor: WorkDataVersion | null;
    private _data: WorkData | null;
    private _dirtyRegion: { min: vec3; max: vec3; } | null = null;

    /** The successor of this version, or `null` if this is the latest one. */
    get successor(): WorkDataVersion | null { return this._successor; }

    /** The lastest version on its timeline. */
    get head(): WorkDataVersion
    {
        let v: WorkDataVersion = this;
        while (v._successor) {
            v = v._successor;
        }
        return v;
    }

    /** The AABB region updated between this version and the next one, or `null` if this is the latest one. */
    get dirtyRegion(): { min: vec3; max: vec3; } | null { return this._dirtyRegion; }

    /**
     * The contained data.
     *
     * Returns `null` if this is not the latest version. In this case, you have
     * to walk through `scuccessor`s to find the latest one in order to
     * retrieve the current `WorkData`.
     *
     * The returned `WorkData` should not be modified directly. Use `mutate`
     * instead.
     */
    get data(): WorkData | null { return this._data; }

    private constructor()
    {
    }

    /**
     * Constructs a `WorkDataVersion` with a given `WorkData`.
     *
     * Note: The ownership of `data` is considered to be transferred to the
     * new `WorkDataVersion`. That means you will no longer be able to
     * manipulate `data` directly.
     */
    static create(data: WorkData): WorkDataVersion
    {
        const ver = new WorkDataVersion();
        ver._data = data;
        return ver;
    }

    mutate(transformer: (context: WorkDataMutateContext) => void): WorkDataVersion
    {
        if (!this._data || this._successor || this._dirtyRegion) {
            throw new Error("Cannot mutate an out-dated WorkDataVersion");
        }

        const context = new WorkDataMutateContextImpl(this._data);

        transformer(context);

        if (context.dirtyRegion) {
            const succ = new WorkDataVersion();
            succ._data = this._data;

            this._dirtyRegion = context.dirtyRegion;
            context.dirtyRegion = null;
            this._successor = succ;
            this._data = null;
            return succ;
        } else {
            return this;
        }
    }
}

class WorkDataMutateContextImpl implements WorkDataMutateContext
{
    dirtyRegion: { min: vec3; max: vec3; } | null = null;

    constructor(public data: WorkData)
    {
    }

    markDirty(min: ReadonlyArray<number>, max: ReadonlyArray<number>): void
    {
        if (this.dirtyRegion) {
            const dirtyRegion = this.dirtyRegion;
            dirtyRegion.min[0] = Math.min(dirtyRegion.min[0], min[0]);
            dirtyRegion.min[1] = Math.min(dirtyRegion.min[1], min[1]);
            dirtyRegion.min[2] = Math.min(dirtyRegion.min[2], min[2]);
            dirtyRegion.max[0] = Math.max(dirtyRegion.max[0], max[0]);
            dirtyRegion.max[1] = Math.max(dirtyRegion.max[1], max[1]);
            dirtyRegion.max[2] = Math.max(dirtyRegion.max[2], max[2]);
        } else {
            this.dirtyRegion = {
                min: vec3.set(vec3.create(), min[0], min[1], min[2]),
                max: vec3.set(vec3.create(), max[0], max[1], max[2]),
            };
        }
    }
}

export const enum WorkDataConstants
{
    GRID_SIZE = 256,
}

export const GRID_SIZE = WorkDataConstants.GRID_SIZE;

export function mapIndex(x: number, y: number, z: number): number
{
    return x + GRID_SIZE * (y + GRID_SIZE * z);
}

/**
 * The work data.
 *
 * It depends on the context whether the data is immutable or not.
 */
export class WorkData
{
    /**
     * The density map, stored in the x-major order.
     */
    readonly density = new Uint8Array(GRID_SIZE * GRID_SIZE * GRID_SIZE);

    readonly mapIndex = mapIndex;
}

export function createWork(): Work
{
    return {
        data: WorkDataVersion.create(new WorkData()),
    };
}
