/**
 * M4 自测：gen-vuepress-config
 *
 * 用法：node scripts/blog/__tests__/m4.test.js
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')

const { renderConfig, parseArgs, normalizeBase } = require('../gen-vuepress-config')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  \x1b[32m\x1b[0m ${name}`)
    passed++
  } catch (err) {
    console.log(`  \x1b[31m\x1b[0m ${name}`)
    console.log(`    ${err.message}`)
    failed++
  }
}

console.log('\n=== parseArgs ===')

test('parseArgs 默认 base = "/"', () => {
  const old = process.env.BLOG_BASE
  delete process.env.BLOG_BASE
  const args = parseArgs(['node', 'x.js'])
  assert.strictEqual(args.base, '/')
  if (old) process.env.BLOG_BASE = old
})

test('parseArgs 强制 base 头尾 /', () => {
  const args = parseArgs(['node', 'x.js', '--base', 'memocast-blog'])
  assert.strictEqual(args.base, '/memocast-blog/')
  const args2 = parseArgs(['node', 'x.js', '--base', '/memocast-blog/'])
  assert.strictEqual(args2.base, '/memocast-blog/')
})

test('parseArgs 显式 --base= 覆盖 ENV', () => {
  process.env.BLOG_BASE = '/from-env/'
  const args = parseArgs(['node', 'x.js', '--base', '/from-cli/'])
  assert.strictEqual(args.base, '/from-cli/')
  delete process.env.BLOG_BASE
})

console.log('\n=== normalizeBase ===')

test('normalizeBase 根路径', () => {
  assert.strictEqual(normalizeBase('/'), '/')
})

test('normalizeBase 子路径', () => {
  assert.strictEqual(normalizeBase('/memocast-blog/'), '/memocast-blog/')
  assert.strictEqual(normalizeBase('/memocast-blog'), '/memocast-blog/')
})

console.log('\n=== renderConfig ===')

test('renderConfig 输出 base、nav、sidebar 可解析', () => {
  const txt = renderConfig({
    base: '/memocast-blog/',
    nav: [{ text: 'Home', link: '/' }, { text: 'Tech', link: '/abc.html' }],
    sidebar: { '/abc/': ['/a.html', '/b.html'] }
  })
  // base 在文件里
  assert.ok(txt.includes('const base = "/memocast-blog/"'), '应包含 base 字面量')
  assert.ok(txt.includes('"Tech"'))
  assert.ok(txt.includes('"/abc/"'))
  // JS 语法可解析
  const m = { exports: {} }
  new Function('module', 'exports', txt)(m, m.exports)
  assert.strictEqual(m.exports.base, '/memocast-blog/')
  assert.strictEqual(m.exports.themeConfig.nav.length, 2)
  assert.deepStrictEqual(m.exports.themeConfig.sidebar['/abc/'], ['/a.html', '/b.html'])
})

test('renderConfig 默认根 base + 标题', () => {
  const txt = renderConfig({
    base: '/',
    nav: [],
    sidebar: {}
  })
  assert.ok(txt.includes("const base = \"/\""))
  assert.ok(txt.includes('Memocast Blog'))
})

console.log('\n=== gen-vuepress-config main 端到端 ===')

test('main 写入 config.js 到 docs/.vuepress/', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memocast-cfg-'))
  const docs = path.join(tmp, 'docs')
  fs.mkdirSync(path.join(docs, '.vuepress'), { recursive: true })
  fs.writeFileSync(
    path.join(docs, '.vuepress', 'sidebar.json'),
    JSON.stringify({
      version: 1,
      nav: [{ text: 'Home', link: '/', items: [] }],
      sidebar: { '/': ['/page1.html'] }
    }),
    'utf8'
  )
  process.env.MEMOCAST_STAGE_DIR = docs
  process.env.BLOG_BASE = '/test-blog/'
  // 直接 require + 调用 main
  const { main } = require('../gen-vuepress-config')
  // 清空 require 缓存保证 ENV 生效
  delete require.cache[require.resolve('../gen-vuepress-config')]
  const { main: run } = require('../gen-vuepress-config')
  const r = run()
  assert.ok(r.out.endsWith('config.js'))
  const written = fs.readFileSync(r.out, 'utf8')
  assert.ok(written.includes('"/test-blog/"'))
  fs.rmSync(tmp, { recursive: true, force: true })
  delete process.env.MEMOCAST_STAGE_DIR
  delete process.env.BLOG_BASE
})

console.log(`\n=== 结果 ===`)
console.log(`  通过: \x1b[32m${passed}\x1b[0m  失败: \x1b[31m${failed}\x1b[0m`)
process.exit(failed > 0 ? 1 : 0)