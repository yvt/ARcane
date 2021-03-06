/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec2 } from 'gl-matrix';

import { downcast } from '../../utils/utils';

import {
    TextureRenderBuffer,
    TextureRenderBufferInfo,
    DummyRenderBufferInfo
} from '../renderbuffer';
import { RenderOperation, RenderOperator } from '../scheduler';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../globjs/context';
import { GLConstants } from '../globjs/constants';
import { Blitter, BlitterContext } from '../subpasses/blit';

export interface VisualizeColorBufferPassContext extends BlitterContext
{
    readonly context: GLContext;
    readonly blitter: Blitter;
}

export class VisualizeColorBufferPass
{
    constructor(private context: VisualizeColorBufferPassContext)
    {
    }

    dispose(): void
    {
    }

    setup(input: TextureRenderBufferInfo, ops: RenderOperation<GLContext>[]): DummyRenderBufferInfo<GLContext>
    {
        const outp = new DummyRenderBufferInfo("Presented Image");

        ops.push({
            inputs: {
                input: input
            },
            outputs: {
                output: outp
            },
            optionalOutputs: ["output"],
            name: "Visualize Color Buffer",
            factory: (cfg) => new VisualizeColorBufferOperator(
                this.context,
                downcast(TextureRenderBuffer, cfg.inputs['input']),
            )
        });

        return outp;
    }
}

class VisualizeColorBufferOperator implements RenderOperator
{
    constructor(
        private context: VisualizeColorBufferPassContext,
        private input: TextureRenderBuffer,
    )
    {
    }

    dispose(): void
    {
    }

    beforeRender(): void
    {
    }

    perform(): void
    {
        const {context} = this.context;
        const {gl} = context;

        context.framebuffer = null;
        context.states = GLStateFlags.Default;
        context.drawBuffers = GLDrawBufferFlags.BackColor | GLDrawBufferFlags.ColorRGBA;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(GLConstants.COLOR_BUFFER_BIT);
        context.drawBuffers = GLDrawBufferFlags.BackColor |
            GLDrawBufferFlags.ColorRed | GLDrawBufferFlags.ColorGreen | GLDrawBufferFlags.ColorBlue;

        const {blitter} = this.context;
        vec2.set(blitter.params.inputMin, 0, 0);
        vec2.set(blitter.params.inputMax, 1, 1);
        vec2.set(blitter.params.outputMin, -1, -1);
        vec2.set(blitter.params.outputMax, 1, 1);
        blitter.params.texture.texture = this.input.texture;
        blitter.blit();
    }

    afterRender(): void
    {
    }
}
