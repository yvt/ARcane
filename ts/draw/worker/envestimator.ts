/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { ChannelId } from '../../utils/workertransport';

export interface EnvironmentEstimatorParam
{
    environmentEstimatorInput: ChannelId<EnvironmentEstimatorInput>;
    environmentEstimatorOutput: ChannelId<EnvironmentEstimatorOutput>;
}

export interface EnvironmentEstimatorInput
{
    camera: {
        image: ArrayBuffer;
        width: number;
        height: number;
        /** The projection view matrix associated with the camera image. */
        matrix: number[];
    };
    resultBuffer?: ArrayBuffer;
}

export interface EnvironmentEstimatorOutput
{
    cameraBuffer: ArrayBuffer;
    result: ArrayBuffer;
}

export const enum EnvironmentEstimatorConstants
{
    LOG_SIZE = 8,
    SIZE = 1 << LOG_SIZE,
}