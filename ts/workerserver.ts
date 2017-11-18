import { WorkerServer } from './utils/workerboot';

import * as draw from './draw/worker/server'

export function main(): void
{
    const server = new WorkerServer();
    draw.register(server);
}
