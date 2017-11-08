import { Logger } from '../../utils/logger';
import { GLContext } from './context';
import { GLFramebuffer } from './framebuffer';

export class GLExtensions
{
    readonly EXT_sRGB: any | null;
    readonly OES_texture_float: OES_texture_float | null;
    readonly OES_texture_float_linear: OES_texture_float_linear | null;
    readonly OES_texture_half_float: OES_texture_half_float | null;
    readonly OES_texture_half_float_linear: OES_texture_half_float_linear | null;
    readonly OES_standard_derivatives: OES_standard_derivatives | null;
    readonly WEBGL_depth_texture: WEBGL_depth_texture | null;
    readonly EXT_shader_texture_lod: {} | null;
    readonly EXT_disjoint_timer_query: EXTDisjointTimerQuery | null;
    readonly WEBGL_draw_buffers: WebGLDrawBuffers | null;
    readonly hasImplicitHalfFloatColorBufferSupport: boolean;

    constructor(public readonly context: GLContext, log: Logger)
    {
        log.log(`WebGL extensions:`);
        for (const name of [
            'EXT_sRGB',
            'OES_texture_float',
            'OES_texture_float_linear',
            'OES_texture_half_float',
            'OES_texture_half_float_linear',
            'OES_standard_derivatives',
            'WEBGL_depth_texture',
            'EXT_shader_texture_lod',
            'EXT_disjoint_timer_query',
            'WEBGL_draw_buffers',
        ] as (keyof GLExtensions)[]) {
            this[name] = context.gl.getExtension(name);
            log.log(`  ${name}: ${this[name] ? 'YES' : 'NO'}`);
        }

        this.hasImplicitHalfFloatColorBufferSupport =
            detectHalfFloatColorBufferSupport(context, log);
    }
}

function detectHalfFloatColorBufferSupport(context: GLContext, log: Logger): boolean
{
    const {gl} = context;
    const halfFloat = gl.getExtension('OES_texture_half_float');

    if (halfFloat == null) {
        log.warn("detectHalfFloatColorBufferSupport: OES_texture_half_float is not available.");
        return false;
    }

    const tex = gl.createTexture();
    if (!tex) {
        throw new Error();
    }

    try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        while (gl.getError()); // clear error
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 7, 7, 0,
            gl.RGBA, halfFloat.HALF_FLOAT_OES, null);
        if (gl.getError()) {
            log.warn("detectHalfFloatColorBufferSupport: could not create half float texture.");
            return false;
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const fb = GLFramebuffer.createFramebuffer(context, {
            colors: [tex]
        });
        fb.dispose();
    } catch (e) {
        log.warn(`detectHalfFloatColorBufferSupport: error: ${e}`);
        return false;
    } finally {
        gl.deleteTexture(tex);
    }

    return true;
}
