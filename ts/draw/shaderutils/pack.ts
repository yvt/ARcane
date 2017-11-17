import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderModuleFactory,
} from '../shadertk/shadertoolkit';

import { PieShaderModule, PieShaderChunk } from '../shadertk/pieglsl';
const pieModule: PieShaderModule = require('./pack.glsl');

export const PackShaderModuleFactory: ShaderModuleFactory<PackShaderModule> =
    (builder) => new PackShaderModule(builder);

export class PackShaderModule extends ShaderModule<PackShaderInstance, {}>
{
    private readonly pieChunk = new PieShaderChunk<{
        u14fp16Encode: string;
        u14fp16Decode: string;
    }>(pieModule);

    readonly u14fp16Encode = this.pieChunk.bindings.u14fp16Encode;
    readonly u14fp16Decode = this.pieChunk.bindings.u14fp16Decode;

    constructor(builder: ShaderBuilder)
    {
        super(builder);
        this.register();
    }

    emit() { return this.pieChunk.emit(); }
}

class PackShaderInstance extends ShaderModuleInstance<{}>
{
}