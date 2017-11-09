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

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder
} from '../shadertk/shadertoolkit';
import {
    TypedShaderInstance, buildShaderTyped, TypedShaderParameter
}from '../shadertk/shadertoolkittyped';
import { allocateIdentifier } from '../shadertk/uniqueid';

export interface RaytraceContext
{
    readonly context: GLContext;
    readonly quad: QuadRenderer;
    readonly scene: Scene;
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
        const {context, quad, scene} = pass.context;
        const {gl} = context;

        const params = this.shaderParams.root;
        mat4.mul(params.viewProjMat, scene.projectionMatrix, scene.viewMatrix);
        mat4.invert(params.invViewProjMat, params.viewProjMat);

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
}

class RaytraceShaderModule extends ShaderModule<RaytraceShaderInstance, RaytraceShaderParam>
{
    readonly a_Position = allocateIdentifier();
    readonly u_InvViewProjMat = allocateIdentifier();
    readonly u_ViewProjMat = allocateIdentifier();

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder)
    {
        return new RaytraceShaderInstance(builder, this);
    }

    emitFrag()
    {
        return `
            uniform highp mat4 ${this.u_ViewProjMat};

            varying highp vec4 v_RayStart;
            varying highp vec4 v_RayEnd;

            void clipRay(
                inout highp vec3 rayStart,
                highp vec3 rayDir,
                highp vec3 planeNormal,
                highp float planeDistance
            ) {
                if (dot(rayDir, planeNormal) > 0.0) {
                    return;
                }

                highp float distance = dot(rayStart, planeNormal) + planeDistance;
                if (distance < 0.0) {
                    return;
                }
                distance /= dot(rayDir, planeNormal);

                rayStart -= distance * rayDir;
            }

            void main() {
                // Render a cube
                highp vec3 rayStart = v_RayStart.xyz / v_RayStart.w;
                highp vec3 rayEnd = v_RayEnd.xyz / v_RayEnd.w;
                highp vec3 rayDir = normalize(rayEnd - rayStart);

                clipRay(rayStart, rayDir, vec3(1.0, 0.0, 0.0), -1.0);
                clipRay(rayStart, rayDir, vec3(-1.0, 0.0, 0.0), -1.0);
                clipRay(rayStart, rayDir, vec3(0.0, 1.0, 0.0), -1.0);
                clipRay(rayStart, rayDir, vec3(0.0, -1.0, 0.0), -1.0);
                clipRay(rayStart, rayDir, vec3(0.0, 0.0, 1.0), -1.0);
                clipRay(rayStart, rayDir, vec3(0.0, 0.0, -1.0), -1.0);

                rayStart = abs(rayStart);
                if (max(max(rayStart.x, rayStart.y), rayStart.z) <= 1.00001) {
                    highp float k = max(max(rayStart.x, rayStart.y), rayStart.z);
                    if (rayStart.x == k) {
                        gl_FragColor = vec4(0.6, 0.0, 0.0, 1.0);
                    } else if (rayStart.y == k) {
                        gl_FragColor = vec4(0.0, 0.6, 0.0, 1.0);
                    } else {
                        gl_FragColor = vec4(0.0, 0.0, 0.6, 1.0);
                    }
                    return;
                }

                gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
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

    constructor(builder: ShaderInstanceBuilder, parent: RaytraceShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);
        this.u_InvViewProjMat = gl.getUniformLocation(builder.program.handle, parent.u_InvViewProjMat)!;
        this.u_ViewProjMat = gl.getUniformLocation(builder.program.handle, parent.u_ViewProjMat)!;
    }

    createParameter(builder: ShaderParameterBuilder): RaytraceShaderParam
    {
        return {
            viewProjMat: mat4.create(),
            invViewProjMat: mat4.create(),
        };
    }

    apply(param: RaytraceShaderParam)
    {
        const {gl} = this.context;

        gl.uniformMatrix4fv(this.u_InvViewProjMat, false, param.invViewProjMat);
        gl.uniformMatrix4fv(this.u_ViewProjMat, false, param.viewProjMat);
    }
}

