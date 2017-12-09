/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { assertEq, assert, downcast } from '../utils/utils';
import { Work, WorkProps, WorkDataConstants, mapIndex } from '../model/work';

export const enum Layout
{
    LOG_SIZE = 8,
    SIZE = 1 << LOG_SIZE,

    LOG_CHUNK_SIZE = 3,
    /** The size of each chunk. */
    CHUNK_SIZE = 1 << LOG_CHUNK_SIZE,

    LOG_CHUNK_DIM = LOG_SIZE - LOG_CHUNK_SIZE,
    /** The number of chunks in each side. */
    CHUNK_DIM = 1 << LOG_CHUNK_DIM,
}

assertEq(Layout.SIZE, WorkDataConstants.GRID_SIZE);

// We don't handle chunks lying on the border yet
assert(Layout.SIZE % Layout.CHUNK_SIZE == 0, "SIZE must be a multiple of CHUNK_SIZE");

// Hard-coded limitation
assert(Layout.LOG_CHUNK_DIM <= 10);

/**
 * A state of an edit history maintained for undo/redo operations.
 *
 * This class wraps its internal intrinsically mutable state and behaves like an
 * immutable data structure (just like `WorkDataVersion`). Each operation
 * creates a fresh instance of `EditHistoryState` and at the same time renders
 * the old instance invalid.
 */
export class EditHistoryState
{
    private history: EditHistory | null = null;

    /** Move constructor. */
    private constructor(predecessor?: EditHistoryState)
    {
        if (predecessor) {
            this.history = predecessor.history;
            predecessor.history = null;
        }
    }

    static createEmpty(): EditHistoryState
    {
        const state = new EditHistoryState();
        state.history = new EditHistory();
        return state;
    }

    private expectHistory(): EditHistory
    {
        if (!this.history) {
            throw new Error("This EditHistoryState is not fresh");
        }
        return this.history;
    }

    get activeEdit(): Edit | null { return this.expectHistory().activeEdit; }

    get isAnyEditActive(): boolean { return this.expectHistory().activeEdit != null; }

    get canUndo(): boolean { return this.expectHistory().position > 0; }

    get canRedo(): boolean
    {
        const history = this.expectHistory();
        return history.position < history.timeline.length;
    }

    beginEdit(work: Work): [EditHistoryState, Edit]
    {
        const history = this.expectHistory();
        if (history.activeEdit) {
            throw new Error("There already is an ongoing edit operation");
        }

        const edit = new EditImpl();
        edit.oldProps = work.props;
        history.activeEdit = edit;

        return [new EditHistoryState(this), edit];
    }

    endEdit(work: Work, edit: Edit): EditHistoryState
    {
        const editImpl = downcast(EditImpl, edit);
        const history = this.expectHistory();
        if (history.activeEdit !== edit) {
            throw new Error("The given Edit is not active");
        }

        editImpl.finalize(work);
        history.activeEdit = null;

        // Truncate the redo history
        history.timeline.length = history.position;

        // And insert the finalized `Edit`
        history.timeline.push(editImpl);
        history.position += 1;

        // TOOD: truncate the undo history to bound the memory usage

        return new EditHistoryState(this);
    }

    undo(work: Work): [Work, string, EditHistoryState]
    {
        const history = this.expectHistory();
        assert(history.activeEdit == null, "An edit operation is active");
        assert(this.canUndo, "Can't undo now");

        const edit = history.timeline[--history.position];
        work = edit.apply(Direction.Undo, work);

        return [work, edit.name, new EditHistoryState(this)];
    }

    redo(work: Work): [Work, string, EditHistoryState]
    {
        const history = this.expectHistory();
        assert(history.activeEdit == null, "An edit operation is active");
        assert(this.canRedo, "Can't redo now");

        const edit = history.timeline[history.position++];
        work = edit.apply(Direction.Redo, work);

        return [work, edit.name, new EditHistoryState(this)];
    }
}

const enum Direction
{
    Undo = 0,
    Redo = 1,
}

interface Chunk
{
    density: Uint8Array[];
    material: Uint32Array[];
}

export abstract class Edit
{
    /** The name of the edit operation displayed to the user. */
    name = '';

    /**
     * Saves a part of a given work for a later undo operation. Must be called
     * before a mutation is done on the work.
     *
     * `work` must be a latest version. Calling this is not required for
     * metadata (`work.props`) updates.
     */
    abstract saveOriginal(work: Work, min: ArrayLike<number>, max: ArrayLike<number>): void;
}

class EditImpl extends Edit
{
    changeset = new Map<number, Chunk>();
    oldProps: WorkProps;
    newProps: WorkProps | null = null;

