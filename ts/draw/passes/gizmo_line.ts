import { vec4, mat4 } from 'gl-matrix';
import { BufferBuilder, ArrayViewTypeFlags } from '../../utils/bufferbuilder';

import { GLContext, GLStateFlags } from '../globjs/context';
import { GLConstants } from '../globjs/constants';
import { GizmoRenderer, VBBuilder } from './gizmo';
import { Scene, Gizmo, LineGizmo, LineStyle } from '../model';

const $fr = Math.fround;

export interface LineGizmoRendererContext
{
    readonly context: GLContext;
    readonly scene: Scene;
}

const INDICES = new Uint32Array([
    0, 1, 2, 1, 3, 2,
    2, 3, 4, 3, 5, 4,
    4, 5, 6, 5, 7, 6,
]);

export class LineGizmoRenderer implements GizmoRenderer
{
    readonly texture: WebGLTexture;

    constructor(private context: LineGizmoRendererContext)
    {
        const data = new Uint8Array(8 * 8 * 4);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i + 1] = data[i + 2] = 255;
        }

        // Solid line
        for (let x = 0; x < 8; ++x) {
            data[x * 4 + 3] = 255;
        }

        // Dash line
        for (let x = 0; x < 8; ++x) {
            data[(x + 2 * 8) * 4 + 3] = (x & 2) ? 255 : 0;
        }

        const {gl} = context.context;
        this.texture = gl.createTexture()!;
        gl.bindTexture(GLConstants.TEXTURE_2D, this.texture);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MAG_FILTER, GLConstants.LINEAR);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MIN_FILTER, GLConstants.LINEAR);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_S, GLConstants.REPEAT);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_T, GLConstants.REPEAT);

        // Fill it with dummy data
        gl.texImage2D(
            GLConstants.TEXTURE_2D, 0, GLConstants.RGBA, 8, 8, 0, GLConstants.RGBA, GLConstants.UNSIGNED_BYTE, data
        );
    }

    /**
     * Array of:
     *
     *    union Vertex {
     *        struct {
     *            uint32_t flags;
     *            float position[4];
     *        } point;
     *        struct {
     *            float dashPosition;
     *            float normal[2];
     *            float tangent[2];
     *        } aux;
     *    }
     */
    private csVertices1 = new BufferBuilder(256, ArrayViewTypeFlags.F32 | ArrayViewTypeFlags.U32);
    private csVertices2 = new BufferBuilder(256, ArrayViewTypeFlags.F32 | ArrayViewTypeFlags.U32);
    private workVec4 = vec4.create();
    private projectionViewMatrix = mat4.create();
    private width = 0;
    private height = 0;

    prepare(width: number, height: number): void
    {
        const {scene} = this.context;
        mat4.multiply(this.projectionViewMatrix, scene.projectionMatrix, scene.viewMatrix);
        this.width = width;
        this.height = height;
    }

    emit(g: LineGizmo, vb: VBBuilder, ib: BufferBuilder): void
    {
        const {csVertices1, csVertices2, workVec4, projectionViewMatrix, context} = this;
        const {scene} = context;

        if (g.points.length < 2) {
            throw new Error("Invalid LineGizmo: Has < 2 points");
        }

        // Transform points, but don't do perspective division (which must be done *after* clipping) yet
        {
            csVertices1.clear();
            csVertices1.reserve((g.points.length + 1) * 20);
            let i = 0;
            const {u32, f32} = csVertices1;
            for (const p of g.points) {
                vec4.set(workVec4, p[0], p[1], p[2], 1);
                vec4.transformMat4(workVec4, workVec4, projectionViewMatrix);
                u32[i] = i == 0 ? 1 : 0; ++i;
                f32[i++] = workVec4[0];
                f32[i++] = workVec4[1];
                f32[i++] = workVec4[2];
                f32[i++] = workVec4[3];
            }
            if (g.closed) {
                u32[i++] = 0;
                f32[i++] = f32[1];
                f32[i++] = f32[2];
                f32[i++] = f32[3];
                f32[i++] = f32[4];
            }
            csVertices1.length = i * 4;
        }

        csVertices2.reserve(csVertices1.length + 20);
        csVertices1.reserveExtra(20);

        // Clip the line segments by `min(z_near, z_far) * w <= z <= max(z_near, z_far) * w`.
        this.clipByZ(1, -Math.min(scene.depthNear, scene.depthFar), csVertices1, csVertices2);
        this.clipByZ(-1, Math.max(scene.depthNear, scene.depthFar), csVertices2, csVertices1);

        if (csVertices1.length === 0) {
            return;
        }

        const {width, height} = this;
        {
            const {u32, f32, length} = csVertices1;
            const auxF32 = csVertices2.f32;
            const clipToViewportX = $fr(width * 0.5);
            const clipToViewportY = $fr(height * 0.5);
            const normFactorX = $fr(2 / width);
            const normFactorY = $fr(2 / height);
            let lastViewportX = 0, lastViewportY = 0;
            let distance = 0;
            for (let i = 0; i < length; i += 20) {
                // Perform perspective division
                const iw = $fr(1 / f32[(i + 16) >> 2]);
                f32[(i + 4) >> 2] *= iw;
                f32[(i + 8) >> 2] *= iw;
                f32[(i + 12) >> 2] *= iw;

                const viewportX = $fr(f32[(i + 4) >> 2] * clipToViewportX);
                const viewportY = $fr(f32[(i + 8) >> 2] * clipToViewportY);
                if (!u32[(i + 0) >> 2]) {
                    const diffX = $fr(viewportX - lastViewportX);
                    const diffY = $fr(viewportY - lastViewportY);
                    const segmentLen = $fr(Math.sqrt($fr(diffX * diffX) + $fr(diffY * diffY)));
                    distance = $fr(distance + segmentLen);

                    // Compute the normal for each segment and store it as a clip-space vector
                    const rcpSegmentLen = $fr(1 / segmentLen);
                    const tanX = $fr(diffX * rcpSegmentLen);
                    const tanY = $fr(diffY * rcpSegmentLen);
                    auxF32[(i + 4) >> 2] = tanY * normFactorX;
                    auxF32[(i + 8) >> 2] = -$fr(tanX * normFactorY);

                    // Also store the tangent
                    auxF32[(i + 12) >> 2] = tanX * normFactorX;
                    auxF32[(i + 16) >> 2] = tanY * normFactorY;
                }
                auxF32[(i + 0) >> 2] = distance;
                lastViewportX = viewportX;
                lastViewportY = viewportY;
            }
        }

        // Generate vertices
        // (Currently we do this on per-line-segment-basis due to the complexity
        // of robustly handling the line corners.)
        {
            const {u32, f32, length} = csVertices1;
            const auxF32 = csVertices2.f32;
            const color = g.color;

            let v1, v2;
            switch (g.style) {
                case LineStyle.SOLID: v1 = -0.5 / 8; v2 = 1.5 / 8; break;
                case LineStyle.DASH: v1 = 1.5 / 8; v2 = 3.5 / 8; break;
                default:
                    throw new Error(`Invalid LineStyle: ${g.style}`);
            }

            let lx = 0, ly = 0, lz = 0, ld = 0;
            for (let i = 0; i < length; i += 20) {
                const x = f32[(i + 4) >> 2];
                const y = f32[(i + 8) >> 2];
                const z = f32[(i + 12) >> 2];
                const d = auxF32[(i + 0) >> 2];
                if (!u32[(i + 0) >> 2]) {
                    const nX = auxF32[(i + 4) >> 2];
                    const nY = auxF32[(i + 8) >> 2];
                    const tX = auxF32[(i + 12) >> 2];
                    const tY = auxF32[(i + 16) >> 2];
                    const vtxIndex = vb.numVertices;
                    // 0, 1 (start cap)
                    vb.pushVertex(
                        lx - tX + nX, ly - tY + nY, lz, 1,
                        0, 0, 0, 0,
                        $fr(ld * (1 / 8)), v1
                    );
                    vb.pushVertex(
                        lx - tX - nX, ly - tY - nY, lz, 1,
                        0, 0, 0, 0,
                        $fr(ld * (1 / 8)), v2
                    );
                    // 2, 3 (start)
                    vb.pushVertex(
                        lx + nX, ly + nY, lz, 1,
                        color[0], color[1], color[2], color[3],
                        $fr(ld * (1 / 8)), v1
                    );
                    vb.pushVertex(
                        lx - nX, ly - nY, lz, 1,
                        color[0], color[1], color[2], color[3],
                        $fr(ld * (1 / 8)), v2
                    );
                    // 4, 5 (end)
                    vb.pushVertex(
                        x + nX, y + nY, z, 1,
                        color[0], color[1], color[2], color[3],
                        $fr(d * (1 / 8)), v1
                    );
                    vb.pushVertex(
                        x - nX, y - nY, z, 1,
                        color[0], color[1], color[2], color[3],
                        $fr(d * (1 / 8)), v2
                    );
                    // 6, 7 (end cap)
                    vb.pushVertex(
                        x + tX + nX, y + tY + nY, z, 1,
                        0, 0, 0, 0,
                        $fr(d * (1 / 8)), v1
                    );
                    vb.pushVertex(
                        x + tX - nX, y + tY - nY, z, 1,
                        0, 0, 0, 0,
                        $fr(d * (1 / 8)), v2
                    );
                    // indices
                    for (let i = 0; i < 18; ++i) {
                        ib.pushU16(INDICES[i] + vtxIndex);
                    }
                }
                lx = x; ly = y; lz = z; ld = d;
            }
        }
    }

    private clipByZ(planeZ: number, planeW: number, input: BufferBuilder, output: BufferBuilder): void
    {
        output.clear();

        const length = input.length;
        let outIndex = 0;
        const inU32 = input.u32;
        const inF32 = input.f32;
        const outU32 = output.u32;
        const outF32 = output.f32;

        let ld = 0;
        let lx = 0, ly = 0, lz = 0, lw = 0;

        planeZ = $fr(planeZ);
        planeW = $fr(planeW);

        for (let inOffset = 0; inOffset < length; inOffset += 20) {
            const x = inF32[(inOffset + 4) >> 2];
            const y = inF32[(inOffset + 8) >> 2];
            const z = inF32[(inOffset + 12) >> 2];
            const w = inF32[(inOffset + 16) >> 2];

            const d = $fr($fr(z * planeZ) + $fr(w * planeW));

            if (!inU32[(inOffset + 0) >> 2]) {
                if (d >= 0) {
                    if (ld < 0) {
                        // Entering the visible region
                        const per = $fr(ld / $fr(ld - d));
                        outU32[outIndex++] = 1;
                        outF32[outIndex++] = $fr(lx * $fr(1 - per)) + $fr(x * per);
                        outF32[outIndex++] = $fr(ly * $fr(1 - per)) + $fr(y * per);
                        outF32[outIndex++] = $fr(lz * $fr(1 - per)) + $fr(z * per);
                        outF32[outIndex++] = $fr(lw * $fr(1 - per)) + $fr(w * per);
                    }
                    outU32[outIndex++] = 0;
                    outF32[outIndex++] = x;
                    outF32[outIndex++] = y;
                    outF32[outIndex++] = z;
                    outF32[outIndex++] = w;
                } else if (ld >= 0) {
                    // Leaving the visible region
                    const per = $fr(ld / $fr(ld - d));
                    outU32[outIndex++] = 0;
                    outF32[outIndex++] = $fr(lx * $fr(1 - per)) + $fr(x * per);
                    outF32[outIndex++] = $fr(ly * $fr(1 - per)) + $fr(y * per);
                    outF32[outIndex++] = $fr(lz * $fr(1 - per)) + $fr(z * per);
                    outF32[outIndex++] = $fr(lw * $fr(1 - per)) + $fr(w * per);
                }
            } else if (d >= 0) {
                outU32[outIndex++] = 1;
                outF32[outIndex++] = x;
                outF32[outIndex++] = y;
                outF32[outIndex++] = z;
                outF32[outIndex++] = w;
            }

            ld = d; lx = x; ly = y; lz = z; lw = w;
        }

        output.length = outIndex * 4;
    }

    dispose(): void
    {
        this.context.context.gl.deleteTexture(this.texture);
    }
}
