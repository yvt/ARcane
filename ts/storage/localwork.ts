/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { default as idb, DB, UpgradeDB, Transaction } from 'idb';

import { IDisposable } from '../utils/interfaces';
import { assertEq, assert } from '../utils/utils';
import { ObjectPool } from '../utils/pool';

import { Work, WorkProps, WorkDataConstants, createWork, mapIndex, WORK_PROPS_DEFAULT } from '../model/work';
import { LocalLockMonitor, LocalLockGuard } from './locallock';

export const enum Layout
{
    LOG_SIZE = 8,
    SIZE = 1 << LOG_SIZE,

    LOG_CHUNK_SIZE = 4,
    /** The size of each chunk. Do not change or the stored data would corrupt! */
    CHUNK_SIZE = 1 << LOG_CHUNK_SIZE,

    LOG_CHUNK_DIM = LOG_SIZE - LOG_CHUNK_SIZE,
    /** The number of chunks in each side. */
    CHUNK_DIM = 1 << LOG_CHUNK_DIM,
}

assertEq(Layout.SIZE, WorkDataConstants.GRID_SIZE);

// We don't handle chunks lying on the border yet
assert(Layout.SIZE % Layout.CHUNK_SIZE == 0, "SIZE must be a multiple of CHUNK_SIZE");

interface DBWork
{
    id: string;
    props: WorkProps;
}

interface DBChunk
{
    /** Composite key of a work ID and chunk ID. */
    key: [string, number];

    density: Uint8Array;
    material: Uint32Array;
}

const StoreNames = {
    WORKS: 'works',
    CHUNKS: 'workChunks',
};

export class LocalWorkStorage
{
    constructor(private db: DB) {}

    static upgrade(upgrade: UpgradeDB): void
    {
        let ver = upgrade.oldVersion;
        while (ver < upgrade.version) {
            if (ver === 0) {
                upgrade.createObjectStore(StoreNames.WORKS, { keyPath: 'id' });
                upgrade.createObjectStore(StoreNames.CHUNKS, { keyPath: 'key' });
            }
            ++ver;
        }
    }

    private lockMonitor = LocalLockMonitor.instance;

    /**
     * Opens a work for editing.
     *
     * Note: `LocalWork` implements `IDisposable`. It is crucial that you call
     * `dispose()` on the returned `LocalWork` when it is no longer needed.
     *
     * This might fail in the following common situations (indicated by a
     * promise being rejected):
     *
     *  - The work is already open.
     *  - The work was not found.
     *  - Data corruption.
     */
    async open(id: string, create = false): Promise<LocalWork>
    {
        // Acquire an lock on the document first
        let guard = await this.lockMonitor.lock(id);
        if (!guard) {
            throw new Error("The work is already being edited in another browser window.");
        }

        try {
            const transaction = this.db.transaction([StoreNames.WORKS, StoreNames.CHUNKS],
                create ? 'readwrite' : 'readonly');
            const works = transaction.objectStore(StoreNames.WORKS);

            let dbWork: DBWork | undefined;
            if (create) {
                dbWork = {
                    id, props: WORK_PROPS_DEFAULT,
                };
                await works.add(dbWork);
            } else {
                dbWork = await works.get(id);
                if (!dbWork) {
                    throw new Error("The work with the specified identifier was not found.");
                }
            }

            const g = guard;
            guard = null;
            return await LocalWorkImpl.load(this.db, transaction, id, dbWork, g);
        } finally {
            if (guard) {
                guard.dispose();
            }
        }
    }
}

const U8_CHUNK_POOL = new ObjectPool(() => new Uint8Array(Layout.CHUNK_SIZE ** 3));
const U32_CHUNK_POOL = new ObjectPool(() => new Uint32Array(Layout.CHUNK_SIZE ** 3));

export abstract class LocalWork implements IDisposable
{
    /** The latest saved version of the work (the one stored in the database. */
    abstract get work(): Work;