    saveOriginal(work: Work, min: ArrayLike<number>, max: ArrayLike<number>)
    {
        assert(min[0] >= 0); assert(min[1] >= 0); assert(min[2] >= 2);
        assert(max[0] <= Layout.SIZE); assert(max[1] <= Layout.SIZE); assert(max[2] <= Layout.SIZE);
        assert(work.data.data != null);

        const cx1 = min[0] >> Layout.LOG_CHUNK_SIZE;
        const cy1 = min[1] >> Layout.LOG_CHUNK_SIZE;
        const cz1 = min[2] >> Layout.LOG_CHUNK_SIZE;
        const cx2 = (max[0] + Layout.CHUNK_SIZE - 1) >> Layout.LOG_CHUNK_SIZE;
        const cy2 = (max[1] + Layout.CHUNK_SIZE - 1) >> Layout.LOG_CHUNK_SIZE;
        const cz2 = (max[2] + Layout.CHUNK_SIZE - 1) >> Layout.LOG_CHUNK_SIZE;

        const {changeset} = this;
        const {density, material} = work.data.data!;
        for (let cz = cz1; cz < cz2; ++cz) {
            for (let cy = cy1; cy < cy2; ++cy) {
                for (let cx = cx1; cx < cx2; ++cx) {
                    const c = cx | ((cy | (cz << 10)) << 10);
                    if (changeset.has(c)) {
                        return;
                    }

                    let outIndex = 0;
                    let inIndex = mapIndex(cx * Layout.CHUNK_SIZE, cy * Layout.CHUNK_SIZE, cz * Layout.CHUNK_SIZE);

                    const cdensity = new Uint8Array(Layout.CHUNK_SIZE ** 3);
                    const cmaterial = new Uint32Array(Layout.CHUNK_SIZE ** 3);

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

                    changeset.set(c, {
                        density: [cdensity],
                        material: [cmaterial],
                    });
                }
            }
        }
    }

    finalize(work: Work)
    {
        assert(this.newProps == null, "This edit is already finalized");
        assert(work.data.data != null);

        this.changeset.forEach((chunk, c) => {
            const cx = c & 0x3ff;
            const cy = (c >> 10) & 0x3ff;
            const cz = (c >> 20) & 0x3ff;

            const {density, material} = work.data.data!;

            let outIndex = 0;
            let inIndex = mapIndex(cx * Layout.CHUNK_SIZE, cy * Layout.CHUNK_SIZE, cz * Layout.CHUNK_SIZE);

            const cdensity = new Uint8Array(Layout.CHUNK_SIZE ** 3);
            const cmaterial = new Uint32Array(Layout.CHUNK_SIZE ** 3);

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

            chunk.density[Direction.Redo] = cdensity;
            chunk.material[Direction.Redo] = cmaterial;
        });

        this.newProps = work.props;
    }

    apply(dir: Direction, work: Work): Work
    {
        assert(this.newProps != null, "This edit is not finalized");

        const dimMin = [0, 0, 0];
        const dimMax = [0, 0, 0];

        let data = work.data.mutate(context => {
            this.changeset.forEach((chunk, c) => {
                const cx = c & 0x3ff;
                const cy = (c >> 10) & 0x3ff;
                const cz = (c >> 20) & 0x3ff;

                const {density, material} = context.data;

                let inIndex = 0;
                let outIndex = mapIndex(cx * Layout.CHUNK_SIZE, cy * Layout.CHUNK_SIZE, cz * Layout.CHUNK_SIZE);

                const cdensity = chunk.density[dir];
                const cmaterial = chunk.material[dir];

                for (let z = 0; z < Layout.CHUNK_SIZE; ++z) {
                    for (let y = 0; y < Layout.CHUNK_SIZE; ++y) {
                        for (let x = 0; x < Layout.CHUNK_SIZE; ++x) {
                            density[outIndex] = cdensity[inIndex];
                            material[outIndex] = cmaterial[inIndex];
                            ++outIndex; ++inIndex;
                        }
                        outIndex += Layout.SIZE - Layout.CHUNK_SIZE;
                    }
                    outIndex += (Layout.SIZE - Layout.CHUNK_SIZE) * Layout.SIZE;
                }

                dimMin[0] = cx << Layout.LOG_CHUNK_SIZE;
                dimMin[1] = cy << Layout.LOG_CHUNK_SIZE;
                dimMin[2] = cz << Layout.LOG_CHUNK_SIZE;
                dimMax[0] = (cx + 1) << Layout.LOG_CHUNK_SIZE;
                dimMax[1] = (cy + 1) << Layout.LOG_CHUNK_SIZE;
                dimMax[2] = (cz + 1) << Layout.LOG_CHUNK_SIZE;

                context.markDirty(dimMin, dimMax);
            });
        });
        return {
            data,
            props: [this.oldProps, this.newProps!][dir],
        };
    }
}

class EditHistory
{
    timeline: EditImpl[] = [];

    /** An index into `timeline` where a new `EditImpl` will be inserted. */
    position = 0;

    /**
     * The currently active `Edit`. Must not be inserted into `timeline` until
     * the edit operation is finalized.
     */
    activeEdit: EditImpl | null = null;
}