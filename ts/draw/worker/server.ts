/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { WorkerBootParam } from './port';
import { Service, WorkerServer } from '../../utils/workerboot';
import { service } from './port';
import * as envestimator from './envestimator_server';

export function register(server: WorkerServer): void
{
    server.register(service, (param, host) => {
        envestimator.addHandler(param, host);
    });
}