    abstract dispose(): void;

    abstract update(newWork: Work): Promise<void>;
}

class LocalWorkImpl extends LocalWork
{
    private db: DB;
    private id: string;
    private guard: LocalLockGuard;

    /** The latest saved version of the work (the one stored in the database. */
    private latest: Work;

    private constructor()
    {
        super();
    }

    static async load(db: DB, transaction: Transaction, id: string, dbWork: DBWork, guard: LocalLockGuard): Promise<LocalWorkImpl>
    {
        const lw = new LocalWorkImpl();
        try {
            const work: Work = {
                ...createWork(),
                props: dbWork.props,
            };

            // Should be okay to mutate the data directly as long as it is not
            // shared with others
            const density = work.data.data!.density;
            const material = work.data.data!.material;

            // Load chunks
            const chunks = transaction.objectStore(StoreNames.CHUNKS);
            let cursor = await chunks.openCursor(IDBKeyRange.bound(
                [id], [id + '\0'], false, true,
            ));

            while (cursor && cursor.value) {
                const chunk = cursor.value as DBChunk;
                const chunkId = chunk.key[1];

                const cx = chunkId & 0x3ff;
                const cy = (chunkId >> 10) & 0x3ff;
                const cz = (chunkId >> 20) & 0x3ff;

                if ((cx | cy | cz) * Layout.CHUNK_SIZE >= Layout.SIZE) {
                    throw new Error(`Chunk (${cx}, ${cy}, ${cz}) is out of range.`);
                }

                let outIndex = mapIndex(
                    cx * Layout.CHUNK_SIZE,
                    cy * Layout.CHUNK_SIZE,
                    cz * Layout.CHUNK_SIZE,
                );
                const cdensity = chunk.density;
                const cmaterial = chunk.material;
                let i = 0;
                for (let z = 0; z < Layout.CHUNK_SIZE; ++z) {
                    for (let y = 0; y < Layout.CHUNK_SIZE; ++y) {
                        for (let x = 0; x < Layout.CHUNK_SIZE; ++x) {
                            density[outIndex] = cdensity[i];
                            material[outIndex] = cmaterial[i];
                            ++i; ++outIndex;
                        }
                        outIndex += Layout.SIZE - Layout.CHUNK_SIZE;
                    }
                    outIndex += (Layout.SIZE - Layout.CHUNK_SIZE) * Layout.SIZE;
                }

                cursor = await cursor.continue();
            }

            await transaction.complete;

            lw.guard = guard;
            lw.db = db;
            lw.id = id;
            lw.latest = work;

            return lw;
        } finally {
            if (!lw.guard) {
                guard.dispose();
            }
        }
    }

    dispose(): void
    {
        this.guard.dispose();
    }

    get work(): Work
    {
        return this.latest;
    }

    /** Changes between `latest` and `latestProvided`. */
    private dirty = new Map<number, DBChunk>();
    private previousUpdate = Promise.resolve();
    private lastestProvided: Work | null = null;

