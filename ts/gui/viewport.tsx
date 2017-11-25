import * as React from 'react';
const Stats = require('stats-js');
import { vec2, vec3, vec4, mat4 } from 'gl-matrix';
import bind from 'bind-decorator';

import { Stopwatch } from '../utils/time';
import { lerp } from '../utils/math';

import { IDisposable } from '../utils/interfaces';
import { LogManager } from '../utils/logger';
import { Renderer } from '../draw/main';
import { LineGizmo, LineStyle } from '../draw/model';
import { createWorkerClient } from '../workerclient';

import { Port } from './utils/port';
import { RequestAnimationFrame } from './utils/animationframe';
import { MouseRouter } from './utils/mousecapture';

import { EditorState, CameraState, DisplayMode, CameraStateInfo } from './editorstate';

import { ARMain, ARState } from '../xr/main';

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
    readonly ar: ARMain;

    numRenderedFrames = 0;

    private smoothedCamera: CameraState | null;
    private stopwatch = new Stopwatch();

    /**
     * Notifies that the viewport must be re-rendered due to a change in the internal
     * state of `ViewportPersistent` while `EditorState` is unmodified.
     */
    onNeedsUpdate: (() => void) | null = null;
    onMouseInputDeviceDetected: (() => void) | null = null;
    onTouchInputDeviceDetected: (() => void) | null = null;
    onEditorStateUpdate: ((trans: (oldState: EditorState) => EditorState) => void) | null = null;

    constructor(logManager: LogManager)
    {
        this.ar = new ARMain(logManager);

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

        // Add gizmos
        for (let col = 0; col <= 1; col++) {
            for (let i = 0; i <= 256; i += 256) {
                const g = new LineGizmo();
                g.points.push(vec3.fromValues(0, 0, i));
                g.points.push(vec3.fromValues(256, 0, i));
                g.points.push(vec3.fromValues(256, 256, i));
                g.points.push(vec3.fromValues(0, 256, i));
                g.closed = true;
                vec4.set(g.color, col, col, col, 1);
                g.style = LineStyle.DASH;
                this.renderer.scene.gizmos.push(g);
            }

            for (let i = 0; i < 4; ++i) {
                const g = new LineGizmo();
                const x = (i & 1) * 256;
                const y = (i >> 1) * 256;
                g.points.push(vec3.fromValues(x, y, 0));
                g.points.push(vec3.fromValues(x, y, 256));
                vec4.set(g.color, col, col, col, 1);
                g.style = LineStyle.DASH;
                this.renderer.scene.gizmos.push(g);
            }
        }
    }

    update(state: State, props: ViewportProps, render: boolean): void
    {
        const {editorState} = props;
        const {canvas, renderer} = this;

        // Use the parent element's bounding rect so it won't be affected by
        // the scaling
        const rect = canvas.parentElement!.getBoundingClientRect();
        const newWidth = Math.max(1, rect.width) | 0;
        const newHeight = Math.max(1, rect.height) | 0;
        if (newWidth == canvas.width && newHeight == canvas.height) {
            if (!render) {
                return;
            }
        } else {
            canvas.width = newWidth;
            canvas.height = newHeight;
        }

        stats.begin();

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

        // Do AR thingy
        const scene = renderer.scene;
        if (state.actualDisplayMode === DisplayMode.AR && this.ar.activeState) {
            scene.enableAR = true;

            const activeState = this.ar.activeState;
            const image = activeState.lastProcessedImage;
            const video = activeState.video;
            renderer.cameraImage.updateWith(image);

            // `video.{videoWidth, videoHeight}` are dependent on the device orientation
            const scale = Math.min(video.videoWidth / newWidth, video.videoHeight / newHeight);
            const scaleX = scale / (video.videoWidth / newWidth);
            const scaleY = scale / (video.videoHeight / newHeight);

            mat4.scale(
                scene.cameraTextureMatrix,
                mat4.fromTranslation(
                    scene.cameraTextureMatrix,
                    [0.5, 0.5, 0]
                ),
                [0.5 * scaleX, -0.5 * scaleY, 0]
            );

            if (activeState.markerFound) {
                scene.skipScene = false;

                mat4.copy(scene.projectionMatrix, activeState.projectionMatrix);

                scene.projectionMatrix[0] /= scaleX;
                scene.projectionMatrix[5] /= scaleY;

                // jsartoolkit's near/far plane default to bizarre values, causing
                // unacceptable amount of numerical errors in FP32 operations.
                // (And there is no way to change it)
                // Substitute them with safe values until we find the right ones.
                const dummyFar = 100;
                const dummyNear = 0.01;
                scene.projectionMatrix[10] = (dummyNear + dummyFar) / (dummyNear - dummyFar);
                scene.projectionMatrix[11] = -1;
                scene.projectionMatrix[14] = (2 * dummyNear * dummyFar) / (dummyNear - dummyFar);

                mat4.scale(scene.viewMatrix, activeState.markerMatrix, [1, 1, 1]);
                mat4.translate(scene.viewMatrix, scene.viewMatrix, [-128, -128, 0]);

                // Make sure objects are in the negative Z region
                for (let i = 0; i < 4; ++i) {
                    scene.viewMatrix[i * 4 + 2] *= -1;
                }

                const mvp = mat4.create();
                const v = vec4.create();
                mat4.multiply(mvp, scene.projectionMatrix, scene.viewMatrix);

                // Scale the projection matrix so entire the scene fits within the
                // clip space Z range [0, 32768]
                let origMaxZ = -Infinity;
                for (let i = 0; i < 8; ++i) {
                    vec4.set(v, (i & 1) ? 256 : 0, (i & 2) ? 256 : 0, (i & 4) ? 256 : 0, 1);
                    vec4.transformMat4(v, v, mvp);
                    if (v[3] > 0) {
                        const z = v[2] / v[3];
                        origMaxZ = Math.max(origMaxZ, z);
                    }
                }

                vec4.set(v, 0, 0, -dummyNear, 1);
                vec4.transformMat4(v, v, scene.projectionMatrix);
                const origMinZ = v[2] / v[3];

                // nearest/furthest points are mapped to 32768 and 0, respectively
                const factor = 32768 / (origMinZ - origMaxZ);
                const offset = -origMaxZ * factor;
                const {projectionMatrix} = scene;
                projectionMatrix[2] *= factor;
                projectionMatrix[6] *= factor;
                projectionMatrix[10] *= factor;
                projectionMatrix[14] *= factor;
                projectionMatrix[2] += projectionMatrix[3] * offset;
                projectionMatrix[6] += projectionMatrix[7] * offset;
                projectionMatrix[10] += projectionMatrix[11] * offset;
                projectionMatrix[14] += projectionMatrix[15] * offset;

                mat4.multiply(mvp, scene.projectionMatrix, scene.viewMatrix);
            } else {
                // Marker was not detected
                scene.skipScene = true;
                mat4.identity(scene.viewMatrix);
                mat4.identity(scene.projectionMatrix);
            }

            if (rect.width * devicePixelRatio > newWidth * 1.5) {
                canvas.style.filter = `blur(${rect.width / video.videoWidth}px)`;
            } else {
                canvas.style.filter = '';
            }
        } else {
            scene.enableAR = false;
            scene.skipScene = false;

            scene.viewMatrix = new CameraStateInfo(this.smoothedCamera).viewMatrix;
            mat4.perspective(renderer.scene.projectionMatrix, 1.0, canvas.width / canvas.height, 1, 500);

            // Convert Z from (-1 -> 1) to (32768 -> 0) (for more precision)
            mat4.multiply(
                scene.projectionMatrix,
                mat4.scale(
                    mat4.create(),
                    mat4.fromTranslation(
                        mat4.create(),
                        [0, 0, 16384]
                    ),
                    [1, 1, -16384]
                ),
                scene.projectionMatrix,
            );

            canvas.style.filter = '';
        }

        scene.depthNear = 32768;
        scene.depthFar = 0;

        renderer.voxel.updateFrom(editorState.workspace.work.data);
        renderer.render();
        this.numRenderedFrames += 1;

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
    switchingMode: boolean;

    arState: ARState;
    arPlaying: boolean;

    actualDisplayMode: DisplayMode;
}

