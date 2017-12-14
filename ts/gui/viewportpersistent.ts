/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
const Stats = require('stats-js');
import { vec2, vec3, vec4, mat4 } from 'gl-matrix';

import { lerp } from '../utils/math';
import { Stopwatch } from '../utils/time';
import { IDisposable } from '../utils/interfaces';
import { LogManager, Logger } from '../utils/logger';
import { RaytraceHit, raytrace } from '../model/raytrace';

import { Renderer } from '../draw/main';
import { LineGizmo, LineStyle, CameraImageData, createCameraImageDataFromImage } from '../draw/model';
import { ProfilerResult } from '../draw/profiler';
import { createWorkerClient } from '../workerclient';

import { EditorState, CameraState, DisplayMode, CameraStateInfo } from './editorstate';
import { MouseRouter } from './utils/mousecapture';
import { DeviceOrientationListener } from './deviceorientation';
import { EditTool, EDIT_TOOLS, Stroke, PointerInput } from './tool';

import { ARMain } from '../xr/main';

const classNames = require('./viewport.less');

export interface ViewportPersistentListener
{
    readonly editorState: EditorState;
    readonly actualDisplayMode: DisplayMode;
    readonly profilingEnabled: boolean;

    /**
     * Notifies that the viewport must be re-rendered due to a change in the internal
     * state of `ViewportPersistent` while `EditorState` is unmodified.
     */
    handleNeedsUpdate(): void;
    handleInputDeviceDetected(type: 'mouse' | 'touch'): void;
    handleEditorStateUpdate(trans: (oldState: EditorState) => EditorState): void;
}

// DEBUG: stats.js for easy frame rate monitoring
const stats = new Stats();
stats.setMode(0);
stats.domElement.className = classNames.stats;
document.body.appendChild(stats.domElement);

let profilerWindow: HTMLDivElement | null = null;

