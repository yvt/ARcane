/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import {
    ShaderObject, ShaderBuilder, ShaderObjectInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder,
    ShaderModule
} from '../shadertk/shadertoolkit';
import { allocateIdentifier } from '../shadertk/uniqueid';
import { GLConstants } from '../globjs/constants';

import {
    Texture2DShaderObject, Texture2DShaderInstance, TextureShaderParameter
} from './texture';

import { VoxelData } from '../voxeldata';

import { PieShaderModule, PieShaderChunk } from '../shadertk/pieglsl';
const voxelDataModule: PieShaderModule = require('./voxeldata.glsl');
const voxelCommonFragModule: PieShaderModule = require('./voxelcommon_frag.glsl');
const voxelCommonVertModule: PieShaderModule = require('./voxelcommon_vert.glsl');

export class VoxelDataShaderParam
{
    constructor(private densityTexture: TextureShaderParameter)
    {
    }

    set voxelData(value: VoxelData)
    {
        this.densityTexture.texture = value.densityTex;
    }
}

export class VoxelDataShaderObject extends ShaderObject<VoxelDataShaderInstance, VoxelDataShaderParam>
{
    private readonly pieChunk = new PieShaderChunk<{
        fetchVoxelData: string;
        densityTextureSampler: string;
        fetchVoxel: string;
    }>(voxelDataModule);

    /**
     * A shader function to fetch a voxel from the associated voxel data.
     *
     * This function has the following parameters:
     *
     *  - `highp vec3 voxel`: specifies the coordinate of the voxel.
     *     - The X and Y components of the coordinate must be multiples of
     *       `exp2(lod)`.
     *     - The Z component must be pre-scaled by `1 / exp2(lod)`. The scaled
     *       value must be integral.
     *  - `mediump float lod`: specifies the mip level (`0` = most detail).
     *    Must be an integral value.
     */
    readonly fetchVoxelData = this.pieChunk.bindings.fetchVoxelData;

    readonly densityTexture: Texture2DShaderObject;
    private commonModule: VoxelDataShaderModule;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.commonModule = builder.requireModule(VoxelDataShaderModuleFactory);
        this.densityTexture = new Texture2DShaderObject(builder, 'mediump');

        this.pieChunk.bind({
            fetchVoxel: this.commonModule.fetchVoxel,
            densityTextureSampler: this.densityTexture.u_Texture,
        });

        this.register();
    }

    /** Provides a direct access to the contained density texture of type `sampler2D`. */
    get densityTextureSampler() { return this.densityTexture.u_Texture; }

    createInstance(builder: ShaderInstanceBuilder): VoxelDataShaderInstance
    {
        return new VoxelDataShaderInstance(builder, this);
    }

    emit() { return this.pieChunk.emit(); }
}

export class VoxelDataShaderInstance extends ShaderObjectInstance<VoxelDataShaderParam>
{
    private densityTexture: Texture2DShaderInstance;

    constructor(builder: ShaderInstanceBuilder, parent: VoxelDataShaderObject)
    {
        super(builder);

        this.densityTexture = builder.getUnwrap(parent.densityTexture);
    }

    createParameter(builder: ShaderParameterBuilder): VoxelDataShaderParam
    {
        return new VoxelDataShaderParam(builder.getUnwrap(this.densityTexture));
    }

    apply(param: VoxelDataShaderParam)
    {
    }
}

const VoxelDataShaderModuleFactory = (builder: ShaderBuilder) => new VoxelDataShaderModule(builder);

class VoxelDataShaderModule extends ShaderModule<any, {}>
{
    private readonly fragChunk = new PieShaderChunk<{
        fetchVoxel: string;
    }>(voxelCommonFragModule);
    private readonly vertChunk = new PieShaderChunk<{
        fetchVoxel: string;
    }>(voxelCommonVertModule);

    readonly fetchVoxel = this.fragChunk.bindings.fetchVoxel;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.vertChunk.inherit(this.fragChunk);

        this.register();
    }

    emitFrag() { return this.fragChunk.emit(); }

    emitVert() { return this.vertChunk.emit(); }
}