export class Viewport extends React.Component<ViewportProps, State>
{
    private displayModeSwitchTimer: number | null;
    private updateStopwatch = new Stopwatch();
    private needsUpdate = false;

    constructor(props: ViewportProps)
    {
        super(props);

        this.state = {
            loaded: false,
            switchingMode: false,
            arState: ARState.Inactive,
            arPlaying: false,
            actualDisplayMode: props.editorState.displayMode,
        };
    }

    componentDidMount()
    {
        if (this.props.persistent.onEditorStateUpdate) {
            throw new Error("ViewportPersistent is already mounted on some Viewport");
        }
        this.props.persistent.ar.onChangeState.connect(this.handleChangeARState);
        this.props.persistent.onEditorStateUpdate = this.handleEditorStateUpdateByPersistent;
        this.props.persistent.onNeedsUpdate = this.handleNeedsUpdate;
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
        this.needsUpdate = true;
    }

    componentWillUnmount()
    {
        this.props.persistent.ar.onChangeState.disconnect(this.handleChangeARState);
        this.props.persistent.onEditorStateUpdate = null;
        this.props.persistent.onMouseInputDeviceDetected = null;
        this.props.persistent.onTouchInputDeviceDetected = null;
        this.props.persistent.onNeedsUpdate = null;

        if (this.displayModeSwitchTimer != null) {
            window.clearTimeout(this.displayModeSwitchTimer);
            this.displayModeSwitchTimer = null;
        }
    }

