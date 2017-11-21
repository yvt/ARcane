
import { countTrailingZeroBits } from "./math";

let bitSteps: Int32Array;
{
    const bitStepsArray: number[] = [];
    for (let i = 0; i < 32; ++i) {
        bitStepsArray.push((1 << i) - 1);
    }
    bitStepsArray.push(0xffffffff);
    bitSteps = new Int32Array(bitStepsArray);
}

export function setBitArrayRange(bits: Int32Array | Uint32Array, start: number, end: number): void
{
    if (end <= start) {
        return;
    }
    const bs = bitSteps;
    const c1 = start >> 5, c2 = (end - 1) >> 5;
    const f1 = start & 0x1f, f2 = end - (c2 << 5);
    if (c1 >= bits.length || c2 >= bits.length) {
        throw new Error("Index out of range");
    }
    if (c1 === c2) {
        bits[c1] |= bs[f2] ^ bs[f1];
    } else {
        bits[c1] |= ~bs[f1];
        bits[c2] |= bs[f2];
        for (let i = c1 + 1; i < c2; ++i) {
            bits[i] = 0xffffffff;
        }
    }
}

export function resetBitArrayRange(bits: Int32Array | Uint32Array, start: number, end: number): void
{
    if (end <= start) {
        return;
    }
    const bs = bitSteps;
    const c1 = start >> 5, c2 = (end - 1) >> 5;
    const f1 = start & 0x1f, f2 = end - (c2 << 5);
    if (c1 >= bits.length || c2 >= bits.length) {
        throw new Error("Index out of range");
    }
    if (c1 === c2) {
        bits[c1] &= ~(bs[f2] ^ bs[f1]);
    } else {
        bits[c1] &= bs[f1];
        bits[c2] &= ~bs[f2];
        for (let i = c2, k = c2; i < k; ++i) {
            bits[i] = 0;
        }
    }
}

export function findOneInBitArray(bits: Int32Array | Uint32Array, start: number): number
{
    let c = start >> 5, f = start & 31;
    if (f > 0) {
        const e = bits[c] >>> f;
        if (e) {
            return (countTrailingZeroBits(e) + f) + (c << 5);
        }
        ++c;
    }
    while (c < bits.length) {
        const e = bits[c];
        if (e) {
            return countTrailingZeroBits(e) + (c << 5);
        }
        ++c;
    }
    return -1;
}

export function findZeroInBitArray(bits: Int32Array | Uint32Array, start: number): number {
    let c = start >> 5, f = start & 31;
    if (f > 0) {
        const e = ~(bits[c] >>> f);
        if (e) {
            return (countTrailingZeroBits(e) + f) + (c << 5);
        }
        ++c;
    }
    while (c < bits.length) {
        const e = ~bits[c];
        if (e) {
            return countTrailingZeroBits(e) + (c << 5);
        }
        ++c;
    }
    return -1;
}