function getProfilerCallback(): (result: string) => void
{
    if (!profilerWindow) {
        profilerWindow = document.createElement('div');
        profilerWindow.className = classNames.profiler;
        document.body.appendChild(profilerWindow);
    }

    return (result) => {
        profilerWindow!.innerText = result;
    };
}

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
    readonly ar: ARMain;

    private listener: ViewportPersistentListener | null;
    private log: Logger;

    // # Rendering
    private readonly context: WebGLRenderingContext;
    private readonly renderer: Renderer;
    private profilingEnabled = false;
    private numRenderedFrames = 0;
    private cameraImageData: CameraImageData | null = null;

    private smoothedCamera: CameraState | null;
    private readonly stopwatch = new Stopwatch();
    private readonly boundingBoxGizmos: LineGizmo[];

    // # Input
    private readonly mouseRouter: MouseRouter<MouseGrabState>;
    private clipSpaceMouseLocation: vec2 | null = null;
    private orientationListener: [DeviceOrientationListener | null] | null = null;
    private orientationMatrix = mat4.identity(mat4.create());

    // # Editing
    private stroke: { stroke: Stroke | null } | null = null;

    constructor(private logManager: LogManager)
    {
        this.log = logManager.getLogger('viewport-persistent');
        this.ar = new ARMain(logManager);

        const context = this.canvas.getContext('webgl') ||
            this.canvas.getContext('experimental-webgl');
        if (!context) {
            throw new Error("failed to create a WebGL context.");
        }
        this.context = context;

        this.renderer = new Renderer(this.context, logManager, createWorkerClient);

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.clipSpaceMouseLocation = vec2.set(
                this.clipSpaceMouseLocation || vec2.create(),
                (e.clientX - rect.left) / rect.width * 2 - 1,
                1 - (e.clientY - rect.top) / rect.height * 2,
            );
            if (this.listener) {
                this.listener.handleInputDeviceDetected('mouse');
                this.listener.handleNeedsUpdate();
            }
        });
        this.canvas.addEventListener('mouseleave', () => {
            if (this.clipSpaceMouseLocation) {
                this.clipSpaceMouseLocation = null;
                if (this.listener) {
                    this.listener.handleNeedsUpdate();
                }
            }
        });
        this.canvas.addEventListener('wheel', (e) => {
            this.listener && this.listener.handleEditorStateUpdate(oldState => {
                let dist = oldState.camera.distance;
                let delta = e.deltaY;
                switch (e.deltaMode) {
                    case WheelEvent.DOM_DELTA_PIXEL:
                        break;
                    case WheelEvent.DOM_DELTA_LINE:
                        delta *= 5;
                        break;
                    case WheelEvent.DOM_DELTA_PIXEL:
                        delta *= 20;
                        break;
                }
                dist *= Math.exp(delta * 0.01);
                dist = Math.max(Math.min(dist, 300), 0.1);
                e.preventDefault();
                return {
                    ...oldState,
                    camera: {
                        ...oldState.camera,
                        distance: dist,
                    },
                };
            });
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
                case 0:
                    const {tool} = this;
                    if (!tool || this.stroke || !this.listener || !this.listener.editorState.workspace) {
                        return null;
                    }

                    mode = MouseGrabMode.Draw;

                    const vpstroke = this.stroke = { stroke: null as Stroke | null };
                    this.listener.handleEditorStateUpdate(state => {
                        if (vpstroke !== this.stroke) {
                            return state;
                        }
                        const input = this.createPointerInput(state);
                        if (!input) {
                            return state;
                        }
                        const result = tool.startStroke(input);
                        if (!result) {
                            return state;
                        }
                        const [stroke, workspace] = result;
                        vpstroke.stroke = stroke;
                        return { ...state, workspace };
                    });
                    break;
                case 2:
                    mode = MouseGrabMode.Camera;
                    break;
                default:
                    return null;
            }
            e.preventDefault();

            state = {
                lastX: e.clientX,
                lastY: e.clientY,
                mode,
            };

            return state;
        };
        this.mouseRouter.onMouseMove = (e, state) => {
            e.preventDefault();

            const dx = e.clientX - state.lastX;
            const dy = e.clientY - state.lastY;

            switch (state.mode) {
                case MouseGrabMode.Draw:
                    const vpstroke = this.stroke;
                    if (this.listener && vpstroke) {
                        this.listener.handleEditorStateUpdate(state => {
                            if (!vpstroke.stroke) {
                                return state;
                            }
                            const input = this.createPointerInput(state);
                            if (!input) {
                                return state;
                            }
                            return { ...state, workspace: vpstroke.stroke.move(input) };
                        });
                    }
                    break;
                case MouseGrabMode.Camera:
                    if (this.listener) {
                        this.listener.handleEditorStateUpdate((oldState) => {
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

        this.mouseRouter.onMouseUp = (e, state) => {
            e.preventDefault();

            switch (state.mode) {
                case MouseGrabMode.Draw:
                    const vpstroke = this.stroke;
                    if (this.listener && vpstroke) {
                        this.listener.handleEditorStateUpdate(state => {
                            if (!vpstroke.stroke) {
                                return state;
                            }
                            return { ...state, workspace: vpstroke.stroke.end(state as any) };
                        });
                    }
                    this.stroke = null;
                    break;
            }
        };

        // TODO: touch input

        {
            const gs: LineGizmo[] = [];
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
                    gs.push(g);
                }

                for (let i = 0; i < 4; ++i) {
                    const g = new LineGizmo();
                    const x = (i & 1) * 256;
                    const y = (i >> 1) * 256;
                    g.points.push(vec3.fromValues(x, y, 0));
                    g.points.push(vec3.fromValues(x, y, 256));
                    vec4.set(g.color, col, col, col, 1);
                    g.style = LineStyle.DASH;
                    gs.push(g);
                }
            }
            this.boundingBoxGizmos = gs;
        }
    }

    get tool(): EditTool | null
    {
        if (!this.listener) {
            return null;
        }
        return EDIT_TOOLS[this.listener.editorState.tool];
    }

    get isShadersReady(): boolean
    {
        return this.numRenderedFrames > 10;
    }

    private createPointerInput(state: EditorState): PointerInput | null
    {
        const {clipSpaceMouseLocation, listener} = this;
        if (!clipSpaceMouseLocation || !listener) {
            return null;
        }
        const {scene} = this.renderer;
        if (scene.skipScene || !state.workspace) {
            return null;
        }

        // Construct the ray
        const m = mat4.create();
        mat4.multiply(m, scene.projectionMatrix, scene.viewMatrix);
        mat4.invert(m, m);

        const rayStart = vec3.set(vec3.create(), clipSpaceMouseLocation[0], clipSpaceMouseLocation[1], scene.depthNear);
        const rayEnd = vec3.set(vec3.create(), clipSpaceMouseLocation[0], clipSpaceMouseLocation[1], scene.depthFar);
        vec3.transformMat4(rayStart, rayStart, m);
        vec3.transformMat4(rayEnd, rayEnd, m);

        return {
            x: clipSpaceMouseLocation[0],
            y: clipSpaceMouseLocation[1],
            rayStart,
            rayEnd,
            state: state as any,
        };
    }

    update(render: boolean): void
    {
        if (!this.listener) {
            throw new Error("Not mounted");
        }
        const {editorState, actualDisplayMode} = this.listener;
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

        // Enable profiling if requested
        if (this.profilingEnabled != this.listener.profilingEnabled) {
            if (this.listener.profilingEnabled) {
                renderer.startProfiling(getProfilerCallback());
                profilerWindow!.style.display = 'block';
            } else {
                renderer.stopProfiling();
                profilerWindow!.style.display = 'none';
            }
            this.profilingEnabled = this.listener.profilingEnabled;
        }

        stats.begin();

        const {camera} = editorState;

        const dt = Math.min(this.stopwatch.elapsed / 1000, 0.1);
        this.stopwatch.reset();

        // Apply a 1st-order low pass filter to the camera parameter
        const coef = 1 - Math.pow(0.0002, dt);
        if (this.smoothedCamera) {
            this.smoothedCamera = {
                center: vec3.lerp(vec3.create(), this.smoothedCamera.center, camera.center, coef),
                eulerAngles: vec2.lerp(vec2.create(), this.smoothedCamera.eulerAngles, camera.eulerAngles, coef),
                distance: lerp(this.smoothedCamera.distance, camera.distance, coef),
            };
        } else {
            this.smoothedCamera = camera;
        }

        const scene = renderer.scene;
        scene.gizmos.length = 0;

        if (editorState.workspace) {
            const work = editorState.workspace.work;
            const {extents} = work.props;

            if (actualDisplayMode === DisplayMode.AR && this.ar.activeState && this.ar.activeState.lastProcessedImage) {
                // Do AR thingy
                scene.enableAR = true;

                const activeState = this.ar.activeState;
                const image = activeState.lastProcessedImage!;
                const video = activeState.video;

                if (!this.cameraImageData || this.cameraImageData.data.length !== image.data.length) {
                    this.cameraImageData = {
                        data: new Uint8Array(image.data.length),
                        width: image.width,
                        height: image.height
                    };
                }
                this.cameraImageData.data.set(image.data);
                renderer.setCameraImage(this.cameraImageData);

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

                if (activeState.orientetion === 'portrait') {
                    // The internally saved image is always oriented in landscape
                    mat4.rotateZ(scene.cameraTextureMatrix, scene.cameraTextureMatrix, Math.PI / -2);
                }

                scene.skipScene = !activeState.markerFound;

                // Derive the matrices
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
                scene.projectionMatrix[11] = 1;
                scene.projectionMatrix[14] = (2 * dummyNear * dummyFar) / (dummyNear - dummyFar);

                if (activeState.markerFound) {
                    const scale = 256 / Math.max(extents[0], extents[1], extents[2]);
                    mat4.scale(scene.viewMatrix, activeState.markerMatrix, [scale, scale, scale]);
                    mat4.rotateX(scene.viewMatrix, scene.viewMatrix, Math.PI / 2);
                    mat4.translate(scene.viewMatrix, scene.viewMatrix, [-1 - extents[0] / 2, -1, -1 - extents[2] / 2]);
                } else {
                    mat4.identity(scene.viewMatrix);
                }

                const mvp = mat4.create();
                const v = vec4.create();
                mat4.multiply(mvp, scene.projectionMatrix, scene.viewMatrix);

                // Scale the projection matrix so entire the scene fits within the
                // clip space Z range [0, 32768]
                let origMaxZ = -Infinity;
                for (let i = 0; i < 8; ++i) {
                    vec4.set(v, (i & 1) ? extents[0] + 1 : 1, (i & 2) ? extents[1] + 1 : 1, (i & 4) ? extents[2] + 1 : 1, 1);
                    vec4.transformMat4(v, v, mvp);
                    if (v[3] > 0) {
                        const z = v[2] / v[3];
                        origMaxZ = Math.max(origMaxZ, z);
                    }
                }

                vec4.set(v, 0, 0, dummyNear, 1);
                vec4.transformMat4(v, v, scene.projectionMatrix);
                const origMinZ = v[2] / v[3];

                if (!isFinite(origMaxZ)) {
                    origMaxZ = origMinZ + 1e-5;
                }

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

                // Device orientation matrix represents mapping from the view space to
                // the env space, so...
                mat4.copy(this.renderer.scene.viewToEnvMatrix, this.orientationMatrix);

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

            // Draw bounding box
            Array.prototype.push.apply(scene.gizmos, this.boundingBoxGizmos);
            for (const g of this.boundingBoxGizmos) {
                for (const v of g.points) {
                    v[0] = v[0] > 1 ? extents[0] + 1 : 1;
                    v[1] = v[1] > 1 ? extents[1] + 1 : 1;
                    v[2] = v[2] > 1 ? extents[2] + 1 : 1;
                }
            }

            // Highlight the hot voxel
            const input = this.createPointerInput(editorState);
            const toolGizmos = input && (this.stroke && this.stroke.stroke
                ? this.stroke.stroke.getGizmos && this.stroke.stroke.getGizmos(input)
                : this.tool && this.tool.getGizmos(input));
            if (toolGizmos) {
                Array.prototype.push.apply(scene.gizmos, toolGizmos);
            }

            renderer.voxel.updateFrom(work.data);
            vec3.set(
                renderer.voxel.extents,
                work.props.extents[0] + 1,
                work.props.extents[1] + 1,
                work.props.extents[2] + 1,
            );
        } else {
            scene.skipScene = true;
        }

        renderer.render();
        this.numRenderedFrames += 1;

        stats.end();
    }

    mount(listener: ViewportPersistentListener): void
    {
        if (this.listener != null) {
            throw new Error("Already mounted");
        }
        this.listener = listener;
        this.smoothedCamera = null;
        const cell = this.orientationListener = [null];
        DeviceOrientationListener.create().then((listener) => {
            if (cell !== this.orientationListener) {
                listener.dispose();
                return;
            }
            this.orientationListener[0] = listener;
            listener.onData = (data) => {
                mat4.copy(this.orientationMatrix, data.matrix);
            };
        }, (error) => {
            this.log.warn(`Could not create DeviceOrientationListener.: ${error}`);
        });
    }

    unmount(): void
    {
        if (this.listener == null) {
            throw new Error("Not mounted");
        }
        this.listener = null;
        if (this.orientationListener && this.orientationListener[0]) {
            this.orientationListener[0]!.dispose();
        }
        this.orientationListener = null;
    }

    setEnvironmentalImage(images: HTMLImageElement[])
    {
        return this.renderer.setEnvironmentalImage(images.map(i => createCameraImageDataFromImage(i)));
    }

    dispose(): void
    {
        this.renderer.dispose();
    }
}