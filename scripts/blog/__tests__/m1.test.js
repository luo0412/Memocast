/**
 * M1 自测脚本：hash-id + scan-nav
 *
 * 用法：node scripts/blog/__tests__/m1.test.js
 * 不依赖第三方包，零配置可跑。
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')

const { genId, extractSeq } = require('../hash-id')
const { scanDocs, getName, parseSidebarParameters, isNavDir, NAV_PREFIXES } = require('../scan-nav')

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

console.log('\n=== hash-id ===')

test('genId 输出 ≈ 26 字符 Base36', () => {
  const id = genId('01-你好世界', 'nav.1-test/ch.2-foo')
  assert.ok(/^[a-z0-9]+$/.test(id), `id 含非 Base36 字符: ${id}`)
  // 用 Number 保存 cyrb53 时高位会被截断，id 长度通常在 10-20 之间
  assert.ok(id.length >= 8 && id.length <= 32, `id 长度异常: ${id.length} (${id})`)
})

test('genId 同样输入输出同样 ID', () => {
  const a = genId('01-foo', 'nav.1-x/ch.2-y')
  const b = genId('01-foo', 'nav.1-x/ch.2-y')
  assert.strictEqual(a, b)
})

test('genId 不同输入产生不同 ID', () => {
  const a = genId('01-foo', 'nav.1-x')
  const b = genId('01-bar', 'nav.1-x')
  assert.notStrictEqual(a, b)
})

test('心形符号不影响 hash（输入带 ❤ 与不带结果一致）', () => {
  const a = genId('01-foo', 'nav.1-x')
  const b = genId('01-foo❤', 'nav.1-x')
  const c = genId('01-foo❤️', 'nav.1-x')
  assert.strictEqual(a, b)
  assert.strictEqual(a, c)
})

test('extractSeq 提取序号', () => {
  assert.strictEqual(extractSeq('01-foo.md'), 1)
  assert.strictEqual(extractSeq('42-bar.md'), 42)
  assert.strictEqual(extractSeq('foo.md'), null)
  assert.strictEqual(extractSeq('README.md'), null)
})

console.log('\n=== scan-nav ===')

test('parseSidebarParameters 解析 --nc,d2', () => {
  const a = parseSidebarParameters('xxx--nc')
  assert.deepStrictEqual(a, { collapsable: false })
  const b = parseSidebarParameters('xxx--d3')
  assert.deepStrictEqual(b, { sidebarDepth: 3 })
  const c = parseSidebarParameters('xxx--nc,d2')
  assert.deepStrictEqual(c, { collapsable: false, sidebarDepth: 2 })
  const d = parseSidebarParameters('xxx')
  assert.deepStrictEqual(d, {})
})

test('getName 剥离 nav./ch./sec. 前缀', () => {
  assert.strictEqual(getName('nav.1-前端笔记'), '前端笔记')
  assert.strictEqual(getName('ch.2-react进阶'), 'React进阶')
  assert.strictEqual(getName('sec.3-hooks'), 'Hooks')
})

test('isNavDir 只接受 nav./ch./sec. 开头', () => {
  assert.strictEqual(isNavDir('nav.1-x', NAV_PREFIXES), true)
  assert.strictEqual(isNavDir('ch.2-y', NAV_PREFIXES), true)
  assert.strictEqual(isNavDir('sec.3-z', NAV_PREFIXES), true)
  assert.strictEqual(isNavDir('tpl', NAV_PREFIXES), false)
  assert.strictEqual(isNavDir('faq', NAV_PREFIXES), false)
})

console.log('\n=== scanDocs 端到端 ===')

test('扫描临时目录生成 nav + sidebar + seqMap', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memocast-blog-'))
  // 构造目录结构：
  //   tmp/
  //     nav.1-tech/
  //       README.md
  //       ch.1-fe/
  //         README.md
  //         01-react.md
  //         02-vue.md
  //         tpl/
  //           01-template.md
  //     nav.2-life/
  //       README.md
  //       01-diary.md
  function write(p, content = '# Title\n') {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content, 'utf8')
  }
  write(path.join(tmp, 'nav.1-tech/README.md'))
  write(path.join(tmp, 'nav.1-tech/ch.1-fe/README.md'))
  write(path.join(tmp, 'nav.1-tech/ch.1-fe/01-react.md'), '# React')
  write(path.join(tmp, 'nav.1-tech/ch.1-fe/02-vue.md'), '<!-- order: 5 -->\n# Vue')
  write(path.join(tmp, 'nav.1-tech/ch.1-fe/tpl/01-template.md'))
  write(path.join(tmp, 'nav.2-life/README.md'))
  write(path.join(tmp, 'nav.2-life/01-diary.md'), '# Diary')

  const result = scanDocs(tmp, {
    maxLevel: 5,
    navPrefixArr: NAV_PREFIXES
  })

  assert.ok(Array.isArray(result.nav), 'nav 应为数组')
  assert.strictEqual(result.nav.length, 2, `应有 2 个 nav 大项，实际 ${result.nav.length}`)

  // nav 大项 0: tech
  assert.ok(result.nav[0].text.includes('Tech') || result.nav[0].text.includes('tech'),
    `nav[0].text 应包含 Tech，实际: ${result.nav[0].text}`)
  assert.ok(Array.isArray(result.nav[0].items), 'nav[0] 应有 items')

  // sidebar keys
  const sidebarKeys = Object.keys(result.sidebar)
  assert.ok(sidebarKeys.includes('nav.1-tech/'), `sidebar 应包含 nav.1-tech/，实际 keys: ${sidebarKeys.join(',')}`)
  assert.ok(sidebarKeys.includes('nav.2-life/'), `sidebar 应包含 nav.2-life/`)
  assert.ok(sidebarKeys.includes('nav.1-tech/ch.1-fe/'), `sidebar 应包含子目录 nav.1-tech/ch.1-fe/`)

  // seqMap 应记录到 01-/02- 前缀
  assert.ok(result.seqMap['nav.1-tech/ch.1-fe/01-react'] === 1, `seqMap 应记录 01-react=1，实际: ${JSON.stringify(result.seqMap)}`)
  assert.ok(result.seqMap['nav.1-tech/ch.1-fe/02-vue'] === 2, `seqMap 应记录 02-vue=2`)

  // 清理
  fs.rmSync(tmp, { recursive: true, force: true })
})

console.log(`\n=== 结果 ===`)
console.log(`  通过: \x1b[32m${passed}\x1b[0m  失败: \x1b[31m${failed}\x1b[0m`)
process.exit(failed > 0 ? 1 : 0)