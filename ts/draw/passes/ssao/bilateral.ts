/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec2, mat4 } from 'gl-matrix';

import { downcast } from '../../../utils/utils';

import {
    TextureRenderBuffer,
    TextureRenderBufferInfo,
    TextureRenderBufferFormat,
} from '../../renderbuffer';
import { RenderOperation, RenderOperator } from '../../scheduler';
import { GLFramebuffer } from '../../globjs/framebuffer';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../../globjs/context';
import { GLConstants } from '../../globjs/constants';
import { QuadRenderer } from '../../quad';
import { Scene } from '../../model';

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder
} from '../../shadertk/shadertoolkit';
import {
    TypedShaderInstance, buildShaderTyped, TypedShaderParameter
} from '../../shadertk/shadertoolkittyped';

import { PieShaderModule, PieShaderChunk } from '../../shadertk/pieglsl';
const fragModule: PieShaderModule = require('./bilateral_frag.glsl');
const vertModule: PieShaderModule = require('./bilateral_vert.glsl');

import {
    Texture2DShaderObject, Texture2DShaderInstance, TextureShaderParameter
} from '../../shaderutils/texture';

import { SsaoContext } from './toplevel';

export class BilateralPass
{
    shaderInstance: TypedShaderInstance<BilateralShaderInstance, BilateralShaderParam>;

    constructor(public readonly context: SsaoContext)
    {
        const {gl} = context.context;

        this.shaderInstance = buildShaderTyped
            <BilateralShaderModule, BilateralShaderInstance, BilateralShaderParam>
            (builder => new BilateralShaderModule(builder))
            .compile(context.context);
    }

    dispose(): void
    {
    }

    setup(
        value: TextureRenderBufferInfo,
        g1: TextureRenderBufferInfo,
        direction: 'horizontal' | 'vertical',
        ops: RenderOperation<GLContext>[]
    ): TextureRenderBufferInfo
    {
        const {width, height} = g1;
        const output = new TextureRenderBufferInfo(
            "Bilateral Filter Result",
            width, height,
            value.format,
        );

        ops.push({
            inputs: { g1, value },
            outputs: { output },
            optionalOutputs: [],
            name: `Bilateral Filter (${direction})`,
            factory: (cfg) => new BilateralOperator(
                this,
                downcast(TextureRenderBuffer, cfg.outputs['output']),
                downcast(TextureRenderBuffer, cfg.inputs['g1']),
                downcast(TextureRenderBuffer, cfg.inputs['value']),
                direction === 'vertical',
            ),
        });

        return output;
    }
}

class BilateralOperator implements RenderOperator
{
    private shaderParams: TypedShaderParameter<BilateralShaderParam>;
    private framebuffer: GLFramebuffer;

    constructor(
        private pass: BilateralPass,
        private output: TextureRenderBuffer,
        private g1: TextureRenderBuffer,
        private value: TextureRenderBuffer,
        private vertical: boolean,
    )
    {
        this.shaderParams = pass.shaderInstance.createParameter();

        this.framebuffer = GLFramebuffer.createFramebuffer(
            pass.context.context,
            {
                colors: [output.texture!],
            }
        );
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

        params.g1Texture.texture = this.g1.texture;
        params.inputTexture.texture = this.value.texture;

        vec2.set(params.tsSweepOffset,
            this.vertical ? 0 : 1 / this.value.width,
            this.vertical ? 1 / this.value.height : 0
        );

        context.framebuffer = this.framebuffer;
        context.states = GLStateFlags.Default;
        context.drawBuffers = GLDrawBufferFlags.Color0 | GLDrawBufferFlags.ColorRGBA;
        gl.viewport(0, 0, this.output.width, this.output.height);

        const {shaderInstance} = pass;
        gl.useProgram(shaderInstance.program.handle);
        shaderInstance.apply(this.shaderParams);

        quad.render(shaderInstance.root.a_Position);
    }

    afterRender(): void
    {
    }
}

interface BilateralShaderParam
{
    g1Texture: TextureShaderParameter;
    inputTexture: TextureShaderParameter;
    tsSweepOffset: vec2;
}

class BilateralShaderModule extends ShaderModule<BilateralShaderInstance, BilateralShaderParam>
{
    private readonly fragChunk = new PieShaderChunk<{
        u_TSSweepOffset: string;
        g1Texture: string;
        inputTexture: string;
    }>(fragModule);
    private readonly vertChunk = new PieShaderChunk<{
        a_Position: string;
    }>(vertModule);

    readonly a_Position = this.vertChunk.bindings.a_Position;

    readonly u_TSSweepOffset = this.fragChunk.bindings.u_TSSweepOffset;

    readonly g1Texture: Texture2DShaderObject;
    readonly inputTexture: Texture2DShaderObject;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.g1Texture = new Texture2DShaderObject(builder, 'mediump');
        this.inputTexture = new Texture2DShaderObject(builder, 'mediump');

        this.fragChunk.bind({
            // child object
            g1Texture: this.g1Texture.u_Texture,
            inputTexture: this.inputTexture.u_Texture,
        });
        this.vertChunk.inherit(this.fragChunk);

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder)
    {
        return new BilateralShaderInstance(builder, this);
    }

    emitFrag() { return this.fragChunk.emit(); }

    emitVert() { return this.vertChunk.emit(); }
}

class BilateralShaderInstance extends ShaderModuleInstance<BilateralShaderParam>
{
    readonly a_Position: number;

    private readonly g1Texture: Texture2DShaderInstance;
    private readonly inputTexture: Texture2DShaderInstance;

    private readonly u_TSSweepOffset: WebGLUniformLocation;

    constructor(builder: ShaderInstanceBuilder, parent: BilateralShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);

        this.u_TSSweepOffset = gl.getUniformLocation(builder.program.handle, parent.u_TSSweepOffset)!;

        this.g1Texture = builder.getUnwrap(parent.g1Texture);
        this.inputTexture = builder.getUnwrap(parent.inputTexture);
    }

    createParameter(builder: ShaderParameterBuilder): BilateralShaderParam
    {
        return {
            g1Texture: builder.getUnwrap(this.g1Texture),
            inputTexture: builder.getUnwrap(this.inputTexture),
            tsSweepOffset: vec2.create(),
        };
    }

    apply(param: BilateralShaderParam)
    {
        const {gl} = this.context;

        gl.uniform2f(this.u_TSSweepOffset, param.tsSweepOffset[0], param.tsSweepOffset[1]);
    }
}

