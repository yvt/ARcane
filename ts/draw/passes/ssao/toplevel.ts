/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { mat4 } from 'gl-matrix';

import { downcast } from '../../../utils/utils';

import {
    TextureRenderBuffer,
    TextureRenderBufferInfo,
    TextureRenderBufferFormat,
} from '../../renderbuffer';
import { RenderOperation, RenderOperator } from '../../scheduler';
import { GLFramebuffer } from '../../globjs/framebuffer';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../../globjs/context';
import { QuadRenderer } from '../../quad';
import { Scene } from '../../model';

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder
} from '../../shadertk/shadertoolkit';
import {
    TypedShaderInstance, buildShaderTyped, TypedShaderParameter
} from '../../shadertk/shadertoolkittyped';

import { SsaoGeneratePass } from './ssao';
import { BilateralPass } from './bilateral';

export interface SsaoContext
{
    readonly context: GLContext;
    readonly quad: QuadRenderer;
    readonly scene: Scene;
}

export class SsaoPass
{
    private generatePass: SsaoGeneratePass;
    private bilateralPass: BilateralPass;

    constructor(public readonly context: SsaoContext)
    {
        this.generatePass = new SsaoGeneratePass(context);
        this.bilateralPass = new BilateralPass(context);
    }

    dispose(): void
    {
        this.generatePass.dispose();
        this.bilateralPass.dispose();
    }

    setup(g1: TextureRenderBufferInfo, color: TextureRenderBufferInfo, ops: RenderOperation<GLContext>[]): TextureRenderBufferInfo
    {
        let buffer = this.generatePass.setup(g1, color, ops);
        buffer = this.bilateralPass.setup(buffer, g1, 'horizontal', ops);
        buffer = this.bilateralPass.setup(buffer, g1, 'vertical', ops);
        return buffer;
    }
}


