/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
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
const raytraceFragModule: PieShaderModule = require('./raytrace_frag.glsl');
const raytraceVertModule: PieShaderModule = require('./raytrace_vert.glsl');

import {
    VoxelDataShaderObject, VoxelDataShaderInstance, VoxelDataShaderParam
} from '../shaderutils/voxel';

export interface RaytraceContext
{
    readonly context: GLContext;
    readonly quad: QuadRenderer;
    readonly scene: Scene;
    readonly voxel: VoxelData;
}

export class RaytracePass
{
    shaderInstance: TypedShaderInstance<RaytraceShaderInstance, RaytraceShaderParam>;

    constructor(public readonly context: RaytraceContext)
    {
        this.shaderInstance = buildShaderTyped
            <RaytraceShaderModule, RaytraceShaderInstance, RaytraceShaderParam>
            (builder => new RaytraceShaderModule(builder))
            .compile(context.context);
    }

    dispose(): void
    {
    }

    setup(width: number, height: number, ops: RenderOperation<GLContext>[]): TextureRenderBufferInfo
    {
        const g1 = new TextureRenderBufferInfo(
            "GBuffer 1",
            width, height,
            TextureRenderBufferFormat.RGBAF16,
        );

        ops.push({
            inputs: {},
            outputs: { g1 },
            optionalOutputs: [],
            name: "Raytrace",
            factory: (cfg) => new RaytraceOperator(
                this,
                downcast(TextureRenderBuffer, cfg.outputs['g1']),
            ),
        });

        return g1;
    }
}

class RaytraceOperator implements RenderOperator
{
    private shaderParams: TypedShaderParameter<RaytraceShaderParam>;
    private framebuffer: GLFramebuffer;

    constructor(
        private pass: RaytracePass,
        private g1: TextureRenderBuffer,
    )
    {
        this.shaderParams = pass.shaderInstance.createParameter();

        this.framebuffer = GLFramebuffer.createFramebuffer(
            pass.context.context,
            {
                colors: [g1.texture!],
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
        params.depthNear = scene.depthNear;
        params.depthFar = scene.depthFar;

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

interface RaytraceShaderParam
{
    viewProjMat: mat4;
    invViewProjMat: mat4;
    voxelData: VoxelDataShaderParam;
    depthNear: number;
    depthFar: number;
}

class RaytraceShaderModule extends ShaderModule<RaytraceShaderInstance, RaytraceShaderParam>
{
    private readonly fragChunk = new PieShaderChunk<{
        u_ViewProjMat: string;
        u_DepthRange: string;
        fetchVoxelDensity: string;
    }>(raytraceFragModule);
    private readonly vertChunk = new PieShaderChunk<{
        a_Position: string;
        u_InvViewProjMat: string;
        u_DepthRange: string;
    }>(raytraceVertModule);

    readonly a_Position = this.vertChunk.bindings.a_Position;
    readonly u_InvViewProjMat = this.vertChunk.bindings.u_InvViewProjMat;
    readonly u_ViewProjMat = this.fragChunk.bindings.u_ViewProjMat;
    readonly u_DepthRange = this.fragChunk.bindings.u_DepthRange;

    readonly voxelData: VoxelDataShaderObject;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.voxelData = new VoxelDataShaderObject(builder);

        this.fragChunk.bind({
            // child object
            fetchVoxelDensity: this.voxelData.fetchVoxelDensity,
        });
        this.vertChunk.inherit(this.fragChunk);

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder)
    {
        return new RaytraceShaderInstance(builder, this);
    }

    emitFrag() { return this.fragChunk.emit(); }

    emitVert() { return this.vertChunk.emit(); }
}

class RaytraceShaderInstance extends ShaderModuleInstance<RaytraceShaderParam>
{
    readonly a_Position: number;
    readonly u_InvViewProjMat: WebGLUniformLocation;
    readonly u_ViewProjMat: WebGLUniformLocation;
    readonly u_DepthRange: WebGLUniformLocation;

    private readonly voxelData: VoxelDataShaderInstance;

    constructor(builder: ShaderInstanceBuilder, parent: RaytraceShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);
        this.u_InvViewProjMat = gl.getUniformLocation(builder.program.handle, parent.u_InvViewProjMat)!;
        this.u_ViewProjMat = gl.getUniformLocation(builder.program.handle, parent.u_ViewProjMat)!;
        this.u_DepthRange = gl.getUniformLocation(builder.program.handle, parent.u_DepthRange)!;

        this.voxelData = builder.getUnwrap(parent.voxelData);
    }

    createParameter(builder: ShaderParameterBuilder): RaytraceShaderParam
    {
        return {
            viewProjMat: mat4.create(),
            invViewProjMat: mat4.create(),
            voxelData: builder.getUnwrap(this.voxelData),
            depthNear: 0,
            depthFar: 0,
        };
    }

    apply(param: RaytraceShaderParam)
    {
        const {gl} = this.context;

        gl.uniformMatrix4fv(this.u_InvViewProjMat, false, param.invViewProjMat);
        gl.uniformMatrix4fv(this.u_ViewProjMat, false, param.viewProjMat);
        gl.uniform2f(this.u_DepthRange, param.depthNear, param.depthFar);
    }
}

