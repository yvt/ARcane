/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
export type Constructor<T> = Function & { prototype: T };

/**
 * Checks the type of the given object at runtime and returns a typed value.
 */
export function downcast<T>(ctor: Constructor<T>, obj: any): T
{
    if (typeof obj !== 'object') {
        throw new TypeError(`expected object, got ${typeof obj}`);
    }
    if (!(obj instanceof ctor)) {
        throw new TypeError("invalid class type");
    }
    return <T> obj;
}

/**
 * Checks the type of the given object at runtime and returns a typed value.
 * Returns `null` for a null-ish value (`undefined` or `null`).
 */
export function downcastOrNull<T>(ctor: Constructor<T>, obj: any): T | null
{
    if (obj == null) {
        return obj;
    }
    return downcast(ctor, obj);
}

export function filterMap<T, S>(array: ArrayLike<T>, cb: (e: T, i: number) => S | null | undefined): S[]
{
    const result: S[] = [];
    for (let i = 0; i < array.length; ++i) {
        const value = cb(array[i], i);
        if (value != null) {
            result.push(value);
        }
    }
    return result;
}

export function assert(cond: boolean, message?: string): void
{
    if (!cond) {
        if (message != null) {
            throw new Error(`Assertion failed.: ${message}`);
        } else {
            throw new Error("Assertion failed.");
        }
    }
}

export function assertEq(got: any, expected: any): void
{
    if (got !== expected) {
        throw new Error(`Expected ${expected}, got ${got}`);
    }
}