    componentDidUpdate(prevProps: ViewportProps, prevState: State): void
    {
        if (this.props.persistent !== prevProps.persistent) {
            throw new Error("Does not support replacing ViewportPersistent");
        }

        // Trigger render
        this.updateStopwatch.reset();

        if (this.props.editorState.displayMode !== prevProps.editorState.displayMode) {
            const {editorState, persistent} = this.props;

            if (editorState.displayMode == DisplayMode.AR) {
                persistent.ar.tryActivate();
                if (persistent.ar.activeState) {
                    // If AR is already active, then restart it.
                    persistent.ar.activeState.play();
                }
            } else {
                if (persistent.ar.activeState) {
                    persistent.ar.activeState.stop();
                }
            }

            // Delay the actual switch so we can have a time to fade out the viewport
            const newMode = this.props.editorState.displayMode;
            this.setState({ switchingMode: true });
            if (this.displayModeSwitchTimer != null) {
                window.clearTimeout(this.displayModeSwitchTimer);
            }
            this.displayModeSwitchTimer = window.setTimeout(() => {
                this.setState({
                    actualDisplayMode: newMode,
                    switchingMode: false,
                });
            }, 200);
        }
    }

    @bind
    private handleNeedsUpdate(): void
    {
        this.needsUpdate = true;
    }

    @bind
    private handleChangeARState(): void
    {
        const {ar} = this.props.persistent;
        this.setState({
            arState: ar.state,
            arPlaying: ar.activeState != null && ar.activeState.isPlaying,
        });
    }

    @bind
    private handleEditorStateUpdateByPersistent(trans: (oldState: EditorState) => EditorState): void
    {
        this.props.onChangeEditorState(trans(this.props.editorState));
    }

    @bind
    private update(): void
    {
        const {persistent} = this.props;

        let needsToUpdate = this.needsUpdate;
        this.needsUpdate = false;

        if (!this.state.switchingMode) {
            if (this.state.actualDisplayMode == DisplayMode.Normal) {
                // Stop updating on inactivity to reduce the power consumption
                needsToUpdate = this.updateStopwatch.elapsed < 5000;
            } else if (this.state.actualDisplayMode == DisplayMode.AR) {
                // Poll `ARMain` and re-render only if we get a new data
                if (persistent.ar.activeState) {
                    needsToUpdate = persistent.ar.activeState.update();
                }
            }
        }

        if (!this.state.loaded) {
            // Warm up shaders
            needsToUpdate = true;
        }

        persistent.update(this.state, this.props, needsToUpdate);

        if (persistent.numRenderedFrames > 10 && !this.state.loaded) {
            // All shaders should be ready now
            this.setState({ loaded: true });
        }
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
        const {ar} = props.persistent;

        const canvasVisible = this.state.loaded &&
            state.actualDisplayMode == DisplayMode.Normal ||
            state.arState == ARState.Active;

        return <div
            className={classNames.wrapper}
            onMouseEnter={this.handleMouseEnter}
            onMouseLeave={this.handleMouseLeave}>
            <RequestAnimationFrame
                onUpdate={this.update} />,
            <Port
                element={props.persistent.canvas}
                className={classNames.port +
                       (canvasVisible ? ' ' + classNames.loaded : '') +
                       (this.state.switchingMode && canvasVisible ? ' ' + classNames.fadeOut : '')} />
            {
                state.actualDisplayMode == DisplayMode.AR &&
                state.arState == ARState.Error &&
                <div className={classNames.arError}>
                    <p>
                        Could not initialize the camera input.
                    </p>
                </div>
            }
        </div>;
    }
}
