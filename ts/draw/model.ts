import { mat4 } from 'gl-matrix';

export class Scene
{
    projectionMatrix = mat4.perspective(mat4.create(), 1.0, 1.5, 1, 1000);
    viewMatrix = mat4.lookAt(
        mat4.create(),
        [0, 0, -10],
        [0, 0, 0],
        [0, 1, 0],
    );
}
