'use strict'

###
  prefiltering-tester

  A tool to test equations from `Pre-filtering Environment Maps.lyx`.
###

###
  Copyright (c) 2017 ARcane Developers

  This file is a part of ARcane. Please read the license text that
  comes with the source code for use conditions.
###

# Texture size
N = 64

# Kernel size ratio to the standard deviation
r = 2

# Desired kernel radius in pixels
K = 8

mipLevelToPower = (n) -> ((2 ** -n) * N * r / K) ** 2

levels = []

for i in [0 .. Math.log2(N)]
  power = mipLevelToPower i

  sigma = 1 / Math.sqrt power

  # If we reuse the result from a previous layer...
  if i == 0
    prevSigma = 0
  else
    prevSigma = levels[i - 1].sigma
  addSigma = Math.sqrt sigma ** 2 - prevSigma ** 2

  levels[i] =
    size: N >> i
    power: power
    sigma: sigma
    addSigma: addSigma
    actualKernelRadius: addSigma * r * (N >> i)


console.log levels