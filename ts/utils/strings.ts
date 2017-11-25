/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

export function stringRepeat(str: string, count: number): string
{
   const parts: string[] = [];
   for (let i = 0; i < count; ++i) {
       parts.push(str);
   }
   return parts.join("");
}

export function fillWith(str: string, ln: number, ch: string): string
{
    return str + stringRepeat(ch, Math.max(0, ln - str.length));
}

export function fillWithRightAligned(str: string, ln: number, ch: string): string
{
    return stringRepeat(ch, Math.max(0, ln - str.length)) + str;
}

export function addLineNumbers(text: string): string
{
    const lines = text.split('\n');
    let numDigits = 0;
    for (let i = lines.length; i > 0;) {
        i = i / 10 | 0;
        ++numDigits;
    }
    return lines
        .map((line, i) => fillWithRightAligned(String(i + 1), numDigits, ' ') + ' ' + line)
        .join('\n');
}
