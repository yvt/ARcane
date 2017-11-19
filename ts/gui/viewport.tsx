import * as React from 'react';
const Stats = require('stats-js');
import { vec2, vec3, vec4, mat4 } from 'gl-matrix';
import bind from 'bind-decorator';

import { Stopwatch } from '../utils/time';
import { lerp } from '../utils/math';

import { IDisposable } from '../utils/interfaces';
import { LogManager } from '../utils/logger';
import { Renderer } from '../draw/main';
import { createWorkerClient } from '../workerclient';

import { Port } from './utils/port';
import { RequestAnimationFrame } from './utils/animationframe';
import { MouseRouter } from './utils/mousecapture';

import { EditorState, CameraState, DisplayMode, CameraStateInfo } from './editorstate';

const classNames = require('./viewport.less');

// DEBUG: stats.js for easy frame rate monitoring
const stats = new Stats();
stats.setMode(0);
stats.domElement.className = classNames.stats;
document.body.appendChild(stats.domElement);

interface MouseGrabState
{
    lastX: number;
    lastY: number;
    mode: MouseGrabMode;
}

enum MouseGrabMode
{
    Draw,
    Camera,
}

export class ViewportPersistent implements IDisposable
{
    readonly canvas = document.createElement('canvas');
    readonly mouseRouter: MouseRouter<MouseGrabState>;
    readonly context: WebGLRenderingContext;
    readonly renderer: Renderer;

    private smoothedCamera: CameraState | null;
    private stopwatch = new Stopwatch();

    onMouseInputDeviceDetected: (() => void) | null = null;
    onTouchInputDeviceDetected: (() => void) | null = null;
    onEditorStateUpdate: ((trans: (oldState: EditorState) => EditorState) => void) | null = null;

    constructor(logManager: LogManager)
    {
        const context = this.canvas.getContext('webgl');
        if (!context) {
            throw new Error("failed to create a WebGL context.");
        }
        this.context = context;

        this.renderer = new Renderer(this.context, logManager, createWorkerClient);

        this.canvas.addEventListener('mousemove', () => {
            if (this.onMouseInputDeviceDetected) {
                this.onMouseInputDeviceDetected();
            }
        });

        // Prevent right click (because we use it for camera manipulation)
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        this.mouseRouter = new MouseRouter(this.canvas);
        this.mouseRouter.onMouseDown = (e, state) => {
            if (state) {
                // Mouse grab has already been started with a different mode.
                return null;
            }
            let mode: MouseGrabMode;
            switch (e.button) {
                case 1:
                    mode = MouseGrabMode.Draw;
                    break;
                case 2:
                    mode = MouseGrabMode.Camera;
                    break;
                default:
                    return null;
            }
            e.preventDefault();
            return {
                lastX: e.clientX,
                lastY: e.clientY,
                mode,
            };
        };
        this.mouseRouter.onMouseMove = (e, state) => {
            e.preventDefault();

            const dx = e.clientX - state.lastX;
            const dy = e.clientY - state.lastY;

            switch (state.mode) {
                case MouseGrabMode.Draw:
                    // TODO
                    break;
                case MouseGrabMode.Camera:
                    if (this.onEditorStateUpdate) {
                        this.onEditorStateUpdate((oldState) => {
                            if (e.shiftKey) {
                                // translation
                                const m = new CameraStateInfo(oldState.camera).viewMatrix;
                                mat4.invert(m, m);

                                const factor = oldState.camera.distance * -0.005;

                                const delta = vec3.create();
                                delta.set(vec4.transformMat4(
                                    vec4.create(),
                                    [dx * factor, dy * -factor, 0, 0],
                                    m
                                ).subarray(0, 3));

                                return {
                                    ... oldState,
                                    camera: {
                                        ... oldState.camera,
                                        center: vec3.add(delta, delta, oldState.camera.center),
                                    }
                                };
                            } else {
                                // rotation
                                const newAngles = vec2.clone(oldState.camera.eulerAngles);
                                newAngles[0] += dx * 0.01;
                                newAngles[1] += dy * 0.01;
                                newAngles[1] = Math.max(Math.min(newAngles[1], Math.PI * 0.49), Math.PI * -0.49);

                                return {
                                    ... oldState,
                                    camera: {
                                        ... oldState.camera,
                                        eulerAngles: newAngles,
                                    }
                                };
                            }
                        });
                    }
                    break;
            }

            state.lastX = e.clientX;
            state.lastY = e.clientY;
        };

        // TODO: touch input
    }

