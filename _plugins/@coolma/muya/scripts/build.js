/**
 * muya 构建脚本 —— 被 package.json scripts 调用
 * 职责：清理 dist/ 后执行 webpack 构建
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const rootDir = path.join(__dirname, '..')
const distDir = path.join(rootDir, 'dist')

// 清理 dist/
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true })
  console.log('[muya-build] cleaned dist/')
} else {
  console.log('[muya-build] dist/ does not exist, skipping clean')
}

// 解析参数
const mode = process.argv.includes('--dev') ? 'development' : 'production'
const isWatch = process.argv.includes('--watch')
process.env.NODE_ENV = mode

// 构建命令行
const webpackBin = path.join(rootDir, 'node_modules', 'webpack', 'bin', 'webpack.js')
const args = ['node', webpackBin, '--mode=' + mode]
if (isWatch) args.push('--watch')

console.log('[muya-build] running: ' + args.join(' '))
execSync(args.join(' '), {
  cwd: rootDir,
  stdio: 'inherit'
})
