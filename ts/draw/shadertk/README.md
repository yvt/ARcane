# Excerpt from Hyper3D Gen3's design notes

## Shader Preprocessing

- [[ShaderBundle]]: Extracts shader codes from a shader bundle created with `tools/gulp-hyper-shader-bundler.coffee`. A shader bundle is supplied via [[ShaderBundleData]].
- [[allocateIdentifier]], [[allocateIdentifiers]]: Generates unique identifiers.

## Shader Toolkit

### Basic Concepts

- [[Shader]]: Shader code to be compiled
- [[ShaderInstance]]: Shader compiled from [[Shader]]
- [[ShaderParameter]]: A set of parameter for [[ShaderInstance]]

|  Physical Representation  |    Shader Toolkit   |  Material System  |
| ------------------------- | ------------------- | ----------------- |
| GLSL source code          | [[Shader]]          |                   |
| [[GLProgram]]             | [[ShaderInstance]]  | material          |
| uniforms of [[GLProgram]] | [[ShaderParameter]] | material instance |

### Component Construction Kit

- [[ShaderChunk]]
    - [[ShaderModule]]: represents a chunk of shader code linked together.
    - [[ShaderObject]]: represents a statically allocated instance of object.
      If GLSL were C++, every instance of [[ShaderObject]] corresponds to a object
      with the static storage duration, and the class deriving from [[ShaderObject]]
      corresponds to the object's type.
    - Generates shader code.
- [[ShaderChunkInstance]]: created for every [[ShaderChunk]] and [[GLProgram]]
    - Allocates texture stages during a construction phase.
    - Retrives `WebGLUniformLocation`.
    - Updates shader uniforms with a given `ShaderChunkParameter`
- `ShaderChunkParameter`: parameter set (e.g., texture, surface color)
