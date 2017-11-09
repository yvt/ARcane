
import { GLProgram, GLShader } from '../globjs/shader';
import { GLContext } from '../globjs/context';
import { GLConstants } from '../globjs/constants';

/**
 * Constructs a shader object with given factory functions of shader modules.
 *
 * @return The [[Shader]].
 */
export function buildShader(roots: ShaderModuleFactory<any>[]): Shader
{
    const builder = new ShaderBuilderImpl();
    for (const root of roots) {
        builder.requireModule(root);
    }
    return builder.finalize();
}

/**
 * Opaque class that holds a set of [[ShaderChunk]]s.
 *
 * Do not instantiate or make a derived class from this directly.
 */
export abstract class Shader
{
    _shaderBrand: {};

    /**
     * Retrieves a [[ShaderModule]] which was created from the given factory
     * function.
     *
     * @return The [[ShaderModule]] or `undefined` if none was found.
     */
    abstract getModule<TModule extends ShaderModule<TInstance, TParameter>,
        TInstance extends ShaderChunkInstance<TParameter>, TParameter>
        (factory: ShaderModuleFactory<TModule>): TModule;

    /**
     * Compiles this shader for a given WebGL context.
     *
     * @return [[ShaderInstance]] that holds the compiled shader and
     *         associated [[ShaderChunkInstance]]s.
     */
    abstract compile(gl: GLContext): ShaderInstance;
}

/**
 * Opaque class that holds a set of [[ShaderChunkInstance]]s and a
 * compiled WebGL shader ([[GLProgram]]).
 *
 * Do not instantiate or make a derived class from this directly.
 */
export abstract class ShaderInstance
{
    _shaderInstanceBrand: {};

    /**
     * Retrieves a compiled [[GLProgram]] object associated with this
     * shader instance.
     */
    get program(): GLProgram
    {
        throw new Error("must be overriden");
    }

    /**
     * Retrieves a [[ShaderChunkInstance]] associated with the given
     * [[ShaderChunk]].
     *
     * @return The [[ShaderChunkInstance]] or `undefined` if none was found.
     */
    abstract get<TInstance extends ShaderChunkInstance<TParam>, TParam>
        (chunk: ShaderChunk<TInstance, TParam>): TInstance;

    /**
     * Creates a parameter object for this shader instance
     * Overridden by a derived class.
     *
     * The returned parameter object can be passed to [[apply]] later.
     *
     * @return A shader parameter object.
     */
    abstract createParameter(): ShaderParameter;

    /**
     * Updates parameters (uniforms of the associated [[GLProgram]] and
     * texture stages) with a given parameter object, which was previously
     * created by [[createParameter]].
     *
     * @param param A parameter object previously created by [[createParameter]].
     */
    abstract apply(parameterSet: ShaderParameter): void;
}

/**
 * Opaque class that holds a set of shader parameters.
 *
 * Do not instantiate or make a derived class from this directly.
 */
export abstract class ShaderParameter
{
    _shaderParameterBrand: {};

    get instance(): ShaderInstance
    {
        throw new Error("must be overriden");
    }

    /**
     * Retrieves a parameter object associated with the given
     * [[ShaderChunkInstance]].
     *
     * @return The parameter object (whose type is specified by the type parameter
     *         of `inst`) or `undefined` if none was found.
     */
    abstract get<T>(inst: ShaderChunkInstance<T>): T;
}

export type ShaderModuleFactory<T extends ShaderModule<any, any>> = (builder: ShaderBuilder) => T

/**
 * Opaque class used during a shader construction.
 *
 * Do not instantiate or make a derived class from this directly.
 */
export abstract class ShaderBuilder
{
    _shaderBuilderBrand: {};

    /**
     * Loads (if needed) and returns a shader module.
     *
     * @param factory The factory function of the shader module to load.
     * @return The loaded shader module.
     */
    abstract requireModule<TModule extends ShaderModule<any, any>>
        (factory: ShaderModuleFactory<TModule>): TModule;
}

