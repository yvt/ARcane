/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import * as uuidv4 from 'uuid/v4';
import { IDisposable } from '../utils/interfaces';

/**
 * Maintains locks on local documents (data stored in a local storage such as
 * Web Storage and IndexedDB) identified using string identifiers.
 *
 * The implemented lock mechanism is not very robust and might misbehave in an
 * extreme condition.
 */
export abstract class LocalLockMonitor
{
    private readonly _brandLocalLockMonitor: {};

    static get instance(): LocalLockMonitor
    {
        return inst;
    }

    abstract lock(id: string): Promise<LocalLockGuard | null>;
}

export abstract class LocalLockGuard implements IDisposable
{
    private readonly _brandLocalLockGuard: {};

    abstract dispose(): void;
}

const ACQUIRE_PREFIX = 'LocalLockMonitor:';

class LocalLockMonitorImpl extends LocalLockMonitor
{
    guards = new Map<string, LocalLockGuardImpl>();
    watches = new Map<string, () => void>();

    constructor()
    {
        super();

        window.addEventListener('storage', (e) => {
            const {key, storageArea, newValue} = e;
            if (storageArea !== localStorage || !key || !newValue) {
                return;
            }
            if (key.startsWith(ACQUIRE_PREFIX)) {
                if (newValue.startsWith('acquire:')) {
                    const id = key.substring(ACQUIRE_PREFIX.length);
                    if (this.guards.has(id)) {
                        // Deny access
                        localStorage.setItem(key, 'deny:' + uuidv4());
                    }
                } else {
                    // The access was denied
                    const handler = this.watches.get(key);
                    if (handler) {
                        handler();
                    }
                }
            }
        });
    }

    lock(id: string): Promise<LocalLockGuard | null>
    {
        return new Promise((resolve, reject) => {
            if (this.guards.has(id)) {
                resolve(null);
                return;
            }

            const storageKey = ACQUIRE_PREFIX + id;

            if (this.watches.has(storageKey)) {
                resolve(null);
                return;
            }

            let resolved = false;
            let timer = setTimeout(() => {
                // No one has responded
                this.watches.delete(storageKey);
                localStorage.removeItem(storageKey);
                if (resolved) {
                    return;
                }
                const guard = new LocalLockGuardImpl(id, this);
                this.guards.set(id, guard);
                resolve(guard);
            }, 500);

            const denyHandler = () => {
                resolved = true;
                this.watches.delete(storageKey);
                localStorage.removeItem(storageKey);
                clearTimeout(timer);
                resolve(null);
                return;
            };

            this.watches.set(storageKey, denyHandler);
            localStorage.setItem(storageKey, 'acquire:' + uuidv4());
        });
    }
}

class LocalLockGuardImpl extends LocalLockGuard
{
    constructor(private readonly id: string, private readonly parent: LocalLockMonitorImpl)
    {
        super();
    }

    dispose(): void
    {
        this.parent.guards.delete(this.id);
    }
}

const inst = new LocalLockMonitorImpl();