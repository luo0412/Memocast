/**
 * M2 自测：export-from-sqlite 的纯函数部分（不需要真实 db）
 *
 * 用法：node scripts/blog/__tests__/m2.test.js
 */

'use strict'

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

const { shortlinkForExport } = require('../shortlink')
const { shortlink } = require('../shortlink')

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

test('parseArgs 默认值', () => {
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

test('categoryToOutDir 多级 -> nav./ch./sec.', () => {
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

console.log('\n=== permalink 与 shortlink 一致性 ===')

test('shortlinkForExport 输出 /<id>.html 格式', () => {
  const p = shortlinkForExport('01-Hello.md', '/tmp/nav.技术')
  assert.ok(p.startsWith('/'), `应以 / 开头: ${p}`)
  assert.ok(p.endsWith('.html'), `应以 .html 结尾: ${p}`)
  // 不带 .md
  assert.ok(!p.includes('.md'), `permalink 不应带 .md: ${p}`)
})

test('shortlinkForExport 与 build-sidebar 阶段的 shortlink 完全一致', () => {
  // export 时 basename 是 '01-Hello.md'（带序号的原文件名）
  // build-sidebar 时 path 是 '01-Hello'（已 strip .md）
  // 两个阶段喂入 shortlink() 函数的 "逻辑输入" 应当能算出同一个 ID
  const exportLink = shortlinkForExport('01-Hello.md', '/tmp/nav.技术')

  // 模拟 sidebar.json 阶段：path 是 'nav.技术/01-Hello'（已 strip seq）
  // 用 shortlink() 算（喂的是 dir+basename 拼起来的整路径）
  const sidebarLink = shortlink('nav.技术/01-Hello')

  // 因为 export 用的是 stripped basename='Hello'，sidebar 用的是被 shortlink
  // 内部 strip 的同样 'Hello'，两者必须输出同一个 ID
  assert.strictEqual(
    exportLink,
    sidebarLink,
    `export 算出 ${exportLink}, sidebar 算出 ${sidebarLink}，应一致`
  )
})

test('shortlinkForExport 带 .md 后缀也能算', () => {
  const a = shortlinkForExport('Foo.md', '/tmp/nav.技术')
  const b = shortlinkForExport('Foo', '/tmp/nav.技术')
  assert.strictEqual(a, b, '短链对 basename 是否带 .md 不敏感')
})

test('shortlinkForExport 目录模式以 / 结尾', () => {
  const p = shortlinkForExport('', '/tmp/nav.技术', { isDir: true })
  assert.ok(p.startsWith('/'), `应以 / 开头: ${p}`)
  assert.ok(p.endsWith('/'), `目录 permalink 应以 / 结尾: ${p}`)
  assert.ok(!p.endsWith('.html'), `目录 permalink 不应带 .html: ${p}`)
})

test('短链稳定性：相同输入多次调用结果一致', () => {
  const a1 = shortlinkForExport('01-Hello.md', '/tmp/nav.技术')
  const a2 = shortlinkForExport('01-Hello.md', '/tmp/nav.技术')
  assert.strictEqual(a1, a2)
  // 同一内容不同位置应输出不同 ID（除非目录相同）
  const b = shortlinkForExport('01-Hello.md', '/tmp/nav.生活')
  assert.notStrictEqual(a1, b, '不同目录的相同 basename 应输出不同 ID')
})

console.log(`\n=== 结果 ===`)
console.log(`  通过: \x1b[32m${passed}\x1b[0m  失败: \x1b[31m${failed}\x1b[0m`)
process.exit(failed > 0 ? 1 : 0)