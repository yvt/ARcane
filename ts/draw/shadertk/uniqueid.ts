/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
const base26Chars = "abcdefghijklmnopqrstuvwxyz";

let nextIdtIndex = 0;
/**
 * Generates a unique identifier.
 *
 * @return A unique identifier.
 */
export function allocateIdentifier(): string
{
    let id = nextIdtIndex++;
    let s = "_h3d_";
    while (id != 0) {
        s += base26Chars[id % 26];
        id = id / 26 | 0;
    }
    return s;
}

/**
 * Generates zero or more unique identifiers.
 *
 * @param count The number of identifiers to create.
 * @return An array containing unique identifiers.
 */
export function allocateIdentifiers(count: number): string[]
{
    if ((count |= 0) < 0) {
        throw new Error("invalid argument");
    }

    const ret: string[] = [];
    for (let i = 0; i < count; ++i) {
        ret.push(allocateIdentifier());
    }
    return ret;
}