/**
 * Opaque class used during a shader instance construction.
 *
 * Do not instantiate or make a derived class from this directly.
 */
export interface ShaderInstanceBuilder
{
    _shaderInstanceBuilderBrand: {};

    /**
     * Retrieves the [[GLProgram]] object the shader instance being
     * constructed will be associated with.
     */
    readonly program: GLProgram;

    readonly context: GLContext;

    // TODO: more contextual info; like texture manager?

    /**
     * Retrieves [[ShadeChunkInstance]] (shader module/object instance)
     * associated with a given [[ShaderChunk]] (shader module/object) in
     * the current construction process.
     *
     * @param mod A shader module or object.
     * @return The shader chunk (module or object) instance.
     */
    get<TInstance extends ShaderChunkInstance<TParameter>, TParameter>
        (mod: ShaderChunk<TInstance, TParameter>): TInstance | null;

    /**
     * Allocates a texture stage.
     *
     * @return The texture stage index.
     */
    allocateTextureStage(): number;
}

/**
 * Opaque class used during a shader parameter construction.
 *
 * Do not instantiate or make a derived class from this directly.
 */
export interface ShaderParameterBuilder
{
    _shaderParameterBuilderBrand: {};

    /**
     * Retrieves a shader chunk (module/object) parameter associated with a
     * given [[ShaderChunkInstance]] (shader module/object instance) in
     * the current construction process.
     *
     * @param mod The shader chunk (module/object) instance.
     * @return The parameter object.
     */
    get<TParameter>(mod: ShaderChunkInstance<TParameter>): TParameter | null;
}

const circularReferenceTag: any = {};

class ShaderBuilderImpl extends ShaderBuilder
{
    private _shader = new ShaderImpl();

    requireModule<TModule extends ShaderModule<any, any>>
        (factory: ShaderModuleFactory<TModule>): TModule
    {
        const map = this._shader._moduleMap;
        let mod = <TModule> map.get(factory);
        if (!mod) {
            map.set(factory, circularReferenceTag);
            mod = factory(this);
            map.set(factory, mod);
        }
        if (mod === circularReferenceTag) {
             throw new Error("circular reference was found");
        }
        return mod;
    }
    registerChunk(m: ShaderChunk<any, any>): void
    {
        this._shader._chunks.push(m);
    }
    finalize(): Shader
    {
        return this._shader;
    }
}

class ShaderImpl extends Shader
{
    _chunks: ShaderChunk<any, any>[] = [];
    _moduleMap = new Map<ShaderModuleFactory<any>, ShaderModule<any, any>>();

    getModule<TModule extends ShaderModule<TInstance, TParameter>,
        TInstance extends ShaderChunkInstance<TParameter>, TParameter>
        (factory: ShaderModuleFactory<TModule>): TModule
    {
        const m = this._moduleMap.get(factory);
        if (!m) {
            throw new Error("The module was not found");
        }
        return <TModule> m;
    }

    compile(context: GLContext): ShaderInstance
    {
        return new ShaderInstanceBuilderImpl(this._chunks, context).finalize();
    }
}

class ShaderInstanceBuilderImpl implements ShaderInstanceBuilder
{
    _shaderInstanceBuilderBrand: {};

    private _inst = new ShaderInstanceImpl();
    private _nextTexStage = 0;

    constructor(private chunks: ShaderChunk<any, any>[], public readonly context: GLContext)
    {
        // Compile GLProgram
        const fsParts: string[] = [];
        const vsParts: string[] = [];

        for (const chunk of chunks) {
            fsParts.push(chunk.emit(), "\n\n");
            vsParts.push(chunk.emit(), "\n\n");
            fsParts.push(chunk.emitFrag(), "\n\n");
            vsParts.push(chunk.emitVert(), "\n\n");
        }

        const fs = GLShader.compile(context, fsParts.join(''), GLConstants.FRAGMENT_SHADER);
        const vs = GLShader.compile(context, vsParts.join(''), GLConstants.VERTEX_SHADER);
        this._inst._glProgram = GLProgram.link(context, [fs, vs]);

        // make sure all instances are created
        for (const chunk of chunks) {
            this.get(chunk);
        }
    }

