"use strict"

EndOfPreprocessorDirectiveToken = toString: -> "(end of preprocessor directive)"
EndOfFileToken = toString: -> "(end of file)"

{glslCompressedKeywords} = require './pieglsl-keywords'

# This one needn't to be synchronized.
glslBuiltinKeywords = [
  # I don't see any use in these constants in shaders
  "gl_MaxVertexAttribs", "gl_MaxVertexUniformVectors", "gl_MaxVertexOutputVectors",
  "gl_MaxFragmentInputVectors", "gl_MaxVertexTextureImageUnits", "gl_MaxCombinedTextureImageUnits",
  "gl_MaxTextureImageUnits", "gl_MaxFragmentUniformVectors", "gl_MaxDrawBuffers",
  "gl_MinProgramTexelOffset", "gl_MaxProgramTexelOffset"
]

# ----------------------------------------------------------------

tokenRE = /// (
  ?: [a-zA-Z_] [a-zA-Z0-9_] *          # identifier / keyword
   | (?: [-!+/*^|&%=<>]+ ) =?          # ops / compound assign / compare
   | [\]\[\?:(){}.,;]+                 # other operator / punctuators
   | \#                                # start of preprocessor directive
   | (?: 0x)? [0-9]+                   # integer literal
   | (?: [0-9]+\.[0-9]* | [0-9]*\.[0-9]+)
     (?: e\+[0-9]+)?                   # floating literal
) ///g

identifierRE = /// ^(
  ?: [a-zA-Z_] [a-zA-Z0-9_] *
)$ ///

keywordMap = do ->
  map = new Map()

  for kw, i in glslCompressedKeywords
    throw new Error("duplicate keyword: #{kw}") if map.has kw
    map.set kw, i

  for kw in glslBuiltinKeywords
    throw new Error("duplicate keyword: #{kw}") if map.has kw
    map.set kw, -1

  map

isBuiltinIdentifierOrKeyword = (token) ->
  keywordMap.has(token) or token.match(/^[rgbaxyzw]{1,4}$/)

class Lexer

  constructor: (@code) ->
    @index = 0

    # line continuation
    @code = @code.replace("\\\n", "")

    @inPPDirective = false
    @saved = []
    @token = null

    @line = 0

  moveNext: () ->
    if @saved.length > 0
      @token = @saved.pop()
      return

    lastIndex = @index
    inPP = @inPPDirective
    @_skipTrivial()
    leftPP = inPP and not @inPPDirective
    if @index < @code.length
      tokenRE.lastIndex = @index
      match = tokenRE.exec @code
      index = @code.length
      if match?
        index = tokenRE.lastIndex - match[0].length
      unless not match or tokenRE.lastIndex > lastIndex
        throw new Error("assertion failed: #{tokenRE.lastIndex} > #{lastIndex} (tokenRE.lastIndex > lastIndex)")
      unless index >= @index
        throw new Error("assertion failed: #{index} > #{@index} (index >= @index)")
      if index > @index
        throw new Error("line #{@line}: invalid character(s): #{@code.substring(@index, index)}");
      @index = tokenRE.lastIndex
      @token = match[0]
      if @token == '#'
        # entering preprocessor token
        # FIXME: can be token stringification
        @inPPDirective = true
    else
      @token = EndOfFileToken
    if leftPP
      @saved.push @token
      @token = EndOfPreprocessorDirectiveToken
    return

  unread: (token) ->
    @saved.push token
    @token = token
    return

  _skipTrivial: () ->
    {index, code} = @
    state = 0
    while index < code.length
      switch state
        when 0
          switch code.charCodeAt(index)
            when 0x0a, 0x0d # cr, lf
              @inPPDirective = false
              @line += 1
            when 0x08, 0x20 then # tab, space
            when 0x2f # slash
              state = 1
            else
              @index = index
              return
        when 1
          switch code.charCodeAt(index)
            when 0x2f # slash -- line comment
              state = 2
            when 0x2a # asterisk -- block comment
              state = 3
            else
              state = 0
              continue
        when 2 # skipping line comment
          switch code.charCodeAt(index)
            when 0x08, 0x20 then # tab, space
            when 0x0a, 0x0d # cr, lf
              state = 0
              @inPPDirective = false
              @line += 1
        when 3 # skipping block comment
          switch code.charCodeAt(index)
            when 0x0a, 0x0d # cr, lf
              @inPPDirective = false
              @line += 1
            when 0x2a # asterisk -- end of block comment?
              state = 4
        when 4 # maybe end of block comment?
          switch code.charCodeAt(index)
            when 0x0a, 0x0d # cr, lf
              @inPPDirective = false
              @line += 1
            when 0x2a then # asterisk -- end of block comment?
            when 0x2f # slash -- end of block comment
              state = 0
            else
              state = 3

      index += 1

    if state == 1
      index -= 1

    @index = index

    return

class Emitter
  constructor: () ->
    @chunks = []

    ###*
    # The state of the emitter state machine.
    #  * 0 - the current line is empty.
    #  * 1 - the last token is a punctuator or a literal.
    #  * 2 - the last token is an identifier.
    ###
    @state = 0

  emitIdentifier: (text) ->
    @chunks.push " " if @state is 2
    @state = 2
    @chunks.push text

  emitPunctuatorOrLiteral: (text) ->
    @chunks.push " " if @state is 2 and text.match(/^[0-9]/) or \
      @state is 1 and text.match(/^\+/)
    @state = 1
    @chunks.push text
    return

  emitKnownIdentifier: (iId) ->
    @chunks.push " " if @state is 2
    @state = 2
    @chunks.push String.fromCharCode(0x200 + iId)
    return

  emitKnownKeyword: (kId, isPPD) ->
    if isPPD # preprocessor directive
      if @state isnt 0
        @chunks.push "\n"
      @state = 0
    else
      @chunks.push " " if @state is 2
    @state = 2
    @chunks.push String.fromCharCode(0x80 + kId)
    return

  startPreprocessorDirective: () ->
    if @state isnt 0
      @chunks.push "\n"
    @state = 1
    @chunks.push "#"
    return
  endPreprocessorDirective: () ->
    if @state isnt 0
      @chunks.push "\n"
    @state = 0
    return

  toString: () -> @chunks.join('')

# Source code emitter that tries to preserve as much of the original source code
# as possible.
#
# Note: This has a totally different interface compred than `Emitter`.
class UnminifiedEmitter
  constructor: (originalText) ->
    @chunks = []
    @originalText = originalText
    @originalPos = 0

  emitVerbatimUntil: (index) ->
    throw new Error() if typeof index isnt 'number'

    if index > @originalPos
      @chunks.push @originalText.substring(@originalPos, index)
      @originalPos = index
    return

  skipOriginalUntil: (index) ->
    throw new Error() if typeof index isnt 'number'

    @originalPos = index
    return

  emitKnownIdentifier: (iId) ->
    @chunks.push String.fromCharCode(0x200 + iId)
    return

  emitIdentifier: (text) ->
    @chunks.push text
    return

  finalize: ->
    @emitVerbatimUntil @originalText.length
    return

  toString: () -> @chunks.join('')

class LocalIdentifierManager
  base52Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  base52Encode = (i) ->
    s = ""
    while i or s.length is 0
      s += base52Chars.substr(i % 52, 1)
      i = Math.floor(i / 52)
    return s
  constructor: (minify) ->
    @map = new Map()
    @nextId = 0
  translate: (text) ->
    translated = @map.get(text)
    return translated if translated?

    # create mapping
    while not translated? or isBuiltinIdentifierOrKeyword translated
      translated = base52Encode @nextId
      @nextId += 1
    @map.set text, translated
    return translated

###*
# Compresses the specified GLSL code.
#
# @param text {string}
# @param options
#         - identifierCallback {(identifier: string) => number}
#          The function that returns an associated identifier ID.
###
compressSourceText = (text, options) ->
  identifierCallback = options.identifierCallback
  throw new Error("identifierCallback is mandatory") unless identifierCallback?

  minify = options.minify
  minify = true unless minify?

  identifierMap = new Map()

  lexer = new Lexer text
  lexer.moveNext()

  if minify
    emitter = new Emitter()
  if not minify
    umEmitter = new UnminifiedEmitter(text)

  localIdentifiers = new LocalIdentifierManager(minify)

  while lexer.token isnt EndOfFileToken
    token = lexer.token

    if token is EndOfPreprocessorDirectiveToken
      emitter?.endPreprocessorDirective()
      lexer.moveNext()
      continue

    iId = identifierMap.get token
    if iId?
      emitter?.emitKnownIdentifier iId

      umEmitter?.emitVerbatimUntil lexer.index - token.length
      umEmitter?.emitKnownIdentifier iId
      umEmitter?.skipOriginalUntil lexer.index

      lexer.moveNext()
      continue

    kId = keywordMap.get token
    if not kId? and token.match(/^[xyzwrgba]{1,4}$/) # component access
      kId = -1
    if kId?
      if kId < 0
        emitter?.emitIdentifier token
      else
        emitter?.emitKnownKeyword kId
      lexer.moveNext()
      continue

    if token.match(identifierRE)
      emitter?.emitIdentifier localIdentifiers.translate token
      lexer.moveNext()
      continue

    # process `#pragma global IDENTIFIER`
    if token == "#"
      umEmitter?.emitVerbatimUntil lexer.index - 1
      lexer.moveNext()

      token = lexer.token
      if token isnt "pragma"
        if typeof token is 'string'
          ppToken = '#' + token
          kId = keywordMap.get ppToken
          if kId?
            emitter?.emitKnownKeyword kId, true
            lexer.moveNext()
            continue
        continue
      lexer.moveNext()

      token = lexer.token
      if token isnt "global"
        lexer.unread lexer.token
        lexer.unread "pragma"
        lexer.moveNext()
        continue
      lexer.moveNext()

      loop
        token = lexer.token
        if token is EndOfPreprocessorDirectiveToken
          lexer.moveNext()
          break
        umEmitter?.skipOriginalUntil lexer.index
        unless typeof token is 'string' and token.match(identifierRE)
          throw new Error("line #{lexer.line}: invalid global identifier: identifier is not valid")
        lexer.moveNext()
        if isBuiltinIdentifierOrKeyword token
          throw new Error("line #{lexer.line}: invalid global identifier: '#{token}' cannot be a global identifier")
        identifierMap.set token, identifierCallback token

      continue

    # punctuator or literal.
    emitter?.emitPunctuatorOrLiteral token
    lexer.moveNext()

  umEmitter?.finalize()

  return emitter?.toString() ? umEmitter.toString()

module.exports =
  compressSourceText: compressSourceText

if require.main is module
  # called directly: visualize the result
  {gzipSync} = require 'zlib'
  argv = require('minimist') process.argv.slice(2)

  minify = not (argv.d?)

  text = ""
  process.stdin.on 'data', (chunk) -> text += chunk
  process.stdin.on 'end', () ->
    identifierMap = new Map()
    identifiers = []
    nextIID = 0
    processed = compressSourceText text,
      identifierCallback: (identifier) ->
        iId = identifierMap.get identifier
        unless iId?
          identifierMap.set identifier, identifiers.length
          iId = identifiers.length
          identifiers.push identifier
        return iId
      minify: minify

    console.log "// Original: #{new Buffer(text).length} byte(s)"
    console.log "// Compressed: #{new Buffer(processed).length} byte(s)"
    console.log "// Original (gzipped): #{gzipSync(new Buffer(text)).length} byte(s)"
    console.log "// Compressed (gzipped): #{gzipSync(new Buffer(processed)).length} byte(s)"

    Reset = "\x1b[0m"
    FgGreen = "\x1b[32m"
    FgYellow = "\x1b[33m"

    formatted = processed.replace /[\u0080-\u2000]/g, (matched) ->
      charCode = matched.charCodeAt 0
      if charCode < 0x200
        kId = charCode - 0x80
        "#{FgGreen}#{glslCompressedKeywords[kId]}#{Reset}"
      else
        iId = charCode - 0x200;
        "#{FgYellow}#{identifiers[iId]}#{Reset}"
    formatted = "// Keywords are colored with #{FgGreen}green#{Reset}.\n\n#{formatted}"
    formatted = "// Global identifiers are colored with #{FgYellow}yellow#{Reset}.\n#{formatted}\n"
    process.stdout.write formatted

    return
