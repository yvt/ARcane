/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec2, mat4 } from 'gl-matrix';

import { downcast, table } from '../../utils/utils';

import { TextureRenderBuffer, TextureRenderBufferInfo, TextureRenderBufferFormat } from '../renderbuffer';
import { RenderOperation, RenderOperator, RenderBuffer, RenderBufferInfo, RenderPipeline } from '../scheduler';
import { GLFramebuffer } from '../globjs/framebuffer';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../globjs/context';
import { GLConstants } from '../globjs/constants';
import { QuadRenderer } from '../quad';
import { RenderState } from '../globals';
import { Blitter, BlitterContext } from '../subpasses/blit';

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder
} from '../shadertk/shadertoolkit';
import { TypedShaderInstance, buildShaderTyped, TypedShaderParameter } from '../shadertk/shadertoolkittyped';

import { PieShaderModule, PieShaderChunk } from '../shadertk/pieglsl';
const fragModule: PieShaderModule = require('./reproject_frag.glsl');
const vertModule: PieShaderModule = require('./reproject_vert.glsl');

import { Texture2DShaderObject, Texture2DShaderInstance, TextureShaderParameter } from '../shaderutils/texture';

export interface TemporalRerojectionPassContext
{
    readonly context: GLContext;
    readonly blitter: Blitter;
    readonly state: RenderState;
    readonly quad: QuadRenderer;
}

enum ShaderFlags
{
    DILATE = 1,
}

export class TemporalRerojectionPass
{
    shaderInstance: TypedShaderInstance<ReprojectShaderInstance, ReprojectShaderParam>[];

    constructor(public readonly context: TemporalRerojectionPassContext)
    {
        const {gl} = context.context;

        this.shaderInstance = table(2, i => buildShaderTyped
            <ReprojectShaderModule, ReprojectShaderInstance, ReprojectShaderParam>
            (builder => new ReprojectShaderModule(builder, i))
            .compile(context.context));
    }

    dispose(): void
    {
    }

    setupReproject(
        g1: TextureRenderBufferInfo,
        format: TextureRenderBufferFormat,
        mode: 'crisp' | 'smooth',
        ops: RenderOperation<GLContext>[]
    ): {
        reprojected: TextureRenderBufferInfo;
        chain: ChainRenderBufferInfo;
    }
    {
        const {width, height} = g1;
        const chain = new ChainRenderBufferInfo('Chain', mode);
        const reprojected = new TextureRenderBufferInfo(
            "Reprojected",
            width, height,
            format,
        );

        ops.push({
            inputs: { g1 },
            outputs: { reprojected, chain },
            optionalOutputs: [],
            name: `Reproject`,
            factory: (cfg) => new ReprojectOperator(
                this,
                downcast(TextureRenderBuffer, cfg.outputs['reprojected']),
                downcast(ChainRenderBuffer, cfg.outputs['chain']),
                downcast(TextureRenderBuffer, cfg.inputs['g1']),
                mode,
            ),
        });

        return { reprojected, chain };
    }

    /**
     * Adds a `RenderOperation` for updating the reprojection buffer.
     *
     * @param input The image to save to the reprojection buffer.
     * @param chain A `ChainRenderBufferInfo` returned by `setupReproject`.
     * @param ops A list of `RenderOperation`.
     * @return A output `TextureRenderBufferInfo`, which actually just stores
     *         a copy of `input`.
     */
    setupSave(
        input: TextureRenderBufferInfo,
        chain: ChainRenderBufferInfo,
        ops: RenderOperation<GLContext>[]
    ): TextureRenderBufferInfo
    {
        const {width, height} = input;
        const output = new TextureRenderBufferInfo(
            input.name + ' (Saved)',
            width, height,
            input.format,
        );

        ops.push({
            inputs: { input, chain },
            outputs: { output },
            optionalOutputs: [],
            bindings: [ 'input', 'output' ],
            name: `Save Reprojection Buffer`,
            factory: (cfg) => new SaveOperator(
                this,
                downcast(TextureRenderBuffer, cfg.outputs['output']),
                downcast(ChainRenderBuffer, cfg.inputs['chain']),
                downcast(TextureRenderBuffer, cfg.inputs['input']),
            ),
        });

        return output;
    }
}

let chainId = 1;

export class ChainRenderBufferInfo extends RenderBufferInfo<GLContext>
{
    private id = chainId++;

    constructor(name: string, public readonly mode: 'crisp' | 'smooth')
    {
        super(name);

        this.cost = 0;
    }
    create(manager: RenderPipeline<GLContext>): ChainRenderBuffer
    {
        return new ChainRenderBuffer(this.mode);
    }
    get physicalFormatDescription(): string
    {
        return `Chain #${this.id}`;
    }
    get logicalFormatDescription(): string
    {
        return "None";
    }
}

class ChainRenderBuffer implements RenderBuffer
{
    buffer: {
        texture: WebGLTexture;
        framebuffer: GLFramebuffer;
        width: number;
        height: number;
        format: TextureRenderBufferFormat;
    } | null = null;
    matrix = mat4.create();

