import { LogManager } from './utils/logger';

const logManager = new LogManager();
if (process.env.NODE_ENV !== 'production') {
    logManager.enableAllTopics();
}

if ('あ'.charCodeAt(0) != 0x3042) {
    throw new Error("The application was loaded with a wrong encoding.");
}

const Stats = require('stats-js');
import { mat4 } from 'gl-matrix';
import { Renderer } from './draw/main';

const canvas = document.createElement('canvas');

const context = canvas.getContext('webgl');
if (!context) {
    throw new Error("failed to create a WebGL context.");
}

const stats = new Stats();
stats.setMode(0);
stats.domElement.style.position = 'fixed';
stats.domElement.style.left = '0px';
stats.domElement.style.top = '0px';

const renderer = new Renderer(context, logManager);
document.body.appendChild(canvas);
document.body.appendChild(stats.domElement);

function render() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width) | 0;
    canvas.height = Math.max(1, rect.height) | 0;

    const t = Date.now() / 3000;
    mat4.lookAt(
        renderer.scene.viewMatrix,
        [128 + Math.cos(t) * 100, 300, 128 + Math.sin(t) * 100],
        [128, 128, 128],
        [0, 1, 0],
    );
    mat4.perspective(
        renderer.scene.projectionMatrix,
        1.0,
        canvas.width / canvas.height,
        1,
        500
    );

    // Convert Z from (-1 -> 1) to (32768 -> 0) (for more precision)
    mat4.multiply(
        renderer.scene.projectionMatrix,
        mat4.scale(
            mat4.create(),
            mat4.fromTranslation(
                mat4.create(),
                [0, 0, 16384]
            ),
            [1, 1, -16384]
        ),
        renderer.scene.projectionMatrix,
    );

    stats.begin();
    renderer.render();
    stats.end();
}

function update() {
    render();
    requestAnimationFrame(update);
}
update();
