import { WorkerBootParam } from './port';
import { Service, WorkerServer } from '../../utils/workerboot';
import { service } from './port';

export function register(server: WorkerServer): void
{
    server.register(service, (param) => {
        // TODO
    });
}
