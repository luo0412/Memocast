/*
 * This file runs in a Node context (it's NOT transpiled by Babel), so use only
 * the ES6 features that are supported by your Node version. https://node.green/
 */

// Configuration for your app
// https://quasar.dev/quasar-cli/quasar-conf-js
/* eslint-env node */

module.exports = function (/* ctx */) {
  return {
    // https://quasar.dev/quasar-cli/supporting-ts
    supportTS: false,

    // https://quasar.dev/quasar-cli/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://quasar.dev/quasar-cli/boot-files
    boot: [

      'i18n',
      'request',
      'element-ui',
      'antd',
      'electron-clipboard'
    ],

    // https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-css
    css: [
      'style.css'
    ],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v5',
      // 'fontawesome-v5',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      'roboto-font', // optional, you are not bound to it
      'material-icons', // optional, you are not bound to it
      'material-icons-outlined'
    ],

    // Full list of options: https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-build
    build: {
      vueRouterMode: 'hash', // available values: 'hash', 'history'

      transpile: true,

      // Add dependencies for transpiling with Babel (Array of string/regex)
      // (from node_modules, which are by default not transpiled).
      // Applies only if "transpile" is set to true.
      transpileDependencies: [/vega.*/, /@quasar.*/, /quill/, 'htmlparser2', 'parse5', 'cheerio', /monaco.*/, 'sql.js'],

      // rtl: false, // https://quasar.dev/options/rtl-support
      // preloadChunks: true,
      // showProgress: false,
      // gzip: true,
      // analyze: true,

      // Options below are automatically set depending on the env, set them if you want to override
      // extractCSS: false,

      // https://quasar.dev/quasar-cli/handling-webpack
      extendWebpack (cfg) {
        // ESLint is run separately via `npm run lint`.
        // eslint-loader v4 is incompatible with eslint v8 (removed getFormatter API),
        // so it has been removed from the webpack build pipeline.
        cfg.externals = {
          electron: 'commonjs electron'
        }

        // Add babel loader for vega modules
        // cfg.module.rules.push({
        //   test: /\.js$/,
        //   include: /node_modules\/vega/,
        //   use: {
        //     loader: 'babel-loader',
        //     options: {
        //       presets: [['@babel/preset-env', { targets: 'Chrome 70' }]],
        //       plugins: [
        //         '@babel/plugin-transform-optional-chaining',
        //         '@babel/plugin-transform-nullish-coalescing-operator'
        //       ]
        //     }
        //   }
        // })

        // Monaco editor: use monaco-editor-webpack-plugin to bundle workers
        const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin')
        cfg.plugins.push(new MonacoWebpackPlugin({
          languages: ['markdown', 'yaml', 'json', 'html', 'css', 'typescript', 'javascript'],
          features: [
            'bracketMatching',
            'clipboard',
            'codeAction',
            'codelens',
            'colorDetector',
            'comment',
            'contextmenu',
            'cursorUndo',
            'find',
            'folding',
            'fontZoom',
            'format',
            'gotoLine',
            'hover',
            'inPlaceReplace',
            'indentation',
            'linesOperations',
            'links',
            'multicursor',
            'parameterHints',
            'quickCommand',
            'quickOutline',
            'referenceSearch',
            'rename',
            'smartSelect',
            'snippets',
            'suggest',
            'toggleHighContrast',
            'toggleTabFocusMode',
            'transpose',
            'unusualFileTabbing',
            'viewportSemanticColoring',
            'wordHighlighter',
            'wordOperations',
            'wordPartOperations',
            'wordPartSearch'
          ]
        }))
      }
    },

    // Full list of options: https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-devServer
    devServer: {
      https: false,
      port: 8080,
      open: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8888',
          changeOrigin: true,
          ws: false,
          pathRewrite: {
            '^/api': ''
          }
        }
      }
    },

    // https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-framework
    framework: {
      iconSet: 'material-icons', // Quasar icon set
      lang: 'en-us', // Quasar language pack
      config: {
        dark: 'auto'
      },

      // Possible values for "importStrategy":
      // * 'auto' - (DEFAULT) Auto-import needed Quasar components & directives
      // * 'all'  - Manually specify what to import
      importStrategy: 'auto',

      // For special cases outside of where "auto" importStrategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      plugins: [
        'Notify',
        'Dialog',
        'BottomSheet',
        'Loading'
      ]
    },

    // animations: 'all', // --- includes all animations
    // https://quasar.dev/options/animations
    animations: ['fadeIn', 'fadeOut'],

    // https://quasar.dev/quasar-cli/developing-ssr/configuring-ssr
    ssr: {
      pwa: false
    },

    // https://quasar.dev/quasar-cli/developing-pwa/configuring-pwa
    pwa: {
      workboxPluginMode: 'GenerateSW', // 'GenerateSW' or 'InjectManifest'
      workboxOptions: {}, // only for GenerateSW
      manifest: {
        name: 'Quasar App',
        short_name: 'Quasar App',
        description: 'A Quasar Framework app',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#027be3',
        icons: [
          {
            src: 'icons/icon-128x128.png',
            sizes: '128x128',
            type: 'image/png'
          },
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-256x256.png',
            sizes: '256x256',
            type: 'image/png'
          },
          {
            src: 'icons/icon-384x384.png',
            sizes: '384x384',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    },

    // Full list of options: https://quasar.dev/quasar-cli/developing-cordova-apps/configuring-cordova
    cordova: {
      // noIosLegacyBuildFlag: true, // uncomment only if you know what you are doing
    },

    // Full list of options: https://quasar.dev/quasar-cli/developing-capacitor-apps/configuring-capacitor
    capacitor: {
      hideSplashscreen: true
    },

    // Full list of options: https://quasar.dev/quasar-cli/developing-electron-apps/configuring-electron
    electron: {
      bundler: 'builder', // 'packager' or 'builder'

      packager: {
        // https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
        productName: 'coolma',
        mac: {
          target: [{
            arch: 'universal',
            target: 'dmg'
          }]
        }

        // OS X / Mac App Store
        // appBundleId: '',
        // appCategoryType: '',
        // osxSign: '',
        // protocol: 'myapp://path',

        // Windows only
        // win32metadata: { ... }
      },

      builder: {
        appId: 'cn.coolma.app',
        electronDownload: {
          mirror: 'https://npmmirror.com/mirrors/electron/'
        },
        publish: {
          provider: 'github',
          releaseType: 'draft'
        },

        // ─── 打包完成后裁剪 Electron 多余模块 ───
        afterPack: './scripts/after-pack.js',

        // ─── 7z 极限压缩配置 ───
        // 底层调用 7z，最高压缩级别 + BCJ2 过滤器（对可执行文件效果显著）
        // 使用 yarn build-7z 或 yarn build-publish-7z 来触发极限压缩
        compression: 'maximum',

        // ─── 压缩 asar 包 ───
        // asarUnpack 用于将大体积模块解压到外部，asar 保持 true 即可
        asar: true,
        // asarUnpack: '**/node_modules/{monaco-editor,echarts,mermaid,vega*,markmap*,katex,@quasar/extras}/**/*',

        // ─── 排除 node_modules 中的无用模块 ───
        files: [
          '**/*',
          './package.json',
          'dist/electron/**/*',
          '!_plugins/**/*',
          '!public/box-im/**/*',
          // 开发依赖裁剪
          '!node_modules/@babel/**/*',
          '!node_modules/babel*/*',
          '!node_modules/webpack/**/*',
          '!node_modules/terser*/**/*',
          '!node_modules/eslint*/*',
          '!node_modules/prettier*/**/*',
          '!node_modules/.bin/**/*',
          // 测试/文档/示例文件
          '!node_modules/**/test/**/*',
          '!node_modules/**/tests/**/*',
          '!node_modules/**/docs/**/*',
          '!node_modules/**/example*/**/*',
          '!node_modules/**/readme*',
          '!node_modules/**/changelog*',
          '!node_modules/**/license*',
          '!node_modules/**/HISTORY*',
          '!node_modules/**/.github/**/*',
          // vuepress 相关（完全不需要）
          '!node_modules/vuepress/**/*',
          '!node_modules/vuepress-theme-vdoing/**/*',
          // ─── 排除 .d.ts .md .map 等无用文件类型 ───
          // *.d.ts (TypeScript 类型定义，运行时不需要)
          '!node_modules/**/*.d.ts',
          // *.md (markdown 文档)
          '!node_modules/**/*.md',
          // *.map (source map，调试用，生产不需要)
          '!node_modules/**/*.map',
          // '!node_modules/**/*.vue',
          // CHANGELOG / CONTRIBUTING / TODO 等文档文件变体
          '!node_modules/**/CHANGELOG*',
          '!node_modules/**/CONTRIBUTING*',
          '!node_modules/**/TODO*',
          '!node_modules/**/LICENSE*',
          '!node_modules/**/AUTHORS*',
          '!node_modules/**/HISTORY*',
          '!node_modules/**/CHANGELELOG*',
          // 其他开发文件
          '!dist/**/*',
          '!.cursor/**/*',
          '!.github/**/*',
          '!.vscode/**/*',
          '!.workbuddy/**/*',
          '!docs/**/*',
        ],

        mac: {
          target: [
            'dmg',
            'zip'
          ],
          // eslint-disable-next-line no-template-curly-in-string
          artifactName: 'Coolma-${version}-${arch}-mac.${ext}'
        },

        win: {
          target: [
            'nsis',
            'zip'
          ],
          legalTrademarks: 'Coolma'
        },

        nsis: {
          // eslint-disable-next-line no-template-curly-in-string
          artifactName: 'Coolma-${version}-${arch}-win.${ext}',
          perMachine: false,
          oneClick: false,
          allowToChangeInstallationDirectory: true,
          // 使用 zip 压缩格式减小安装包体积
          // useZip: true
        },

        linux: {
          target: [
            'AppImage',
            'deb',
            'rpm'
          ],
          vendor: 'Coolma',
          // eslint-disable-next-line no-template-curly-in-string
          artifactName: 'Coolma-${version}-${arch}-linux.${ext}'
        }
      },

      // More info: https://quasar.dev/quasar-cli/developing-electron-apps/node-integration
      nodeIntegration: true,

      extendWebpack (cfg) {
        // do something with Electron main process Webpack cfg
        // chainWebpack also available besides this extendWebpack
        cfg.externals = {
          mime: 'commonjs mime',
          electron: 'commonjs electron',
          'electron-util': 'commonjs electron-util',
          'electron-log': 'commonjs electron-log',
          'electron-unhandled': 'commonjs electron-unhandled',
          'electron-updater': 'commonjs electron-updater',
          'electron-window-state': 'commonjs electron-window-state',
          'sql.js': 'commonjs sql.js'
        }

        // 使用 babel-loader 转译 sql.js 的 wasm 文件
        cfg.module.rules.push({
          test: /\.js$/,
          include: /node_modules\/sql\.js/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
            }
          }
        })
      }
    }
  }
}
