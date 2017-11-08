
import {
    buildShader,
    ShaderModule,
    ShaderModuleInstance,
    ShaderModuleFactory,
    ShaderChunk,
    ShaderChunkInstance,
    Shader,
    ShaderInstance,
    ShaderParameter
} from "./shadertoolkit";

/**
 * Constructs a typed shader object with a given factory function of shader
 * module.
 *
 * This function behaves similarly to [[buildShader]], but returns
 * [[TypedShader]] which are a type-safe version of [[Shader]], and only
 * accepts one root shader module.
 *
 * @return The [[TypedShader]].
 */
export function buildShaderTyped
    <TModule extends ShaderModule<TInstance, TParameter>,
         TInstance extends ShaderModuleInstance<TParameter>, TParameter>
    (root: ShaderModuleFactory<TModule>): TypedShader<TModule, TInstance, TParameter>
{
    const sh = buildShader([root]);
    return new TypedShader<TModule, TInstance, TParameter>(
        sh, sh.getModule(root));
}

/**
 * A wrapper class of [[Shader]] that ensures type-safety when used in a
 * TypeScript based project.
 *
 * Do not instantiate or make a derived class from this directly.
 *
 * @param TModule The type of the root shader module.
 * @param TInstance The type of the root shader module instance.
 * @param TParameter The type of the root shader module parameter.
 */
export class TypedShader
    <TModule extends ShaderModule<TInstance, TParameter>,
         TInstance extends ShaderModuleInstance<TParameter>, TParameter>
{
    /**
     * Internal method. Do not call.
     *
     * @internal
     */
    constructor(private shader: Shader, private _root: TModule)
    { }

    /**
     * Retrieves the root shader module.
     */
    get root(): TModule { return this._root; }

    /**
     * Compiles this shader for a given WebGL context.
     *
     * @return [[TypedShaderInstance]] that holds the compiled shader and
     *         associated [[ShaderChunkInstance]]s.
     */
    compile(gl: WebGLRenderingContext): TypedShaderInstance<TInstance, TParameter>
    {
        const inst = this.shader.compile(gl);
        return new TypedShaderInstance<TInstance, TParameter>(inst,
            inst.get(this._root));
    }
}

/**
 * A wrapper class of [[ShaderInstance]] that ensures type-safety when
 * used in a TypeScript based project.
 *
 * @param TInstance The type of the root shader module instance.
 * @param TParameter The type of the root shader module parameter.
 */
export class TypedShaderInstance
    <TInstance extends ShaderModuleInstance<TParameter>, TParameter>
{
    /**
     * Internal method. Do not call.
     *
     * @internal
     */
    constructor(private inst: ShaderInstance,
        private _root: TInstance)
    { }

    /**
     * Retrieves the root shader module instance.
     */
    get root(): TInstance { return this._root; }

    /**
     * Retrieves a [[ShaderChunkInstance]] associated with the given
     * [[ShaderChunk]].
     *
     * @return The [[ShaderChunkInstance]] or `undefined` if none was found.
     */
    get<TInstance extends ShaderChunkInstance<TParam>, TParam>
                (chunk: ShaderChunk<TInstance, TParam>): TInstance
    {
        return this.inst.get(chunk);
    }

    /**
     * Creates a parameter object for this shader instance
     * Overridden by a derived class.
     *
     * The returned parameter object can be passed to [[apply]] later.
     *
     * @return A shader parameter object.
     */
    createParameter(): TypedShaderParameter<TParameter>
    {
        const p = this.inst.createParameter();
        return new TypedShaderParameter<TParameter>(
            p, p.get(this._root));
    }

    /**
     * Updates parameters (uniforms of the associated [[GLProgram]] and
     * texture stages) with a given parameter object, which was previously
     * created by [[createParameter]].
     *
     * @param param A parameter object previously created by [[createParameter]].
     */
    apply(parameterSet: TypedShaderParameter<TParameter>): void
    {
        this.inst.apply(parameterSet.untypedParameter);
    }
}

/**
 * A wrapper class of [[ShaderParameter]] that ensures type-safety when
 * used in a TypeScript based project.
 *
 * @param TParameter The type of the root shader module parameter.
 */
export class TypedShaderParameter<TParameter>
{
    /**
     * Internal method. Do not call.
     *
     * @internal
     */
    constructor(private _param: ShaderParameter,
        private _root: TParameter)
    { }

    /**
     * Retrieves a parameter object associated with the given
     * [[ShaderChunkInstance]].
     *
     * @return The parameter object (whose type is specified by the type parameter
     *         of `inst`) or `undefined` if none was found.
     */
    get<T>(inst: ShaderChunkInstance<T>): T
    {
        return this._param.get(inst);
    }

    /**
     * Exposes access to the underlying [[ShaderParameter]].
     */
    get untypedParameter(): ShaderParameter
    {
        return this._param;
    }

    /**
     * Retrieves a parameter object associated with the root shader module.
     */
    get root(): TParameter
    {
        return this._root;
    }
}

