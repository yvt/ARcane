/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec3, vec4, mat4 } from 'gl-matrix';
import { Scene } from './model';

const HALTON_2_3 = [
    [8, 9], [4, 18], [12, 3], [2, 12], [10, 21], [6, 6], [14, 15], [1, 24],
].map(x => [x[0] / 16 * 2 - 1, x[1] / 27 * 2 - 1]);

export class RenderState
{
    renderProjectionMatrix = mat4.create();

    private haltonIndex = 0;

    constructor(
        private context: {
            scene: Scene;
        }
    )
    {
    }

    get scene() { return this.context.scene; }

    update(width: number, height: number): void
    {
        mat4.copy(this.renderProjectionMatrix, this.context.scene.projectionMatrix);

        // Apply jittering for temporal antialiasing
        // https://de45xmedrsdbp.cloudfront.net/Resources/files/TemporalAA_small-59732822.pdf
        const m = this.renderProjectionMatrix;
        let [x, y] = HALTON_2_3[this.haltonIndex];
        this.haltonIndex = (this.haltonIndex + 1) & 7;

        x /= width; y /= height;

        for (let i = 0; i < 16; i += 4) {
            m[i] += m[i + 3] * x;
            m[i + 1] += m[i + 3] * y;
        }
    }
}

