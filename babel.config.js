module.exports = {
  presets: [
    '@quasar/babel-preset-app'
  ],
  plugins: [
    '@babel/plugin-transform-optional-chaining',
    '@babel/plugin-transform-nullish-coalescing-operator',
    '@babel/plugin-syntax-import-meta'
  ]
}
