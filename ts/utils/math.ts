
const imul: (a: number, b: number) => number = (<any> Math).imul;

const deBruijnTable = [
    0,  9,  1, 10, 13, 21,  2, 29, 11, 14, 16, 18, 22, 25,  3, 30,
    8, 12, 20, 28, 15, 17, 24,  7, 19, 27, 23,  6, 26,  5,  4, 31
];

export const ulog2: (v: number) => number =
    imul ? (v: number) => {
        // have imul; use http://graphics.stanford.edu/~seander/bithacks.html#IntegerLogDeBruijn
        v |= v >>> 1;
        v |= v >>> 2;
        v |= v >>> 4;
        v |= v >>> 8;
        v |= v >>> 16;
        return deBruijnTable[imul(v, 0x07C4ACDD) >>> 27];
    } : (v: number) => {
        let i = 0;
        while (v != 0) {
            ++i;
            v = (v >>> 1);
        }
        return i;
    };

const deBrujinTable2 = [
    0, 1, 28, 2, 29, 14, 24, 3, 30, 22, 20, 15, 25, 17, 4, 8,
    31, 27, 13, 23, 21, 19, 16, 7, 26, 12, 18, 6, 11, 5, 10, 9
];

export const countTrailingZeroBits: (v: number) => number =
    imul ? (v: number) => {
        // have imul; use http://graphics.stanford.edu/~seander/bithacks.html#ZerosOnRightMultLookup
        return deBrujinTable2[imul(v & -v, 0x077CB531) >>> 27];
    } : (v: number) => {
        let c = 32;
        v &= -v;
        if (v !== 0) --c;
        if (v & 0x0000FFFF) c -= 16;
        if (v & 0x00FF00FF) c -= 8;
        if (v & 0x0F0F0F0F) c -= 4;
        if (v & 0x33333333) c -= 2;
        if (v & 0x55555555) c -= 1;
        return c;
    };

export function lerp(a: number, b: number, coef: number): number
{
    return a * (1 - coef) + b * coef;
}
