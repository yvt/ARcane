import { IDisposable } from "../../utils/interfaces";
import { GLContext } from "./context";
import { GLConstants } from "./constants";

/**
 * Wraps a WebGL program object.
 */
export class GLProgram implements IDisposable
{
    private _context: GLContext;
    private _handle: WebGLProgram;

    /**
     * Constructs a new instance of [[GLProgram]] using an existing
     * WebGL program object.
     *
     * The ownership of the given object is transfered to this instance
     * (thus it will be deleted as soon as this [[GLProgram]] is destroyed).
     */
    constructor(context: GLContext, handle: WebGLProgram)
    {
        this._context = context;
        this._handle = handle;
    }

    dispose(): void
    {
        this._context.gl.deleteProgram(this._handle);
        this._handle = null!;
    }

    /**
     * Retrieves the native WebGL program object.
     */
    get handle(): WebGLProgram { return this._handle; }

    /**
     * Create and links a WebGL program object and returns the linked [[GLProgram]].
     *
     * @param context A GL context.
     * @param shaders WebGL shaders to link.
     */
    static link(context: GLContext, shaders: (GLShader | WebGLShader)[]): GLProgram
    {
        const {gl} = context;
        const handle = gl.createProgram()!;

        for (const shader of shaders) {
            let glsh: WebGLShader;
            if (shader instanceof GLShader) {
                glsh = shader.handle;
            } else {
                glsh = shader;
            }
            gl.attachShader(handle, glsh);
        }

        gl.linkProgram(handle);

        if (!gl.getProgramParameter(handle, GLConstants.LINK_STATUS)) {
            const infoLog = gl.getProgramInfoLog(handle);
            gl.deleteProgram(handle);
            throw new Error(`Program linking failed.:\n\n${infoLog}`);
        }

        return new GLProgram(context, handle);
    }
}

export class GLShader implements IDisposable
{
    private _context: GLContext;
    private _handle: WebGLShader;

    /**
     * Constructs a new instance of [[GLShader]] using an existing
     * WebGL shader object.
     *
     * The ownership of the given object is transfered to this instance
     * (thus it will be deleted as soon as this [[GLShader]] is destroyed).
     */
    constructor(context: GLContext, handle: WebGLShader)
    {
        this._context = context;
        this._handle = handle;
    }

    dispose(): void
    {
        this._context.gl.deleteShader(this._handle);
        this._handle = null!;
    }

    /**
     * Retrieves the native WebGL shader object.
     */
    get handle(): WebGLShader { return this._handle; }

    /**
     * Compiles a GLSL shader code and returns the compiled [[GLShader]].
     *
     * @param context A GL context.
     * @param source A GLSL source code.
     * @param type [[GLConstants.FRAGMENT_SHADER]] or [[GLConstants.VERTEX_SHADER]].
     */
    static compile(context: GLContext, source: string, type: number): GLShader
    {
        const {gl} = context;
        const handle = gl.createShader(type)!;

        gl.shaderSource(handle, source);

        gl.compileShader(handle);

        if (!gl.getShaderParameter(handle, GLConstants.COMPILE_STATUS)) {
            const infoLog = gl.getShaderInfoLog(handle);
            gl.deleteShader(handle);
            throw new Error(`Shader compilation failed.:\n\n${infoLog}`);
        }

        return new GLShader(context, handle);
    }
}

