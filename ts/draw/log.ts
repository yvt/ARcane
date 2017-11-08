export const TOPICS = makeReadonly({
    PROFILER: 'draw-profiler',
    CAPABILITIES: 'draw-caps',
    SCHEDULER: 'draw-scheduler',
});

function makeReadonly<T>(x: T): Readonly<T> {
    return x;
}
