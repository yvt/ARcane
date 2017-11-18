export interface Work
{
    /** The latest `WorkData`. */
    readonly data: WorkData;
}

/** Represents a version of the work data. */
export class WorkData
{
    private _nextVersion: WorkData | null;

    get nextVersion(): WorkData | null { return this._nextVersion; }

    private constructor()
    {
    }
}