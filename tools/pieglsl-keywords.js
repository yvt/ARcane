// Do NOT remove any words from this list or you'll break the backward
// compatibility!
const glslCompressedKeywords = [
    "const", "bool", "float", "int", "uint", "break", "continue", "do",
    "else", "for", "if", "discard", "return", "switch", "case", "default",
    "bvec2", "bvec3", "bvec4", "ivec2", "ivec3", "ivec4", "uvec2", "uvec3",
    "uvec4", "vec2", "vec3", "vec4", "mat2", "mat3", "mat4", "centroid",
    "in", "inout", "out", "uniform",
    "flat", "smooth", "layout", "mat2x2", "mat2x3", "mat2x4",
    "mat3x2", "mat3x3", "mat3x4", "mat4x2", "mat4x3", "mat4x4",
    "sampler2D", "sampler3D", "samplerCube", "sampler2DShadow",
    "samplerCubeShadow", "sampler2DArray", "sampler2DArrayShadow",
    "isampler2D", "isampler3D", "isamplerCube", "isampler2DArray",
    "usampler2D", "usampler3D", "usamplerCube", "usampler2DArray",
    "struct", "void", "while", "#if", "#else", "#elif", "#endif", "defined",
    "#define", "#pragma",
    "lowp", "mediump", "highp", "true", "false",

    // WebGL 1.0 keywords, function, and vars
    "gl_FragColor", "attribute", "varying",

    "texture2D", "texture2DProj", "texture2DLod", "texture2DProjLod",
    "texture2DLodEXT", "textureCube", "textureCubeLod", "textureCubeLodEXT",

    // built-in functions
    "radians", "degrees", "sin", "cos", "tan", "asin", "acos", "atan",
    "sinh", "cosh", "tanh", "asinh", "acosh", "atanh", "pow", "exp", "log",
    "exp2", "log2", "sqrt", "inversesqrt", "abs", "sign", "floor", "trunc",
    "round", "roundEven", "fract", "mod", "min", "max", "clamp", "mix",
    "step", "smoothstep", "isnan", "isinf", "floatBitsToInt", "floatBitsToUint",
    "intBitsToFloat", "uintBitsToFloat", "packSnorm2x16", "unpackSnorm2x16",
    "packUnorm2x16", "unpackUnorm2x16", "packHalf2x16", "unpackHalf2x16",
    "length", "distance", "dot", "cross", "normalize", "faceforward",
    "reflect", "refract", "matrixCompMult", "outerProduct", "transpose",
    "determinant", "inverse", "lessThan", "lessThanEqual", "greaterThan",
    "greaterThanEqual", "equal", "notEqual", "any", "all", "not",

    // texture lookup
    "textureSize", "texture", "textureProj", "textureLod", "textureOffset",
    "texelFetch", "texelFetchOffset", "textureProjOffset", "textureLodOffset",
    "textureProjLod", "textureProjLodOffset", "textureGrad", "textureGradOffset",
    "textureProjGrad", "textureProjGradOffset",

    // fragment processing funcs
    "dFdx", "dFdy", "fwidth",

    // built-in vars
    "gl_VertexID", "gl_InstanceID", "gl_Position", "gl_PointSize",
    "gl_FragCoord", "gl_FrontFacing", "gl_FragDepth", "gl_PointCoord",
    "gl_DepthRange",

    // entry point
    "main",
];

module.exports = {
    glslCompressedKeywords,
};
