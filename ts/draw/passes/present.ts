import {
    TextureRenderBuffer,
    TextureRenderBufferInfo,
    DummyRenderBufferInfo
} from '../renderbuffer';
import { RenderOperation, RenderOperator } from '../scheduler';
import { GLContext } from '../globjs/context';
import { GLConstants } from '../globjs/constants';

export class PresentPass
{
    constructor(private context: GLContext)
    {
    }

    dispose(): void
    {
    }

    setup(ops: RenderOperation<GLContext>[]): DummyRenderBufferInfo<GLContext>
    {
        const outp = new DummyRenderBufferInfo("Presented Image");

        ops.push({
            inputs: {
                // input: input
            },
            outputs: {
                output: outp
            },
            optionalOutputs: ["output"],
            name: "Present",
            factory: (cfg) => new PresentOperator(this.context)
        });

        return outp;
    }
}

class PresentOperator implements RenderOperator
{
    constructor(private context: GLContext)
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
        const {context} = this;
        context.framebuffer = null;

        const {gl} = context;

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(GLConstants.COLOR_BUFFER_BIT);
    }

    afterRender(): void
    {
    }
}
