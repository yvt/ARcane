import { vec2, mat4 } from 'gl-matrix';

import { downcast } from '../../utils/utils';

import { TextureRenderBuffer, TextureRenderBufferInfo, TextureRenderBufferFormat } from '../renderbuffer';
import { RenderOperation, RenderOperator } from '../scheduler';
import { GLFramebuffer } from '../globjs/framebuffer';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../globjs/context';
import { Blitter } from '../subpasses/blit';
import { Scene } from '../model';

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance, ShaderInstanceBuilder, ShaderParameterBuilder,
} from '../shadertk/shadertoolkit';
import { TypedShaderInstance, buildShaderTyped, TypedShaderParameter } from '../shadertk/shadertoolkittyped';

import { PieShaderModule, PieShaderChunk } from '../shadertk/pieglsl';
const pieFragModule: PieShaderModule = require('./gizmo_frag.glsl');
const pieVertModule: PieShaderModule = require('./gizmo_vert.glsl');

import { Texture2DShaderObject, Texture2DShaderInstance, TextureShaderParameter } from '../shaderutils/texture';

export interface GizmoContext
{
    readonly context: GLContext;
    readonly scene: Scene;
    readonly blitter: Blitter;
}

export class GizmoPass
{
    shaderInstance: TypedShaderInstance<GizmoShaderInstance, GizmoShaderParam>;

    constructor(public readonly context: GizmoContext)
    {
        this.shaderInstance = buildShaderTyped<GizmoShaderModule, GizmoShaderInstance, GizmoShaderParam>
            (builder => new GizmoShaderModule(builder)).compile(context.context);
    }

    dispose(): void
    {
    }

    setup(g1: TextureRenderBufferInfo, input: TextureRenderBufferInfo, ops: RenderOperation<GLContext>[]): TextureRenderBufferInfo
    {
        const {width, height} = g1;
        const output = new TextureRenderBufferInfo(
            input.name + ' + Gizmos',
            width, height,
            input.format,
        );

        ops.push({
            inputs: { g1, input },
            outputs: { output },
            optionalOutputs: [],
            bindings: [ 'input', 'output' ],
            name: "Gizmos",
            factory: (cfg) => new GizmoOperator(
                this,
                downcast(TextureRenderBuffer, cfg.outputs['output']),
                downcast(TextureRenderBuffer, cfg.inputs['g1']),
                downcast(TextureRenderBuffer, cfg.inputs['input']),
            ),
        });

        return output;
    }
}

class GizmoOperator implements RenderOperator
{
    private shaderParams: TypedShaderParameter<GizmoShaderParam>;
    private framebuffer: GLFramebuffer;

    constructor(
        private pass: GizmoPass,
        private output: TextureRenderBuffer,
        private g1: TextureRenderBuffer,
        private input: TextureRenderBuffer,
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
        const {context, blitter, scene} = pass.context;
        const {gl} = context;
        const {shaderInstance} = pass;

        context.framebuffer = this.framebuffer;
        context.drawBuffers = GLDrawBufferFlags.Color0 | GLDrawBufferFlags.ColorRGBA;
        gl.viewport(0, 0, this.output.width, this.output.height);

        if (this.input !== this.output) {
            // Out-place operation
            const {params} = blitter;
            vec2.set(params.inputMin, 0, 0);
            vec2.set(params.inputMax, 1, 1);
            vec2.set(params.outputMin, -1, -1);
            vec2.set(params.outputMax, 1, 1);
            params.inputLod = 0;
            params.texture.texture = this.input.texture;
            context.states = GLStateFlags.Default;
            blitter.blit();
        }

/*
        const params = this.shaderParams.root;
        params.g1Texture.texture = this.g1.texture;

        gl.useProgram(shaderInstance.program.handle);
        shaderInstance.apply(this.shaderParams); */
    }

    afterRender(): void
    {
    }
}

interface GizmoShaderParam
{
    readonly g1Texture: TextureShaderParameter;
    readonly imageTexture: TextureShaderParameter;
}

class GizmoShaderModule extends ShaderModule<GizmoShaderInstance, GizmoShaderParam>
{
    private readonly fragChunk = new PieShaderChunk<{
        v_TexCoord: string;
        v_ScreenCoord: string;
        v_Color: string;
        inputTexture: string;
        g1Texture: string;
    }>(pieFragModule);
    private readonly vertChunk = new PieShaderChunk<{
        v_TexCoord: string;
        v_ScreenCoord: string;
        v_Color: string;
        a_Position: string;
        a_TexCoord: string;
        a_Color: string;
    }>(pieVertModule);

    readonly a_Position = this.vertChunk.bindings.a_Position;
    readonly a_Color = this.vertChunk.bindings.a_Color;
    readonly a_TexCoord = this.vertChunk.bindings.a_TexCoord;

    readonly g1Texture: Texture2DShaderObject;
    readonly imageTexture: Texture2DShaderObject;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.g1Texture = new Texture2DShaderObject(builder, 'mediump');
        this.imageTexture = new Texture2DShaderObject(builder, 'mediump');

        this.fragChunk.bind({
            // child object
            g1Texture: this.g1Texture.u_Texture,
            inputTexture: this.imageTexture.u_Texture,
        });
        this.vertChunk.inherit(this.fragChunk);

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder)
    {
        return new GizmoShaderInstance(builder, this);
    }

    emitFrag() { return this.fragChunk.emit(); }
    emitVert() { return this.vertChunk.emit(); }
}

class GizmoShaderInstance extends ShaderModuleInstance<GizmoShaderParam>
{
    readonly a_Position: number;
    readonly a_Color: number;
    readonly a_TexCoord: number;

    private readonly g1Texture: Texture2DShaderInstance;
    private readonly imageTexture: Texture2DShaderInstance;

    constructor(builder: ShaderInstanceBuilder, parent: GizmoShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);
        this.a_Color = gl.getAttribLocation(builder.program.handle, parent.a_Color);
        this.a_TexCoord = gl.getAttribLocation(builder.program.handle, parent.a_TexCoord);

        this.g1Texture = builder.getUnwrap(parent.g1Texture);
        this.imageTexture = builder.getUnwrap(parent.imageTexture);
    }

    createParameter(builder: ShaderParameterBuilder): GizmoShaderParam
    {
        return {
            g1Texture: builder.getUnwrap(this.g1Texture),
            imageTexture: builder.getUnwrap(this.imageTexture),
        };
    }
}

