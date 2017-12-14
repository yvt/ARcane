/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import bind from 'bind-decorator';
import { vec4, mat4 } from 'gl-matrix';
import { WasmHelper, Ptr } from '../../utils/wasm';
import { fillWithRightAligned } from '../../utils/strings';

const envmapgenModule: (imports?: any) => Promise<WebAssembly.ResultObject> =
    require('../../../target/envmapgen.wasm');

import { table, assertEq } from '../../utils/utils';
import { Host, Channel } from '../../utils/workertransport';
import {
    EnvironmentEstimatorParam, EnvironmentEstimatorInput, EnvironmentEstimatorOutput, EnvironmentEstimatorConstants,
    BlurInputOutput,
} from './envestimator';

const LOG_SIZE = EnvironmentEstimatorConstants.LOG_SIZE;
const SIZE = EnvironmentEstimatorConstants.SIZE;

type EnvmapgenContext = Ptr;

interface EnvmapgenExports
{
    memory: WebAssembly.Memory;

    emg_malloc(size: number): Ptr;
    emg_free(ptr: Ptr): void;

    emg_context_new(): EnvmapgenContext;
    emg_context_destroy(self: EnvmapgenContext): void;
    emg_context_stamp(
        self: EnvmapgenContext,
        image: Ptr,
        width: number,
        height: number,
        camera_matrix: Ptr,
    ): void;
    emg_context_get_image_size(self: EnvmapgenContext): number;
    emg_context_process(self: EnvmapgenContext): void;
    emg_context_get_output_image_data(
        self: EnvmapgenContext,
        mip_level: number,
        cube_face: number,
    ): Ptr;

    emg_spherical_blur(size: number, images: Ptr): void;
}

const RESULT_BUFFER_SIZE = (() => {
    let total = 0;
    for (let i = SIZE; i; i >>= 1) {
        total += i * i * 4 * 6;
    }
    return total;
})();

class EnvironmentEstimator
{
    private output: Channel<EnvironmentEstimatorOutput>;

    // private envmapgen: Promise<WebAssembly.Instance>;
    private envmapgen: Promise<{
        instance: WebAssembly.Instance;
        context: EnvmapgenContext;
        matrixBuffer: Ptr;
        cameraImageBuffer: null | {
            ptr: Ptr;
            size: number;
        };
    }>;

    constructor(param: EnvironmentEstimatorParam, private host: Host)
    {
        const input = host.getUnwrap(param.environmentEstimatorInput);
        input.onMessage = this.handleInput;

        this.output = host.getUnwrap(param.environmentEstimatorOutput);

        const blurInOut = host.getUnwrap(param.blurInputOutput);
        blurInOut.onMessage = this.handleBlurRequest;

        this.envmapgen = (async () => {
            const helper = new WasmHelper();
            const compiled = await envmapgenModule(helper.augumentImportObject());
            helper.link(compiled.instance.exports);

            const emg: EnvmapgenExports = compiled.instance.exports;
            const context = emg.emg_context_new();
            const matrixBuffer = emg.emg_malloc(64);

            assertEq(emg.emg_context_get_image_size(context), SIZE);

            return {
                instance: compiled.instance,
                context,
                matrixBuffer,
                cameraImageBuffer: null,
            };
        })();
    }

    @bind
    private async handleBlurRequest(data: BlurInputOutput): Promise<void>
    {
        const emg = await this.envmapgen;
        const emgExports: EnvmapgenExports = emg.instance.exports;
        const bufferPtr = emgExports.emg_malloc(data.image.length);

        new Uint8Array(emgExports.memory.buffer, bufferPtr, data.image.length)
            .set(data.image);

        emgExports.emg_spherical_blur(data.size, bufferPtr);

        data.image.set(new Uint8Array(emgExports.memory.buffer, bufferPtr, data.image.length));

        // Send back the result
        this.host.getUnwrap(data.channel).postMessage(data, [data.image.buffer]);
    }

    @bind
    private async handleInput(data: EnvironmentEstimatorInput): Promise<void>
    {
        const emg = await this.envmapgen;
        const emgExports: EnvmapgenExports = emg.instance.exports;
        let t1, t2, t3, t4;

        // Stamp the latest camere image onto the base cube map layer
        // (We do nothing fancy (no exposure estimation nor highlight
        // restoration) - we just stamp it)
        {
            const {image, width, height} = data.camera;
            const size = width * height * 4;
            if (!emg.cameraImageBuffer || size > emg.cameraImageBuffer.size) {
                if (emg.cameraImageBuffer) {
                    emgExports.emg_free(emg.cameraImageBuffer.ptr);
                }

                const ptr = emgExports.emg_malloc(size);
                emg.cameraImageBuffer = {
                    ptr,
                    size,
                };
            }
            new Uint8Array(emgExports.memory.buffer, emg.cameraImageBuffer.ptr, size)
                .set(new Uint8Array(data.camera.image));

            new Float32Array(emgExports.memory.buffer, emg.matrixBuffer, 16)
                .set(data.camera.matrix);

            t1 = performance.now();
            emgExports.emg_context_stamp(emg.context, emg.cameraImageBuffer.ptr, width, height, emg.matrixBuffer);
        }

        t2 = performance.now();
        emgExports.emg_context_process(emg.context);
        t3 = performance.now();

        // Generate the result image
        const resultBuffer = data.resultBuffer || new ArrayBuffer(RESULT_BUFFER_SIZE);
        {
            const outU8 = new Uint8Array(resultBuffer);
            let outIndex = 0;
            for (let level = 0; level <= LOG_SIZE; ++level) {
                const size = SIZE >> level;
                const numTexels = size * size;
                for (let i = 0; i < 6; ++i) {
                    const wasmPtr = emgExports.emg_context_get_output_image_data(emg.context, level, i);
                    outU8.set(new Uint8Array(emgExports.memory.buffer, wasmPtr, numTexels * 4), outIndex);
                    outIndex += numTexels * 4;
                }
            }
        }

        t4 = performance.now();

        let performanceProfilingResult = '';

        if (data.profilePerformance) {
            const colWidth = 10;
            performanceProfilingResult += `| Stamp              | ${fillWithRightAligned(String((t2 - t1) * 1000 | 0), colWidth, ' ')} μs |\n`;
            performanceProfilingResult += `| Pyramid Generation | ${fillWithRightAligned(String((t3 - t2) * 1000 | 0), colWidth, ' ')} μs |\n`;
            performanceProfilingResult += `| Copy Output        | ${fillWithRightAligned(String((t4 - t3) * 1000 | 0), colWidth, ' ')} μs |`;
        }

        this.output.postMessage({
            cameraBuffer: data.camera.image,
            result: resultBuffer,
            performanceProfilingResult,
        }, [resultBuffer, data.camera.image]);
    }
}

export function addHandler(param: EnvironmentEstimatorParam, host: Host): void
{
    new EnvironmentEstimator(param, host);
}