    async update(newWork: Work): Promise<void>
    {
        if (!newWork.data.data) {
            throw new Error("Must be the latest version");
        }

        // Figure out which part of the work was updated
        const {dirty} = this;
        let version = (this.lastestProvided || this.latest).data;
        const updated: number[] = [];

        if (newWork === (this.lastestProvided || this.latest)) {
            // No update, but the save operation of `latestProvided` might not
            // be completed yet
            await this.previousUpdate;
            return;
        }

        if (version.head !== newWork.data) {
            for (let i = 0, count = Layout.CHUNK_DIM ** 3; i < count; ++i) {
                if (!dirty.has(i)) {
                    dirty.set(i, {
                        key: [this.id, i],
                        density: U8_CHUNK_POOL.alloc(),
                        material: U32_CHUNK_POOL.alloc(),
                    });
                }
                updated.push(i);
            }
        } else {
            while (version !== newWork.data) {
                const region = version.dirtyRegion!;
                const minX = region.min[0] >> Layout.LOG_CHUNK_SIZE;
                const minY = region.min[1] >> Layout.LOG_CHUNK_SIZE;
                const minZ = region.min[2] >> Layout.LOG_CHUNK_SIZE;
                const maxX = (region.max[0] + Layout.CHUNK_SIZE - 1) >> Layout.LOG_CHUNK_SIZE;
                const maxY = (region.max[1] + Layout.CHUNK_SIZE - 1) >> Layout.LOG_CHUNK_SIZE;
                const maxZ = (region.max[2] + Layout.CHUNK_SIZE - 1) >> Layout.LOG_CHUNK_SIZE;

                for (let z = minZ; z < maxZ; ++z) {
                    for (let y = minY; y < maxY; ++y) {
                        for (let x = minX; x < maxX; ++x) {
                            const i = x + (y + (z << Layout.LOG_CHUNK_DIM) << Layout.LOG_CHUNK_DIM);
                            if (!dirty.has(i)) {
                                dirty.set(i, {
                                    key: [this.id, i],
                                    density: U8_CHUNK_POOL.alloc(),
                                    material: U32_CHUNK_POOL.alloc(),
                                });
                            }
                            updated.push(i);
                        }
                    }
                }

                version = version.successor!;
            }
        }

        // Copy the updated region immediately
        const {density, material} = newWork.data.data!;
        for (const ci of updated) {
            const cx = ci & (Layout.CHUNK_SIZE - 1);
            const cy = (ci >> Layout.LOG_CHUNK_SIZE) & (Layout.CHUNK_SIZE - 1);
            const cz = (ci >> Layout.LOG_CHUNK_SIZE * 2) & (Layout.CHUNK_SIZE - 1);

            let outIndex = 0;
            let inIndex = mapIndex(cx * Layout.CHUNK_SIZE, cy * Layout.CHUNK_SIZE, cz * Layout.CHUNK_SIZE);

            const c = dirty.get(ci)!;
            const cdensity = c.density;
            const cmaterial = c.material;

            for (let z = 0; z < Layout.CHUNK_SIZE; ++z) {
                for (let y = 0; y < Layout.CHUNK_SIZE; ++y) {
                    for (let x = 0; x < Layout.CHUNK_SIZE; ++x) {
                        cdensity[outIndex] = density[inIndex];
                        cmaterial[outIndex] = material[inIndex];
                        ++outIndex; ++inIndex;
                    }
                    inIndex += Layout.SIZE - Layout.CHUNK_SIZE;
                }
                inIndex += (Layout.SIZE - Layout.CHUNK_SIZE) * Layout.SIZE;
            }
        }

        this.lastestProvided = newWork;

        await (this.previousUpdate = this.commit());
    }

    private async commit(): Promise<void>
    {
        // If there is an ongoing update, wait until it is done
        await this.previousUpdate;

        // Take a snapshot of changes between `latest` and `latestProvided`
        // (At this point, `latestProvided` is not necessarily the version
        // which triggered this call to `commit`)
        const stored = this.latest;
        const goal = this.lastestProvided!;
        const changes: DBChunk[] = [];
        this.dirty.forEach(chunk => changes.push(chunk));
        this.dirty.clear();

        // Write changes
        const transaction = this.db.transaction([StoreNames.WORKS, StoreNames.CHUNKS], 'readwrite');

        if (goal.props !== stored.props) {
            const works = transaction.objectStore(StoreNames.WORKS);
            await works.put({
                id: this.id,
                props: goal.props,
            } as DBWork);
        }

        const chunks = transaction.objectStore(StoreNames.CHUNKS);
        for (const chunk of changes) {
            await chunks.put(chunk);
            U8_CHUNK_POOL.free(chunk.density);
            U32_CHUNK_POOL.free(chunk.material);
        }

        await transaction.complete;
        this.latest = goal;
    }
}
