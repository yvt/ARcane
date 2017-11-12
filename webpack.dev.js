const merge = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common(true), {
  devtool: 'inline-source-map',
  devServer: {
    contentBase: './dist'
  }
});
