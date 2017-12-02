/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import bind from 'bind-decorator';
import { mat4 } from 'gl-matrix';

import { Host, Channel } from '../../utils/workertransport';
import {
    EnvironmentEstimatorParam, EnvironmentEstimatorInput, EnvironmentEstimatorOutput, EnvironmentEstimatorConstants
} from './envestimator';

import { GLContext } from '../globjs/context';
import { GLConstants } from '../globjs/constants';
import { Scene, CameraImageData } from '../model';

const LOG_SIZE = EnvironmentEstimatorConstants.LOG_SIZE;
const SIZE = EnvironmentEstimatorConstants.SIZE;

export interface EnvironmentEstimatorContext
{
    readonly host: Host;
    readonly context: GLContext;
    readonly scene: Scene;
}

export class EnvironmentEstimatorClient
{
    private input: Channel<EnvironmentEstimatorInput>;
    private output: Channel<EnvironmentEstimatorOutput>;

    texture: WebGLTexture;

    private response: false | true | EnvironmentEstimatorOutput = true;

    onPerformanceProfile: ((text: string) => void) | null = null;

    constructor(private context: EnvironmentEstimatorContext)
    {
        this.input = context.host.open();
        this.output = context.host.open();

        const {gl} = context.context;
        this.texture = gl.createTexture()!;
        gl.bindTexture(GLConstants.TEXTURE_CUBE_MAP, this.texture);
        gl.texParameteri(GLConstants.TEXTURE_CUBE_MAP, GLConstants.TEXTURE_MAG_FILTER, GLConstants.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(GLConstants.TEXTURE_CUBE_MAP, GLConstants.TEXTURE_MIN_FILTER, GLConstants.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(GLConstants.TEXTURE_CUBE_MAP, GLConstants.TEXTURE_WRAP_S, GLConstants.CLAMP_TO_EDGE);
        gl.texParameteri(GLConstants.TEXTURE_CUBE_MAP, GLConstants.TEXTURE_WRAP_T, GLConstants.CLAMP_TO_EDGE);

        for (let i = 0; i <= LOG_SIZE; ++i) {
            for (let k = 0; k < 6; ++k) {
                gl.texImage2D(GLConstants.TEXTURE_CUBE_MAP_POSITIVE_X + k, i,
                    GLConstants.SRGB_ALPHA_EXT, SIZE >> i, SIZE >> i, 0,
                    GLConstants.SRGB_ALPHA_EXT,
                    GLConstants.UNSIGNED_BYTE,
                    null);
            }
        }

        this.output.onMessage = this.handleOutput;
    }

    dispose(): void
    {
        this.context.context.gl.deleteTexture(this.texture);
    }

    get bootParam(): EnvironmentEstimatorParam
    {
        return {
            environmentEstimatorInput: this.input.id,
            environmentEstimatorOutput: this.output.id,
        };
    }

    update(cameraImage: CameraImageData): void
    {
        const {scene} = this.context;
        const {gl} = this.context.context;

        // Process the response from the worker
        if (typeof this.response === 'object') {
            const u8 = new Uint8Array(this.response.result);

            gl.bindTexture(GLConstants.TEXTURE_CUBE_MAP, this.texture);
            let index = 0;
            for (let i = 0; i <= LOG_SIZE; ++i) {
                for (let k = 0; k < 6; ++k) {
                    gl.texSubImage2D(GLConstants.TEXTURE_CUBE_MAP_POSITIVE_X + k, i,
                        0, 0, SIZE >> i, SIZE >> i,
                        GLConstants.SRGB_ALPHA_EXT,
                        GLConstants.UNSIGNED_BYTE,
                        u8.subarray(index));
                    index += ((SIZE >> i) ** 2) * 4;
                }
            }
        }

        if (!this.response) {
            // The worker is still busy and is not ready to accept new data.
            return;
        }

        const cameraMatrix = mat4.create();
        mat4.invert(cameraMatrix, scene.viewToEnvMatrix);
        // Remove the translation component
        cameraMatrix[12] = 0;
        cameraMatrix[13] = 0;
        cameraMatrix[14] = 0;
        mat4.multiply(cameraMatrix, scene.projectionMatrix, cameraMatrix);
        // TODO: use `cameraTextureMatrix`, or a projection matrix specific to the camera image

        let cameraImageBuffer =
            typeof this.response === 'object' &&
            this.response.cameraBuffer.byteLength == cameraImage.width * cameraImage.height * 4 ?
            this.response.cameraBuffer : new ArrayBuffer(cameraImage.width * cameraImage.height * 4);
        new Uint8Array(cameraImageBuffer).set(cameraImage.data);

        const input: EnvironmentEstimatorInput = {
            camera: {
                image: cameraImageBuffer,
                width: cameraImage.width,
                height: cameraImage.height,
                matrix: Array.prototype.slice.call(cameraMatrix, 0, 16),
            },
            resultBuffer: void 0,
            profilePerformance: !!this.onPerformanceProfile,
        };
        const transferList: any[] = [cameraImageBuffer];

        // Reuse the response buffer
        if (typeof this.response === 'object') {
            input.resultBuffer = this.response.result;
            transferList.push(this.response.result);
        }

        this.input.postMessage(input, transferList);
        this.response = false;
    }

    @bind
    private handleOutput(data: EnvironmentEstimatorOutput): void
    {
        this.response = data;
        if (this.onPerformanceProfile) {
            this.onPerformanceProfile(data.performanceProfilingResult);
        }
    }
}
