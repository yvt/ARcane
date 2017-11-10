import { vec2 } from 'gl-matrix';

import { RenderOperation, RenderOperator } from '../scheduler';
import { GLContext, GLStateFlags, GLDrawBufferFlags } from '../globjs/context';
import { QuadRenderer } from '../quad';

import {
    ShaderModule, ShaderBuilder, ShaderModuleInstance,
    ShaderInstanceBuilder, ShaderParameterBuilder
} from '../shadertk/shadertoolkit';
import {
    TypedShaderInstance, buildShaderTyped, TypedShaderParameter
} from '../shadertk/shadertoolkittyped';
import { allocateIdentifier } from '../shadertk/uniqueid';

import {
    Texture2DShaderObject, Texture2DShaderInstance, TextureShaderParameter
} from '../shaderutils/texture';

export interface BlitterContext
{
    readonly context: GLContext;
    readonly quad: QuadRenderer;
}

export class Blitter
{
    private readonly shaderInstance: TypedShaderInstance<BlitShaderInstance, BlitShaderParam>;
    private readonly shaderParam: TypedShaderParameter<BlitShaderParam>;

    constructor(public readonly context: BlitterContext, private readonly precision: 'lowp' | 'mediump' | 'highp')
    {
        this.shaderInstance = buildShaderTyped
            <BlitShaderModule, BlitShaderInstance, BlitShaderParam>
            (builder => new BlitShaderModule(builder, precision))
            .compile(context.context);
        this.shaderParam = this.shaderInstance.createParameter();
    }

    blit(): void
    {
        const {context, quad} = this.context;
        const {gl} = context;
        const params = this.shaderParam.root;

        const {shaderInstance} = this;
        gl.useProgram(shaderInstance.program.handle);
        shaderInstance.apply(this.shaderParam);

        quad.render(shaderInstance.root.a_Position);
    }
}

interface BlitShaderParam
{
    /** The minimum output coordinate specified in the clip space. */
    outputMin: vec2;

    /** The maximum output coordinate specified in the clip space. */
    outputMax: vec2;

    /** The minium input UV coordinate. */
    inputMin: vec2;

    /** The maximum input UV coordinate. */
    inputMax: vec2;

    inputLod: number;

    /** The input texture. */
    texture: TextureShaderParameter;
}

class BlitShaderModule extends ShaderModule<BlitShaderInstance, BlitShaderParam>
{
    readonly a_Position = allocateIdentifier();
    readonly u_Input = allocateIdentifier();
    readonly u_Output = allocateIdentifier();
    readonly u_Lod = allocateIdentifier();

    readonly texture: Texture2DShaderObject;

    constructor(builder: ShaderBuilder, private readonly precision: 'lowp' | 'mediump' | 'highp')
    {
        super(builder);

        this.texture = new Texture2DShaderObject(builder, precision);

        this.register();
    }

    createInstance(builder: ShaderInstanceBuilder)
    {
        return new BlitShaderInstance(builder, this);
    }

    emitFrag()
    {
        // FIXME: how do I specify the output color precision
        return `
            varying highp vec2 v_TexCoord;
            uniform highp float ${this.u_Lod};

            void main() {
                gl_FragColor = texture2DLodEXT(${this.texture.u_Texture}, v_TexCoord, ${this.u_Lod});
            }
        `;
    }

    emitVert()
    {
        return `
            attribute highp vec2 ${this.a_Position};

            uniform highp vec4 ${this.u_Input};
            uniform highp vec4 ${this.u_Output};

            varying highp vec2 v_TexCoord;

            void main() {
                highp vec2 pos = ${this.a_Position} * 0.5 + 0.5;
                gl_Position = vec4(mix(${this.u_Output}.xy, ${this.u_Output}.zw, pos), 0.0, 1.0);
                v_TexCoord = mix(${this.u_Input}.xy, ${this.u_Input}.zw, pos);
            }
        `;
    }
}

class BlitShaderInstance extends ShaderModuleInstance<BlitShaderParam>
{
    readonly a_Position: number;
    readonly u_Input: WebGLUniformLocation;
    readonly u_Output: WebGLUniformLocation;
    readonly u_Lod: WebGLUniformLocation;

    private readonly texture: Texture2DShaderInstance;

    constructor(builder: ShaderInstanceBuilder, parent: BlitShaderModule)
    {
        super(builder);

        const {gl} = builder.context;
        this.a_Position = gl.getAttribLocation(builder.program.handle, parent.a_Position);
        this.u_Input = gl.getUniformLocation(builder.program.handle, parent.u_Input)!;
        this.u_Output = gl.getUniformLocation(builder.program.handle, parent.u_Output)!;
        this.u_Lod = gl.getUniformLocation(builder.program.handle, parent.u_Lod)!;

        this.texture = builder.getUnwrap(parent.texture);
    }

    createParameter(builder: ShaderParameterBuilder): BlitShaderParam
    {
        return {
            inputMin: vec2.create().fill(0),
            inputMax: vec2.create().fill(1),
            outputMin: vec2.create().fill(-1),
            outputMax: vec2.create().fill(1),
            inputLod: 0,
            texture: builder.getUnwrap(this.texture),
        };
    }

    apply(param: BlitShaderParam)
    {
        const {gl} = this.context;

        gl.uniform4f(
            this.u_Input,
            param.inputMin[0],
            param.inputMin[1],
            param.inputMax[0],
            param.inputMax[1]
        );
        gl.uniform4f(
            this.u_Output,
            param.outputMin[0],
            param.outputMin[1],
            param.outputMax[0],
            param.outputMax[1]
        );
        gl.uniform1f(this.u_Lod, param.inputLod);
    }
}
