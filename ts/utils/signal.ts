/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

export class Signal<T>
{
    private listeners: ((arg: T) => void)[] | null;

    constructor()
    {
        this.listeners = null;
    }

    connect(cb: (arg: T) => void): void
    {
        let {listeners} = this;
        if (!listeners) {
            this.listeners = listeners = [];
        }
        listeners.push(cb);
    }

    disconnect(cb: (arg: T) => void): void
    {
        const {listeners} = this;
        if (!listeners) {
            throw new Error();
        }
        listeners.splice(listeners.indexOf(cb), 1);
    }

    invoke(caller: any, arg: T): void
    {
        const {listeners} = this;
        if (listeners) {
            for (const listener of listeners) {
                listener.call(caller, arg);
            }
        }
    }
}