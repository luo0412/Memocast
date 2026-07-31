'use strict'

process.env.BABEL_ENV = 'renderer'

const path = require('path')

// Memocast 源码根目录（向上 3 级到达 coolma/）
const MEMOCAST_ROOT = path.resolve(__dirname, '../../..')

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
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { importLoader: 1 } },
          {
            loader: 'postcss-loader',
            options: {
              ident: 'postcss',
              plugins: () => [
                require('postcss-preset-env')({ stage: 0 })
              ]
            }
          }
        ]
      },
      {
        test: /\.html$/,
        use: 'vue-html-loader'
      },
      {
        test: /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/,
        type: 'asset/resource',
        generator: {
          filename: 'imgs/[name]--[folder].[ext]'
        }
      },
      {
        test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
        type: 'asset/resource',
        generator: {
          filename: 'media/[name]--[folder].[ext]'
        }
      },
      {
        test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[name]--[folder].[ext]'
        }
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
    extensions: ['.js', '.vue', '.json', '.css', '.node'],
    alias: {
      // Memocast 源码别名 —— muya 内部引用了这些路径
      'boot/i18n': path.join(MEMOCAST_ROOT, 'src/boot/i18n.js'),
      'src/components/echo/echoCore': path.join(MEMOCAST_ROOT, 'src/components/echo/echoCore.js'),
      'src/utils': path.join(MEMOCAST_ROOT, 'src/utils')
    },
    fallback: {
      path: false,
      fs: false
    }
  },
  externals: {
    jquery: 'jQuery',
    vue: 'Vue'
  }
}
