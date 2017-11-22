import { vec2, mat4 } from 'gl-matrix';

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
import { CameraImage } from '../cameraimage';

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
    readonly cameraImage: CameraImage;
}

const enum ShaderFlags
{
    ENABLE_AR = 1
}

export class GlobalLightingPass
{
    shaderInstance: TypedShaderInstance<GlobalLightingShaderInstance, GlobalLightingShaderParam>[] = [];

    constructor(public readonly context: GlobalLightingContext)
    {
        for (let i = 0; i < 2; ++i) {
            this.shaderInstance.push(buildShaderTyped
                <GlobalLightingShaderModule, GlobalLightingShaderInstance, GlobalLightingShaderParam>
                (builder => new GlobalLightingShaderModule(builder, i))
                .compile(context.context));
        }
    }

    dispose(): void
    {
    }

    setup(g1: TextureRenderBufferInfo, ssao: TextureRenderBufferInfo, ops: RenderOperation<GLContext>[]): TextureRenderBufferInfo
    {
        const {width, height} = g1;
        const lit = new TextureRenderBufferInfo(
            "Lit",
            width, height,
            TextureRenderBufferFormat.RGBA8,
        );

        ops.push({
            inputs: { g1, ssao },
            outputs: { lit },
            optionalOutputs: [],
            name: "Global Lighting",
            factory: (cfg) => new GlobalLightingOperator(
                this,
                downcast(TextureRenderBuffer, cfg.outputs['lit']),
                downcast(TextureRenderBuffer, cfg.inputs['g1']),
                downcast(TextureRenderBuffer, cfg.inputs['ssao']),
                this.context.scene.enableAR,
            ),
        });

        return lit;
    }
}

class GlobalLightingOperator implements RenderOperator
{
    private shaderParams: TypedShaderParameter<GlobalLightingShaderParam>;
    private framebuffer: GLFramebuffer;
    private shaderIndex: number;

    constructor(
        private pass: GlobalLightingPass,
        private outputLit: TextureRenderBuffer,
        private g1: TextureRenderBuffer,
        private ssao: TextureRenderBuffer,
        private enableAR: boolean,
    )
    {
        let index = 0;
        if (enableAR) {
            index |= ShaderFlags.ENABLE_AR;
        }
        this.shaderIndex = index;

        this.shaderParams = pass.shaderInstance[index].createParameter();

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
        const {context, quad, scene, voxel, cameraImage} = pass.context;
        const {gl} = context;

        const params = this.shaderParams.root;
        mat4.mul(params.viewProjMat, scene.projectionMatrix, scene.viewMatrix);
        mat4.invert(params.invViewProjMat, params.viewProjMat);
        params.voxelData.voxelData = voxel;
        params.g1Texture.texture = this.g1.texture;
        params.ssaoTexture.texture = this.ssao.texture;

        if (this.enableAR) {
            params.cameraTexture!.texture = cameraImage.texture;
            params.cameraTextureMat = scene.cameraTextureMatrix;
        }

        context.framebuffer = this.framebuffer;
        context.states = GLStateFlags.Default;
        context.drawBuffers = GLDrawBufferFlags.Color0 | GLDrawBufferFlags.ColorRGBA;
        gl.viewport(0, 0, this.outputLit.width, this.outputLit.height);

        const shaderInstance = pass.shaderInstance[this.shaderIndex];
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
    cameraTextureMat: mat4;
    readonly voxelData: VoxelDataShaderParam;
    readonly g1Texture: TextureShaderParameter;
    readonly ssaoTexture: TextureShaderParameter;
    readonly cameraTexture: TextureShaderParameter | null;
}

class GlobalLightingShaderModule extends ShaderModule<GlobalLightingShaderInstance, GlobalLightingShaderParam>
{
    private readonly fragChunk = new PieShaderChunk<{
        ENABLE_AR: string;
        v_TexCoord: string;
        g1Texture: string;
        ssaoTexture: string;
        cameraTexture: string;
        fetchVoxelData: string;
    }>(globalLightingFragModule);
    private readonly vertChunk = new PieShaderChunk<{
        ENABLE_AR: string;
        a_Position: string;
        v_TexCoord: string;
        u_CameraTexMatrix: string;
    }>(globalLightingVertModule);

    readonly a_Position = this.vertChunk.bindings.a_Position;
    readonly u_CameraTexMatrix = this.vertChunk.bindings.u_CameraTexMatrix;

    readonly g1Texture: Texture2DShaderObject;
    readonly ssaoTexture: Texture2DShaderObject;
    readonly cameraTexture: Texture2DShaderObject | null = null;
    readonly voxelData: VoxelDataShaderObject;

    constructor(builder: ShaderBuilder, flags: ShaderFlags)
    {
        super(builder);

        this.g1Texture = new Texture2DShaderObject(builder, 'mediump');
        this.ssaoTexture = new Texture2DShaderObject(builder, 'mediump');
        if (flags & ShaderFlags.ENABLE_AR) {
            this.cameraTexture = new Texture2DShaderObject(builder, 'mediump');
        }
        this.voxelData = new VoxelDataShaderObject(builder);

        this.fragChunk.bind({
            // child object
            g1Texture: this.g1Texture.u_Texture,
            ssaoTexture: this.ssaoTexture.u_Texture,
            cameraTexture: (this.cameraTexture && this.cameraTexture.u_Texture) || '',
            fetchVoxelData: this.voxelData.fetchVoxelData,

            // static parameters
            ENABLE_AR: String(flags & ShaderFlags.ENABLE_AR),
        });
        this.vertChunk.inherit(this.fragChunk);

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
    private readonly ssaoTexture: Texture2DShaderInstance;
    private readonly cameraTexture: Texture2DShaderInstance | null;
    private readonly voxelData: VoxelDataShaderInstance;

    private readonly u_CameraTexMatrix: WebGLUniformLocation | null;

    constructor(builder: ShaderInstanceBuilder, parent: GlobalLightingShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);
        this.u_CameraTexMatrix = gl.getUniformLocation(builder.program.handle, parent.u_CameraTexMatrix);

        this.g1Texture = builder.getUnwrap(parent.g1Texture);
        this.ssaoTexture = builder.getUnwrap(parent.ssaoTexture);
        this.cameraTexture = parent.cameraTexture && builder.getUnwrap(parent.cameraTexture);
        this.voxelData = builder.getUnwrap(parent.voxelData);
    }

    createParameter(builder: ShaderParameterBuilder): GlobalLightingShaderParam
    {
        return {
            viewProjMat: mat4.create(),
            invViewProjMat: mat4.create(),
            cameraTextureMat: mat4.create(),
            voxelData: builder.getUnwrap(this.voxelData),
            g1Texture: builder.getUnwrap(this.g1Texture),
            ssaoTexture: builder.getUnwrap(this.ssaoTexture),
            cameraTexture: this.cameraTexture && builder.getUnwrap(this.cameraTexture),
        };
    }

    apply(param: GlobalLightingShaderParam)
    {
        const {gl} = this.context;
        if (this.u_CameraTexMatrix) {
            gl.uniformMatrix4fv(this.u_CameraTexMatrix, false, param.cameraTextureMat);
        }
    }
}

