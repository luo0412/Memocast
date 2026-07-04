/**
 * 本地 workflow 校验：
 *   1) YAML 三个文件可被正确解析
 *   2) 必要字段存在（on / jobs / steps）
 *   3) step 引用的 action 版本合法
 *   4) script 步骤里的 secrets 引用符合预期
 *   5) 与现有 blog 脚本的引用对应（pipeline.js / sidebar / config）
 *
 * 用法：node scripts/blog/__tests__/gh-workflow.test.js
 */

'use strict'

const fs = require('fs')
const path = require('path')

const WORKFLOWS_DIR = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows')
const SCRIPTS_DIR = path.resolve(__dirname, '..', '..')

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

function readYAML(name) {
  // 用项目内置的 yaml 包做严格解析
  const YAML = require('yaml')
  const p = path.join(WORKFLOWS_DIR, name)
  if (!fs.existsSync(p)) throw new Error(`workflow 文件缺失: ${p}`)
  const text = fs.readFileSync(p, 'utf8')
  let parsed
  try {
    parsed = YAML.parse(text)
  } catch (e) {
    throw new Error(`YAML 解析失败: ${e.message}`)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('YAML 顶层不是对象')
  }
  return { text, parsed }
}

const KNOWN_ACTIONS = {
  'actions/checkout': ['v2', 'v3', 'v4'],
  'actions/setup-node': ['v1', 'v2', 'v3', 'v4'],
  'actions/upload-artifact': ['v1', 'v2', 'v3', 'v4'],
  'actions/download-artifact': ['v1', 'v2', 'v3', 'v4'],
  'actions/github-script': ['v5', 'v6', 'v7'],
  'peaceiris/actions-gh-pages': ['v3', 'v4']
}

function assertHasAction(text, expected) {
  const re = new RegExp(`uses:\\s+${expected.replace(/[/.]/g, '\\$&')}@`)
  if (!re.test(text)) throw new Error(`缺少 action 引用: ${expected}`)
}

function assertStepUsesValidVersion(text, action, versions = KNOWN_ACTIONS[action]) {
  if (!versions) throw new Error(`未知 action: ${action}`)
  const re = new RegExp(`uses:\\s+${action.replace(/[/.]/g, '\\$&')}@(\\S+)`, 'g')
  const matches = [...text.matchAll(re)]
  if (matches.length === 0) {
    throw new Error(`未引用 action: ${action}`)
  }
  for (const m of matches) {
    const ver = m[1]
    if (!versions.includes(ver)) {
      throw new Error(`action ${action}@${ver} 不在已知版本列表 [${versions.join(', ')}] 中`)
    }
  }
}

console.log('\n=== 文件存在 + 顶层结构 ===')

test('blog-build.yml YAML 可解析且有 on/jobs', () => {
  const { parsed } = readYAML('blog-build.yml')
  if (!parsed.on) throw new Error('缺少 on: 顶层')
  if (!parsed.jobs) throw new Error('缺少 jobs: 顶层')
  if (parsed.name !== 'blog-build') throw new Error(`workflow name 应为 blog-build，实际: ${parsed.name}`)
  if (!parsed.jobs.build) throw new Error('缺少 build job')
})

test('三个 yml 头部含 init-ci 自动生成水印', () => {
  for (const f of ['blog-build.yml', 'blog-db-upload.yml', 'blog-preview.yml']) {
    const { text } = readYAML(f)
    if (!/init-ci/.test(text) && !/init-ci/.test(text)) {
      throw new Error(`${f} 缺 init-ci 水印 — 应由 scripts/blog/init-ci.js 自动生成`)
    }
  }
})

test('blog-db-upload.yml YAML 可解析且 workflow_dispatch', () => {
  const { parsed } = readYAML('blog-db-upload.yml')
  const on = parsed.on
  if (!on || !on.workflow_dispatch) throw new Error('应包含 workflow_dispatch 触发器')
})

