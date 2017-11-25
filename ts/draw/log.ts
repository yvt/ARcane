/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
export const TOPICS = makeReadonly({
    PROFILER: 'draw-profiler',
    CAPABILITIES: 'draw-caps',
    SCHEDULER: 'draw-scheduler',
});

function makeReadonly<T>(x: T): Readonly<T> {
    return x;
}
