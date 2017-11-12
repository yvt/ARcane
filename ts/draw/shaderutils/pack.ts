import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder,
    ShaderModuleFactory,
} from '../shadertk/shadertoolkit';
import { GLConstants } from '../globjs/constants';

import { PieShaderModule, PieShaderChunk } from '../shadertk/pieglsl';
const packModule: PieShaderModule = require('./pack.glsl');

export const PackShaderModuleFactory: ShaderModuleFactory<PackShaderModule> =
    (builder) => new PackShaderModule(builder);

export class PackShaderModule extends ShaderModule<PackShaderInstance, {}>
{
    private readonly pieChunk = new PieShaderChunk<{
        u_Texture: string;
    }>(packModule);

    readonly u_Texture = this.pieChunk.bindings.u_Texture;

    constructor(builder: ShaderBuilder)
    {
        super(builder);
        this.register();
    }

    emit() { return this.pieChunk.emit(); }
}

export class PackShaderInstance extends ShaderModuleInstance<{}>
{
    private readonly u_Texture: WebGLUniformLocation;

    readonly textureStage: number;

    constructor(builder: ShaderInstanceBuilder)
    {
        super(builder);
    }
}