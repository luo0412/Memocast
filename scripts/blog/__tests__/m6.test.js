/**
 * M6 自测：incremental.js
 *
 * 用法：node scripts/blog/__tests__/m6.test.js
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')

const inc = require('../incremental')

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

console.log('\n=== contentHash ===')

test('同样输入稳定', () => {
  const a = inc.contentHash('# Hello\n')
  const b = inc.contentHash('# Hello\n')
  assert.strictEqual(a, b)
})

test('不同输入产生不同 hash', () => {
  const a = inc.contentHash('# Hello\n')
  const b = inc.contentHash('# World\n')
  assert.notStrictEqual(a, b)
})

test('hash 长度固定', () => {
  assert.strictEqual(inc.contentHash('x').length, 16)
  assert.strictEqual(inc.contentHash('a very long content ' + 'x'.repeat(10000)).length, 16)
})

console.log('\n=== shouldSkip ===')

test('空 manifest 总是写入', () => {
  const m = { entries: {} }
  const r = inc.shouldSkip(m, 'a/b.md', '# x')
  assert.strictEqual(r.skip, false)
})

test('hash 命中跳过', () => {
  const content = '# x'
  const h = inc.contentHash(content)
  const m = { entries: { 'a/b.md': { hash: h } } }
  const r = inc.shouldSkip(m, 'a/b.md', content)
  assert.strictEqual(r.skip, true)
})

test('hash 不命中不跳过', () => {
  const m = { entries: { 'a/b.md': { hash: 'deadbeef' } } }
  const r = inc.shouldSkip(m, 'a/b.md', '# x')
  assert.strictEqual(r.skip, false)
})

console.log('\n=== writeIncremental ===')

test('writeIncremental 第一次写入后再次跳过', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memocast-inc-'))
  const m = inc.loadManifest(tmp)
  const r1 = inc.writeIncremental(tmp, m, 'a/b.md', '# Hello\n')
  assert.strictEqual(r1.written, true)
  assert.ok(fs.existsSync(path.join(tmp, 'a/b.md')))
  // 第一次落盘后 manifest 已被 in-memory 更新，再次调用同 content 应跳过
  const r2 = inc.writeIncremental(tmp, m, 'a/b.md', '# Hello\n')
  assert.strictEqual(r2.written, false)
  // 改内容后再次写入
  const r3 = inc.writeIncremental(tmp, m, 'a/b.md', '# Hello2\n')
  assert.strictEqual(r3.written, true)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('saveManifest 原子写入', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memocast-inc-save-'))
  const m = { entries: { 'a/b.md': { hash: 'a'.repeat(16), size: 1, mtime: 0, builtAt: 0 } } }
  inc.saveManifest(tmp, m)
  const file = path.join(tmp, '.vuepress', inc.MANIFEST_FILE)
  assert.ok(fs.existsSync(file))
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.strictEqual(obj.version, inc.MANIFEST_VERSION)
  assert.strictEqual(obj.entries['a/b.md'].hash, 'a'.repeat(16))
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('loadManifest 缺失或损坏 → 空 manifest', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memocast-inc-load-'))
  const m1 = inc.loadManifest(tmp)
  assert.deepStrictEqual(m1.entries, {})
  fs.mkdirSync(path.join(tmp, '.vuepress'), { recursive: true })
  fs.writeFileSync(path.join(tmp, '.vuepress', inc.MANIFEST_FILE), '{not json', 'utf8')
  const m2 = inc.loadManifest(tmp)
  assert.deepStrictEqual(m2.entries, {})
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('pruneManifest 清理 stale 条目', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memocast-inc-prune-'))
  fs.mkdirSync(path.join(tmp, 'keep'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'keep/x.md'), 'x')
  const m = { entries: {
    'keep/x.md': { hash: 'h1' },
    'stale/y.md': { hash: 'h2' }
  } }
  const r = inc.pruneManifest(tmp, m)
  assert.strictEqual(r.removed, 1)
  assert.ok(m.entries['keep/x.md'])
  assert.ok(!m.entries['stale/y.md'])
  fs.rmSync(tmp, { recursive: true, force: true })
})

console.log(`\n=== 结果 ===`)
console.log(`  通过: \x1b[32m${passed}\x1b[0m  失败: \x1b[31m${failed}\x1b[0m`)
process.exit(failed > 0 ? 1 : 0)