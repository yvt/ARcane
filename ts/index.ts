/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
if ('あ'.charCodeAt(0) != 0x3042) {
    throw new Error("The application was loaded with a wrong encoding.");
}

if (typeof importScripts === 'function') {
    // Running in a web worker
    require('./workerserver').main();
} else {
    // Running in a main thread
    require('./browser').main();
}
