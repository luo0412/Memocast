/**
 * muya link 脚本 —— 注册 yarn link
 */
'use strict'

const { execSync } = require('child_process')
const path = require('path')

try {
  execSync('yarn link', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  })
  console.log('[muya-link] yarn link registered')
} catch (e) {
  console.log('[muya-link] yarn link failed:', e.message)
}
