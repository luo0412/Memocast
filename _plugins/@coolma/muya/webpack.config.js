'use strict'

process.env.BABEL_ENV = 'renderer'

const path = require('path')

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  devtool: process.env.NODE_ENV === 'production' ? false : 'eval-cheap-module-source-map',
  entry: {
    renderer: path.join(__dirname, './lib/index.js')
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: 'babel-loader',
        exclude: /node_modules/
      }
    ]
  },
  output: {
    filename: 'index.min.js',
    libraryTarget: 'umd',
    library: 'Muya',
    path: path.join(__dirname, './dist')
  },
  resolve: {
    extensions: ['.js', '.vue', '.json', '.css', '.node']
  },
  externals: {
    jquery: 'jQuery',
    vue: 'Vue'
  }
}