    constructor(public readonly mode: 'crisp' | 'smooth') {}

    free(): void
    {
        if (this.buffer) {
            const {gl} = this.buffer.framebuffer.context;
            gl.deleteTexture(this.buffer.texture);
            this.buffer.framebuffer.dispose();
            this.buffer = null;
        }
    }

    dispose(): void
    {
        this.free();
    }


}

class SaveOperator implements RenderOperator
{
    private framebuffer: GLFramebuffer | null = null;

    constructor(
        private pass: TemporalRerojectionPass,
        private output: TextureRenderBuffer,
        private chain: ChainRenderBuffer,
        private input: TextureRenderBuffer,
    )
    {
        if (output !== input) {
            this.framebuffer = GLFramebuffer.createFramebuffer(
                pass.context.context,
                {
                    colors: [output.texture!],
                }
            );
        }
    }

    dispose(): void
    {
        if (this.framebuffer) {
            this.framebuffer.dispose();
        }
    }

    beforeRender(): void { }

    perform(): void
    {
        const {pass, chain} = this;
        const {context, blitter, state} = pass.context;
        const {scene} = state;
        const {gl} = context;

        // Re-create the reprojection buffer if needed
        if (
            chain.buffer == null ||
            chain.buffer.width !== this.input.width ||
            chain.buffer.height !== this.input.height ||
            chain.buffer.format !== this.input.format
        ) {
            chain.free();

            const texture = gl.createTexture()!;
            gl.bindTexture(GLConstants.TEXTURE_2D, texture);
            if (chain.mode === 'crisp') {
                gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MAG_FILTER, GLConstants.NEAREST);
                gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MIN_FILTER, GLConstants.NEAREST);
            } else {
                gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MAG_FILTER, GLConstants.LINEAR);
                gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MIN_FILTER, GLConstants.LINEAR);
            }
            gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_S, GLConstants.CLAMP_TO_EDGE);
            gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_T, GLConstants.CLAMP_TO_EDGE);
            gl.texImage2D(
                GLConstants.TEXTURE_2D,
                0,
                GLConstants.RGBA,
                this.input.width,
                this.input.height,
                0,
                GLConstants.RGBA,
                GLConstants.UNSIGNED_BYTE,
                null
            );

            chain.buffer = {
                texture,
                framebuffer: GLFramebuffer.createFramebuffer(
                    pass.context.context,
                    {
                        colors: [texture!],
                    }
                ),
                width: this.input.width,
                height: this.input.height,
                format: this.input.format,
            };
        }

        const {params} = blitter;

        // Copy to the reprojection buffer
        context.framebuffer = chain.buffer.framebuffer;
        context.drawBuffers = GLDrawBufferFlags.Color0 | GLDrawBufferFlags.ColorRGBA;
        context.states = GLStateFlags.CullFaceDisabled;
        gl.viewport(0, 0, this.input.width, this.input.height);
        vec2.set(params.inputMin, 0, 0);
        vec2.set(params.inputMax, 1, 1);
        vec2.set(params.outputMin, -1, -1);
        vec2.set(params.outputMax, 1, 1);
        params.inputLod = 0;
        params.texture.texture = this.input.texture;
        blitter.blit();

        // It is supposed that `input === output` (in-place operation), but just
        // in case `input !== output`
        if (this.framebuffer) {
            context.framebuffer = this.framebuffer;
            context.drawBuffers = GLDrawBufferFlags.Color0 | GLDrawBufferFlags.ColorRGBA;
            blitter.blit();
        }

        // Also save the matrix
        const projectionMatrix = chain.mode === 'smooth'
            ? state.scene.projectionMatrix
            : state.renderProjectionMatrix;
        mat4.multiply(chain.matrix, projectionMatrix, scene.viewMatrix);
    }

    afterRender(): void { }
}

class ReprojectOperator implements RenderOperator
{
    private shaderFlags: ShaderFlags;
    private shaderParams: TypedShaderParameter<ReprojectShaderParam>;
    private framebuffer: GLFramebuffer;

    constructor(
        private pass: TemporalRerojectionPass,
        private output: TextureRenderBuffer,
        private chain: ChainRenderBuffer,
        private g1: TextureRenderBuffer,
        private mode: 'crisp' | 'smooth',
    )
    {
        this.shaderFlags = (mode === 'smooth' ? ShaderFlags.DILATE : 0);
        this.shaderParams = pass.shaderInstance[this.shaderFlags].createParameter();

        this.framebuffer = GLFramebuffer.createFramebuffer(
            pass.context.context,
            {
                colors: [output.texture!],
            }
        );
    }

    dispose(): void { this.framebuffer.dispose(); }

    beforeRender(): void { }

