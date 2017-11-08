import { LogManager } from './utils/logger';

const logManager = new LogManager();
if (process.env.NODE_ENV !== 'production') {
    logManager.enableAllTopics();
}

import { Renderer } from './draw/main';

const canvas = document.createElement('canvas');

const context = canvas.getContext('webgl');
if (!context) {
    throw new Error("failed to create a WebGL context.");
}

const renderer = new Renderer(context, logManager);

document.body.appendChild(canvas);

setTimeout(() => {
    renderer.render();
}, 0);
