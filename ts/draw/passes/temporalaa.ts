/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec2, mat4 } from 'gl-matrix';

import { downcast } from '../../utils/utils';

import { TextureRenderBuffer, TextureRenderBufferInfo, TextureRenderBufferFormat } from '../renderbuffer';
import { RenderOperation, RenderOperator } from '../scheduler';
import { GLFramebuffer } from '../globjs/framebuffer';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../globjs/context';
import { GLConstants } from '../globjs/constants';
import { QuadRenderer } from '../quad';
import { Scene } from '../model';

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder
} from '../shadertk/shadertoolkit';
import { TypedShaderInstance, buildShaderTyped, TypedShaderParameter } from '../shadertk/shadertoolkittyped';

import { PieShaderModule, PieShaderChunk } from '../shadertk/pieglsl';
const fragModule: PieShaderModule = require('./temporalaa_frag.glsl');
const vertModule: PieShaderModule = require('./temporalaa_vert.glsl');

import { Texture2DShaderObject, Texture2DShaderInstance, TextureShaderParameter } from '../shaderutils/texture';

export interface TemporalAAContext
{
    readonly context: GLContext;
    readonly quad: QuadRenderer;
}

export class TemporalAAPass
{
    shaderInstance: TypedShaderInstance<TemporalAAShaderInstance, TemporalAAShaderParam>;

    constructor(public readonly context: TemporalAAContext)
    {
        const {gl} = context.context;

        this.shaderInstance = buildShaderTyped
            <TemporalAAShaderModule, TemporalAAShaderInstance, TemporalAAShaderParam>
            (builder => new TemporalAAShaderModule(builder))
            .compile(context.context);
    }

    dispose(): void
    {
    }

    setup(
        input: TextureRenderBufferInfo,
        reprojected: TextureRenderBufferInfo,
        ops: RenderOperation<GLContext>[]
    ): TextureRenderBufferInfo
    {
        const {width, height} = input;
        const output = new TextureRenderBufferInfo(
            "TXAA'd Image + Blend Factor",
            width, height,
            input.format,
        );

        ops.push({
            inputs: { input, reprojected },
            outputs: { output },
            optionalOutputs: [],
            name: "TXAA",
            factory: (cfg) => new TemporalAAOperator(
                this,
                downcast(TextureRenderBuffer, cfg.outputs['output']),
                downcast(TextureRenderBuffer, cfg.inputs['input']),
                downcast(TextureRenderBuffer, cfg.inputs['reprojected']),
            ),
        });

        return output;
    }
}

class TemporalAAOperator implements RenderOperator
{
    private shaderParams: TypedShaderParameter<TemporalAAShaderParam>;
    private framebuffer: GLFramebuffer;

    constructor(
        private pass: TemporalAAPass,
        private output: TextureRenderBuffer,
        private input: TextureRenderBuffer,
        private reprojected: TextureRenderBuffer,
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
        const {context, quad} = pass.context;
        const {gl} = context;

        const params = this.shaderParams.root;

        params.historyTexture.texture = this.reprojected.texture;
        params.inputTexture.texture = this.input.texture;

        vec2.set(params.tsOffset, 1 / this.input.width, 1 / this.input.height);

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

interface TemporalAAShaderParam
{
    historyTexture: TextureShaderParameter;
    inputTexture: TextureShaderParameter;
    tsOffset: vec2;
}

class TemporalAAShaderModule extends ShaderModule<TemporalAAShaderInstance, TemporalAAShaderParam>
{
    private readonly fragChunk = new PieShaderChunk<{
        historyTexture: string;
        inputTexture: string;
    }>(fragModule);
    private readonly vertChunk = new PieShaderChunk<{
        u_TSOffset: string;
        a_Position: string;
    }>(vertModule);

    readonly a_Position = this.vertChunk.bindings.a_Position;

    readonly u_TSOffset = this.vertChunk.bindings.u_TSOffset;

    readonly historyTexture: Texture2DShaderObject;
    readonly inputTexture: Texture2DShaderObject;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.historyTexture = new Texture2DShaderObject(builder, 'mediump');
        this.inputTexture = new Texture2DShaderObject(builder, 'mediump');

        this.fragChunk.bind({
            // child object
            historyTexture: this.historyTexture.u_Texture,
            inputTexture: this.inputTexture.u_Texture,
        });
        this.vertChunk.inherit(this.fragChunk);

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder)
    {
        return new TemporalAAShaderInstance(builder, this);
    }

    emitFrag() { return this.fragChunk.emit(); }

    emitVert() { return this.vertChunk.emit(); }
}

class TemporalAAShaderInstance extends ShaderModuleInstance<TemporalAAShaderParam>
{
    readonly a_Position: number;

    private readonly historyTexture: Texture2DShaderInstance;
    private readonly inputTexture: Texture2DShaderInstance;

    private readonly u_TSOffset: WebGLUniformLocation;

    constructor(builder: ShaderInstanceBuilder, parent: TemporalAAShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);

        this.u_TSOffset = gl.getUniformLocation(builder.program.handle, parent.u_TSOffset)!;

        this.historyTexture = builder.getUnwrap(parent.historyTexture);
        this.inputTexture = builder.getUnwrap(parent.inputTexture);
    }

    createParameter(builder: ShaderParameterBuilder): TemporalAAShaderParam
    {
        return {
            historyTexture: builder.getUnwrap(this.historyTexture),
            inputTexture: builder.getUnwrap(this.inputTexture),
            tsOffset: vec2.create(),
        };
    }

    apply(param: TemporalAAShaderParam)
    {
        const {gl} = this.context;

        gl.uniform2f(this.u_TSOffset, param.tsOffset[0], param.tsOffset[1]);
    }
}

