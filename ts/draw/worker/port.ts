/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { Service } from '../../utils/workerboot';
import { EnvironmentEstimatorParam } from './envestimator';

export type WorkerBootParam = EnvironmentEstimatorParam;

export const service = new Service<WorkerBootParam, void>('draw');