test('blog-preview.yml YAML 可解析且 pull_request 触发', () => {
  const { parsed } = readYAML('blog-preview.yml')
  const on = parsed.on
  if (!on || !on.pull_request) throw new Error('应包含 pull_request 触发器')
  if (!parsed.jobs || !parsed.jobs.preview) throw new Error('缺少 preview job')
})

console.log('\n=== Action 版本合法 ===')

function collectActionRefs(text) {
  const re = /uses:\s+([^\s@]+)@([^\s]+)/g
  const out = {}
  let m
  while ((m = re.exec(text)) !== null) {
    out[m[1]] = m[2]
  }
  return out
}

for (const file of ['blog-build.yml', 'blog-preview.yml', 'blog-db-upload.yml']) {
  test(`${file} action 引用版本合法`, () => {
    const { text } = readYAML(file)
    const refs = collectActionRefs(text)
    for (const [action, version] of Object.entries(refs)) {
      const versions = KNOWN_ACTIONS[action]
      if (!versions) throw new Error(`未知 action: ${action}`)
      if (!versions.includes(version)) {
        throw new Error(`action ${action}@${version} 不在已知版本列表 [${versions.join(', ')}] 中`)
      }
    }
  })
}

console.log('\n=== 与 blog: 脚本对应 ===')

test('blog-build.yml 引用 yarn blog:sidebar / blog:config / blog:build', () => {
  const { text } = readYAML('blog-build.yml')
  if (!/yarn blog:sidebar/.test(text)) throw new Error('应调用 yarn blog:sidebar')
  if (!/yarn blog:config/.test(text)) throw new Error('应调用 yarn blog:config')
  if (!/yarn blog:build/.test(text)) throw new Error('应调用 yarn blog:build')
})

test('blog-preview.yml 引用 yarn blog:test', () => {
  const { text } = readYAML('blog-preview.yml')
  if (!/yarn blog:test/.test(text)) throw new Error('应调用 yarn blog:test')
  if (!/yarn blog:sidebar/.test(text)) throw new Error('应调用 yarn blog:sidebar')
  if (!/yarn blog:config/.test(text)) throw new Error('应调用 yarn blog:config')
})

console.log('\n=== 安全 / 最佳实践 ===')

test('blog-build.yml 含 concurrency 防重复部署', () => {
  const { text } = readYAML('blog-build.yml')
  if (!/concurrency:/m.test(text)) throw new Error('缺少 concurrency 配置')
  if (!/cancel-in-progress:\s+true/.test(text)) throw new Error('应启用 cancel-in-progress')
})

test('blog-build.yml 仅在非 PR 时部署', () => {
  const { text } = readYAML('blog-build.yml')
  if (!/github\.event_name\s*!=\s*'pull_request'/.test(text)) {
    throw new Error('部署条件应排除 pull_request')
  }
})

test('blog-build.yml peaceiris actions-gh-pages 推到 gh-pages 分支', () => {
  const { text } = readYAML('blog-build.yml')
  if (!/publish_branch:\s+gh-pages/.test(text)) {
    throw new Error('publish_branch 应为 gh-pages')
  }
})

test('blog-build.yml 工作目录引用正确', () => {
  const { text } = readYAML('blog-build.yml')
  if (!/working-directory:\s+\${{ github\.workspace }}/m.test(text)) {
    throw new Error('应设置 working-directory 为 ${{ github.workspace }}')
  }
})

test('blog-build.yml 包含失败诊断步骤', () => {
  const { text } = readYAML('blog-build.yml')
  if (!/if:\s+\${{ failure\(\) }}/m.test(text)) {
    throw new Error('应包含 failure() 诊断步骤')
  }
})

test('blog-build.yml 含 404.html 兼容 SPA fallback', () => {
  const { text } = readYAML('blog-build.yml')
  if (!/404\.html/.test(text)) {
    throw new Error('应包含 404.html 兜底')
  }
})