    update(editorState: EditorState): void
    {
        const {canvas, renderer} = this;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, rect.width) | 0;
        canvas.height = Math.max(1, rect.height) | 0;

        const {camera} = editorState;

        const dt = Math.min(this.stopwatch.elapsed / 1000, 0.1);
        this.stopwatch.reset();

        // Apply a 1st-order low pass filter to the camera parameter
        const coef = 1 - Math.pow(0.01, dt);
        if (this.smoothedCamera) {
            this.smoothedCamera = {
                center: vec3.lerp(vec3.create(), this.smoothedCamera.center, camera.center, coef),
                eulerAngles: vec2.lerp(vec2.create(), this.smoothedCamera.eulerAngles, camera.eulerAngles, coef),
                distance: lerp(this.smoothedCamera.distance, camera.distance, coef),
            };
        } else {
            this.smoothedCamera = camera;
        }

        renderer.scene.viewMatrix = new CameraStateInfo(this.smoothedCamera).viewMatrix;
        mat4.perspective(renderer.scene.projectionMatrix, 1.0, canvas.width / canvas.height, 1, 500);

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

    mount(): void
    {
        this.smoothedCamera = null;
    }

    dispose(): void
    {
        this.renderer.dispose();
    }
}

export interface ViewportProps
{
    persistent: ViewportPersistent;
    editorState: EditorState;

    onChangeEditorState: (newValue: EditorState) => void;
}

interface State
{
    loaded: boolean;
}

export class Viewport extends React.Component<ViewportProps, State>
{

    constructor(props: ViewportProps)
    {
        super(props);

        this.state = {
            loaded: false,
        };
    }

    componentDidMount()
    {
        setTimeout(() => {
            this.setState({
                loaded: true,
            });
        }, 400);
        if (this.props.persistent.onEditorStateUpdate) {
            throw new Error("ViewportPersistent is already mounted on some Viewport");
        }
        this.props.persistent.onEditorStateUpdate = this.handleEditorStateUpdateByPersistent;
        this.props.persistent.onMouseInputDeviceDetected = () => {
            if (!this.props.editorState.inputDevicesInUse.touch) {
                // The presence of a mouse was detected
                this.props.onChangeEditorState({
                    ... this.props.editorState,
                    inputDevicesInUse: {
                        ... this.props.editorState.inputDevicesInUse,
                        mouse: true,
                    },
                });
            }
        };
        this.props.persistent.onTouchInputDeviceDetected = () => {
            if (!this.props.editorState.inputDevicesInUse.touch) {
                // The presence of a mouse was detected
                this.props.onChangeEditorState({
                    ... this.props.editorState,
                    inputDevicesInUse: {
                        ... this.props.editorState.inputDevicesInUse,
                        touch: true,
                    },
                });
            }
        };
        this.props.persistent.mount();
    }

    componentWillUnmount()
    {
        this.props.persistent.onEditorStateUpdate = null;
        this.props.persistent.onMouseInputDeviceDetected = null;
        this.props.persistent.onTouchInputDeviceDetected = null;
    }

    componentDidUpdate(prevProps: ViewportProps, prevState: State): void
    {
        if (this.props.persistent !== prevProps.persistent) {
            throw new Error("Does not support replacing ViewportPersistent");
        }
    }

    @bind
    private handleEditorStateUpdateByPersistent(trans: (oldState: EditorState) => EditorState): void
    {
        this.props.onChangeEditorState(trans(this.props.editorState));
    }

    @bind
    private update(): void
    {
        this.props.persistent.update(this.props.editorState);
    }

    @bind
    private handleMouseEnter(): void
    {
        this.props.onChangeEditorState({
            ... this.props.editorState,
            viewportHot: true,
        });
    }

    @bind
    private handleMouseLeave(): void
    {
        this.props.onChangeEditorState({
            ... this.props.editorState,
            viewportHot: false,
        });
    }

    render()
    {
        const {props, state} = this;
        return <div
            onMouseEnter={this.handleMouseEnter}
            onMouseLeave={this.handleMouseLeave}>
            <RequestAnimationFrame
                onUpdate={this.update} />,
            <Port
                element={props.persistent.canvas}
                className={classNames.port + (this.state.loaded ? ' ' + classNames.loaded : '')} />
        </div>;
    }
}
