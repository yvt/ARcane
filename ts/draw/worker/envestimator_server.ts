/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import bind from 'bind-decorator';
import { vec4, mat4 } from 'gl-matrix';

import { table, assertEq } from '../../utils/utils';
import { Host, Channel } from '../../utils/workertransport';
import {
    EnvironmentEstimatorParam, EnvironmentEstimatorInput, EnvironmentEstimatorOutput, EnvironmentEstimatorConstants
} from './envestimator';

const $fr = Math.fround;

const enum Layout
{
    SIZE = 128,
}

assertEq(Layout.SIZE, EnvironmentEstimatorConstants.SIZE);

const CUBE_FACES = [
    /* positive X */ { u: [0, 0, -1], v: [0, -1, 0], n: [+1, 0, 0] },
    /* negative X */ { u: [0, 0, +1], v: [0, -1, 0], n: [-1, 0, 0] },
    /* positive Y */ { u: [+1, 0, 0], v: [0, 0, +1], n: [0, +1, 0] },
    /* negative Y */ { u: [+1, 0, 0], v: [0, 0, -1], n: [0, -1, 0] },
    /* positive Z */ { u: [+1, 0, 0], v: [0, -1, 0], n: [0, 0, +1] },
    /* negative Z */ { u: [-1, 0, 0], v: [0, -1, 0], n: [0, 0, -1] },
].map(info => {
    const {u, v, n} = info;
    const proj = mat4.fromValues(
        u[0], v[0], 0, n[0],
        u[1], v[1], 0, n[1],
        u[2], v[2], 0, n[2],
        0, 0, 1, 0,
    );
    const invProj = mat4.invert(mat4.create(), proj)!;
    return { proj, invProj };
});

const RESULT_BUFFER_SIZE = (() => {
    let total = 0;
    for (let i = Layout.SIZE; i; i >>= 1) {
        total += i * i * 4 * 6;
    }
    return total;
})();

class EnvironmentEstimator
{
    private output: Channel<EnvironmentEstimatorOutput>;
    private baseLayer = table(6, () => new Uint32Array(Layout.SIZE ** 2));

    constructor(param: EnvironmentEstimatorParam, host: Host)
    {
        const input = host.getUnwrap(param.environmentEstimatorInput);
        input.onMessage = this.handleInput;

        this.output = host.getUnwrap(param.environmentEstimatorOutput);
    }

    @bind
    private handleInput(data: EnvironmentEstimatorInput): void
    {
        // Stamp the latest camere image onto the base cube map layer
        // (We do nothing fancy (no exposure estimation nor highlight
        // restoration) - we just stamp it)
        {
            const cameraProjMat = mat4.create()
            cameraProjMat.set(data.camera.matrix);

            const {image, width, height} = data.camera;
            const image32 = new Uint32Array(image);
            const m = mat4.create();
            const vBase = vec4.create();
            const vU = vec4.create();
            const vV = vec4.create();
            const vLine1 = vec4.create();
            const vLine2 = vec4.create();

            const camWFrac2 = $fr(width / 2);
            const camHFrac2 = $fr(height / 2);

            if (image32.length < width * height) {
                throw new Error();
            }

            for (let i = 0; i < 6; ++i) {
                const face = CUBE_FACES[i];
                const layer = this.baseLayer[i];
                mat4.multiply(m, cameraProjMat, face.invProj);

                vec4.set(vBase, 0, 0, 1, 1);
                vec4.set(vU, 1, 0, 0, 0);
                vec4.set(vV, 0, 1, 0, 0);

                vec4.transformMat4(vBase, vBase, m);
                vec4.transformMat4(vU, vU, m);
                vec4.transformMat4(vV, vV, m);

                for (let y = 0; y < Layout.SIZE; ++y) {
                    const cs1Y = (y + 0.5) * (2 / Layout.SIZE) - 1;
                    vec4.sub(vLine1, vBase, vU);
                    vec4.scaleAndAdd(vLine1, vLine1, vV, cs1Y);
                    vec4.add(vLine2, vBase, vU);
                    vec4.scaleAndAdd(vLine2, vLine2, vV, cs1Y);

                    if (vLine1[3] <= 0 && vLine2[3] <= 0) {
                        continue;
                    }

                    let cs2X = vLine1[0], cs2Y = vLine1[1], cs2W = vLine1[3];
                    const cs2dX = $fr($fr(vLine2[0] - vLine1[0]) * (1 / Layout.SIZE));
                    const cs2dY = $fr($fr(vLine2[1] - vLine1[1]) * (1 / Layout.SIZE));
                    const cs2dW = $fr($fr(vLine2[3] - vLine1[3]) * (1 / Layout.SIZE));
                    let outIndex = y * Layout.SIZE;

                    cs2X = $fr(cs2X + cs2dX * 0.5);
                    cs2Y = $fr(cs2Y + cs2dY * 0.5);
                    cs2W = $fr(cs2W + cs2dW * 0.5);

                    for (let x = 0; x < Layout.SIZE; ++x) {
                        if (cs2W > 0 && Math.abs(cs2X) < cs2W && Math.abs(cs2Y) < cs2W) {
                            const rcpW = $fr(1 / cs2W);
                            const vpX = $fr($fr(cs2X * rcpW) + 1) * camWFrac2 | 0;
                            const vpY = $fr($fr(cs2Y * rcpW) + 1) * camHFrac2 | 0;
                            const color = image32[vpX + (height - 1 - vpY) * width];
                            layer[outIndex] = color;
                        }

                        cs2X = $fr(cs2X + cs2dX);
                        cs2Y = $fr(cs2Y + cs2dY);
                        cs2W = $fr(cs2W + cs2dW);
                        ++outIndex;
                    }
                }
            }
        }

        // Generate lower mip levels
        const resultBuffer = data.resultBuffer || new ArrayBuffer(RESULT_BUFFER_SIZE);
        for (let i = 0; i < 6; ++i) {
            new Uint32Array(resultBuffer).set(this.baseLayer[i], (Layout.SIZE ** 2) * i);
        }
        // TODO: generate mip levels

        this.output.postMessage({
            cameraBuffer: data.camera.image,
            result: resultBuffer,
        }, [resultBuffer, data.camera.image]);
    }
}

export function addHandler(param: EnvironmentEstimatorParam, host: Host): void
{
    new EnvironmentEstimator(param, host);
}