test('blog-build.yml 自身在 CI 内重新 init-ci（幂等保护）', () => {
  const { text } = readYAML('blog-build.yml')
  if (!/init-ci\.js\s+--target\s+ci/.test(text)) {
    throw new Error('CI 应在早期重新渲染 workflow，确保模板是权威')
  }
})

console.log('\n=== secrets 引用合法性 ===')

test('blog-build.yml 引用 MEMOCAST_DB_ARTIFACT_NAME / MEMOCAST_DB_BASE64', () => {
  const { text } = readYAML('blog-build.yml')
  if (!/secrets\.MEMOCAST_DB_ARTIFACT_NAME/.test(text)) {
    throw new Error('应支持 secrets.MEMOCAST_DB_ARTIFACT_NAME')
  }
  if (!/secrets\.MEMOCAST_DB_BASE64/.test(text)) {
    throw new Error('应支持 secrets.MEMOCAST_DB_BASE64')
  }
})

test('blog-db-upload.yml 引用 MEMOCAST_DB_BASE64', () => {
  const { text } = readYAML('blog-db-upload.yml')
  if (!/secrets\.MEMOCAST_DB_BASE64/.test(text)) {
    throw new Error('应引用 secrets.MEMOCAST_DB_BASE64')
  }
  // 不应内嵌长 base64
  if (/secrets\.MEMOCAST_DB_BASE64.*[A-Za-z0-9+/=]{200,}/.test(text)) {
    throw new Error('不应在 workflow 里硬编码长 base64 字符串')
  }
})

console.log('\n=== 结构深度校验 ===')

test('blog-build.yml build job 包含完整 deploy 链路', () => {
  const { parsed } = readYAML('blog-build.yml')
  const job = parsed.jobs.build
  if (!job) throw new Error('缺少 build job')
  const stepNames = (job.steps || []).map(s => s && s.name).filter(Boolean)
  const required = [
    'Checkout',
    'Setup Node 20',
    'Install dependencies',
    'VuePress build',
    'Deploy to gh-pages'
  ]
  for (const r of required) {
    if (!stepNames.includes(r)) {
      throw new Error(`缺少 step: ${r}`)
    }
  }
})

test('blog-build.yml deploy 步骤在 PR 时跳过', () => {
  const { parsed } = readYAML('blog-build.yml')
  const job = parsed.jobs.build
  const deployStep = (job.steps || []).find(s => s && s.name === 'Deploy to gh-pages')
  if (!deployStep) throw new Error('找不到 Deploy 步骤')
  const cond = deployStep.if || ''
  if (!/pull_request/.test(cond)) {
    throw new Error('Deploy 步骤应排除 pull_request 事件')
  }
})

test('blog-build.yml steps 顺序：checkout → install → db → build → deploy', () => {
  const { parsed } = readYAML('blog-build.yml')
  const job = parsed.jobs.build
  const order = (job.steps || []).map(s => (s && s.name) || '')
  const idx = (name) => order.findIndex(s => s.includes(name))
  if (idx('Checkout') >= idx('Install')) throw new Error('Checkout 应早于 Install')
  if (idx('Install') >= idx('memocast.db')) throw new Error('Install 应早于 db 准备')
  if (idx('db') >= idx('VuePress')) throw new Error('db 准备应早于 VuePress 构建')
  if (idx('VuePress') >= idx('Deploy')) throw new Error('VuePress 应早于 Deploy')
})

console.log('\n=== 与 package.json scripts 对应 ===')

test('package.json 包含所有被引用的 blog: 脚本', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(SCRIPTS_DIR, '..', 'package.json'), 'utf8'))
  const required = ['blog:sidebar', 'blog:config', 'blog:build', 'blog:test']
  for (const k of required) {
    if (!pkg.scripts[k]) throw new Error(`package.json 缺少 scripts.${k}`)
  }
})

console.log(`\n=== 结果 ===`)
console.log(`  通过: \x1b[32m${passed}\x1b[0m  失败: \x1b[31m${failed}\x1b[0m`)
process.exit(failed > 0 ? 1 : 0)