    get program(): any
    {
        return this._inst._glProgram;
    }

    get<TInstance extends ShaderChunkInstance<TParameter>, TParameter>
        (mod: ShaderChunk<TInstance, TParameter>): TInstance | null
    {
        const map = this._inst._instMap;
        let inst = <TInstance | null> map.get(mod);
        if (!map.has(mod)) {
            map.set(mod, circularReferenceTag);
            inst = mod.createInstance(this);
            map.set(mod, inst);
            this._inst._insts.push(inst);
        }
        if (inst === circularReferenceTag) {
             throw new Error("circular reference was found");
        }
        return inst;
    }

    allocateTextureStage(): number
    {
        // TODO: texture stage count checking
        if (this._nextTexStage == 8) {
             throw new Error("shader requires too many texture stages");
        }
        return this._nextTexStage++;
    }

    finalize(): ShaderInstanceImpl
    {
        return this._inst;
    }
}

class ShaderInstanceImpl extends ShaderInstance
{
    _glProgram: GLProgram | null = null;
    _instMap = new Map<ShaderChunk<any, any>, ShaderChunkInstance<any> | null>();
    _insts: (ShaderChunkInstance<any> | null)[] = [];

    get program(): GLProgram
    {
        return this._glProgram!;
    }

    get<TInstance extends ShaderChunkInstance<TParam>, TParam>
        (chunk: ShaderChunk<TInstance, TParam>): TInstance
    {
        const inst = this._instMap.get(chunk);
        if (!inst) {
            throw new Error("The instance was not found");
        }
        return <TInstance> inst;
    }

    createParameter(): ShaderParameter
    {
        return new ShaderParameterBuilderImpl(this, this._insts).finalize();
    }

    apply(parameterSet: ShaderParameter): void
    {
        if (parameterSet instanceof ShaderParameterImpl) {
            if (parameterSet.instance !== this) {
                 throw new Error("associated with a wrong instance");
            }
            const insts = this._insts;
            const params = parameterSet._params;
            for (let i = 0; i < insts.length; ++i) {
                const inst = insts[i];
                if (inst) {
                    inst.apply(params[i]);
                }
            }
        } else {
             throw new Error("invalid type");
        }
    }
}

class ShaderParameterBuilderImpl implements ShaderParameterBuilder
{
    _shaderParameterBuilderBrand: {};

    private _param = new ShaderParameterImpl();

    constructor(inst: ShaderInstance, insts: (ShaderChunkInstance<any> | null)[])
    {
        this._param._inst = inst;

        // make sure all parameters are created
        for (const inst of insts) {
            this._param._params.push(this.get(inst));
        }
    }

    get<TParameter>(inst: ShaderChunkInstance<TParameter> | null): TParameter | null
    {
        if (!inst) {
            return null;
        }
        const map = this._param._paramMap;
        let param = <TParameter | null> map.get(inst);
        if (!map.has(inst)) {
            map.set(inst, circularReferenceTag);
            param = inst.createParameter(this);
            map.set(inst, param);
        }
        if (param === circularReferenceTag) {
            throw new Error("circular reference was found");
        }
        return param;
    }

    finalize(): ShaderParameter
    {
        return this._param;
    }
}

class ShaderParameterImpl extends ShaderParameter
{
    _paramMap = new Map<ShaderChunkInstance<any>, any>();
    _params: ShaderParameter[] = []; // each element corresponds to one in ShaderInstanceImpl._insts
    _inst: ShaderInstance | null = null;

    get instance(): ShaderInstance
    {
        return this._inst!;
    }

    get<T>(inst: ShaderChunkInstance<T>): T
    {
        return <T> this._paramMap.get(inst);
    }
}

/**
 * The abstract base class for shader modules and objects.
 *
 * Application developers should not create a class derived directly from
 * [[ShaderChunk]]. [[ShaderModule]] and [[ShaderObject]] must be used as a
 * base class instead.
 */
