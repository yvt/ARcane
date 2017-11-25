/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderModuleFactory,
} from '../shadertk/shadertoolkit';

import { PieShaderModule, PieShaderChunk } from '../shadertk/pieglsl';
const pieModule: PieShaderModule = require('./complexnum.glsl');

export const MediumpComplexNumbersShaderModuleFactory:
    ShaderModuleFactory<ComplexNumbersShaderModule> =
    (builder) => new ComplexNumbersShaderModule(builder, 'mediump');

export const HighpComplexNumbersShaderModuleFactory:
    ShaderModuleFactory<ComplexNumbersShaderModule> =
    (builder) => new ComplexNumbersShaderModule(builder, 'highp');

export class ComplexNumbersShaderModule extends ShaderModule<ComplexNumbersShaderInstance, {}>
{
    private readonly pieChunk = new PieShaderChunk<{
        PRECISION: string;
        multiply: string;
    }>(pieModule);

    readonly multiply = this.pieChunk.bindings.multiply;

    constructor(builder: ShaderBuilder, precision: 'highp' | 'mediump' | 'lowp')
    {
        super(builder);

        this.pieChunk.bind({
            PRECISION: precision,
        });

        this.register();
    }

    emit() { return this.pieChunk.emit(); }
}

class ComplexNumbersShaderInstance extends ShaderModuleInstance<{}>
{
}