'use strict'

process.env.BABEL_ENV = 'renderer'

const path = require('path')

// Memocast 源码根目录（向上 3 级到达 coolma/
const MEMOCAST_ROOT = path.resolve(__dirname, '../../..')

/**
 * 把所有动态 import() 产生的 async chunks 合并到主入口 chunk，输出单个 CDN-friendly UMD 文件。
 *
 * 实际生成 `import('./xx.js')` 时，webpack 5 会创建独立 async chunk 文件，
 * 这里在 optimizeChunks 阶段把所有非主入口 chunk 的模块搬进主入口，并删除那些空 chunk。
 */
class MergeAsyncChunksIntoMainPlugin {
  apply (compiler) {
    compiler.hooks.thisCompilation.tap('MergeAsyncChunksIntoMainPlugin', (compilation) => {
      compilation.hooks.optimizeChunks.tap('MergeAsyncChunksIntoMainPlugin', () => {
        const mainChunk = Array.from(compilation.chunks).find((c) => c.canBeInitial())
        if (!mainChunk) return

        const chunkGraph = compilation.chunkGraph

        for (const chunk of Array.from(compilation.chunks)) {
          if (chunk === mainChunk) continue
          for (const module of chunkGraph.getChunkModules(chunk)) {
            chunkGraph.connectChunkAndModule(mainChunk, module)
          }
          compilation.chunks.delete(chunk)
        }
      })
    })
  }
}

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
          { loader: 'css-loader', options: { importLoaders: 1 } },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                ident: 'postcss',
                plugins: () => [
                  require('postcss-preset-env')({ stage: 0 })
                ]
              }
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
        type: 'asset/inline'
      },
      {
        test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
        type: 'asset/inline'
      },
      {
        test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
        type: 'asset/inline'
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
      'src/utils': path.join(MEMOCAST_ROOT, 'src/utils'),
      // src/boot/i18n.js 内部使用 'src/i18n' 作为根别名
      'src/i18n$': path.join(MEMOCAST_ROOT, 'src/i18n/index.js'),
      // src/utils/helper.js 内部使用 'components/common/bus'
      'components/common/bus': path.join(MEMOCAST_ROOT, 'src/components/common/bus.js')
    },
    fallback: {
      // Memocast 主进程相关 Node 核心模块 —— muya 浏览器构建里不需要，给空实现兜底
      path: false,
      fs: false,
      crypto: false,
      os: false
    }
  },
  optimization: {
    // 不产生 runtime chunk（避免多出一个 runtime 文件）
    runtimeChunk: false,
    // 关闭默认的 splitChunks —— 所有代码都进主入口
    splitChunks: false,
    // 模块合并（启用 ModuleConcatenationPlugin）—— 减小体积
    concatenateModules: true,
    // 用更激进的 minimize
    minimize: true,
    usedExports: true,
    sideEffects: false
  },
  plugins: [
    // 把动态 import() 产生的 async chunks 合并进主入口
    new MergeAsyncChunksIntoMainPlugin()
  ],
  externals: {
    jquery: 'jQuery',
    vue: 'Vue'
  }
}