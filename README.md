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

Changing a Rust source code does not trigger recompilation. You have to run `npm run build:wasm` manually, which updates `target/*.wasm` which in turn triggers recompilation of the final webpack bundle.

## License

ARcane, Copyright © 2017 ARcane Developers

The source code of this application is licensed under [the GNU General Public License v3.0].

[the GNU General Public License v3.0]: https://www.gnu.org/licenses/gpl-3.0.en.html
