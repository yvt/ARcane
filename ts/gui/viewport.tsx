import * as React from 'react';
const Stats = require('stats-js');
import { mat4 } from 'gl-matrix';

import { IDisposable } from '../utils/interfaces';
import { LogManager } from '../utils/logger';
import { Renderer } from '../draw/main';
import { createWorkerClient } from '../workerclient';

import { Port } from './utils/port';
import { RequestAnimationFrame } from './utils/animationframe';

// DEBUG: stats.js for easy frame rate monitoring
const stats = new Stats();
stats.setMode(0);
stats.domElement.style.position = 'fixed';
stats.domElement.style.left = '0px';
stats.domElement.style.top = '0px';
document.body.appendChild(stats.domElement);

export class ViewportPersistent implements IDisposable
{
    readonly canvas = document.createElement('canvas');
    readonly context: WebGLRenderingContext;
    readonly renderer: Renderer;

    constructor(logManager: LogManager)
    {
        const context = this.canvas.getContext('webgl');
        if (!context) {
            throw new Error("failed to create a WebGL context.");
        }
        this.context = context;

        this.renderer = new Renderer(this.context, logManager, createWorkerClient);
    }

    dispose(): void
    {
        this.renderer.dispose();
    }
}

export interface ViewportProps
{
    persistent: ViewportPersistent;

    className?: string;
    style?: React.CSSProperties;
}

export class Viewport extends React.Component<ViewportProps, {}>
{
    constructor(props: ViewportProps)
    {
        super(props);
        this.update = this.update.bind(this);
    }

    private update(): void
    {
        const {canvas, renderer} = this.props.persistent;
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

    render()
    {
        const {props} = this;
        return <div className={props.className} style={props.style}>
            <RequestAnimationFrame onUpdate={this.update} />
            <Port element={props.persistent.canvas} />
        </div>;
    }
}
