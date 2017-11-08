import { GLFramebuffer } from "./framebuffer";
import { GLExtensions } from "./extensions";
import { LogManager } from '../../utils/logger';
import { TOPICS } from '../log';
import { GLConstants } from './constants';
import { VertexAttribState } from './vertexattribenabler';

/**
 * Specifies draw buffers to be drawn into.
 *
 * These flags actually can be grouped into three categories:
 *
 *  - Depth ([[Depth]]) and stencil ([[Stencil]]) write enable. Context-global.
 *  - Color mask that specifies which color channels are updated.
 *    [[ColorRed]], [[ColorGreen]], [[ColorBlue]], [[ColorAlpha]], and
 *    [[ColorRGBA]] fall into this category. Context-global.
 *  - Color draw buffer specification ([[Color0]], [[Color1]], ...).
 *    Flags in this category are bound to the current framebuffer.
 *
 * The last two categories are independent; you must pick at least one from
 * each category to enable the color output. Here are some examples:
 *
 * - `ColorRed | BackColor` enables the color output to the red channel of
 *   the back color buffer.
 * - `ColorRGBA | Color1 | Color2` enables the color ooutput to all channels
 *   of the 1st and 2nd color attachment of the current framebuffer.
 *
 * There's no way to specify color channels of each color attachment
 * individually due to lack of support by WebGL 2.0.
 */
export const enum GLDrawBufferFlags
{
    /** The depth buffer. */
    Depth = 1 << 0,

    /** The stencil buffer. */
    Stencil = 1 << 1,

    /** The red channel of color buffer(s). */
    ColorRed = 1 << 2,
    /** The green channel of color buffer(s). */
    ColorGreen = 1 << 3,
    /** The blue channel of color buffer(s). */
    ColorBlue = 1 << 4,
    /** The alpha channel of color buffer(s). */
    ColorAlpha = 1 << 5,
    /** All color channels of color buffer(s). */
    ColorRGBA = ColorRed | ColorGreen | ColorBlue | ColorAlpha,

    /** The back color buffer. */
    BackColor = 1 << 6,

    /** The 0th color attachment of the current framebuffer. */
    Color0 = 1 << 7,
    /** The 1st color attachment of the current framebuffer. */
    Color1 = 1 << 8,
    /** The 2nd color attachment of the current framebuffer. */
    Color2 = 1 << 9,
    /** The 3rd color attachment of the current framebuffer. */
    Color3 = 1 << 10,
    /** The 4th color attachment of the current framebuffer. */
    Color4 = 1 << 11,
    /** The 5th color attachment of the current framebuffer. */
    Color5 = 1 << 12,
    /** The 6th color attachment of the current framebuffer. */
    Color6 = 1 << 13,
    /** The 7th color attachment of the current framebuffer. */
    Color7 = 1 << 14,

    /**
     * Bit-wise OR of all flags which are bound to the context.
     * @internal
     */
    GlobalMask = Depth | Stencil | ColorRGBA,
    /**
     * Bit-wise OR of all flags which are bound to the current framebuffer.
     * @internal
     */
    PerFramebufferMask = BackColor | Color0 | Color1 | Color2 | Color3 |
        Color4 | Color5 | Color6 | Color7
}

/**
 * Wrapper class of `WebGLRenderingContext` that manages the context state.
 *
 * Following states are managed by [[GLContext]]:
 *  - Depth write enable.
 *  - Stencil write enable. ([[GLContext]] only disables stencil write but
 *    doesn't enable; it's up to you to enable the stencil write and set
 *    the write mask appropriately. You still have to set [[drawBuffers]]
 *    appropriately so it can be disabled by [[GLContext]] later.)
 *  - Color mask.
 *  - Current framebuffer.
 *  - Draw buffers of the current framebuffer (including the default one).
 *
 */
export class GLContext
{
    /**
     * Current draw buffer set, masked with [[GLDrawBufferFlags.GlobalMask]].
     * The [[GLDrawBufferFlags.PerFramebufferMask]] part is stored in [[GLFramebuffer.drawBufs]].
     */
    private _drawBuffers =
        GLDrawBufferFlags.ColorRGBA |
        GLDrawBufferFlags.Depth |
        GLDrawBufferFlags.Stencil;
    private _fb: GLFramebuffer;
    private _defFB: GLFramebuffer;

    readonly ext: GLExtensions;
    readonly vertexAttribs: VertexAttribState;

