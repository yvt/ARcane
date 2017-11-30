/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */

/**
 * Retrieves the elapsed time since some time point, measured in milliseconds.
 *
 * This function attempts to use the best strategy based on the functionality
 * provided by the browser.
 */
export const now = (() => {
    if (typeof performance !== 'undefined' && performance.now) {
        return () => performance.now();
    }

    let lastValue = 0;
    let drift = 0;
    // Prevent going back in time
    return () => {
        let t = Date.now() + drift;
        if (t < lastValue) {
            drift += lastValue - t;
            t = lastValue;
        }
        lastValue = t;
        return t;
    };
})();

export class Stopwatch
{
    private origin: number;

    constructor()
    {
        this.reset();
    }

    reset(): void
    {
        this.origin = now();
    }

    get elapsed(): number
    {
        return now() - this.origin;
    }
}