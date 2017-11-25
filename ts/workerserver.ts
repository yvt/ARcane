/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { WorkerServer } from './utils/workerboot';

import * as draw from './draw/worker/server'

export function main(): void
{
    const server = new WorkerServer();
    draw.register(server);
}
