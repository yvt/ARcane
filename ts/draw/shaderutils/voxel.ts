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

export type ShaderPrecision = 'lowp' | 'mediump' | 'highp';

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
    readonly densityTexture: Texture2DShaderObject;

    /**
     * A shader function to fetch a voxel from the associated voxel data.
     *
     * This function has the following parameters:
     *
     *  - `highp vec3 voxel`: specifies the coordinate of the voxel.
     *    The components of the coordinate must be multiples of `exp2(lod)`.
     *  - `mediump float lod`: specifies the mip level (`0` = most detail).
     *    Must be an integral value.
     */
    readonly fetchVoxel = allocateIdentifier();

    private commonModule: VoxelDataShaderModule;

    constructor(builder: ShaderBuilder)
    {
        super(builder);

        this.commonModule = builder.requireModule(VoxelDataShaderModuleFactory);
        this.densityTexture = new Texture2DShaderObject(builder, 'mediump');

        this.register();
    }

    get densityTextureSampler(): string
    {
        return this.densityTexture.u_Texture;
    }

    createInstance(builder: ShaderInstanceBuilder): VoxelDataShaderInstance
    {
        return new VoxelDataShaderInstance(builder, this);
    }

    emit(): string
    {
        return `
        mediump float ${this.fetchVoxel}(highp vec3 voxel, mediump float lod) {
            return ${this.commonModule.fetchVoxel}(
                ${this.densityTextureSampler},
                voxel,
                lod
            );
        }`;
    }
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
    readonly fetchVoxel = allocateIdentifier();

    constructor(builder: ShaderBuilder)
    {
        super(builder);
        this.register();
    }

    emitFrag(): string
    {
        return `
        mediump float ${this.fetchVoxel}(mediump sampler2D tex, highp vec3 voxel, mediump float lod) {
            highp float sz1 = fract(voxel.z * (1.0 / 16.0)) * 16.0;
            highp float sz2 = floor(voxel.z * (1.0 / 16.0));
            highp vec2 mapped =
                (voxel.xy + exp2(lod - 1.0)) * (1.0 / 4096.0) +
                vec2(sz1, sz2) * (256.0 / 4096.0);

            return texture2DLodEXT(tex, mapped, lod).w;
        }`;
    }

    emitVert(): string
    {
        return `
        mediump float ${this.fetchVoxel}(mediump sampler2D tex, highp vec3 voxel, mediump float lod) {
            highp float sz1 = fract(voxel.z * (1.0 / 16.0)) * 16.0;
            highp float sz2 = floor(voxel.z * (1.0 / 16.0));
            highp vec2 mapped =
                (voxel.xy + exp2(lod - 1.0)) * (1.0 / 4096.0) +
                vec2(sz1, sz2) * (256.0 / 4096.0);

            return texture2DLod(tex, mapped, lod).w;
        }`;
    }
}