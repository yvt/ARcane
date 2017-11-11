import { mat4 } from 'gl-matrix';

import {
    TextureRenderBuffer,
    TextureRenderBufferInfo,
    DummyRenderBufferInfo
} from '../renderbuffer';
import { RenderOperation, RenderOperator } from '../scheduler';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../globjs/context';
import { QuadRenderer } from '../quad';
import { Scene } from '../model';
import { VoxelData } from '../voxeldata';

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder
} from '../shadertk/shadertoolkit';
import {
    TypedShaderInstance, buildShaderTyped, TypedShaderParameter
} from '../shadertk/shadertoolkittyped';
import { allocateIdentifier } from '../shadertk/uniqueid';

import {
    VoxelDataShaderObject, VoxelDataShaderInstance, VoxelDataShaderParam
} from '../shaderutils/voxel';

export interface RaytraceContext
{
    readonly context: GLContext;
    readonly quad: QuadRenderer;
    readonly scene: Scene;
    readonly voxel: VoxelData;
}

export class RaytracePass
{
    shaderInstance: TypedShaderInstance<RaytraceShaderInstance, RaytraceShaderParam>;

    constructor(public readonly context: RaytraceContext)
    {
        this.shaderInstance = buildShaderTyped
            <RaytraceShaderModule, RaytraceShaderInstance, RaytraceShaderParam>
            (builder => new RaytraceShaderModule(builder))
            .compile(context.context);
    }

    dispose(): void
    {
    }

    setup(ops: RenderOperation<GLContext>[]): DummyRenderBufferInfo<GLContext>
    {
        const outp = new DummyRenderBufferInfo("Raytraced Image");

        ops.push({
            inputs: {
                // input: input
            },
            outputs: {
                output: outp
            },
            optionalOutputs: ["output"],
            name: "Raytrace",
            factory: (cfg) => new RaytraceOperator(this)
        });

        return outp;
    }
}

class RaytraceOperator implements RenderOperator
{
    private shaderParams: TypedShaderParameter<RaytraceShaderParam>;

    constructor(private pass: RaytracePass)
    {
        this.shaderParams = pass.shaderInstance.createParameter();
    }

    dispose(): void
    {
    }

    beforeRender(): void
    {
    }

    perform(): void
    {
        const {pass} = this;
        const {context, quad, scene, voxel} = pass.context;
        const {gl} = context;

        const params = this.shaderParams.root;
        mat4.mul(params.viewProjMat, scene.projectionMatrix, scene.viewMatrix);
        mat4.invert(params.invViewProjMat, params.viewProjMat);
        params.voxelData.voxelData = voxel;

        context.framebuffer = null;
        context.states = GLStateFlags.Default;
        context.drawBuffers = GLDrawBufferFlags.BackColor | GLDrawBufferFlags.ColorRGBA | GLDrawBufferFlags.Depth;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        const {shaderInstance} = pass;
        gl.useProgram(shaderInstance.program.handle);
        shaderInstance.apply(this.shaderParams);

        quad.render(shaderInstance.root.a_Position);
    }

    afterRender(): void
    {
    }
}

interface RaytraceShaderParam
{
    viewProjMat: mat4;
    invViewProjMat: mat4;
    voxelData: VoxelDataShaderParam;
}

class RaytraceShaderModule extends ShaderModule<RaytraceShaderInstance, RaytraceShaderParam>
{
    readonly a_Position = allocateIdentifier();
    readonly u_InvViewProjMat = allocateIdentifier();
    readonly u_ViewProjMat = allocateIdentifier();

