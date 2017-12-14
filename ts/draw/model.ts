/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec3, vec4, mat4 } from 'gl-matrix';

export class Scene
{
    depthNear = -1;
    depthFar = 1;
    projectionMatrix = mat4.perspective(mat4.create(), 1.0, 1.5, 1, 1000);
    viewMatrix = mat4.lookAt(
        mat4.create(),
        [0, 0, -10],
        [0, 0, 0],
        [0, 1, 0],
    );

    viewToEnvMatrix = mat4.identity(mat4.create());

    /**
     * Enables the AR mode. The camera image is displayed as the background.
     */
    enableAR = false;

    /**
     * Texture transformation matrix for the camera image.
     */
    cameraTextureMatrix = mat4.scale(
        mat4.create(),
        mat4.fromTranslation(
            mat4.create(),
            [0.5, 0.5, 0]
        ),
        [0.5, 0.5, 0]
    );

    /**
     * Skip rendering of all objects.
     *
     * Intended to be used when the AR mode is active and marker is not detected.
     */
    skipScene = false;

    gizmos: Gizmo[] = [];
}

export type Gizmo = LineGizmo;

export enum GizmoType
{
    LINE,
}

export enum LineStyle
{
    SOLID,
    DASH,
}

export class LineGizmo
{
    readonly type: GizmoType.LINE = GizmoType.LINE;
    /** Color with pre-multiplied alpha and normalized RGB values. */
    color = vec4.fromValues(1, 1, 1, 1);
    points: vec3[] = [];
    style = LineStyle.SOLID;
    closed = false;
}

export interface CameraImageData
{
    readonly data: Uint8Array | Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
}

export function createCameraImageDataFromImage(
    image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    width?: number,
    height?: number,
): CameraImageData
{
    width = width || image.width;
    height = height || image.height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
}
