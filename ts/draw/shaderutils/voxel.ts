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
const voxelCommonModule: PieShaderModule = require('./voxelcommon.glsl');
const voxelCommonFragModule: PieShaderModule = require('./voxelcommon_frag.glsl');
const voxelCommonVertModule: PieShaderModule = require('./voxelcommon_vert.glsl');

export class VoxelDataShaderParam
{
    constructor(
        private densityTexture: TextureShaderParameter,
        private materialTexture: TextureShaderParameter,
    )
    {
    }

    set voxelData(value: VoxelData)
    {
        this.densityTexture.texture = value.densityTex;
        this.materialTexture.texture = value.materialTex;
    }
}

export class VoxelDataShaderObject extends ShaderObject<VoxelDataShaderInstance, VoxelDataShaderParam>
{
    private readonly pieChunk = new PieShaderChunk<{
        fetchVoxelDensity: string;
        fetchVoxelMaterial: string;
        densityTextureSampler: string;
        materialTextureSampler: string;
        fetchVoxelDensityCommon: string;
        fetchVoxelMaterialCommon: string;
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
    readonly fetchVoxelDensity = this.pieChunk.bindings.fetchVoxelDensity;

    /**
     * A shader function to fetch a material info from the associated voxel data.
     *
     * This function has the following parameters:
     *
     *  - `highp vec3 voxel`: specifies the integral coordinate of the voxel.
     *
     * Returns `mediump vec4`.
     */
    readonly fetchVoxelMaterial = this.pieChunk.bindings.fetchVoxelMaterial;

    readonly densityTexture: Texture2DShaderObject;
    readonly materialTexture: Texture2DShaderObject;
    private commonModule: VoxelDataShaderModule;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.commonModule = builder.requireModule(VoxelDataShaderModuleFactory);
        this.densityTexture = new Texture2DShaderObject(builder, 'mediump');
        this.materialTexture = new Texture2DShaderObject(builder, 'mediump');

        this.pieChunk.bind({
            fetchVoxelDensityCommon: this.commonModule.fetchVoxelDensity,
            fetchVoxelMaterialCommon: this.commonModule.fetchVoxelMaterial,
            densityTextureSampler: this.densityTexture.u_Texture,
            materialTextureSampler: this.materialTexture.u_Texture,
        });

        this.register();
    }

    /** Provides a direct access to the contained density texture of type `sampler2D`. */
    get densityTextureSampler() { return this.densityTexture.u_Texture; }

    /** Provides a direct access to the contained material texture of type `sampler2D`. */
    get materialTextureSampler() { return this.materialTexture.u_Texture; }

    createInstance(builder: ShaderInstanceBuilder): VoxelDataShaderInstance
    {
        return new VoxelDataShaderInstance(builder, this);
    }

    emit() { return this.pieChunk.emit(); }
}

export class VoxelDataShaderInstance extends ShaderObjectInstance<VoxelDataShaderParam>
{
    private densityTexture: Texture2DShaderInstance;
    private materialTexture: Texture2DShaderInstance;

    constructor(builder: ShaderInstanceBuilder, parent: VoxelDataShaderObject)
    {
        super(builder);

        this.densityTexture = builder.getUnwrap(parent.densityTexture);
        this.materialTexture = builder.getUnwrap(parent.materialTexture);
    }

    createParameter(builder: ShaderParameterBuilder): VoxelDataShaderParam
    {
        return new VoxelDataShaderParam(builder.getUnwrap(this.densityTexture), builder.getUnwrap(this.materialTexture));
    }

    apply(param: VoxelDataShaderParam)
    {
    }
}

const VoxelDataShaderModuleFactory = (builder: ShaderBuilder) => new VoxelDataShaderModule(builder);

class VoxelDataShaderModule extends ShaderModule<any, {}>
{
    private readonly pieChunk = new PieShaderChunk<{
        fetchVoxelMaterial: string;
    }>(voxelCommonModule);
    private readonly fragChunk = new PieShaderChunk<{
        fetchVoxelDensity: string;
    }>(voxelCommonFragModule);
    private readonly vertChunk = new PieShaderChunk<{
        fetchVoxelDensity: string;
    }>(voxelCommonVertModule);

    readonly fetchVoxelDensity = this.fragChunk.bindings.fetchVoxelDensity;
    readonly fetchVoxelMaterial = this.pieChunk.bindings.fetchVoxelMaterial;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.vertChunk.inherit(this.fragChunk);
        this.pieChunk.inherit(this.fragChunk);

        this.register();
    }

    emit() { return this.pieChunk.emit(); }

    emitFrag() { return this.fragChunk.emit(); }

    emitVert() { return this.vertChunk.emit(); }
}