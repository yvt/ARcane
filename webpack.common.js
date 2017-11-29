require('coffeescript/register');
const path = require('path');

const webpack = require('webpack');
const ExtractTextPlugin = require("extract-text-webpack-plugin");
const GitRevisionPlugin = require('git-revision-webpack-plugin');
const gitRevision = new GitRevisionPlugin();

module.exports = debug => ({
  entry: './ts/index.ts',
  module: {
    rules: [
      {
        test: /\.wasm$/,
        use: 'wasm-loader',
        exclude: /node_modules/
      },
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
      },
      {
        test: /\.less$/,
        use: ExtractTextPlugin.extract({
          use: [{
            loader: 'css-loader',
            options: {
              modules: true,
            },
          }, {
            loader: 'less-loader',
          }],
        }),
      },
    ]
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js', '.glsl', '.less' ]
  },
  resolveLoader: {
    alias: {
      'pieglsl-loader': path.resolve(__dirname, 'tools/pieglsl-loader.coffee'),
    },
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  plugins: [
    new ExtractTextPlugin('bundle.css'),
    new webpack.DefinePlugin({
      'process.env': {
        'VERSION': JSON.stringify(gitRevision.version()),
        'COMMITHASH': JSON.stringify(gitRevision.commithash()),
        'BRANCH': JSON.stringify(gitRevision.branch()),
      },
    }),
  ],
});
