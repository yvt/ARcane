/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec2, mat4 } from 'gl-matrix';

import { downcast } from '../../utils/utils';

import { TextureRenderBuffer, TextureRenderBufferInfo, TextureRenderBufferFormat } from '../renderbuffer';
import { RenderOperation, RenderOperator, RenderBuffer, RenderBufferInfo, RenderPipeline } from '../scheduler';
import { GLFramebuffer } from '../globjs/framebuffer';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../globjs/context';
import { GLConstants } from '../globjs/constants';
import { QuadRenderer } from '../quad';
import { Scene } from '../model';
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
    readonly scene: Scene;
    readonly quad: QuadRenderer;
}

export class TemporalRerojectionPass
{
    shaderInstance: TypedShaderInstance<ReprojectShaderInstance, ReprojectShaderParam>;

    constructor(public readonly context: TemporalRerojectionPassContext)
    {
        const {gl} = context.context;

        this.shaderInstance = buildShaderTyped
            <ReprojectShaderModule, ReprojectShaderInstance, ReprojectShaderParam>
            (builder => new ReprojectShaderModule(builder))
            .compile(context.context);
    }

    dispose(): void
    {
    }

    setupReproject(
        g1: TextureRenderBufferInfo,
        format: TextureRenderBufferFormat,
        ops: RenderOperation<GLContext>[]
    ): {
        reprojected: TextureRenderBufferInfo;
        chain: ChainRenderBufferInfo;
    }
    {
        const {width, height} = g1;
        const chain = new ChainRenderBufferInfo('Chain');
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

export class ChainRenderBufferInfo extends RenderBufferInfo<GLContext>
{
    constructor(name: string)
    {
        super(name);

        this.cost = 0;
    }
    create(manager: RenderPipeline<GLContext>): ChainRenderBuffer
    {
        return new ChainRenderBuffer();
    }
    get physicalFormatDescription(): string
    {
        return "External";
    }
    get logicalFormatDescription(): string
    {
        return "Untyped";
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
    private shaderParams: TypedShaderParameter<ReprojectShaderParam>;
    private framebuffer: GLFramebuffer | null = null;

    constructor(
        private pass: TemporalRerojectionPass,
        private output: TextureRenderBuffer,
        private chain: ChainRenderBuffer,
        private input: TextureRenderBuffer,
    )
    {
        this.shaderParams = pass.shaderInstance.createParameter();

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
        const {context, blitter, scene} = pass.context;
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
            gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MAG_FILTER, GLConstants.NEAREST);
            gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MIN_FILTER, GLConstants.NEAREST);
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
        mat4.multiply(chain.matrix, scene.projectionMatrix, scene.viewMatrix);
    }

    afterRender(): void { }
}

class ReprojectOperator implements RenderOperator
{
    private shaderParams: TypedShaderParameter<ReprojectShaderParam>;
    private framebuffer: GLFramebuffer;

    constructor(
        private pass: TemporalRerojectionPass,
        private output: TextureRenderBuffer,
        private chain: ChainRenderBuffer,
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

    dispose(): void { this.framebuffer.dispose(); }

    beforeRender(): void { }

    perform(): void
    {
        const {pass, chain} = this;
        const {context, quad, scene} = pass.context;
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

        // `reprojectionMatrix` = P ⋅ V ⋅ V⁻¹ ⋅ P⁻¹
        mat4.multiply(params.reprojectionMatrix, scene.projectionMatrix, scene.viewMatrix);
        mat4.invert(params.reprojectionMatrix, params.reprojectionMatrix);
        mat4.multiply(params.reprojectionMatrix, chain.matrix, params.reprojectionMatrix);

        const {shaderInstance} = pass;
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
}

class ReprojectShaderModule extends ShaderModule<ReprojectShaderInstance, ReprojectShaderParam>
{
    private readonly fragChunk = new PieShaderChunk<{
        u_ReprojectionMatrix: string;
        g1Texture: string;
        inputTexture: string;
    }>(fragModule);
    private readonly vertChunk = new PieShaderChunk<{
        u_ReprojectionMatrix: string;
        a_Position: string;
    }>(vertModule);

    readonly a_Position = this.vertChunk.bindings.a_Position;

    readonly u_ReprojectionMatrix = this.fragChunk.bindings.u_ReprojectionMatrix;

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

    constructor(builder: ShaderInstanceBuilder, parent: ReprojectShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);

        this.u_ReprojectionMatrix = gl.getUniformLocation(builder.program.handle, parent.u_ReprojectionMatrix)!;

        this.g1Texture = builder.getUnwrap(parent.g1Texture);
        this.inputTexture = builder.getUnwrap(parent.inputTexture);
    }

    createParameter(builder: ShaderParameterBuilder): ReprojectShaderParam
    {
        return {
            g1Texture: builder.getUnwrap(this.g1Texture),
            inputTexture: builder.getUnwrap(this.inputTexture),
            reprojectionMatrix: mat4.create(),
        };
    }

    apply(param: ReprojectShaderParam)
    {
        const {gl} = this.context;

        gl.uniformMatrix4fv(this.u_ReprojectionMatrix, false, param.reprojectionMatrix);
    }
}

