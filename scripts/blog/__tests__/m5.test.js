/**
 * M5 自测：pipeline.js 端到端 + package.json 脚本存在
 *
 * 用法：node scripts/blog/__tests__/m5.test.js
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..', '..')

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

console.log('\n=== package.json scripts ===')

test('package.json 包含 blog:* 脚本', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const required = ['blog:export', 'blog:stage', 'blog:sidebar', 'blog:config', 'blog:build', 'blog:preview', 'blog:test']
  for (const k of required) {
    assert.ok(pkg.scripts[k], `缺少 scripts.${k}`)
    assert.ok(pkg.scripts[k].includes('scripts/blog'), `scripts.${k} 应引用 scripts/blog，实际: ${pkg.scripts[k]}`)
  }
})

console.log('\n=== pipeline 端到端（用真实 db 不便，跳过 export 阶段） ===')

test('pipeline sidebar-only + config-only 串联产出 sidebar.json + config.js', () => {
  // 用 fixture 跳过 export，直接调 stage + sidebar + config
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memocast-pipe-'))
  const stage = path.join(tmp, 'stage')

  // 先用 stageDocs 准备 fixture
  const { stageDocs } = require('../stage-docs')
  const src = path.join(tmp, 'src')
  fs.mkdirSync(path.join(src, 'nav.1-tech', 'ch.1-fe'), { recursive: true })
  fs.writeFileSync(path.join(src, 'nav.1-tech/README.md'), '# Tech\n')
  fs.writeFileSync(path.join(src, 'nav.1-tech/ch.1-fe/README.md'), '# FE\n')
  fs.writeFileSync(path.join(src, 'nav.1-tech/ch.1-fe/react.md'), '# React\n')
  stageDocs(src, stage)

  // 跑 sidebar
  const { buildSidebar } = require('../build-sidebar')
  buildSidebar({ docs: stage, out: path.join(stage, '.vuepress', 'sidebar.json') })

  // 跑 config
  process.env.MEMOCAST_STAGE_DIR = stage
  process.env.BLOG_BASE = '/pipe-blog/'
  delete require.cache[require.resolve('../gen-vuepress-config')]
  const { main: genConfig } = require('../gen-vuepress-config')
  const r = genConfig()
  assert.strictEqual(r.base, '/pipe-blog/')

  assert.ok(fs.existsSync(path.join(stage, '.vuepress', 'config.js')))
  const cfg = fs.readFileSync(path.join(stage, '.vuepress', 'config.js'), 'utf8')
  assert.ok(cfg.includes('"/pipe-blog/"'))

  fs.rmSync(tmp, { recursive: true, force: true })
  delete process.env.MEMOCAST_STAGE_DIR
  delete process.env.BLOG_BASE
})

test('CLI 调用 pipeline --sidebar-only 走通', () => {
  // 起一个完整 fixture，然后直接 spawn node scripts/blog/pipeline.js --sidebar-only
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memocast-pipe-cli-'))
  const stage = path.join(tmp, 'stage')

  // 先把 fixture 直接拷贝到 _docs（pipeline 会调 stageDocs，但用 --sidebar-only 时跳过）
  fs.mkdirSync(path.join(stage, 'nav.1-技术'), { recursive: true })
  fs.writeFileSync(path.join(stage, 'README.md'), '# Index\n')
  fs.writeFileSync(path.join(stage, 'nav.1-技术/README.md'), '# 技术\n')
  fs.writeFileSync(path.join(stage, 'nav.1-技术/01-react.md'), '# React\n')
  // 也跑一次 stage 让 manifest 落地
  const { stageDocs } = require('../stage-docs')
  const fakeSrc = path.join(tmp, 'fakesrc')
  fs.mkdirSync(fakeSrc, { recursive: true })
  fs.cpSync(stage, fakeSrc, { recursive: true })
  stageDocs(fakeSrc, stage)

  // 用 ENV 注入 stage 路径并 --sidebar-only
  const env = Object.assign({}, process.env, {
    MEMOCAST_STAGE_DIR: stage,
    BLOG_BASE: '/cli-blog/'
  })
  // 调用 CLI
  execFileSync('node', [
    path.join(ROOT, 'scripts', 'blog', 'pipeline.js'),
    '--sidebar-only'
  ], { env, stdio: 'pipe' })

  // 验证 sidebar.json
  assert.ok(fs.existsSync(path.join(stage, '.vuepress', 'sidebar.json')), 'sidebar.json 应生成')

  fs.rmSync(tmp, { recursive: true, force: true })
  delete process.env.MEMOCAST_STAGE_DIR
  delete process.env.BLOG_BASE
})

console.log(`\n=== 结果 ===`)
console.log(`  通过: \x1b[32m${passed}\x1b[0m  失败: \x1b[31m${failed}\x1b[0m`)
process.exit(failed > 0 ? 1 : 0)