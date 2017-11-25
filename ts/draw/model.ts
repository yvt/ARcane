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
