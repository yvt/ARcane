/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { IDisposable } from "../../utils/interfaces";
import { GLContext, GLDrawBufferFlags } from './context';
import { GLConstants } from './constants';

export interface GLFramebufferAttachments
{
    depth?: WebGLTexture | WebGLRenderbuffer;
    colors: WebGLTexture[];
}

export class GLFramebuffer implements IDisposable
{
    /**
     * Internal use only. Do not touch, darling!
     * @internal
     */
    drawBufs = GLDrawBufferFlags.Color0;

    constructor(public readonly context: GLContext, public readonly handle: WebGLFramebuffer | null)
    {
        if (handle == null) {
            // the default framebuffer
            this.drawBufs = GLDrawBufferFlags.BackColor;
        }
    }

    static createFramebuffer(
        context: GLContext,
        attachments: GLFramebufferAttachments,
        texTarget?: number
    ): GLFramebuffer
    {
        const gl = context.gl;

        if (texTarget == null) {
            texTarget = GLConstants.TEXTURE_2D;
        }

        const handle = gl.createFramebuffer();
        if (!handle) {
            throw new Error();
        }
        gl.bindFramebuffer(GLConstants.FRAMEBUFFER, handle);

        if (attachments.depth != null) {
            if (attachments.depth instanceof WebGLTexture) {
                gl.framebufferTexture2D(GLConstants.FRAMEBUFFER, GLConstants.DEPTH_STENCIL_ATTACHMENT,
                    GLConstants.TEXTURE_2D, attachments.depth, 0);
            } else if (attachments.depth instanceof WebGLRenderbuffer) {
                gl.framebufferRenderbuffer(GLConstants.FRAMEBUFFER, GLConstants.DEPTH_ATTACHMENT,
                    GLConstants.RENDERBUFFER, attachments.depth);
            }
        }

        const colors = attachments.colors;
        if (colors.length == 1) {
            gl.framebufferTexture2D(GLConstants.FRAMEBUFFER, GLConstants.COLOR_ATTACHMENT0,
                texTarget, colors[0], 0);
        } else {
            const ext = <WebGLDrawBuffers> gl.getExtension("WEBGL_draw_buffers");
            for (let i = 0; i < colors.length; ++i) {
                gl.framebufferTexture2D(GLConstants.FRAMEBUFFER, ext.COLOR_ATTACHMENT0_WEBGL + i,
                    texTarget, colors[i], 0);
            }
        }

        const status = gl.checkFramebufferStatus(GLConstants.FRAMEBUFFER);

        if (status != GLConstants.FRAMEBUFFER_COMPLETE) {
            gl.deleteFramebuffer(handle);
            throw new Error(`incomplete framebuffer: ${status}`);
        }

        return new GLFramebuffer(context, handle);
    }

    dispose(): void
    {
        if (this.handle) {
            this.context.gl.deleteFramebuffer(this.handle);
        }
    }

}
