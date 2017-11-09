import { LogManager } from './utils/logger';

const logManager = new LogManager();
if (process.env.NODE_ENV !== 'production') {
    logManager.enableAllTopics();
}

import { mat4 } from 'gl-matrix';
import { Renderer } from './draw/main';

const canvas = document.createElement('canvas');

const context = canvas.getContext('webgl');
if (!context) {
    throw new Error("failed to create a WebGL context.");
}

const renderer = new Renderer(context, logManager);

document.body.appendChild(canvas);

setInterval(() => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width) | 0;
    canvas.height = Math.max(1, rect.height) | 0;

    const t = Date.now() / 1000;
    mat4.lookAt(
        renderer.scene.viewMatrix,
        [Math.cos(t) * 3, 2, Math.sin(t) * 3],
        [0, 0, 0],
        [0, 1, 0],
    );
    mat4.perspective(
        renderer.scene.projectionMatrix,
        1.0,
        canvas.width / canvas.height,
        1,
        100
    );
    renderer.render();
}, 0);
