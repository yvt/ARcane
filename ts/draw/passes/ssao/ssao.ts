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
const fragModule: PieShaderModule = require('./ssao_frag.glsl');
const vertModule: PieShaderModule = require('./ssao_vert.glsl');

import {
    Texture2DShaderObject, Texture2DShaderInstance, TextureShaderParameter
} from '../../shaderutils/texture';
import { MediumpComplexNumbersShaderModuleFactory } from '../../shaderutils/complexnum';
import { ConstantsShaderModuleFactory } from '../../shaderutils/constants';

import { SsaoContext } from './toplevel';

/** 4x4 Bayer matrix. */
const DITHER16 = new Uint8Array([
    0x00, 0x80, 0x20, 0xa0,
    0xc0, 0x40, 0xe0, 0x60,
    0x30, 0xb0, 0x10, 0x90,
    0xf0, 0x70, 0xd0, 0x50,
]);

export class SsaoGeneratePass
{
    shaderInstance: TypedShaderInstance<SsaoShaderInstance, SsaoShaderParam>;

    ditherTexture: WebGLTexture;

    constructor(public readonly context: SsaoContext)
    {
        const {gl} = context.context;

        this.shaderInstance = buildShaderTyped
            <SsaoShaderModule, SsaoShaderInstance, SsaoShaderParam>
            (builder => new SsaoShaderModule(builder))
            .compile(context.context);

        this.ditherTexture = gl.createTexture()!;
        gl.bindTexture(GLConstants.TEXTURE_2D, this.ditherTexture);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MAG_FILTER, GLConstants.NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MIN_FILTER, GLConstants.NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_S, GLConstants.REPEAT);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_T, GLConstants.REPEAT);

        gl.texImage2D(GLConstants.TEXTURE_2D, 0, GLConstants.LUMINANCE, 4, 4, 0,
            GLConstants.LUMINANCE, GLConstants.UNSIGNED_BYTE, DITHER16);
    }

    dispose(): void
    {
        const {gl} = this.context.context;
        gl.deleteTexture(this.ditherTexture);
    }

    setup(g1: TextureRenderBufferInfo, ops: RenderOperation<GLContext>[]): TextureRenderBufferInfo
    {
        const {width, height} = g1;
        const output = new TextureRenderBufferInfo(
            "SSAO Result",
            width, height,
            TextureRenderBufferFormat.RGBA8,
        );

        ops.push({
            inputs: { g1 },
            outputs: { output },
            optionalOutputs: [],
            name: "SSAO",
            factory: (cfg) => new SsaoOperator(
                this,
                downcast(TextureRenderBuffer, cfg.outputs['output']),
                downcast(TextureRenderBuffer, cfg.inputs['g1']),
            ),
        });

        return output;
    }
}

class SsaoOperator implements RenderOperator
{
    private shaderParams: TypedShaderParameter<SsaoShaderParam>;
    private framebuffer: GLFramebuffer;

    constructor(
        private pass: SsaoGeneratePass,
        private output: TextureRenderBuffer,
        private g1: TextureRenderBuffer,
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
        mat4.copy(params.projMat, scene.projectionMatrix);
        mat4.invert(params.invProjMat, params.projMat);

        params.g1Texture.texture = this.g1.texture;
        params.ditherTexture.texture = this.pass.ditherTexture;

        vec2.set(params.tsPixelOffset, 1 / this.g1.width, 1 / this.g1.height);
        vec2.set(params.ditherTexCoordFactor, this.g1.width / 4, this.g1.height / 4);

        const kernelSize = Math.max(1, Math.min(this.g1.width, this.g1.height) * 0.005);
        vec2.set(params.tsSampleOffsetFactor, kernelSize / this.g1.width, kernelSize / this.g1.height);

        context.framebuffer = this.framebuffer;
        context.states = GLStateFlags.Default;
        context.drawBuffers = GLDrawBufferFlags.Color0 | GLDrawBufferFlags.ColorRGBA;
        gl.viewport(0, 0, this.g1.width, this.g1.height);

        const {shaderInstance} = pass;
        gl.useProgram(shaderInstance.program.handle);
        shaderInstance.apply(this.shaderParams);

        quad.render(shaderInstance.root.a_Position);
    }

    afterRender(): void
    {
    }
}

interface SsaoShaderParam
{
    projMat: mat4;
    invProjMat: mat4;
    g1Texture: TextureShaderParameter;
    ditherTexture: TextureShaderParameter;
    tsPixelOffset: vec2;
    ditherTexCoordFactor: vec2;
    tsSampleOffsetFactor: vec2;
}

