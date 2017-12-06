/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { default as idb, DB, UpgradeDB } from 'idb';
import { LocalWorkStorage } from './localwork';

export const SCHEME_VERSION = 1;

/** Top-level interface to access data stored by the user agent. */
export class LocalDataStorage
{
    static readonly instance = (async () => {
        let db = await idb.open('ARcaneLocalDataStorage', SCHEME_VERSION, upgradeDB);
        return new LocalDataStorage(db);
    })();

    readonly works: LocalWorkStorage;

    private constructor(db: DB)
    {
        this.works = new LocalWorkStorage(db);
    }
}

function upgradeDB(upgrade: UpgradeDB): void
{
    LocalWorkStorage.upgrade(upgrade);
}