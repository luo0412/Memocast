/**
 * M3 自测：shortlink + stage-docs + build-sidebar 端到端
 *
 * 用法：node scripts/blog/__tests__/m3.test.js
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')

const { shortlink, rewriteTree, isExternalOrAsset } = require('../shortlink')
const { stageDocs, SEQ_FILENAME_REGEX } = require('../stage-docs')
const { buildSidebar, loadSeqManifest } = require('../build-sidebar')

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

console.log('\n=== shortlink 纯函数 ===')

test('短链生成确定性', () => {
  const a = shortlink('nav.1-tech/ch.1-fe/01-react', { seqMap: { 'nav.1-tech/ch.1-fe/01-react': 1 } })
  const b = shortlink('nav.1-tech/ch.1-fe/01-react', { seqMap: { 'nav.1-tech/ch.1-fe/01-react': 1 } })
  assert.strictEqual(a, b)
})

test('短链格式: 形如 /<id>.html', () => {
  const s = shortlink('nav.1-tech/ch.1-fe/01-react', { seqMap: { 'nav.1-tech/ch.1-fe/01-react': 1 } })
  assert.ok(/^\/[a-z0-9]+\.html$/.test(s), `短链格式异常: ${s}`)
})

test('短链生成带 seq 与不带 seq 一致', () => {
  // 因为喂入 hash 的 basename 已经剥掉 seq 前缀
  const a = shortlink('nav.1-x/foo', { seqMap: { 'nav.1-x/foo': 1 } })
  const b = shortlink('nav.1-x/01-foo', { seqMap: { 'nav.1-x/01-foo': 1 } })
  assert.strictEqual(a, b)
})

test('短链外部链接 / 资源链接透传', () => {
  assert.strictEqual(shortlink('https://github.com'), 'https://github.com')
  assert.strictEqual(shortlink('//cdn.example.com/a.png'), '//cdn.example.com/a.png')
  assert.strictEqual(shortlink('mailto:foo@bar.com'), 'mailto:foo@bar.com')
  assert.strictEqual(shortlink('/abs.png'), '/abs.png')
  assert.strictEqual(shortlink('foo.js'), 'foo.js')
})

test('目录结尾保留为 /<id>/', () => {
  const s = shortlink('nav.1-tech/', { seqMap: {} })
  assert.ok(s.endsWith('/'), `目录应保留 / 后缀，实际: ${s}`)
})

test('isExternalOrAsset 判定', () => {
  assert.strictEqual(isExternalOrAsset('https://x'), true)
  assert.strictEqual(isExternalOrAsset('a.png'), true)
  assert.strictEqual(isExternalOrAsset('foo/bar'), false)
  assert.strictEqual(isExternalOrAsset(null), false)
})

console.log('\n=== rewriteTree ===')

test('rewriteTree 递归改写 link/path', () => {
  const tree = {
    text: 'Foo',
    link: 'nav.1-tech/ch.1-foo',
    items: [
      { text: 'Bar', link: 'nav.1-tech/ch.1-foo/01-bar' },
      'nav.1-tech/ch.1-foo/02-baz'
    ]
  }
  const seqMap = {
    'nav.1-tech/ch.1-foo/01-bar': 1,
    'nav.1-tech/ch.1-foo/02-baz': 2
  }
  const out = rewriteTree(tree, { seqMap })
  assert.ok(out.link.startsWith('/') && out.link.endsWith('.html'), `link 应被改写: ${out.link}`)
  assert.strictEqual(out.text, 'Foo') // text 不变
  assert.ok(out.items[0].link.endsWith('.html'))
  assert.ok(typeof out.items[1] === 'string' && out.items[1].endsWith('.html'))
})

console.log('\n=== stageDocs 端到端 ===')

test('stageDocs 把 01- 前缀剥离并写入 manifest', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memocast-stage-'))
  // 构造 src：nav.1-技术/01-react.md
  const src = path.join(tmp, 'src')
  fs.mkdirSync(path.join(src, 'nav.1-技术'), { recursive: true })
  fs.writeFileSync(path.join(src, 'nav.1-技术/01-react.md'), '# React\n', 'utf8')
  fs.writeFileSync(path.join(src, 'nav.1-技术/02-vue.md'), '# Vue\n', 'utf8')

  const stageRoot = path.join(tmp, 'stage')
  const { stageRoot: out, mappings } = stageDocs(src, stageRoot)

  // 物理文件应当是 nav.技术/react.md（无 01- 前缀）
  assert.ok(fs.existsSync(path.join(out, 'nav.技术/react.md')), '应当存在 nav.技术/react.md')
  assert.ok(fs.existsSync(path.join(out, 'nav.技术/vue.md')))
  assert.ok(!fs.existsSync(path.join(out, 'nav.技术/01-react.md')), '不应当再有 01-react.md')

  // README 应当自动补
  assert.ok(fs.existsSync(path.join(out, 'nav.技术/README.md')), '应当自动生成 README.md')

  // manifest 应当记录
  assert.ok(mappings.files['nav.技术/react'] === 1, `mappings.files 应包含 react=1，实际: ${JSON.stringify(mappings.files)}`)
  assert.ok(mappings.dirs['nav.技术'] === 1, `mappings.dirs 应包含 nav.技术=1，实际: ${JSON.stringify(mappings.dirs)}`)
  assert.ok(mappings.originals['nav.技术/react'] === '01-react.md')
  assert.ok(mappings.dirOriginals['nav.技术'] === 'nav.1-技术')

  // 写盘 manifest
  assert.ok(fs.existsSync(path.join(out, 'seq-manifest.json')))
  fs.rmSync(tmp, { recursive: true, force: true })
})

console.log('\n=== buildSidebar 端到端 ===')

test('buildSidebar 产出含短链的 sidebar.json', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memocast-bs-'))
  // 构造一个最小 docs：
  //   nav.1-tech/
  //     README.md
  //     ch.1-fe/
  //       README.md
  //       react.md
  const stage = path.join(tmp, 'stage')
  fs.mkdirSync(path.join(stage, 'nav.1-tech/ch.1-fe'), { recursive: true })
  fs.writeFileSync(path.join(stage, 'nav.1-tech/README.md'), '# Tech\n')
  fs.writeFileSync(path.join(stage, 'nav.1-tech/ch.1-fe/README.md'), '# FE\n')
  fs.writeFileSync(path.join(stage, 'nav.1-tech/ch.1-fe/react.md'), '# React\n')
  // 手动跑 stageDocs 来生成 manifest
  const { stageDocs: runStage } = require('../stage-docs')
  runStage(stage, stage)

  const out = buildSidebar({
    docs: stage,
    out: path.join(stage, '.vuepress', 'sidebar.json')
  })
  assert.ok(out.outFile.endsWith('sidebar.json'))
  const payload = JSON.parse(fs.readFileSync(out.outFile, 'utf8'))
  assert.ok(Array.isArray(payload.nav), 'nav 应该是数组')
  assert.ok(payload.nav[0].items, 'nav[0] 应有 items')
  // sidebar 至少有一个键，且值的第一个 link 是 /<id>.html
  const sidebarKeys = Object.keys(payload.sidebar)
  assert.ok(sidebarKeys.length > 0, `sidebar 应至少有 1 个键，实际 0`)
  for (const k of sidebarKeys) {
    const arr = payload.sidebar[k]
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string') {
      assert.ok(arr[0].startsWith('/'), `sidebar[${k}][0] 应是短链: ${arr[0]}`)
      assert.ok(arr[0].endsWith('.html'), `sidebar[${k}][0] 应以 .html 结尾: ${arr[0]}`)
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true })
})

console.log(`\n=== 结果 ===`)
console.log(`  通过: \x1b[32m${passed}\x1b[0m  失败: \x1b[31m${failed}\x1b[0m`)
process.exit(failed > 0 ? 1 : 0)