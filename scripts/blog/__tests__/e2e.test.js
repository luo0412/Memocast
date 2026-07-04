/**
 * 完整端到端 fixture：构造临时 memocast.db，跑完整 pipeline
 *
 * 用法：node scripts/blog/__tests__/e2e.test.js
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')
const initSqlJs = require('sql.js')

const ROOT = path.resolve(__dirname, '..', '..', '..')

let passed = 0
let failed = 0

function test(name, fn) {
  // 同步包装异步函数
  const result = fn()
  if (result && typeof result.then === 'function') {
    return result.then(
      () => { console.log(`  \x1b[32m\x1b[0m ${name}`); passed++ },
      err => { console.log(`  \x1b[31m\x1b[0m ${name}\n    ${err.message}`); failed++ }
    )
  } else {
    console.log(`  \x1b[32m\x1b[0m ${name}`)
    passed++
  }
}

async function buildFixtureDb() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(ROOT, 'node_modules', 'sql.js', 'dist', file)
  })
  const db = new SQL.Database()
  db.run(`CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    doc_guid TEXT,
    kb_guid TEXT,
    title TEXT,
    content TEXT,
    category TEXT,
    tags TEXT,
    data_created INTEGER,
    data_modified INTEGER,
    local_modified INTEGER
  )`)
  db.run(`CREATE TABLE tags (name TEXT)`)
  db.run(`CREATE TABLE local_categories (category TEXT)`)
  db.run(`INSERT INTO notes VALUES
    ('n1', 'g1', 'kb-main', 'Hello', '---\ntitle: Hello\npublished: true\norder: 1\n---\n# Hello\n\n这是第一篇博客。', '/My Notes/技术/', 'published', 1700000000, 1700000000, 1700000000),
    ('n2', 'g2', 'kb-main', 'World', '<!-- published: true -->\n<!-- order: 2 -->\n# World\n', '/My Notes/技术/', 'published', 1700000100, 1700000100, 1700000100),
    ('n3', 'g3', 'kb-main', 'Draft', '# Draft\n', '/My Notes/技术/', '', 1700000200, 1700000200, 1700000200),
    ('n4', 'g4', 'kb-main', 'Offline', '# Offline\n', '/My Notes/', '', 1700000300, 1700000300, 1700000300)
  `)
  db.run(`INSERT INTO tags VALUES ('published'), ('发布')`)
  db.run(`INSERT INTO local_categories VALUES ('/My Notes/'), ('/My Notes/技术/')`)
  return db
}

async function runE2E() {
  const db = await buildFixtureDb()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memocast-e2e-'))
  const dbFile = path.join(tmp, 'memocast.db')
  fs.writeFileSync(dbFile, Buffer.from(db.export()))

  // 1) export
  const { exportFromSqlite } = require('../export-from-sqlite')
  const outDir = path.join(tmp, '_docs-export')
  const r1 = await exportFromSqlite({ source: dbFile, out: outDir, sys: 'kb-main' })
  assert.strictEqual(r1.exported, 2, `应导出 2 篇 (n1, n2)，实际 ${r1.exported}`)
  assert.ok(fs.existsSync(path.join(outDir, 'nav.技术/01-Hello.md')))
  assert.ok(fs.existsSync(path.join(outDir, 'nav.技术/02-World.md')))
  assert.ok(!fs.existsSync(path.join(outDir, 'nav.技术/03-Draft.md')), '未 published 的笔记不应被导出')

  // 验证导出文件包含 permalink front-matter
  const helloContent = fs.readFileSync(path.join(outDir, 'nav.技术/01-Hello.md'), 'utf8')
  assert.ok(/^---\s*\n[\s\S]*?permalink:\s+\/[a-z0-9]+\.html/m.test(helloContent),
    '01-Hello.md 应包含 permalink: /<id>.html')
  // 从 helloContent 里抽出 permalink
  const helloPerm = helloContent.match(/permalink:\s+(\/\S+\.html)/)[1]
  assert.ok(helloPerm.length > 1, 'permalink 应非空')

  // README 也应有 permalink（目录）
  const readmeContent = fs.readFileSync(path.join(outDir, 'nav.技术/README.md'), 'utf8')
  assert.ok(/permalink:\s+\/[a-z0-9]+\//m.test(readmeContent),
    '目录 README 应包含 permalink: /<id>/')

  // 验证：export 的 permalink 应与 sidebar.json 阶段算的一致
  const { shortlink } = require('../shortlink')
  const sidebarHello = shortlink('nav.技术/01-Hello')
  assert.strictEqual(helloPerm, sidebarHello,
    `导出 permalink ${helloPerm} 与 sidebar 算 ${sidebarHello} 不一致`)

  // 2) stage
  const { stageDocs } = require('../stage-docs')
  const stageDir = path.join(tmp, '_docs')
  stageDocs(outDir, stageDir)
  assert.ok(fs.existsSync(path.join(stageDir, 'nav.技术/Hello.md')))
  assert.ok(fs.existsSync(path.join(stageDir, 'nav.技术/World.md')))
  assert.ok(fs.existsSync(path.join(stageDir, 'nav.技术/README.md')), '应自动补 README')
  assert.ok(fs.existsSync(path.join(stageDir, 'seq-manifest.json')))

  // 3) sidebar
  const { buildSidebar } = require('../build-sidebar')
  const sidebarFile = path.join(stageDir, '.vuepress', 'sidebar.json')
  buildSidebar({ docs: stageDir, out: sidebarFile })
  const sidebarJson = JSON.parse(fs.readFileSync(sidebarFile, 'utf8'))
  assert.ok(sidebarJson.nav.length >= 1)
  const allSidebarValues = Object.values(sidebarJson.sidebar).flat()
  for (const item of allSidebarValues) {
    if (typeof item === 'string') {
      assert.ok(item.startsWith('/'), `sidebar 项应为短链: ${item}`)
      assert.ok(item.endsWith('.html') || item.endsWith('/'), `sidebar 项应以 .html 或 / 结尾: ${item}`)
    }
  }

  // 4) config
  process.env.MEMOCAST_STAGE_DIR = stageDir
  process.env.BLOG_BASE = '/e2e-blog/'
  delete require.cache[require.resolve('../gen-vuepress-config')]
  const { main: genConfig } = require('../gen-vuepress-config')
  const cfg = genConfig()
  assert.strictEqual(cfg.base, '/e2e-blog/')
  const configJs = fs.readFileSync(cfg.out, 'utf8')
  assert.ok(configJs.includes('"/e2e-blog/"'))

  // 5) 增量：同目录第二次 export
  const r1c = await exportFromSqlite({ source: dbFile, out: outDir, sys: 'kb-main' })
  assert.strictEqual(r1c.exported, 0, `同目录第二次应全部跳过，实际 exported=${r1c.exported}`)
  assert.ok(r1c.skipped >= 2, `skipped 应 >= 2，实际 ${r1c.skipped}`)
  assert.ok(fs.existsSync(path.join(outDir, '.vuepress', '.blog-build-manifest.json')))

  // 6) 修改一篇笔记的内容后，incremental 只导出变更的那一篇
  db.run(`UPDATE notes SET content = '<!-- published: true -->\n<!-- order: 2 -->\n# World Modified\n' WHERE id = 'n2'`)
  fs.writeFileSync(dbFile, Buffer.from(db.export()))
  const r1d = await exportFromSqlite({ source: dbFile, out: outDir, sys: 'kb-main' })
  assert.strictEqual(r1d.exported, 1, `修改 1 篇后应只导出 1 篇，实际 ${r1d.exported}`)

  fs.rmSync(tmp, { recursive: true, force: true })
  delete process.env.MEMOCAST_STAGE_DIR
  delete process.env.BLOG_BASE
}

;(async () => {
  console.log('\n=== E2E: memocast.db → vuepress _docs/ ===\n')
  await test('完整 pipeline：从临时 db 跑 export → stage → sidebar → config', runE2E)
  console.log(`\n=== 结果 ===`)
  console.log(`  通过: \x1b[32m${passed}\x1b[0m  失败: \x1b[31m${failed}\x1b[0m`)
  process.exit(failed > 0 ? 1 : 0)
})()