class SsaoShaderModule extends ShaderModule<SsaoShaderInstance, SsaoShaderParam>
{
    private readonly fragChunk = new PieShaderChunk<{
        u_ProjMat: string;
        u_InvProjMat: string;
        u_TSPixelOffset: string;
        u_TSSampleOffsetFactor: string;
        g1Texture: string;
        ditherTexture: string;
        complexMultiply: string;
        PI: string;
    }>(fragModule);
    private readonly vertChunk = new PieShaderChunk<{
        u_InvProjMat: string;
        u_DitherTexCoordFactor: string;
        a_Position: string;
    }>(vertModule);

    readonly a_Position = this.vertChunk.bindings.a_Position;

    readonly u_ProjMat = this.fragChunk.bindings.u_ProjMat;
    readonly u_InvProjMat = this.fragChunk.bindings.u_InvProjMat;
    readonly u_TSPixelOffset = this.fragChunk.bindings.u_TSPixelOffset;
    readonly u_DitherTexCoordFactor = this.vertChunk.bindings.u_DitherTexCoordFactor;
    readonly u_TSSampleOffsetFactor = this.fragChunk.bindings.u_TSSampleOffsetFactor;

    readonly g1Texture: Texture2DShaderObject;
    readonly ditherTexture: Texture2DShaderObject;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        const complexnum = builder.requireModule(MediumpComplexNumbersShaderModuleFactory);
        const constants = builder.requireModule(ConstantsShaderModuleFactory);

        this.g1Texture = new Texture2DShaderObject(builder, 'mediump');
        this.ditherTexture = new Texture2DShaderObject(builder, 'mediump');

        this.fragChunk.bind({
            // child object
            g1Texture: this.g1Texture.u_Texture,
            ditherTexture: this.ditherTexture.u_Texture,

            // library
            complexMultiply: complexnum.multiply,
            PI: constants.PI,
        });
        this.vertChunk.inherit(this.fragChunk);

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder)
    {
        return new SsaoShaderInstance(builder, this);
    }

    emitFrag() { return this.fragChunk.emit(); }

    emitVert() { return this.vertChunk.emit(); }
}

class SsaoShaderInstance extends ShaderModuleInstance<SsaoShaderParam>
{
    readonly a_Position: number;

    private readonly g1Texture: Texture2DShaderInstance;
    private readonly ditherTexture: Texture2DShaderInstance;

    private readonly u_ProjMat: WebGLUniformLocation;
    private readonly u_InvProjMat: WebGLUniformLocation;
    private readonly u_TSPixelOffset: WebGLUniformLocation;
    private readonly u_DitherTexCoordFactor: WebGLUniformLocation;
    private readonly u_TSSampleOffsetFactor: WebGLUniformLocation;

    constructor(builder: ShaderInstanceBuilder, parent: SsaoShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);

        this.u_ProjMat = gl.getUniformLocation(builder.program.handle, parent.u_ProjMat)!;
        this.u_InvProjMat = gl.getUniformLocation(builder.program.handle, parent.u_InvProjMat)!;
        this.u_TSPixelOffset = gl.getUniformLocation(builder.program.handle, parent.u_TSPixelOffset)!;
        this.u_DitherTexCoordFactor = gl.getUniformLocation(builder.program.handle, parent.u_DitherTexCoordFactor)!;
        this.u_TSSampleOffsetFactor = gl.getUniformLocation(builder.program.handle, parent.u_TSSampleOffsetFactor)!;

        this.g1Texture = builder.getUnwrap(parent.g1Texture);
        this.ditherTexture = builder.getUnwrap(parent.ditherTexture);
    }

    createParameter(builder: ShaderParameterBuilder): SsaoShaderParam
    {
        return {
            projMat: mat4.create(),
            invProjMat: mat4.create(),
            g1Texture: builder.getUnwrap(this.g1Texture),
            ditherTexture: builder.getUnwrap(this.ditherTexture),
            tsPixelOffset: vec2.create(),
            ditherTexCoordFactor: vec2.create(),
            tsSampleOffsetFactor: vec2.create(),
        };
    }

    apply(param: SsaoShaderParam)
    {
        const {gl} = this.context;

        gl.uniformMatrix4fv(this.u_InvProjMat, false, param.invProjMat);
        gl.uniformMatrix4fv(this.u_ProjMat, false, param.projMat);
        gl.uniform2f(this.u_TSPixelOffset, param.tsPixelOffset[0], param.tsPixelOffset[1]);
        gl.uniform2f(this.u_DitherTexCoordFactor, param.ditherTexCoordFactor[0], param.ditherTexCoordFactor[1]);
        gl.uniform2f(this.u_TSSampleOffsetFactor, param.tsSampleOffsetFactor[0], param.tsSampleOffsetFactor[1]);
    }
}