export abstract class ShaderChunk<TInstance extends ShaderChunkInstance<TParameter>, TParameter>
{
    private _builder: ShaderBuilderImpl;

    constructor(builder: ShaderBuilder)
    {
        if (builder instanceof ShaderBuilderImpl) {
            this._builder = builder;
        } else {
             throw new Error("invalid type");
        }
    }

    /**
     * Retrieves the associated [[ShaderBuilder]].
     */
    protected get builder(): ShaderBuilder
    {
        return this._builder;
    }

    /**
     * Creates a shader chunk instance (`TInstance`: [[ShaderChunkInstance]]).
     * Can be overridden by a derived class.
     *
     * @return The shader chunk instance or `null`.
     */
    createInstance(builder: ShaderInstanceBuilder): TInstance | null
    { return null; }

    /**
     * Generates a GLSL (fragment/vertex shader) code for this shader chunk.
     * Can be overridden by a derived class.
     */
    emit(): string { return ""; }

    /**
     * Generates a GLSL (fragment shader only) code for this shader chunk.
     * Can be overridden by a derived class.
     */
    emitFrag(): string { return ""; }

    /**
     * Generates a GLSL (vertex shader only) code for this shader chunk.
     * Can be overridden by a derived class.
     */
    emitVert(): string { return ""; }
}

/**
 * The abstract base class for shader modules.
 */
export abstract class ShaderModule<TInstance extends ShaderModuleInstance<TParameter>, TParameter>
    extends ShaderChunk<TInstance, TParameter>
{
    /**
     * Registers this shader module to the system. Must be called in the
     * constructor. All dependent modules and objects must be created
     * (by means of [[ShaderBuilder.requireModule]] for modules and `new`
     * for objects) before calling this method.
     */
    protected register(): void
    {
        (<ShaderBuilderImpl> this.builder).registerChunk(this);
    }
}

/**
 * The abstract base class for shader objects.
 */
export abstract class ShaderObject<TInstance extends ShaderObjectInstance<TParameter>, TParameter>
    extends ShaderChunk<TInstance, TParameter>
{
    /**
     * Registers this shader object to the system. Must be called in the
     * constructor. All dependent modules and objects must be created
     * (by means of [[ShaderBuilder.requireModule]] for modules and `new`
     * for objects) before calling this method.
     */
    protected register(): void
    {
        (<ShaderBuilderImpl> this.builder).registerChunk(this);
    }
}

/**
 * The abstract base class for shader module/object instances.
 *
 * ShaderChunkInstance developers should not create a class derived directly
 * from [[ShaderChunk]]. [[ShaderObjectInstance]] and
 * [[ShaderModuleInstance]] must be used as a base class instead.
 */
export abstract class ShaderChunkInstance<TParameter>
{
    private _builder: ShaderInstanceBuilderImpl;

    constructor(builder: ShaderInstanceBuilder)
    {
        if (builder instanceof ShaderInstanceBuilderImpl) {
            this._builder = builder;
        } else {
             throw new Error("invalid type");
        }
    }

    /**
     * Creates a parameter object for this chunk (module/object).
     * Overridden by a derived class.
     *
     * The returned parameter object can be passed to [[apply]] later.
     *
     * @return A parameter object or `null`.
     */
    createParameter(builder: ShaderParameterBuilder): TParameter | null
    { return null; }

    /**
     * Updates parameters (uniforms of the associated [[GLProgram]] and
     * texture stages) with a given parameter object, which was previously
     * created by [[createParameter]].
     *
     * @param param A parameter object previously created by [[createParameter]].
     */
    apply(param: TParameter) { }
}

/**
 * The abstract base class for shader object instances.
 */
export abstract class ShaderObjectInstance<TParameter> extends ShaderChunkInstance<TParameter>
{
}

/**
 * The abstract base class for shader module instances.
 */
export abstract class ShaderModuleInstance<TParameter> extends ShaderChunkInstance<TParameter>
{
}


