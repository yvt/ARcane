import { IDisposable } from '../../utils/interfaces';
import { Service } from '../../utils/workerboot';

export interface WorkerBootParam
{
}

export const service = new Service<WorkerBootParam, void>('draw');
