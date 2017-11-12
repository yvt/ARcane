import { mat4 } from 'gl-matrix';

import { downcast } from '../../utils/utils';

import {
    TextureRenderBuffer,
    TextureRenderBufferInfo,
    TextureRenderBufferFormat,
} from '../renderbuffer';
import { RenderOperation, RenderOperator } from '../scheduler';
import { GLFramebuffer } from '../globjs/framebuffer';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../globjs/context';
import { QuadRenderer } from '../quad';
import { Scene } from '../model';
import { VoxelData } from '../voxeldata';

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder
} from '../shadertk/shadertoolkit';
import {
    TypedShaderInstance, buildShaderTyped, TypedShaderParameter
} from '../shadertk/shadertoolkittyped';

import { PieShaderModule, PieShaderChunk } from '../shadertk/pieglsl';
const globalLightingFragModule: PieShaderModule = require('./globallighting_frag.glsl');
const globalLightingVertModule: PieShaderModule = require('./globallighting_vert.glsl');

import {
    VoxelDataShaderObject, VoxelDataShaderInstance, VoxelDataShaderParam
} from '../shaderutils/voxel';
import {
    Texture2DShaderObject, Texture2DShaderInstance, TextureShaderParameter
} from '../shaderutils/texture';

export interface GlobalLightingContext
{
    readonly context: GLContext;
    readonly quad: QuadRenderer;
    readonly scene: Scene;
    readonly voxel: VoxelData;
}

export class GlobalLightingPass
{
    shaderInstance: TypedShaderInstance<GlobalLightingShaderInstance, GlobalLightingShaderParam>;

    constructor(public readonly context: GlobalLightingContext)
    {
        this.shaderInstance = buildShaderTyped
            <GlobalLightingShaderModule, GlobalLightingShaderInstance, GlobalLightingShaderParam>
            (builder => new GlobalLightingShaderModule(builder))
            .compile(context.context);
    }

    dispose(): void
    {
    }

    setup(g1: TextureRenderBufferInfo, ops: RenderOperation<GLContext>[]): TextureRenderBufferInfo
    {
        const {width, height} = g1;
        const lit = new TextureRenderBufferInfo(
            "Lit",
            width, height,
            TextureRenderBufferFormat.RGBA8,
        );

        ops.push({
            inputs: { g1 },
            outputs: { lit },
            optionalOutputs: [],
            name: "Global Lighting",
            factory: (cfg) => new GlobalLightingOperator(
                this,
                downcast(TextureRenderBuffer, cfg.outputs['lit']),
                downcast(TextureRenderBuffer, cfg.inputs['g1']),
            ),
        });

        return lit;
    }
}

class GlobalLightingOperator implements RenderOperator
{
    private shaderParams: TypedShaderParameter<GlobalLightingShaderParam>;
    private framebuffer: GLFramebuffer;

    constructor(
        private pass: GlobalLightingPass,
        private outputLit: TextureRenderBuffer,
        private g1: TextureRenderBuffer,
    )
    {
        this.shaderParams = pass.shaderInstance.createParameter();

        this.framebuffer = GLFramebuffer.createFramebuffer(
            pass.context.context,
            {
                colors: [outputLit.texture!],
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
        const {context, quad, scene, voxel} = pass.context;
        const {gl} = context;

        const params = this.shaderParams.root;
        mat4.mul(params.viewProjMat, scene.projectionMatrix, scene.viewMatrix);
        mat4.invert(params.invViewProjMat, params.viewProjMat);
        params.voxelData.voxelData = voxel;
        params.g1Texture.texture = this.g1.texture;

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

interface GlobalLightingShaderParam
{
    viewProjMat: mat4;
    invViewProjMat: mat4;
    voxelData: VoxelDataShaderParam;
    g1Texture: TextureShaderParameter;
}

class GlobalLightingShaderModule extends ShaderModule<GlobalLightingShaderInstance, GlobalLightingShaderParam>
{
    private readonly fragChunk = new PieShaderChunk<{
        v_TexCoord: string;
        g1Texture: string;
        fetchVoxelData: string;
    }>(globalLightingFragModule);
    private readonly vertChunk = new PieShaderChunk<{
        a_Position: string;
        v_TexCoord: string;
    }>(globalLightingVertModule);

    readonly a_Position = this.vertChunk.bindings.a_Position;

    readonly g1Texture: Texture2DShaderObject;
    readonly voxelData: VoxelDataShaderObject;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.g1Texture = new Texture2DShaderObject(builder, 'mediump');
        this.voxelData = new VoxelDataShaderObject(builder);

        this.fragChunk.bind({
            // varyings
            v_TexCoord: this.vertChunk.bindings.v_TexCoord,

            // child object
            g1Texture: this.g1Texture.u_Texture,
            fetchVoxelData: this.voxelData.fetchVoxelData,
        });

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder)
    {
        return new GlobalLightingShaderInstance(builder, this);
    }

    emitFrag() { return this.fragChunk.emit(); }

    emitVert() { return this.vertChunk.emit(); }
}

class GlobalLightingShaderInstance extends ShaderModuleInstance<GlobalLightingShaderParam>
{
    readonly a_Position: number;

    private readonly g1Texture: Texture2DShaderInstance;
    private readonly voxelData: VoxelDataShaderInstance;

    constructor(builder: ShaderInstanceBuilder, parent: GlobalLightingShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);

        this.g1Texture = builder.getUnwrap(parent.g1Texture);
        this.voxelData = builder.getUnwrap(parent.voxelData);
    }

    createParameter(builder: ShaderParameterBuilder): GlobalLightingShaderParam
    {
        return {
            viewProjMat: mat4.create(),
            invViewProjMat: mat4.create(),
            voxelData: builder.getUnwrap(this.voxelData),
            g1Texture: builder.getUnwrap(this.g1Texture),
        };
    }

    apply(param: GlobalLightingShaderParam)
    {
        const {gl} = this.context;
    }
}

