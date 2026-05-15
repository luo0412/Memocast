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
            // ─── 核心功能（必需）─
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
            'toggleTabFocusMode',
            'transpose',
            'wordHighlighter',
            'wordOperations',
            'wordPartOperations',
            'wordPartSearch',
            // ─── 已移除的功能（节省体积）─
            // 'inPlaceReplace'        - 内联替换（不常用）
            // 'unusualFileTabbing'    - 特殊文件缩进（不常用）
            // 'viewportSemanticColoring' - 视口语义着色（性能消耗大）
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
        // ─── 第二轮优化：Electron 构建优化 ───

        // 禁用不必要的功能以减小体积
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
        // asarUnpack 用于将大体积模块解压到外部，避免双重压缩并提升运行时性能
        // 这些模块包含二进制文件、worker 文件或特殊格式，不适合打包进 asar
        asar: true,
        asarUnpack: [
          '**/node_modules/{monaco-editor,echarts,mermaid,vega*,markmap*,katex,@quasar/extras}/**/*',
          '**/node_modules/sql.js/**/*',
          '**/node_modules/electron-updater/**/*',
          '**/node_modules/electron-log/**/*',
          '**/node_modules/electron-store/**/*',
          '**/node_modules/@electron/**/*'
        ],

        // ─── 排除 node_modules 中的无用模块 ───
        files: [
          '**/*',
          './package.json',
          'dist/electron/**/*',
          '!_plugins/**/*',
          '!public/box-im/**/*',
          // ─── 排除 Muya 编辑器的多余图标资源 ───
          // 每个图标有 3 个尺寸 (1.png, 2.png, 3.png)，只保留 @2x 和 @3x
          '!src/libs/muya/lib/assets/pngicon/**/1.png',
          // 开发依赖裁剪
          '!node_modules/@babel/**/*',
          '!node_modules/babel*/*',
          '!node_modules/webpack/**/*',
          '!node_modules/terser*/**/*',
          '!node_modules/eslint*/*',
          '!node_modules/prettier*/**/*',
          '!node_modules/.bin/**/*',
          // 构建工具和开发工具
          '!node_modules/vuepress*/**/*',
          '!node_modules/@vuepress*/**/*',
          '!node_modules/vuepress-theme-*/**/*',
          '!node_modules/webpack-dev-server/**/*',
          '!node_modules/webpack-cli/**/*',
          '!node_modules/cross-env/**/*',
          '!node_modules/nodemon/**/*',
          '!node_modules/@types/**/*',
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
          // ─── 排除 .d.ts .md .map 等无用文件类型 ───
          // *.d.ts (TypeScript 类型定义，运行时不需要)
          '!node_modules/**/*.d.ts',
          // *.md (markdown 文档)
          '!node_modules/**/*.md',
          // *.map (source map，调试用，生产不需要)
          '!node_modules/**/*.map',
          // 其他文档和配置文件类型
          '!node_modules/**/*.yml',
          '!node_modules/**/*.yaml',
          '!node_modules/**/*.txt',
          '!node_modules/**/*.AUTHORS',
          '!node_modules/**/*.CONTRIBUTING',
          '!node_modules/**/*.TODO',
          '!node_modules/**/*.LICENSE',
          '!node_modules/**/*.CHANGELOG',
          '!node_modules/**/*.HISTORY',
          '!node_modules/**/*.CHANGELELOG',
          // *.vue 文件（源码，已编译的不需要）
          '!node_modules/**/*.vue',
          // 其他开发文件
          '!dist/**/*',
          '!.cursor/**/*',
          '!.github/**/*',
          '!.vscode/**/*',
          '!.workbuddy/**/*',
          '!docs/**/*',

          // ─── 第二轮优化：深度排除更多无用资源 ───

          // 排除 node_modules 中的其他无用文件类型
          '!node_modules/**/*.spec.js',
          '!node_modules/**/*.test.js',
          '!node_modules/**/*.spec.ts',
          '!node_modules/**/*.test.ts',
          '!node_modules/**/*.min.js',           // 已压缩的文件（可能有重复）
          '!node_modules/**/*.min.css',          // 已压缩的 CSS（可能有重复）
          '!node_modules/**/package-lock.json',  // 锁定文件不需要
          '!node_modules/**/yarn.lock',         // Yarn 锁定文件
          '!node_modules/**/pnpm-lock.yaml',    // pnpm 锁定文件

          // 排除常见的无用目录（大小写不敏感）
          '!node_modules/**/.git/**/*',
          '!node_modules/**/.svn/**/*',
          '!node_modules/**/.hg/**/*',
          '!node_modules/**/coverage/**/*',      // 测试覆盖率报告
          '!node_modules/**/nyc_output/**/*',    // NYC 覆盖率数据
          '!node_modules/**/.cache/**/*',        // 缓存目录
          '!node_modules/**/.temp/**/*',         // 临时目录
          '!node_modules/**/tmp/**/*',           // 临时目录

          // 排除 IDE 和编辑器配置
          '!node_modules/**/.idea/**/*',
          '!node_modules/**/*.sublime-project',
          '!node_modules/**/*.sublime-workspace',
          '!node_modules/**/.project',
          '!node_modules/**/.classpath',

          // 排除 CI/CD 配置
          '!node_modules/**/.travis.yml',
          '!node_modules/**/.circleci/**/*',
          '!node_modules/**/.github/workflows/**/*',
          '!node_modules/**/Jenkinsfile',
          '!node_modules/**/.gitlab-ci.yml',

          // 排除 Docker 和部署配置
          '!node_modules/**/Dockerfile*',
          '!node_modules/**/docker-compose*',
          '!node_modules/**/.dockerignore',
          '!node_modules/**/Procfile',
          '!node_modules/**/now.json',
          '!node_modules/**/vercel.json',

          // 排除示例、模板和脚手架
          '!node_modules/**/template/**/*',
          '!node_modules/**/templates/**/*',
          '!node_modules/**/scaffold/**/*',
          '!node_modules/**/boilerplate/**/*',
          '!node_modules/**/starter*/**/*',

          // 排除构建产物缓存
          '!node_modules/**/lib-cov/**/*',
          '!node_modules/**/build/**/*',
          '!node_modules/**/dist/**/*',
          '!node_modules/**/out/**/*',
          '!node_modules/**/output/**/*',

          // 排除文档生成器输出
          '!node_modules/**/typedoc/**/*',
          '!node_modules/**/api/**/*',
          '!node_modules/**/doc/**/*'
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
