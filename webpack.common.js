require('coffeescript/register');
const path = require('path');

module.exports = debug => ({
  entry: './ts/index.tsx',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.glsl$/,
        use: {
          loader: 'pieglsl-loader',
          options: {
            debug,
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js', '.glsl' ]
  },
  resolveLoader: {
    alias: {
      'pieglsl-loader': path.resolve(__dirname, 'tools/pieglsl-loader.coffee'),
    },
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  }
});
