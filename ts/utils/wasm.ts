/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import bind from 'bind-decorator';

export type Ptr = number;

export class WasmHelper
{
    private memory: WebAssembly.Memory | null = null;

    constructor()
    {
    }

    augumentImportObject(importObject: any = {}): any
    {
        if (!importObject.env) {
            importObject.env = {};
        }

        importObject.env.crypto_get_random_values = this.cryptoGetRandomValues;
        importObject.env.powf = Math.pow;
        importObject.env.expf = Math.exp;

        return importObject;
    }

    link(exportObject: any): void
    {
        this.memory = exportObject.memory;
    }

    private growIfNeeded(length: number): void
    {
        const {memory} = this;
        if (!memory) {
            throw new Error();
        }
        if (memory.buffer.byteLength >= length) {
            return;
        }
        const extraPages = ((length + 0xffff) >> 16) - (memory.buffer.byteLength >> 16);
        memory.grow(extraPages);
    }

    @bind
    private cryptoGetRandomValues(count: number, bytesPtr: number): void
    {
        this.growIfNeeded(bytesPtr + count);
        crypto.getRandomValues(new Uint8Array(this.memory!.buffer, bytesPtr, count));
    }
}
