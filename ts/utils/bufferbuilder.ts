/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

export const enum ArrayViewTypeFlags
{
    U8 = 1 << 0,
    U16 = 1 << 1,
    U32 = 1 << 2,
    I8 = 1 << 3,
    I16 = 1 << 4,
    I32 = 1 << 5,
    F32 = 1 << 6,
    All = U8 | U16 | U32 | I8 | I16 | I32 | F32,
}

export class BufferBuilder
{
    arrayBuffer: ArrayBuffer;
    u8: Uint8Array;
    u16: Uint16Array;
    u32: Uint32Array;
    i8: Int8Array;
    i16: Int16Array;
    i32: Int32Array;
    f32: Float32Array;
    length: number;

    constructor(capacity: number, flags = ArrayViewTypeFlags.All)
    {
        this.arrayBuffer = new ArrayBuffer(capacity);
        // U8 is mandatory — otherwise we can't resize the buffer with preserving the contents
        this.u8 = new Uint8Array(this.arrayBuffer);
        this.u16 = (flags & ArrayViewTypeFlags.U16) ? new Uint16Array(this.arrayBuffer) : null!;
        this.u32 = (flags & ArrayViewTypeFlags.U32) ? new Uint32Array(this.arrayBuffer) : null!;
        this.i8 = (flags & ArrayViewTypeFlags.I8) ? new Int8Array(this.arrayBuffer) : null!;
        this.i16 = (flags & ArrayViewTypeFlags.I16) ? new Int16Array(this.arrayBuffer) : null!;
        this.i32 = (flags & ArrayViewTypeFlags.I32) ? new Int32Array(this.arrayBuffer) : null!;
        this.f32 = (flags & ArrayViewTypeFlags.F32) ? new Float32Array(this.arrayBuffer) : null!;
    }

    reserve(newCapacity: number)
    {
        let cap = this.arrayBuffer.byteLength;
        if (newCapacity <= cap) {
            return;
        }
        while (newCapacity > cap) {
            cap <<= 1;
        }
        const newAB = new ArrayBuffer(cap);
        const newU8 = new Uint8Array(newAB);
        newU8.set(this.u8.subarray(0, this.length));

        this.arrayBuffer = newAB;
        this.u8 = newU8;
        this.u16 = new Uint16Array(newAB);
        this.u32 = new Uint32Array(newAB);
        this.i8 = new Int8Array(newAB);
        this.i16 = new Int16Array(newAB);
        this.i32 = new Int32Array(newAB);
        this.f32 = new Float32Array(newAB);
    }

    reserveExtra(extra: number)
    {
        this.reserve(this.length + extra);
    }

    clear() { this.length = 0; }

    pushU8(value: number)
    {
        this.reserveExtra(1);
        this.u8[this.length] = value;
        this.length += 1;
    }

    pushU16(value: number)
    {
        this.reserveExtra(2);
        this.u16[this.length >> 1] = value;
        this.length += 2;
    }

    pushU32(value: number)
    {
        this.reserveExtra(4);
        this.u32[this.length >> 2] = value;
        this.length += 4;
    }

    pushF32(value: number)
    {
        this.reserveExtra(4);
        this.f32[this.length >> 2] = value;
        this.length += 4;
    }

    getU8Subarray(): Uint8Array
    {
        return this.u8.subarray(0, this.length);
    }
}