    constructor(public readonly gl: WebGLRenderingContext, logManager: LogManager)
    {
        this.ext = new GLExtensions(this, logManager.getLogger(TOPICS.CAPABILITIES));

        // default framebuffer
        this._fb = this._defFB = new GLFramebuffer(this, null);

        this.vertexAttribs = new VertexAttribState(gl);
    }

    /**
     * Sets or retrieves the current framebuffer. `null` indicates the default
     * framebuffer.
     */
    get framebuffer(): GLFramebuffer | null
    {
        return this._fb;
    }
    set framebuffer(fb: GLFramebuffer | null)
    {
        if (fb == null) {
            fb = this._defFB;
        }
        if (fb == this._fb) {
            return;
        }
        this._fb = fb;
        this.gl.bindFramebuffer(GLConstants.FRAMEBUFFER, fb.handle);
    }

    /**
     * Resets the GL context to a known state so that rendering via Hyper3D
     * can be started.
     */
    begin(): void
    {
        const {
            drawBuffers,
            gl
        } = this;
        this.framebuffer = null;
        gl.depthMask(!!(drawBuffers & GLDrawBufferFlags.Depth));
        // We don't manage stencil mask; just write somewrite or no write at all
        if (!(drawBuffers & GLDrawBufferFlags.Stencil)) {
            gl.stencilMask(0);
        }
        gl.colorMask(!!(drawBuffers & GLDrawBufferFlags.ColorRed),
            !!(drawBuffers & GLDrawBufferFlags.ColorGreen),
            !!(drawBuffers & GLDrawBufferFlags.ColorBlue),
            !!(drawBuffers & GLDrawBufferFlags.ColorAlpha));
        gl.bindFramebuffer(GLConstants.FRAMEBUFFER, this._fb.handle);
        setDrawBuffers(this, drawBuffers);
    }

    /**
     * Sets or retrieves flags indicating which draw buffers are written into.
     */
    get drawBuffers(): GLDrawBufferFlags
    {
        return this._drawBuffers | this._fb.drawBufs;
    }
    set drawBuffers(newFlags: GLDrawBufferFlags)
    {
        const {gl} = this;
        const diff = newFlags ^ this.drawBuffers;
        if (diff & GLDrawBufferFlags.Depth) {
            gl.depthMask(!!(newFlags & GLDrawBufferFlags.Depth));
        }
        // We don't manage stencil mask; just write somewrite or no write at all
        if ((diff & GLDrawBufferFlags.Stencil) && !(newFlags & GLDrawBufferFlags.Stencil)) {
            gl.stencilMask(0);
        }
        if (diff & GLDrawBufferFlags.ColorRGBA) {
            gl.colorMask(!!(newFlags & GLDrawBufferFlags.ColorRed),
                !!(newFlags & GLDrawBufferFlags.ColorGreen),
                !!(newFlags & GLDrawBufferFlags.ColorBlue),
                !!(newFlags & GLDrawBufferFlags.ColorAlpha));
        }
        if (diff >> 6) {
            setDrawBuffers(this, newFlags);
        }
        this._drawBuffers = newFlags & GLDrawBufferFlags.GlobalMask;
        this._fb.drawBufs = newFlags & GLDrawBufferFlags.PerFramebufferMask;
    }
}

const drawBuffersArray: number[][] = new Array(16);
function setDrawBuffers(context: GLContext, flags: GLDrawBufferFlags): void
{
    let arraySize = 0;
    for (let i = 0; i < 8; ++i) {
        if (flags & (GLDrawBufferFlags.Color0 << i)) {
            arraySize = i;
        }
    }
    if (flags & (GLDrawBufferFlags.BackColor)) {
        if (arraySize != 0) {
            throw new Error("Invalid argument");
        }
        arraySize = 1;
    }
    let bufs = drawBuffersArray[arraySize];
    if (!bufs) {
        bufs = drawBuffersArray[arraySize] = new Array(arraySize);
    }
    for (let i = 0; i < arraySize; ++i) {
        bufs[i] = (flags & (GLDrawBufferFlags.Color0 << i)) ?
            (GLConstants.COLOR_ATTACHMENT0 + i) : GLConstants.NONE;
    }
    if (flags & (GLDrawBufferFlags.BackColor)) {
        bufs[0] = GLConstants.BACK;
    }
    if (context.ext.WEBGL_draw_buffers) {
        context.ext.WEBGL_draw_buffers.drawBuffersWEBGL(bufs);
    }
}