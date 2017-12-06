/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
export class ObjectPool<T>
{
    private pool: T[];

    constructor(private factory: () => T)
    {
        this.pool = [];
    }
    alloc(): T
    {
        const obj = this.pool.pop();
        return obj ? obj : this.factory();
    }
    free(obj: T): void
    {
        this.pool.push(obj);
    }
}
