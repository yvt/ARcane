###

  pieglsl-loader - webpack loader for PieGLSL shader module

  Takes a GLSL source file as input and generates a Node.js module containing
  a `PieShaderModule` object.

  During the process, the GLSL source is minified using `pieglsl-compressor`.
  This behavior can be suppressed by the `debug` option.

###
loaderUtils = require 'loader-utils'
{compressSourceText} = require './pieglsl-compressor'

module.exports = (content, map) ->
  query = loaderUtils.getOptions(this) or {}

  # Minify the source code while extracting global identifiers at the same time
  identifierMap = new Map()
  identifiers = []
  compressed = compressSourceText content,
    identifierCallback: (identifier) ->
      iId = identifierMap.get identifier
      unless iId?
        identifierMap.set identifier, identifiers.length
        iId = identifiers.length
        identifiers.push identifier
      return iId
    minify: not query.debug

  # Generate `PieShaderModule`
  psm =
    fragment: compressed
    numSymbols: identifiers.length
    symbols: {}
  identifierMap.forEach (i, idt) ->
    psm.symbols[idt] = i

  "exports = module.exports = #{JSON.stringify(psm)};"
