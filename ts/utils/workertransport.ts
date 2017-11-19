export interface ChannelId<T>
{
    /** A marker to enforce nominal typing. */
    readonly _channelIdBrand: T;

    readonly id: number;
}

export interface Channel<T>
{
    /** A marker to enforce nominal typing. */
    readonly _channelBrand: T;

    readonly id: ChannelId<T>;
    readonly host: Host;

    onMessage: null | ((data: T) => void);
    postMessage(data: T, transferList?: any[]): void;
    close(): void;
}

enum MessageType
{
    Open,
    Close,
    Data,
}

function channelClosed(): never
{
    throw new Error("The channel is already closed.");
}

export abstract class Host
{
    private _hostBrand: {};
    private nextId: number;
    private channels = new Map<number, Channel<any>>();

    constructor(hostId: number)
    {
        this.nextId = hostId + 2;
        this.createChannel(0);
    }

    get rootChannel(): Channel<any>
    {
        return this.channels.get(0)!;
    }

    private createChannel(id: number): Channel<any>
    {
        const channel: Channel<any> = {
            _channelBrand: undefined as any,
            id: { id } as ChannelId<any>,
            onMessage: null,
            host: this,
            postMessage(this: Channel<any>, data: any, transferList?: any[]): void
            {
                this.host.postMessage({
                    type: MessageType.Data,
                    id: this.id.id,
                    payload: data,
                }, transferList);
            },
            close(this: Channel<any>): void
            {
                this.host.postMessage({
                    type: MessageType.Close,
                    id: this.id.id,
                });
                this.postMessage = channelClosed;
            },
        };

        this.channels.set(id, channel);
        return channel;
    }

    /** Open a receiving channel. */
    open<T>(): Channel<T>
    {
        const id = this.nextId;
        this.nextId += 2; // so IDs generated by the server and client do not collide
        this.postMessage({
            type: MessageType.Open,
            id: id,
        });
        return this.createChannel(id);
    }

    get<T>(id: ChannelId<T>): Channel<T> | null
    {
        return this.channels.get(id.id) || null;
    }

    getUnwrap<T>(id: ChannelId<T>): Channel<T>
    {
        const c = this.channels.get(id.id);
        if (!c) {
            throw new Error("The channel was not found.");
        }
        return c;
    }

    protected onMessage(data: any): void
    {
        switch (data.type) {
            case MessageType.Open:
                this.createChannel(data.id);
                break;
            case MessageType.Close: {
                const ch = this.channels.get(data.id);
                if (ch) {
                    ch.postMessage = channelClosed;
                }
                this.channels.delete(data.id);
                break;
            }
            case MessageType.Data: {
                const ch = this.channels.get(data.id);
                if (ch && ch.onMessage) {
                    ch.onMessage(data.payload);
                }
                break;
            }
        }
    }

    protected abstract postMessage(data: any, transferList?: any[]): void;
}

export class BrowserHost extends Host
{
    constructor(private worker: Worker)
    {
        super(0);

        worker.onmessage = (e) => {
            this.onMessage(e.data);
        };
    }

    protected postMessage(data: any, transferList?: any[]): void
    {
        this.worker.postMessage(data, transferList);
    }
}

export class WorkerHost extends Host
{
    constructor()
    {
        super(2);
        onmessage = (e) => {
            this.onMessage(e.data);
        };
    }

    protected postMessage(data: any, transferList?: any[]): void
    {
        postMessage(data, transferList);
    }
}