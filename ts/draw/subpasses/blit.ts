/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec2 } from 'gl-matrix';

import { RenderOperation, RenderOperator } from '../scheduler';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../globjs/context';
import { QuadRenderer } from '../quad';

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder
} from '../shadertk/shadertoolkit';
import {
    TypedShaderInstance, buildShaderTyped, TypedShaderParameter
} from '../shadertk/shadertoolkittyped';

import { PieShaderModule, PieShaderChunk } from '../shadertk/pieglsl';
const blitFragModule: PieShaderModule = require('./blit_frag.glsl');
const blitVertModule: PieShaderModule = require('./blit_vert.glsl');

import {
    Texture2DShaderObject, Texture2DShaderInstance, TextureShaderParameter
} from '../shaderutils/texture';

export interface BlitterContext
{
    readonly context: GLContext;
    readonly quad: QuadRenderer;
}

export class Blitter
{
    private readonly shaderInstance: TypedShaderInstance<BlitShaderInstance, BlitShaderParam>;
    private readonly shaderParam: TypedShaderParameter<BlitShaderParam>;

    constructor(public readonly context: BlitterContext, private readonly precision: 'lowp' | 'mediump' | 'highp')
    {
        this.shaderInstance = buildShaderTyped
            <BlitShaderModule, BlitShaderInstance, BlitShaderParam>
            (builder => new BlitShaderModule(builder, precision))
            .compile(context.context);
        this.shaderParam = this.shaderInstance.createParameter();
    }

    get params(): BlitterParams
    {
        return this.shaderParam.root;
    }

    blit(): void
    {
        const {context, quad} = this.context;
        const {gl} = context;
        const params = this.shaderParam.root;

        const {shaderInstance} = this;
        gl.useProgram(shaderInstance.program.handle);
        shaderInstance.apply(this.shaderParam);

        quad.render(shaderInstance.root.a_Position);
    }
}

export interface BlitterParams
{
    /** The minimum output coordinate specified in the clip space. */
    outputMin: vec2;

    /** The maximum output coordinate specified in the clip space. */
    outputMax: vec2;

    /** The minium input UV coordinate. */
    inputMin: vec2;

    /** The maximum input UV coordinate. */
    inputMax: vec2;

    inputLod: number;

    /** The input texture. */
    texture: TextureShaderParameter;
}

type BlitShaderParam = BlitterParams;

class BlitShaderModule extends ShaderModule<BlitShaderInstance, BlitShaderParam>
{
    private readonly fragChunk = new PieShaderChunk<{
        u_Lod: string;
        inputTexture: string;
        v_TexCoord: string;
    }>(blitFragModule);
    private readonly vertChunk = new PieShaderChunk<{
        a_Position: string;
        u_Input: string;
        u_Output: string;
        v_TexCoord: string;
    }>(blitVertModule);

    readonly a_Position = this.vertChunk.bindings.a_Position;
    readonly u_Input = this.vertChunk.bindings.u_Input;
    readonly u_Output = this.vertChunk.bindings.u_Output;
    readonly u_Lod = this.fragChunk.bindings.u_Lod;

    readonly texture: Texture2DShaderObject;

    constructor(builder: ShaderBuilder, private readonly precision: 'lowp' | 'mediump' | 'highp')
    {
        super(builder);

        this.texture = new Texture2DShaderObject(builder, precision);

        this.fragChunk.bind({
            // child object
            inputTexture: this.texture.u_Texture,
        });
        this.vertChunk.inherit(this.fragChunk);

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder)
    {
        return new BlitShaderInstance(builder, this);
    }

    emitFrag() { return this.fragChunk.emit(); }

    emitVert() { return this.vertChunk.emit(); }
}

class BlitShaderInstance extends ShaderModuleInstance<BlitShaderParam>
{
    readonly a_Position: number;
    readonly u_Input: WebGLUniformLocation;
    readonly u_Output: WebGLUniformLocation;
    readonly u_Lod: WebGLUniformLocation;

    private readonly texture: Texture2DShaderInstance;

    constructor(builder: ShaderInstanceBuilder, parent: BlitShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);
        this.u_Input = gl.getUniformLocation(builder.program.handle, parent.u_Input)!;
        this.u_Output = gl.getUniformLocation(builder.program.handle, parent.u_Output)!;
        this.u_Lod = gl.getUniformLocation(builder.program.handle, parent.u_Lod)!;

        this.texture = builder.getUnwrap(parent.texture);
    }

    createParameter(builder: ShaderParameterBuilder): BlitShaderParam
    {
        return {
            inputMin: vec2.create().fill(0),
            inputMax: vec2.create().fill(1),
            outputMin: vec2.create().fill(-1),
            outputMax: vec2.create().fill(1),
            inputLod: 0,
            texture: builder.getUnwrap(this.texture),
        };
    }

    apply(param: BlitShaderParam)
    {
        const {gl} = this.context;

        gl.uniform4f(
            this.u_Input,
            param.inputMin[0],
            param.inputMin[1],
            param.inputMax[0],
            param.inputMax[1]
        );
        gl.uniform4f(
            this.u_Output,
            param.outputMin[0],
            param.outputMin[1],
            param.outputMax[0],
            param.outputMax[1]
        );
        gl.uniform1f(this.u_Lod, param.inputLod);
    }
}
