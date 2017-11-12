import {
    ShaderObject, ShaderBuilder, ShaderObjectInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder
} from '../shadertk/shadertoolkit';
import { GLConstants } from '../globjs/constants';

import { PieShaderModule, PieShaderChunk } from '../shadertk/pieglsl';
const textureModule: PieShaderModule = require('./texture.glsl');

export type ShaderPrecision = 'lowp' | 'mediump' | 'highp';

export interface TextureShaderParameter
{
    texture: WebGLTexture | null;
}

export class Texture2DShaderObject extends ShaderObject<Texture2DShaderInstance, TextureShaderParameter>
{
    private readonly textureChunk = new PieShaderChunk<{
        PRECISION: string;
        u_Texture: string;
    }>(textureModule);

    readonly u_Texture = this.textureChunk.bindings.u_Texture;

    constructor(builder: ShaderBuilder, private readonly precision: ShaderPrecision)
    {
        super(builder);

        // kinda hack but it works anyway
        this.textureChunk.bind({
            PRECISION: precision,
        });

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder): Texture2DShaderInstance
    {
        return new Texture2DShaderInstance(builder, this);
    }

    emit() { return this.textureChunk.emit(); }
}

export class Texture2DShaderInstance extends ShaderObjectInstance<TextureShaderParameter>
{
    private readonly u_Texture: WebGLUniformLocation;

    readonly textureStage: number;

    constructor(builder: ShaderInstanceBuilder, parent: Texture2DShaderObject)
    {
        super(builder);

        const {gl} = builder.context;

        this.textureStage = builder.allocateTextureStage();
        this.u_Texture = gl.getUniformLocation(builder.program.handle, parent.u_Texture)!;
        gl.uniform1i(this.u_Texture, this.textureStage);
    }

    createParameter(builder: ShaderParameterBuilder): TextureShaderParameter
    {
        return {
            texture: null,
        };
    }

    apply(param: TextureShaderParameter)
    {
        if (!param.texture) {
            throw new Error("texture cannot be null.");
        }

        const {gl} = this.context;
        gl.activeTexture(GLConstants.TEXTURE0 + this.textureStage);
        gl.bindTexture(GLConstants.TEXTURE_2D, param.texture);
    }
}