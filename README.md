# ARcane

## Building

    # Install the Rust toolchain for WebAssembly compilation
    rustup target add wasm32-unknown-unknown --toolchain nightly
    cargo install --git https://github.com/alexcrichton/wasm-gc 

    # Install necessary packages
    npm install

    # Build the application
    npm run build:wasm
    npm run build:js

`package.json` provides other script commands useful for development:

    # Run a development server and build JS automatically whenever
    # source files are modified
    npm run start

    # Same as `npm run start` except that the develeopment server is 
    # visible from LAN and TLS is enabled
    npm run start-pub

Changing a Rust source code does not trigger automatic recompilation. You have to run `npm run build:wasm` manually, which updates `target/*.wasm` which in turn triggers recompilation of the final webpack bundle.

## Browser Support

ARcane only supports modern web browsers due to its heavy reliance on latest web features.

 - Google Chrome ≥ 62
 - Firefox ≥ 58
 - Safari ≥ 11
 - iOS (Mobile Safari) ≥ 11

The following tables detail the features used by ARcane.

 - Ubiquitous features, such as ECMAScript 5, `border-radius` and `text-shadow`, are not listed here.

### Required

|              Feature              | Edge | Chrome | Firefox | Safari | iOS  |
| --------------------------------- | ---- | ------ | ------- | ------ | ---- |
| [ES6] Collections (basic support) | 12   |     38 |      13 |      8 | ≤ 8  |
| ES6 [Promise]                     | Yes  |     32 |      27 |    7.1 | ≤ 8  |
| ES6 [`Math.imul`]                 | Yes  |     28 |      20 |      7 | ≤ 8  |
| ES6 [`Math.sign`]                 | Yes  |     38 |      25 |      9 | 9    |
| ES6 [`Math.hypot`]                | Yes  |     38 |      27 |      8 | ≤ 8  |
| ES6 [`Math.fround`]               | Yes  |     38 |      26 |      8 | ≤ 8  |
| ES6 [`String#startsWith`]         | Yes  |     41 |      17 |      9 | ?    |
| [WebGL 1.0]                       | 12   |      8 |       4 |    5.1 | 8    |
| [IndexedDB]                       | 12   |     24 |      16 |     10 | 10.2 |

### Semi-optional (CSS)

|               Feature                | Edge | Chrome | Firefox | Safari | iOS |
| ------------------------------------ | ---- | ------ | ------- | ------ | --- |
| [CSS Flexible Box] w/o vendor prefix | 12   | 29     |      28 |      9 | 9.2 |
| [CSS Masks]                          | No   | Yes    |     3.5 |      4 | 3.2 |

### Optional (AR mode only)

|       Feature        | Edge | Chrome | Firefox | Safari | iOS |
| -------------------- | ---- | ------ | ------- | ------ | --- |
| [Web Workers]        |   12 |      4 |     3.5 |      4 | 5.1 |
| [`getUserMedia` API] |   12 |     53 |      36 |     11 |  11 |
| [WebAssembly]        |   16 |     61 |      53 |     11 |  11 |

[ES6]: https://kangax.github.io/compat-table/es6/
[WebGL 1.0]: https://caniuse.com/#feat=webgl
[Promise]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
[`Math.imul`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul
[`Math.sign`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/sign
[`Math.hypot`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/hypot
[`Math.fround`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround
[`String#startsWith`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith
[IndexedDB]: https://caniuse.com/#feat=indexeddb
[CSS Flexible Box]: https://caniuse.com/#feat=flexbox
[CSS Masks]: https://caniuse.com/#feat=css-masks
[Web Workers]: https://caniuse.com/#feat=webworkers
[`getUserMedia` API]: https://caniuse.com/#feat=stream
[WebAssembly]: https://caniuse.com/#feat=wasm

## License

ARcane, Copyright © 2017 ARcane Developers

The source code of this application is licensed under [the GNU General Public License v3.0].

[the GNU General Public License v3.0]: https://www.gnu.org/licenses/gpl-3.0.en.html
