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
    Texture2DShaderObject, Texture2DShaderInstance, TextureShaderParameter
} from '../shaderutils/texture';

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
        params.densityTexture.texture = voxel.densityTex;

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
    densityTexture: TextureShaderParameter;
}

class RaytraceShaderModule extends ShaderModule<RaytraceShaderInstance, RaytraceShaderParam>
{
    readonly a_Position = allocateIdentifier();
    readonly u_InvViewProjMat = allocateIdentifier();
    readonly u_ViewProjMat = allocateIdentifier();

    readonly densityTexture: Texture2DShaderObject;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.densityTexture = new Texture2DShaderObject(builder, 'mediump');

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

            // Coordinates are specified in the voxel data space
            mediump float ${voxelTrace}(
                highp vec3 rayStart,
                highp vec3 rayEnd,
                highp vec3 rayDir
            ) {
                highp float rayLen = length(rayEnd - rayStart);
                mediump float dens = 0.0;

                for (mediump int i = 0; i < 256; ++i) {
                    highp vec3 position = floor(rayStart);
                    highp float sz1 = fract(position.z * (1.0 / 16.0)) * 16.0;
                    highp float sz2 = floor(position.z * (1.0 / 16.0));
                    highp vec2 mapped =
                        position.xy * (1.0 / 4096.0) +
                        vec2(sz1, sz2) * (256.0 / 4096.0);

                    dens += texture2D(${this.densityTexture.u_Texture}, mapped).w;

                    rayStart += rayDir * 2.0;
                    rayLen -= 2.0;
                    if (rayLen <= 0.0) {
                        break;
                    }
                }

                return dens;
            }

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

            void main() {
                // Render a cube
                highp vec3 rayStart = v_RayStart.xyz / v_RayStart.w;
                highp vec3 rayEnd = v_RayEnd.xyz / v_RayEnd.w;
                highp vec3 rayDir = normalize(rayEnd - rayStart);

                ${clipRay}(rayStart, rayEnd, rayDir, vec3(1.0, 0.0, 0.0), 0.0);
                ${clipRay}(rayStart, rayEnd, rayDir, vec3(-1.0, 0.0, 0.0), 256.0);
                ${clipRay}(rayStart, rayEnd, rayDir, vec3(0.0, 1.0, 0.0), 0.0);
                ${clipRay}(rayStart, rayEnd, rayDir, vec3(0.0, -1.0, 0.0), 256.0);
                ${clipRay}(rayStart, rayEnd, rayDir, vec3(0.0, 0.0, 1.0), 0.0);
                ${clipRay}(rayStart, rayEnd, rayDir, vec3(0.0, 0.0, -1.0), 256.0);

                mediump float dens = 0.0;
                if (dot(rayEnd - rayStart, rayDir) >= 0.0) {
                    dens = ${voxelTrace}(rayStart, rayEnd, rayDir);
                }

                gl_FragColor = vec4(vec3(exp2(-dens)), 1.0);
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

    private readonly densityTexture: Texture2DShaderInstance;

    constructor(builder: ShaderInstanceBuilder, parent: RaytraceShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);
        this.u_InvViewProjMat = gl.getUniformLocation(builder.program.handle, parent.u_InvViewProjMat)!;
        this.u_ViewProjMat = gl.getUniformLocation(builder.program.handle, parent.u_ViewProjMat)!;

        this.densityTexture = builder.getUnwrap(parent.densityTexture);
    }

    createParameter(builder: ShaderParameterBuilder): RaytraceShaderParam
    {
        return {
            viewProjMat: mat4.create(),
            invViewProjMat: mat4.create(),
            densityTexture: builder.getUnwrap(this.densityTexture),
        };
    }

    apply(param: RaytraceShaderParam)
    {
        const {gl} = this.context;

        gl.uniformMatrix4fv(this.u_InvViewProjMat, false, param.invViewProjMat);
        gl.uniformMatrix4fv(this.u_ViewProjMat, false, param.viewProjMat);
    }
}

