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
import { LineGizmo, LineStyle, CameraImageData } from '../draw/model';
import { ProfilerResult } from '../draw/profiler';
import { createWorkerClient } from '../workerclient';

import { EditorState, CameraState, DisplayMode, CameraStateInfo } from './editorstate';
import { MouseRouter } from './utils/mousecapture';
import { DeviceOrientationListener } from './deviceorientation';

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

function getProfilerCallback(): (result: ProfilerResult) => void
{
    if (!profilerWindow) {
        profilerWindow = document.createElement('div');
        profilerWindow.className = classNames.profiler;
        document.body.appendChild(profilerWindow);
    }

    return (result) => {
        profilerWindow!.innerText = result.formatted;
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

    constructor(private logManager: LogManager)
    {
        this.log = logManager.getLogger('viewport-persistent');
        this.ar = new ARMain(logManager);

        const context = this.canvas.getContext('webgl');
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

    get isShadersReady(): boolean
    {
        return this.numRenderedFrames > 10;
    }

    /**
     * Retrieve the result of the pointer hit scan.
     */
    private get cursorRaytraceHit(): RaytraceHit | null
    {
        const {clipSpaceMouseLocation, listener} = this;
        if (!clipSpaceMouseLocation || !listener) {
            return null;
        }
        const {scene} = this.renderer;
        if (scene.skipScene) {
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

        // Perform ray trace
        const {data} = listener.editorState.workspace.work;
        return raytrace(data.data!, rayStart, rayEnd);
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

        const scene = renderer.scene;
        scene.gizmos.length = 0;
        if (actualDisplayMode === DisplayMode.AR && this.ar.activeState) {
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
                mat4.scale(scene.viewMatrix, activeState.markerMatrix, [1, 1, 1]);
                mat4.translate(scene.viewMatrix, scene.viewMatrix, [-128, -128, 0]);
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
                vec4.set(v, (i & 1) ? 256 : 0, (i & 2) ? 256 : 0, (i & 4) ? 256 : 0, 1);
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

        // Highlight the hot voxel
        const hit = this.cursorRaytraceHit;
        if (hit && hit.hit && hit.normal) {
            const bx = Math.max(0, hit.normal.normal[0]) + hit.voxel[0];
            const by = Math.max(0, hit.normal.normal[1]) + hit.voxel[1];
            const bz = Math.max(0, hit.normal.normal[2]) + hit.voxel[2];
            const tan1x = Math.abs(hit.normal.normal[2]);
            const tan1y = Math.abs(hit.normal.normal[0]);
            const tan1z = Math.abs(hit.normal.normal[1]);
            const tan2x = Math.abs(hit.normal.normal[1]);
            const tan2y = Math.abs(hit.normal.normal[2]);
            const tan2z = Math.abs(hit.normal.normal[0]);
            for (let i = 0; i < 2; ++i) {
                const g = new LineGizmo();
                g.points.push(vec3.fromValues(bx, by, bz));
                g.points.push(vec3.fromValues(bx + tan1x, by + tan1y, bz + tan1z));
                g.points.push(vec3.fromValues(bx + tan1x + tan2x, by + tan1y + tan2y, bz + tan1z + tan2z));
                g.points.push(vec3.fromValues(bx + tan2x, by + tan2y, bz + tan2z));
                g.closed = true;
                vec4.set(g.color, i, i, i, 1);
                g.style = LineStyle.SOLID;
                scene.gizmos.push(g);
            }
        }

        renderer.voxel.updateFrom(editorState.workspace.work.data);
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

    dispose(): void
    {
        this.renderer.dispose();
    }
}