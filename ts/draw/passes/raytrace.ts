import {
    TextureRenderBuffer,
    TextureRenderBufferInfo,
    DummyRenderBufferInfo
} from '../renderbuffer';
import { RenderOperation, RenderOperator } from '../scheduler';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../globjs/context';
import { QuadRenderer } from '../quad';

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderInstanceBuilder
} from '../shadertk/shadertoolkit';
import {
    TypedShaderInstance, buildShaderTyped, TypedShaderParameter
}from '../shadertk/shadertoolkittyped';
import { allocateIdentifier } from '../shadertk/uniqueid';

export interface RaytraceContext
{
    readonly context: GLContext;
    readonly quad: QuadRenderer;
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
        const {context, quad} = pass.context;
        const {gl} = context;

        context.framebuffer = null;
        context.states = GLStateFlags.Default;
        context.drawBuffers = GLDrawBufferFlags.BackColor | GLDrawBufferFlags.ColorRGBA;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        const {shaderInstance} = pass;
        gl.useProgram(shaderInstance.program.handle);
        shaderInstance.apply(this.shaderParams);

        quad.render(shaderInstance.root.a_position);
    }

    afterRender(): void
    {
    }
}

interface RaytraceShaderParam
{
}

class RaytraceShaderModule extends ShaderModule<RaytraceShaderInstance, RaytraceShaderParam>
{
    readonly a_position = allocateIdentifier();

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
            void main() {
                gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
            }
        `;
    }

    emitVert()
    {
        return `
            attribute vec2 ${this.a_position};

            void main() {
                gl_Position = vec4(${this.a_position}, 0.0, 1.0);
            }
        `;
    }
}

class RaytraceShaderInstance extends ShaderModuleInstance<RaytraceShaderParam>
{
    readonly a_position: number;

    constructor(builder: ShaderInstanceBuilder, parent: RaytraceShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_position = gl.getAttribLocation(builder.program.handle, parent.a_position);
    }
}