    readonly voxelData: VoxelDataShaderObject;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.voxelData = new VoxelDataShaderObject(builder);

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder)
    {
        return new RaytraceShaderInstance(builder, this);
    }

    private readonly voxelTrace = allocateIdentifier();
    private readonly clipRay = allocateIdentifier();

    emitFrag()
    {
        const {voxelTrace, clipRay} = this;
        return `
            uniform highp mat4 ${this.u_ViewProjMat};

            varying highp vec4 v_RayStart;
            varying highp vec4 v_RayEnd;

            void ${clipRay}(
                inout highp vec3 rayStart,
                inout highp vec3 rayEnd,
                highp vec3 rayDir,
                highp vec3 planeNormal,
                highp float planeDistance
            ) {
                if (dot(rayDir, planeNormal) > 0.0) {
                    highp float distance = dot(rayStart, planeNormal) + planeDistance;
                    if (distance > 0.0) {
                        return;
                    }
                    distance /= dot(rayDir, planeNormal);
                    rayStart -= distance * rayDir;
                } else {
                    highp float distance = dot(rayEnd, planeNormal) + planeDistance;
                    if (distance > 0.0) {
                        return;
                    }
                    distance /= dot(rayDir, planeNormal);
                    rayEnd -= distance * rayDir;
                }
            }

            // Coordinates are specified in the voxel data space
            bool ${voxelTrace}(
                highp vec3 rayStart,
                highp vec3 rayEnd,
                out highp vec3 hitVoxel,
                out highp vec3 hitPosition
            ) {
                highp vec3 rayDir = normalize(rayEnd - rayStart);

                ${clipRay}(rayStart, rayEnd, rayDir, vec3(1.0, 0.0, 0.0), 0.0);
                ${clipRay}(rayStart, rayEnd, rayDir, vec3(-1.0, 0.0, 0.0), 256.0);
                ${clipRay}(rayStart, rayEnd, rayDir, vec3(0.0, 1.0, 0.0), 0.0);
                ${clipRay}(rayStart, rayEnd, rayDir, vec3(0.0, -1.0, 0.0), 256.0);
                ${clipRay}(rayStart, rayEnd, rayDir, vec3(0.0, 0.0, 1.0), 0.0);
                ${clipRay}(rayStart, rayEnd, rayDir, vec3(0.0, 0.0, -1.0), 256.0);

                if (dot(rayEnd - rayStart, rayDir) <= 0.0) {
                    return false;
                }

                highp float rayLen = length(rayEnd - rayStart);
                mediump float dens = 0.0;

                /// The current mip level.
                mediump float mip = 8.0;

                /// The current voxel. (Always rounded to integral coordinates)
                mediump vec3 voxel = floor(rayStart + rayDir * 0.001);

                for (mediump int i = 0; i < 256; ++i) {
                    mediump float mipScale = exp2(mip);
                    mediump float mipScaleRcp = exp2(-mip);

                    /// "voxel" rounded according to the current mip level
                    mediump vec3 voxelRounded = floor(voxel * mipScaleRcp) * mipScale;

                    mediump float dens = ${this.voxelData.fetchVoxel}(voxelRounded, mip);
                    if (dens > 0.5) {
                        if (mip <= 0.0) {
                            hitVoxel = voxel;
                            hitPosition = rayStart;
                            return true;
                        } else {
                            // We need to go deeper
                            mip -= 1.0;
                            continue;
                        }
                    }

                    // The X, Y, and Z coordinates of the next X, Y, and Z planes that the ray collides, respectively.
                    mediump vec3 nextPlane = voxelRounded + max(sign(rayDir), vec3(0.0)) * mipScale;

                    /// The time at which the ray intersects each plane indicated by "nextPlane".
                    // hack: Flicker appears when rayDir.x < 0 || rayDir.z < 0 if we change the last value to vec3(0.001).
                    //       I just don't know why.
                    highp vec3 nextPlaneT = max((nextPlane - rayStart) / rayDir, vec3(0.001));

                    highp float minPlaneT = min(min(nextPlaneT.x, nextPlaneT.y), nextPlaneT.z);
                    rayStart += minPlaneT * rayDir;

                    mediump float minPlaneCoord;

                    // Figure out which voxel the ray has entered
                    // (with a correct rounding for each possible intersecting plane)
                    voxel = floor(rayStart);
                    if (minPlaneT == nextPlaneT.x) {
                        voxel.x = nextPlane.x + min(sign(rayDir.x), 0.0);
                        minPlaneCoord = nextPlane.x;
                    } else if (minPlaneT == nextPlaneT.y) {
                        voxel.y = nextPlane.y + min(sign(rayDir.y), 0.0);
                        minPlaneCoord = nextPlane.y;
                    } else /* if (minPlaneT == nextPlaneT.z) */ {
                        voxel.z = nextPlane.z + min(sign(rayDir.z), 0.0);
                        minPlaneCoord = nextPlane.z;
                    }

                    // Go back to the higher mip level as needed
                    // (I wish I had leading_zeros in WebGL 1.0 SL)
                    minPlaneCoord *= mipScaleRcp;
                    for (int k = 0; k < 8; ++k) {
                        if (mip >= 8.0 || floor(minPlaneCoord * 0.5) != minPlaneCoord * 0.5) {
                            break;
                        }
                        minPlaneCoord *= 0.5;
                        mip += 1.0;
                    }

                    rayLen -= minPlaneT;
                    if (rayLen < 0.0) {
                        break;
                    }
                }

                return false;
            }

            void main() {
                // Render a cube
                highp vec3 rayStart = v_RayStart.xyz / v_RayStart.w;
                highp vec3 rayEnd = v_RayEnd.xyz / v_RayEnd.w;

                highp vec3 hitVoxel, hitPosition;
                if (${voxelTrace}(
                    rayStart,
                    rayEnd,
                    /* out */ hitVoxel,
                    /* out */ hitPosition
                )) {
                    // Derive the normal using the partial derivatives
                    mediump float val1 = ${this.voxelData.fetchVoxel}(hitVoxel, 0.0);
                    mediump vec3 neighbor = vec3(
                        ${this.voxelData.fetchVoxel}(hitVoxel + vec3(1.0, 0.0, 0.0), 0.0),
                        ${this.voxelData.fetchVoxel}(hitVoxel + vec3(0.0, 1.0, 0.0), 0.0),
                        ${this.voxelData.fetchVoxel}(hitVoxel + vec3(0.0, 0.0, 1.0), 0.0)
                    );
                    mediump vec3 normal = normalize(val1 - neighbor);

                    // Diffuse shading
                    mediump vec3 lightDir = normalize(vec3(0.3, 1.0, 0.3));
                    mediump float diffuse;
                    highp vec3 dummy1, dummy2;
                    if (${voxelTrace}(
                        hitPosition + lightDir * 2.0,
                        hitPosition + lightDir * 512.0,
                        /* out */ dummy1,
                        /* out */ dummy2
                    )) {
                        diffuse = 0.0;
                    } else {
                        diffuse = max(dot(normal, lightDir), 0.0);
                    }
                    diffuse += 0.03;

                    gl_FragColor = vec4(vec3(1.0, 0.9, 0.8) * sqrt(diffuse), 1.0);
                } else {
                    gl_FragColor = vec4(1.0);
                }
            }
        `;
    }

    emitVert()
    {
        return `
            attribute highp vec2 ${this.a_Position};

            uniform highp mat4 ${this.u_InvViewProjMat};

            varying highp vec4 v_RayStart;
            varying highp vec4 v_RayEnd;

            void main() {
                gl_Position = vec4(${this.a_Position}, 0.0, 1.0);

                v_RayStart = ${this.u_InvViewProjMat} *
                    vec4(${this.a_Position}, -1.0, 1.0);
                v_RayEnd = ${this.u_InvViewProjMat} *
                    vec4(${this.a_Position}, 1.0, 1.0);
            }
        `;
    }
}

class RaytraceShaderInstance extends ShaderModuleInstance<RaytraceShaderParam>
{
    readonly a_Position: number;
    readonly u_InvViewProjMat: WebGLUniformLocation;
    readonly u_ViewProjMat: WebGLUniformLocation;

    private readonly voxelData: VoxelDataShaderInstance;

    constructor(builder: ShaderInstanceBuilder, parent: RaytraceShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);
        this.u_InvViewProjMat = gl.getUniformLocation(builder.program.handle, parent.u_InvViewProjMat)!;
        this.u_ViewProjMat = gl.getUniformLocation(builder.program.handle, parent.u_ViewProjMat)!;

        this.voxelData = builder.getUnwrap(parent.voxelData);
    }

    createParameter(builder: ShaderParameterBuilder): RaytraceShaderParam
    {
        return {
            viewProjMat: mat4.create(),
            invViewProjMat: mat4.create(),
            voxelData: builder.getUnwrap(this.voxelData),
        };
    }

    apply(param: RaytraceShaderParam)
    {
        const {gl} = this.context;

        gl.uniformMatrix4fv(this.u_InvViewProjMat, false, param.invViewProjMat);
        gl.uniformMatrix4fv(this.u_ViewProjMat, false, param.viewProjMat);
    }
}

