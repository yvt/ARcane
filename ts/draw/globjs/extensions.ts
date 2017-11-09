import { Logger } from '../../utils/logger';
import { GLContext } from './context';
import { GLConstants} from './constants';
import { GLFramebuffer } from './framebuffer';

export class GLExtensions
{
    readonly EXT_sRGB: any | null;
    readonly EXT_frag_depth: EXT_frag_depth | null;
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
            'EXT_frag_depth',
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
        gl.bindTexture(GLConstants.TEXTURE_2D, tex);
        while (gl.getError()); // clear error
        gl.texImage2D(GLConstants.TEXTURE_2D, 0, GLConstants.RGBA, 7, 7, 0,
            GLConstants.RGBA, halfFloat.HALF_FLOAT_OES, null);
        if (gl.getError()) {
            log.warn("detectHalfFloatColorBufferSupport: could not create half float texture.");
            return false;
        }
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MAG_FILTER, GLConstants.NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_MIN_FILTER, GLConstants.NEAREST);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_S, GLConstants.CLAMP_TO_EDGE);
        gl.texParameteri(GLConstants.TEXTURE_2D, GLConstants.TEXTURE_WRAP_T, GLConstants.CLAMP_TO_EDGE);

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
