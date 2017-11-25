/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
const base26Chars = "abcdefghijklmnopqrstuvwxyz";

let nextIdtIndex = 0;
/**
 * Generates a unique identifier to be used as the value for the `id` attribute.
 *
 * @return A unique identifier.
 */
export function allocateIdentifier(): string
{
    let id = nextIdtIndex++;
    let s = "agui-";
    while (id != 0) {
        s += base26Chars[id % 26];
        id = id / 26 | 0;
    }
    return s;
}
