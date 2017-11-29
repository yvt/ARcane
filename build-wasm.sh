#!/bin/sh

set -x
cd "`dirname "$0"`"

pushd rust/envmapgen
cargo build --target=wasm32-unknown-unknown --release || exit 1
popd

wasm-gc target/wasm32-unknown-unknown/release/envmapgen.wasm target/envmapgen.wasm