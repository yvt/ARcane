import {
    RenderBufferInfo,
    RenderPipeline,
    RenderBuffer
} from "./scheduler";
import { GLContext } from './globjs/context';

export class TextureRenderBufferInfo extends RenderBufferInfo<GLContext>
{
    constructor(name: string,
        public width: number, public height: number,
        public format: TextureRenderBufferFormat)
    {
        super(name);

        // fallback
        switch (this.format) {
            case TextureRenderBufferFormat.R8:
            case TextureRenderBufferFormat.R8G8:
                // these formats are not supported by WebGL for now.
                // fall back to RGBA8 at cost of additional memory usage & bandwidth.
                this.format = TextureRenderBufferFormat.RGBA8;
                break;
        }

        this.hash = this.width ^ (this.height << 16) ^ (this.format << 24) ^ 114514;
        this.cost = this.width * this.height;
        switch (this.format) {
            case TextureRenderBufferFormat.RGBA8:
                this.cost *= 4;
                break;
            case TextureRenderBufferFormat.RGBAF16:
                this.cost *= 8;
                break;
            case TextureRenderBufferFormat.Depth:
                this.cost *= 2;
                break;
        }
    }

    canMergeWith(o: RenderBufferInfo<GLContext>): boolean
    {
        if (o instanceof TextureRenderBufferInfo) {
            return this.width == o.width &&
                this.height == o.height &&
                this.format == o.format;
        } else {
            return false;
        }
    }

    create(manager: RenderPipeline<GLContext>): TextureRenderBuffer
    {
        return new TextureRenderBufferImpl(manager.context, this.width, this.height, this.format);
    }

    get isDepthBuffer(): boolean
    {
        switch (this.format) {
            case TextureRenderBufferFormat.Depth:
                return true;
            default:
                return false;
        }
    }

    get physicalFormatDescription(): string
    {
        let fmtStr = `${this.format}`;
        switch (this.format) {
            case TextureRenderBufferFormat.RGBA8:
                fmtStr = "RGBA8";
                break;
            case TextureRenderBufferFormat.SRGBA8:
                fmtStr = "sRGBA8";
                break;
            case TextureRenderBufferFormat.RGBAF16:
                fmtStr = "RGBAF16";
                break;
            case TextureRenderBufferFormat.Depth:
                fmtStr = "Depth";
                break;
        }
        return `Texture ${this.width}x${this.height} ${fmtStr}`;
    }
}

export class DummyRenderBufferInfo<T> extends RenderBufferInfo<T>
{
    constructor(name: string)
    {
        super(name);

        this.cost = 0;
    }
    create(manager: RenderPipeline<T>): DummyRenderBuffer
    {
        return new DummyRenderBufferImpl();
    }
    get physicalFormatDescription(): string
    {
        return "None";
    }
    get logicalFormatDescription(): string
    {
        return "Untyped";
    }
}


export enum TextureRenderBufferFormat
{
    Depth,
    RGBA8,
    SRGBA8,
    RGBAF16,
    R8,
    R8G8
}

export interface TextureRenderBuffer extends RenderBuffer
{
    width: number;
    height: number;
    texture: WebGLTexture | null;
    renderbuffer: WebGLRenderbuffer | null;
    format: TextureRenderBufferFormat;

    invalidate(): void;
}

export interface DummyRenderBuffer extends RenderBuffer
{
}

class TextureRenderBufferImpl implements TextureRenderBuffer
{
    texture: WebGLTexture | null;
    renderbuffer: WebGLRenderbuffer | null; // actually unused:)

    constructor(
        private context: GLContext,
        public width: number,
        public height: number,
        public format: TextureRenderBufferFormat
    )
    {
        const gl = context.gl;
        this.texture = null;
        this.renderbuffer = null;

        let ext: any;

        switch (this.format) {
            case TextureRenderBufferFormat.SRGBA8:
                ext = context.ext.EXT_sRGB;
                if (!ext) {
                    throw new Error("sRGB not supported");
                }
                this.texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texImage2D(gl.TEXTURE_2D, 0, ext.SRGB_ALPHA_EXT, width, height, 0,
                    ext.SRGB_ALPHA_EXT, gl.UNSIGNED_BYTE, null);
                break;
            case TextureRenderBufferFormat.RGBA8:
                this.texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0,
                    gl.RGBA, gl.UNSIGNED_BYTE, null);
                break;
            case TextureRenderBufferFormat.RGBAF16:
                ext = context.ext.OES_texture_half_float;
                if (!ext) {
                    throw new Error("RGBAF16 buffer not supported");
                }
                this.texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0,
                    gl.RGBA, ext.HALF_FLOAT_OES, null);
                break;
            case TextureRenderBufferFormat.Depth:
                ext = context.ext.WEBGL_depth_texture;
                if (!ext) {
                    throw new Error("Depth texture not supported");
                }
                this.texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_STENCIL, width, height, 0,
                    gl.DEPTH_STENCIL, ext.UNSIGNED_INT_24_8_WEBGL, null); // FIXME: support 24-bit depth?
                break;
        }

        this.renderbuffer = gl.createRenderbuffer();
    }

    dispose(): void
    {
        const gl = this.context.gl;
        if (this.texture != null) {
            gl.deleteTexture(this.texture);
            this.texture = null;
        }
        if (this.renderbuffer != null) {
            gl.deleteRenderbuffer(this.renderbuffer);
            this.renderbuffer = null;
        }
    }

    invalidate(): void
    {

    }
}

class DummyRenderBufferImpl implements DummyRenderBuffer
{
    dispose(): void
    {
    }
}
