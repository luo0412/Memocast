// ============================================================================
// jest.config.js —— Jest 29 配置（Vue 2.7 项目）
//
// 设计要点：
//   1) testEnvironment = jsdom —— 让 echo / rune 体系里 $ / window.jQuery / document 都在
//   2) transform：.js 走 babel-jest，.vue 走 @vue/vue2-jest
//   3) setupFiles 注入 jQuery 到 globalThis.window.jQuery，
//      让 anno_source 里的 `const $ = window.jQuery` 在 Node 里也能解析到
//   4) moduleNameMapper 让 @/ 指向 src/，与 Quasar 构建一致
//   5) transformIgnorePatterns 排除 node_modules 的转译（体积 + 安全）
//   6) testMatch 限定 tests/** 目录，避免误扫到 src/ 里的 *.test.js（未来可扩展）
//
// 注意：babel-jest 会自动找 babel.config.js，但我们要避免主项目 babel.config.js
// 拉入 @quasar/babel-preset-app，所以显式指定 babelConfig: './babel.config.test.js'。
// ============================================================================
module.exports = {
  testEnvironment: 'jsdom',
  rootDir: __dirname,
  roots: ['<rootDir>/tests'],

  // 显式指向 Jest 专用 babel 配置，避免触发主项目 babel.config.js
  // （主项目带 @quasar/babel-preset-app，会拉 webpack 依赖链）
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './babel.config.test.js' }],
    '^.+\\.vue$': '@vue/vue2-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(echarts|jquery)/)'
  ],

  // 让 @/ 别名走 src/，和 Quasar 构建一致
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // 与 Quasar 构建别名一致：源码里直接 import 'src/utils/...' 或 'src/components/...' 也能解析
    '^src/(.*)$': '<rootDir>/src/$1'
  },

  // 全局注入 jQuery + window 给 jsdom
  setupFiles: ['<rootDir>/tests/fixtures/jquery-setup.js'],

  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],

  // 超时：echo anno_source 编译 16 张卡时偶尔慢
  testTimeout: 30000,

  // 让 verify 测试的 console.log / console.error 直接透传，不被 Jest 缓冲
  verbose: false
}