    perform(): void
    {
        const {pass, chain} = this;
        const {context, quad, state} = pass.context;
        const {scene} = state;
        const {gl} = context;

        context.framebuffer = this.framebuffer;
        context.states = GLStateFlags.Default;
        context.drawBuffers = GLDrawBufferFlags.Color0 | GLDrawBufferFlags.ColorRGBA;
        gl.viewport(0, 0, this.output.width, this.output.height);

        if (chain.buffer == null || chain.buffer.format !== this.output.format) {
            // Can't reproject; fill the output with transparent color
            gl.clearColor(0, 0, 0, 0);
            gl.clear(GLConstants.COLOR_BUFFER_BIT);
            return;
        }

        const params = this.shaderParams.root;

        params.g1Texture.texture = this.g1.texture;
        params.inputTexture.texture = chain.buffer.texture;

        // `reprojectionMatrix` = P' ⋅ V' ⋅ V⁻¹ ⋅ P⁻¹
        const projectionMatrix = this.mode === 'smooth'
            ? state.scene.projectionMatrix
            : state.renderProjectionMatrix;

        mat4.multiply(params.reprojectionMatrix, projectionMatrix, scene.viewMatrix);
        mat4.invert(params.reprojectionMatrix, params.reprojectionMatrix);
        mat4.multiply(params.reprojectionMatrix, chain.matrix, params.reprojectionMatrix);

        vec2.set(params.tsOffset, 2 / chain.buffer.width, 2 / chain.buffer.height);

        const shaderInstance = pass.shaderInstance[this.shaderFlags];
        gl.useProgram(shaderInstance.program.handle);
        shaderInstance.apply(this.shaderParams);

        quad.render(shaderInstance.root.a_Position);
    }

    afterRender(): void { }
}

interface ReprojectShaderParam
{
    g1Texture: TextureShaderParameter;
    inputTexture: TextureShaderParameter;
    reprojectionMatrix: mat4;
    tsOffset: vec2;
}

class ReprojectShaderModule extends ShaderModule<ReprojectShaderInstance, ReprojectShaderParam>
{
    private readonly fragChunk = new PieShaderChunk<{
        u_ReprojectionMatrix: string;
        g1Texture: string;
        inputTexture: string;
        DILATE: string;
    }>(fragModule);
    private readonly vertChunk = new PieShaderChunk<{
        u_ReprojectionMatrix: string;
        u_TSOffset: string;
        a_Position: string;
    }>(vertModule);

    readonly a_Position = this.vertChunk.bindings.a_Position;

    readonly u_ReprojectionMatrix = this.fragChunk.bindings.u_ReprojectionMatrix;
    readonly u_TSOffset = this.vertChunk.bindings.u_TSOffset;

    readonly g1Texture: Texture2DShaderObject;
    readonly inputTexture: Texture2DShaderObject;

    constructor(builder: ShaderBuilder, flags: ShaderFlags)
    {
        super(builder);

        this.g1Texture = new Texture2DShaderObject(builder, 'mediump');
        this.inputTexture = new Texture2DShaderObject(builder, 'mediump');

        this.fragChunk.bind({
            // child object
            g1Texture: this.g1Texture.u_Texture,
            inputTexture: this.inputTexture.u_Texture,

            // static parameters
            DILATE: `${flags & ShaderFlags.DILATE}`,
        });
        this.vertChunk.inherit(this.fragChunk);

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder)
    {
        return new ReprojectShaderInstance(builder, this);
    }

    emitFrag() { return this.fragChunk.emit(); }

    emitVert() { return this.vertChunk.emit(); }
}

class ReprojectShaderInstance extends ShaderModuleInstance<ReprojectShaderParam>
{
    readonly a_Position: number;

    private readonly g1Texture: Texture2DShaderInstance;
    private readonly inputTexture: Texture2DShaderInstance;

    private readonly u_ReprojectionMatrix: WebGLUniformLocation;
    private readonly u_TSOffset: WebGLUniformLocation;

    constructor(builder: ShaderInstanceBuilder, parent: ReprojectShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);

        this.u_ReprojectionMatrix = gl.getUniformLocation(builder.program.handle, parent.u_ReprojectionMatrix)!;
        this.u_TSOffset = gl.getUniformLocation(builder.program.handle, parent.u_TSOffset)!;

        this.g1Texture = builder.getUnwrap(parent.g1Texture);
        this.inputTexture = builder.getUnwrap(parent.inputTexture);
    }

    createParameter(builder: ShaderParameterBuilder): ReprojectShaderParam
    {
        return {
            g1Texture: builder.getUnwrap(this.g1Texture),
            inputTexture: builder.getUnwrap(this.inputTexture),
            reprojectionMatrix: mat4.create(),
            tsOffset: vec2.create(),
        };
    }

    apply(param: ReprojectShaderParam)
    {
        const {gl} = this.context;

        gl.uniformMatrix4fv(this.u_ReprojectionMatrix, false, param.reprojectionMatrix);
        gl.uniform2f(this.u_TSOffset, param.tsOffset[0], param.tsOffset[1]);
    }
}

