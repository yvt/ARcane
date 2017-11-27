/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec2, mat4 } from 'gl-matrix';

import { downcast } from '../../utils/utils';
import { BufferBuilder, ArrayViewTypeFlags } from '../../utils/bufferbuilder';

import { TextureRenderBuffer, TextureRenderBufferInfo, TextureRenderBufferFormat } from '../renderbuffer';
import { RenderOperation, RenderOperator } from '../scheduler';
import { GLFramebuffer } from '../globjs/framebuffer';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../globjs/context';
import { GLConstants } from '../globjs/constants';
import { Blitter } from '../subpasses/blit';
import { Scene, Gizmo, GizmoType } from '../model';

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance, ShaderInstanceBuilder, ShaderParameterBuilder,
} from '../shadertk/shadertoolkit';
import { TypedShaderInstance, buildShaderTyped, TypedShaderParameter } from '../shadertk/shadertoolkittyped';

import { PieShaderModule, PieShaderChunk } from '../shadertk/pieglsl';
const pieFragModule: PieShaderModule = require('./gizmo_frag.glsl');
const pieVertModule: PieShaderModule = require('./gizmo_vert.glsl');

import { Texture2DShaderObject, Texture2DShaderInstance, TextureShaderParameter } from '../shaderutils/texture';

import { LineGizmoRenderer } from './gizmo_line';

export interface GizmoContext
{
    readonly context: GLContext;
    readonly scene: Scene;
    readonly blitter: Blitter;
}

export class GizmoPass
{
    readonly shaderInstance: TypedShaderInstance<GizmoShaderInstance, GizmoShaderParam>;

    readonly lineGizmoRenderer: LineGizmoRenderer;

    constructor(public readonly context: GizmoContext)
    {
        const {gl} = context.context;

        this.shaderInstance = buildShaderTyped<GizmoShaderModule, GizmoShaderInstance, GizmoShaderParam>
            (builder => new GizmoShaderModule(builder)).compile(context.context);

        this.lineGizmoRenderer = new LineGizmoRenderer(context);
    }

    dispose(): void
    {
        this.lineGizmoRenderer.dispose();
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

    readonly vertexBuffer: WebGLBuffer;
    readonly indexBuffer: WebGLBuffer;
    readonly vertexBufferBuilder = new VBBuilder(256, ArrayViewTypeFlags.F32);
    readonly indexBufferBuilder = new BufferBuilder(256, ArrayViewTypeFlags.U16);

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

        const {gl} = pass.context.context;
        this.vertexBuffer = gl.createBuffer()!;
        this.indexBuffer = gl.createBuffer()!;
    }

    dispose(): void
    {
        const {gl} = this.pass.context.context;
        gl.deleteBuffer(this.vertexBuffer);
        gl.deleteBuffer(this.indexBuffer);
    }

    private current: GizmoRenderer | null = null;
    private passes: Pass[] = [];

    beforeRender(): void
    {
        this.current = null;
        this.passes.length = 0;

        const {pass, vertexBufferBuilder, indexBufferBuilder} = this;
        const {context, lineGizmoRenderer} = pass;
        const {scene} = context;

        vertexBufferBuilder.clear();
        indexBufferBuilder.clear();

        if (scene.skipScene) {
            return;
        }

        lineGizmoRenderer.prepare(this.output.width, this.output.height);

        for (const gizmo of scene.gizmos) {
            if (gizmo.type == GizmoType.LINE) {
                if (this.current !== lineGizmoRenderer) {
                    this.flush();
                    this.current = lineGizmoRenderer;
                }
                lineGizmoRenderer.emit(gizmo, vertexBufferBuilder, indexBufferBuilder);
            } else {
                throw new Error(`Unknown GizmoType: ${gizmo.type}`);
            }
        }

        this.flush();

        // Upload these generated vertex data
        const {gl} = context.context;
        gl.bindBuffer(GLConstants.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(GLConstants.ARRAY_BUFFER, this.vertexBufferBuilder.getU8Subarray(), GLConstants.STREAM_DRAW);

        gl.bindBuffer(GLConstants.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(GLConstants.ELEMENT_ARRAY_BUFFER, this.indexBufferBuilder.getU8Subarray(), GLConstants.STREAM_DRAW);
    }

    private flush(): void
    {
        const {current} = this;
        if (current) {
            this.passes.push({
                end: this.indexBufferBuilder.length >> 1,
                texture: current.texture,
            });
            this.current = null;
        }
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
            context.states = GLStateFlags.CullFaceDisabled;
            blitter.blit();
        }

        if (scene.skipScene) {
            return;
        }

        context.states = GLStateFlags.CullFaceDisabled | GLStateFlags.BlendEnabled;
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE)

        gl.bindBuffer(GLConstants.ARRAY_BUFFER, this.vertexBuffer);
        gl.bindBuffer(GLConstants.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        const params = this.shaderParams.root;
        params.g1Texture.texture = this.g1.texture;
        gl.useProgram(shaderInstance.program.handle);

        context.vertexAttribs.toggleAllWithTrueIndex(
            shaderInstance.root.a_Position,
            shaderInstance.root.a_Color,
            shaderInstance.root.a_TexCoord,
        );

        const STRIDE = 40;
        gl.vertexAttribPointer(shaderInstance.root.a_Position, 4, GLConstants.FLOAT, false, STRIDE, 0);
        gl.vertexAttribPointer(shaderInstance.root.a_Color, 4, GLConstants.FLOAT, false, STRIDE, 16);
        gl.vertexAttribPointer(shaderInstance.root.a_TexCoord, 2, GLConstants.FLOAT, false, STRIDE, 32);

        let index = 0;

        for (const p of this.passes) {
            params.imageTexture.texture = p.texture;
            shaderInstance.apply(this.shaderParams);

            gl.drawElements(GLConstants.TRIANGLES, p.end - index, GLConstants.UNSIGNED_SHORT, index << 1);
            index = p.end;
        }
    }

    afterRender(): void { }
}

export class VBBuilder extends BufferBuilder
{
    numVertices = 0;

    clear(): void
    {
        super.clear();
        this.numVertices = 0;
    }

    pushVertex(
        x: number,
        y: number,
        z: number,
        w: number,
        colorR: number,
        colorG: number,
        colorB: number,
        colorA: number,
        texCoordU: number,
        texCoordV: number,
    ): void
    {
        this.reserveExtra(40);

        const {f32, length} = this;
        f32[(length + 0) >> 2] = x;
        f32[(length + 4) >> 2] = y;
        f32[(length + 8) >> 2] = z;
        f32[(length + 12) >> 2] = w;
        f32[(length + 16) >> 2] = colorR;
        f32[(length + 20) >> 2] = colorG;
        f32[(length + 24) >> 2] = colorB;
        f32[(length + 28) >> 2] = colorA;
        f32[(length + 32) >> 2] = texCoordU;
        f32[(length + 36) >> 2] = texCoordV;

        this.length += 40;
        this.numVertices += 1;
    }
}

interface Pass
{
    end: number;
    texture: WebGLTexture;
}

export interface GizmoRenderer
{
    readonly texture: WebGLTexture;
}

interface GizmoShaderParam
{
    readonly g1Texture: TextureShaderParameter;
    readonly imageTexture: TextureShaderParameter;
}

class GizmoShaderModule extends ShaderModule<GizmoShaderInstance, GizmoShaderParam>
{
    private readonly fragChunk = new PieShaderChunk<{
        inputTexture: string;
        g1Texture: string;
    }>(pieFragModule);
    private readonly vertChunk = new PieShaderChunk<{
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

