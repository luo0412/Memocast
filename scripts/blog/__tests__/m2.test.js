/**
 * M2 自测：export-from-sqlite 的纯函数部分（不需要真实 db）
 *
 * 用法：node scripts/blog/__tests__/m2.test.js
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')

const {
  parseArgs,
  categoryToOutDir,
  isPublishedFrontMatter,
  extractOrder,
  extractTitle,
  OFFLINE_ROOT_CATEGORY
} = require('../export-from-sqlite')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
    passed++
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`)
    console.log(`    ${err.message}`)
    failed++
  }
}

console.log('\n=== parseArgs ===')

test('parseArgs 默认值', () => {
  // 构造一个干净环境，避免 ENV 干扰
  const oldDb = process.env.MEMOCAST_DB
  const oldSys = process.env.BLOG_SYS
  const oldOut = process.env.MEMOCAST_BLOG_OUT
  delete process.env.MEMOCAST_DB
  delete process.env.BLOG_SYS
  delete process.env.MEMOCAST_BLOG_OUT
  const args = parseArgs(['node', 'export-from-sqlite.js'])
  assert.ok(args.source.endsWith('memocast.db'), `source 应指向 memocast.db，实际: ${args.source}`)
  assert.strictEqual(args.dryRun, false)
  if (oldDb) process.env.MEMOCAST_DB = oldDb
  if (oldSys) process.env.BLOG_SYS = oldSys
  if (oldOut) process.env.MEMOCAST_BLOG_OUT = oldOut
})

test('parseArgs 解析 --source --out --sys --dry-run', () => {
  const args = parseArgs([
    'node', 'x.js', '--source', '/tmp/a.db', '--out', '/tmp/blog', '--sys', 'kb-1', '--dry-run'
  ])
  assert.strictEqual(args.source, '/tmp/a.db')
  assert.strictEqual(args.out, '/tmp/blog')
  assert.strictEqual(args.sys, 'kb-1')
  assert.strictEqual(args.dryRun, true)
})

console.log('\n=== categoryToOutDir ===')

test('categoryToOutDir 加 nav. 前缀', () => {
  const out = categoryToOutDir('/tmp/out', '/My Notes/技术/')
  assert.strictEqual(out, path.join('/tmp/out', 'nav.技术'))
})

test('categoryToOutDir 多级 → nav./ch.', () => {
  const out = categoryToOutDir('/tmp/out', '/技术/前端/React/')
  assert.strictEqual(out, path.join('/tmp/out', 'nav.技术', 'ch.前端', 'sec.React'))
})

test('categoryToOutDir 根分类落到 _misc', () => {
  const out = categoryToOutDir('/tmp/out', OFFLINE_ROOT_CATEGORY)
  assert.strictEqual(out, path.join('/tmp/out', '_misc'))
})

test('categoryToOutDir 空字符串落到 _misc', () => {
  const out = categoryToOutDir('/tmp/out', '')
  assert.strictEqual(out, path.join('/tmp/out', '_misc'))
})

console.log('\n=== front-matter 解析 ===')

test('isPublishedFrontMatter HTML 注释', () => {
  assert.strictEqual(isPublishedFrontMatter('<!-- published: true -->\n# x'), true)
  assert.strictEqual(isPublishedFrontMatter('<!-- published: 1 -->\n# x'), true)
  assert.strictEqual(isPublishedFrontMatter('<!-- published: false -->\n# x'), false)
})

test('isPublishedFrontMatter YAML', () => {
  assert.strictEqual(isPublishedFrontMatter('---\ntitle: foo\npublished: true\n---\n# x'), true)
  assert.strictEqual(isPublishedFrontMatter('---\ntitle: foo\npublished: false\n---\n# x'), false)
})

test('isPublishedFrontMatter 无 front-matter', () => {
  assert.strictEqual(isPublishedFrontMatter('# 纯标题\n'), false)
})

test('extractOrder YAML', () => {
  assert.strictEqual(extractOrder('---\norder: 7\n---\n# x'), 7)
})

test('extractOrder HTML 注释', () => {
  assert.strictEqual(extractOrder('<!-- order: 5 -->\n# x'), 5)
})

test('extractTitle YAML', () => {
  assert.strictEqual(extractTitle('---\ntitle: 你好世界\n---\n# x'), '你好世界')
  assert.strictEqual(extractTitle('---\ntitle: "带引号"\n---\n# x'), '带引号')
})

console.log(`\n=== 结果 ===`)
console.log(`  通过: \x1b[32m${passed}\x1b[0m  失败: \x1b[31m${failed}\x1b[0m`)
process.exit(failed > 0 ? 1 : 0)