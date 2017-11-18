import { IDisposable } from './interfaces';
import { Channel, ChannelId, WorkerHost, BrowserHost, Host } from './workertransport';

export class Service<T, R>
{
    _serviceBrand: [T, R];

    constructor(public readonly identifier: string)
    {
    }
}

export type ServiceHandler<T, R> = (param: T, host: Host) => R;

interface RootMessage
{
    identifier: string;
    param: any;
    response: ChannelId<false | { result: any }>;
}

export class WorkerServer
{
    readonly host: Host = new WorkerHost();

    private services = new Map<string, ServiceHandler<any, any>>();

    constructor()
    {
        this.host.rootChannel.onMessage = (data: false | RootMessage) => {
            if (data === false) {
                close();
                return;
            }

            const response = this.host.getUnwrap(data.response);
            const service = this.services.get(data.identifier);
            if (service) {
                const result = service(data.param, this.host);
                response.postMessage({ result });
            } else {
                response.postMessage(false);
            }
            response.close();
        };
    }

    register<T, R>(service: Service<T, R>, listener: ServiceHandler<T, R>): void
    {
        if (this.services.has(service.identifier)) {
            throw new Error(`Duplicate service identifier: ${service.identifier}`);
        }

        this.services.set(service.identifier, listener);
    }
}

export class WorkerClient implements IDisposable
{
    readonly host: Host;

    constructor(public readonly worker: Worker)
    {
        this.host = new BrowserHost(worker);
    }

    dispose(): void
    {
        this.host.rootChannel.postMessage(false);
    }

    call<T, R>(service: Service<T, R>, param: T): Promise<R>
    {
        return new Promise((resolve, reject) => {
            const response = this.host.open<false | { result: R }>();
            response.onMessage = (data) => {
                if (data) {
                    resolve(data.result);
                } else {
                    reject("The service is not defined on the server.");
                }
            };

            this.host.rootChannel.postMessage({
                identifier: service.identifier,
                param: param,
                response: response.id,
            } as RootMessage);
        });
    }
}