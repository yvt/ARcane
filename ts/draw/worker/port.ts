/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { IDisposable } from '../../utils/interfaces';
import { Service } from '../../utils/workerboot';

export interface WorkerBootParam
{
}

export const service = new Service<WorkerBootParam, void>('draw');
