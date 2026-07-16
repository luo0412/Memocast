// _temp/blog/blog-config-writer.js
// 完整重写 §5-§8 + §11.3 runSmokeTest。所有路径均限定为本次传入的 blogDir。
// 受 §10.1 约束：写入磁盘的 JS 文件里只用 `/`，统一在加载侧处理 win 分隔符。
'use strict'

const fs = require('fs')
const fse = require('fs-extra')
const path = require('path')

// ============================================================
// §5.2 / §6 / §7 / §8 模板源码常量
// 写入磁盘后由 Node 直接 require；模板字符串里只允许出现
//   - `/` (磁盘字面 1 char)
//   - `\\` (磁盘 2 char，目标 js 加载后是 1 字面 `\`，与 §10.1 对齐)
// ============================================================

const SIDEBAR_BUILDER_SRC = `
const fs = require('fs')
const path = require('path')

const VP_DIR   = path.join(__dirname, '..')
const IDMAP    = path.join(VP_DIR, 'id-mappings.json')
const SEQ      = path.join(VP_DIR, 'seq-manifest.json')
const SHORTMAP = path.join(VP_DIR, 'shortlink-map.json')
const OUT      = path.join(VP_DIR, 'sidebar.json')

function readJson (p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch (_) { return fb } }

// 把 category 字符串清洗成 frontend 用的"分类标题"。
// 输入 "技术/前端" → "技术/前端";空或纯空白 → "未分类"。
function normalizeCategory (rawCategory) {
  if (!rawCategory || typeof rawCategory !== 'string') return '未分类'
  const t = rawCategory.replace(/\\\\/g, '/').trim().replace(/^\\/+|\\/+$/g, '')
  return t || '未分类'
}

// 把扁平 items 按 category 聚合成二维数组形态,供 vuepress sidebar 使用:
//   { '/': [ { title, collapsable, children }, ... ] }
// '/ ' 前缀对应 permalink=/<id>.html 的页面路由。
// 这样渲染时 sidebar 会按 category 自动分块,且同 category 内按 seq 排序。
function buildSidebar () {
  const idMap = readJson(IDMAP, { mappings: [] })
  const seq   = readJson(SEQ, {})
  const items = (idMap.mappings || []).map(m => ({
    title: m.title || m.id,
    path: m.shortUrl || m.defaultUrl,
    permalink: m.shortUrl || m.defaultUrl,
    seq: seq[m.id] || 0,
    category: m.category || ''
  }))
  items.sort((a, b) => (a.seq - b.seq) || a.title.localeCompare(b.title))

  // 按 category 分组,稳定顺序(按出现次序: 先出现的分类先排)
  const groupMap = new Map()
  const groupOrder = []
  for (const it of items) {
    const cat = normalizeCategory(it.category)
    if (!groupMap.has(cat)) {
      groupMap.set(cat, [])
      groupOrder.push(cat)
    }
    groupMap.get(cat).push({ title: it.title, path: it.path })
  }

  const groups = groupOrder.map(cat => ({
    title: cat,
    collapsable: true,
    children: groupMap.get(cat)
  }))

  // vuepress 1.x 默认主题: sidebar 顶层 key '/' 对应 permalink=/<id>.html 的全部页面
  const sidebar = { '/': groups }

  fs.writeFileSync(OUT, JSON.stringify(sidebar, null, 2), 'utf-8')
  console.log('[sidebar-builder] wrote', items.length, 'entries in', groups.length, 'groups ->', OUT)
  return sidebar
}

if (require.main === module) buildSidebar()
module.exports = { buildSidebar }
`.trim() + '\n'

const NAV_BUILDER_SRC = `
const fs = require('fs')
const path = require('path')

const VP_DIR = path.join(__dirname, '..')
const IDMAP  = path.join(VP_DIR, 'id-mappings.json')
const SHORT  = path.join(VP_DIR, 'shortlink-map.json')
const OUT    = path.join(VP_DIR, 'nav.json')

function readJson (p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch (_) { return fb } }

function buildNav () {
  const idMap = readJson(IDMAP, { mappings: [] })
  const items = (idMap.mappings || []).map(m => ({
    title: m.title, link: m.shortUrl || m.defaultUrl, category: m.category || ''
  }))
  const byCategory = new Map()
  for (const it of items) {
    const arr = byCategory.get(it.category) || []
    arr.push({ text: it.title, link: it.link })
    byCategory.set(it.category, arr)
  }
  const nav = []
  for (const [cat, arr] of byCategory.entries()) {
    if (!cat) {
      nav.push({ text: '文章', items: arr })
    } else {
      const node = { text: cat }
      if (arr.length > 0) node.link = arr[0].link
      node.items = arr
      nav.push(node)
    }
  }
  if (nav.length === 0 || !nav.some(n => n && n.link)) {
    nav.unshift({ text: '首页', link: '/' })
  }
  fs.writeFileSync(OUT, JSON.stringify(nav, null, 2), 'utf-8')
  console.log('[nav-builder] wrote', nav.length, 'groups ->', OUT)
  return nav
}

if (require.main === module) buildNav()
module.exports = { buildNav }
`.trim() + '\n'

const VERIFY_PATHS_SRC = `
const fs = require('fs')
const path = require('path')

const VP_DIR    = path.join(__dirname, '..')
const BLOG_DIR  = path.join(VP_DIR, '..')
const POSTS_DIR = path.join(BLOG_DIR, '_posts')
const DIST_DIR  = path.join(VP_DIR, 'dist')
const SIDEBAR   = path.join(VP_DIR, 'sidebar.json')
const NAV       = path.join(VP_DIR, 'nav.json')
const IDMAP     = path.join(VP_DIR, 'id-mappings.json')

function readJson (p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch (_) { return fb } }

function normalizeUrl (p) {
  return String(p || '').replace(/\\\\/g, '/').split('#')[0].split('?')[0]
}

// 递归扫描 sidebar / nav 的所有 string 叶子,收集看起来像 URL/MD 的字符串
// 这里必须既看 key 也看 value: 文档原版只扫 key 会漏掉 sidebar 里的 {path:"/x.html"} value
function collectUrlLike (node, out) {
  out = out || []
  if (node == null) return out
  if (typeof node === 'string') {
    if (node.startsWith('/') || /\\.html$/.test(node) || /\\.md$/.test(node)) out.push(node)
    return out
  }
  if (Array.isArray(node)) {
    for (const it of node) collectUrlLike(it, out)
    return out
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      collectUrlLike(k, out)
      collectUrlLike(v, out)
    }
  }
  return out
}

function main () {
  const sidebar = readJson(SIDEBAR, null)
  const nav     = readJson(NAV, null)
  const idMap   = readJson(IDMAP, { mappings: [] })

  const byId    = new Map()
  const byShort = new Map()
  const byFullP = new Map()
  for (const m of idMap.mappings || []) {
    if (m.id) byId.set(m.id, m)
    if (m.shortUrl) byShort.set(m.shortUrl, m)
    if (m.fullPath) byFullP.set(m.fullPath, m)
  }

  const all = []
  if (sidebar) collectUrlLike(sidebar, all)
  if (nav)     collectUrlLike(nav, all)

  const seen = new Set()
  const unresolved = []
  let total = 0, resolved = 0

  for (const raw of all) {
    const p = normalizeUrl(raw)
    if (!p || seen.has(p)) continue
    seen.add(p)
    // 容器键 '_posts/' 收集进来后会被 normalize 成 '_posts/' 不以 / 开头,自然不入栈;
    // 这里再保险一次: 含 '_posts' 的字符串视为容器,跳过
    if (p.indexOf('_posts') !== -1) continue
    if (p.startsWith('#') || /^https?:\\/\\//i.test(p) || p.startsWith('//')) continue
    if (p === '/' || p === '/index.html' || p === '/README.html') continue
    total++

    // §10.2: 命中 id 短链后必须 fs.existsSync 对应 .md 文件
    const idMatch = p.match(/^\\/([a-z0-9]{6,})\\.html$/i)
    if (idMatch) {
      const id = idMatch[1]
      const cand = path.join(POSTS_DIR, id + '.md')
      if (fs.existsSync(cand)) { resolved++; continue }
    }
    // 全路径 key (如 '技术/前端/序章')
    const fullKey = p.replace(/^\\//, '')
    if (byFullP.has(fullKey)) {
      const cand = path.join(POSTS_DIR, fullKey + '.md')
      if (fs.existsSync(cand)) { resolved++; continue }
    }
    // 兜底: basename.md 是否真实存在
    const baseMatch = p.match(/\\/([^\\/]+?)(?:\\.html|\\.md)?$/)
    if (baseMatch) {
      const cand = path.join(POSTS_DIR, baseMatch[1] + '.md')
      if (fs.existsSync(cand)) { resolved++; continue }
    }
    // dist 兜底
    const distFile = path.join(DIST_DIR, p.replace(/^\\//, ''))
    if (fs.existsSync(distFile) || fs.existsSync(distFile + '.html')) {
      resolved++; continue
    }
    unresolved.push(p)
  }

  console.log('[verify-paths] total=' + total + ', resolved=' + resolved + ', unresolved=' + unresolved.length)
  if (unresolved.length > 0) {
    console.error('[verify-paths] unresolved paths:')
    for (const p of unresolved) console.error('  -', p)
    throw new Error('verify-paths found ' + unresolved.length + ' unresolved links - abort')
  }
  return { total, resolved, unresolved }
}

if (require.main === module) {
  try { main() } catch (e) { console.error(e.message || e); process.exit(1) }
}
module.exports = { main }
`.trim() + '\n'

// ============================================================
// 写入工具
// ============================================================

async function writeBlogUtilities (blogDir) {
  const utilsDir = path.join(blogDir, '.vuepress', 'utils')
  await fse.ensureDir(utilsDir)
  await fse.writeFile(path.join(utilsDir, 'sidebar-builder.js'), SIDEBAR_BUILDER_SRC, 'utf-8')
  await fse.writeFile(path.join(utilsDir, 'nav-builder.js'),    NAV_BUILDER_SRC,    'utf-8')
  await fse.writeFile(path.join(utilsDir, 'verify-paths.js'),   VERIFY_PATHS_SRC,   'utf-8')
  return utilsDir
}

/**
 * 读取已存在 config.js 中的 base —— 不引入 AST 解析,走静态文本扫描。
 * 与主进程 blog-deploy-handler.js 的 readBaseFromConfigFile 同形态。
 */
function readBaseFromConfigFile (configPath) {
  if (!fse.pathExistsSync(configPath)) return ''
  try {
    const src = fse.readFileSync(configPath, 'utf-8')
    const m = src.match(/base\s*:\s*(['"`])([^'"`]*)\1/)
    return m ? m[2] : ''
  } catch (_) {
    return ''
  }
}

/**
 * 把用户输入的 base 字符串规范化成 vuepress 期望的形态。
 * 与 api.js / blog-deploy-handler 的 normalizeBase 同形态。
 *
 *   ''         → ''
 *   './'       → './'
 *   './foo'    → './foo/'
 *   '/foo'     → '/foo/'
 *   '/foo/'    → '/foo/'
 *   '/'        → '/'
 */
function normalizeBase (raw) {
  if (!raw || typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed === './') return './'
  const quoted = trimmed.match(/^(['"`])(.*)\1$/)
  const v = quoted ? quoted[2] : trimmed
  if (v.startsWith('/')) {
    const collapsed = '/' + v.replace(/^\/+/, '').replace(/\/+$/, '')
    if (collapsed === '/') return '/'
    return collapsed + '/'
  }
  if (v.startsWith('./') || v.startsWith('../')) {
    return v.endsWith('/') ? v : v + '/'
  }
  return v
}

/**
 * 替换（或插入）config.js 里的 `base` 字段——覆盖语义。
 * 与 blog-deploy-handler.js 的 replaceBaseInConfig 同形态。
 */
async function replaceBaseInConfig (configPath, quotedBase, rawBaseForLog) {
  const src = fse.readFileSync(configPath, 'utf-8')
  const inner = quotedBase.slice(1, -1).replace(/\\'/g, "'")
  // 整段替换 `base: 'x'` → `base: 'new', // memocast: base=...
  // 这里必须重新生成尾部的 `,`,因为原 `,` 不在第一组捕获里,会落到注释后导致语法错。
  const replaced = src.replace(
    /(\bbase\s*:\s*)(['"`])([^'"`]*)\2(\s*,)?/,
    (_m, head, quote, _old, trailingComma) => {
      const tail = trailingComma || ','
      return `${head}${quote}${inner}${quote}${tail} // memocast: base=${rawBaseForLog}`
    }
  )
  if (replaced !== src) {
    await fse.writeFile(configPath, replaced, 'utf-8')
    return { mode: 'replaced' }
  }
  const marker = 'module.exports = {'
  const idx = src.indexOf(marker)
  if (idx >= 0) {
    const insertAt = idx + marker.length
    const out = src.slice(0, insertAt) + `\n  base: ${quotedBase}, // memocast: base=${rawBaseForLog}\n` + src.slice(insertAt)
    await fse.writeFile(configPath, out, 'utf-8')
    return { mode: 'inserted' }
  }
  await fse.writeFile(configPath, src + `\nmodule.exports.base = ${quotedBase} // memocast: base=${rawBaseForLog}\n`, 'utf-8')
  return { mode: 'appended' }
}

/**
 * 写/合并 .vuepress/config.js —— "弹框传了 base 就强制覆盖"。
 *
 * 与主进程 blog-deploy-handler.js 的 ensureBlogConfig 行为对齐。
 *
 *   A. opts.base 非空 → 必须生效：
 *      - 不管现存 config.js 里 base 是 './' 还是别的,都用 opts.base 替换
 *      - 已存在的 config.js 中其它字段不破坏
 *   B. opts.base 缺失或为空：
 *      - config.js 不存在 → 默认模板,base 写 './'
 *      - 已存在 → 完全保留(用户手工编辑的 config.js 不被触碰)
 *
 * @param {string} blogDir
 * @param {string} theme 'default' | 'vdoing' | 'hope' | 'reco'
 * @param {object} [opts]
 * @param {string} [opts.title]
 * @param {string} [opts.description]
 * @param {string} [opts.base] 用户在弹框里输入的 base；空串视为"不强制"
 */
async function writeVuepressConfig (blogDir, theme = 'default', opts = {}) {
  const vpDir = path.join(blogDir, '.vuepress')
  await fse.ensureDir(vpDir)
  const configPath = path.join(vpDir, 'config.js')
  const rawBase = normalizeBase(opts.base)
  const quotedBase = rawBase
    ? ( /^['"`].*['"`]$/.test(rawBase)
        ? rawBase
        : `'${rawBase.replace(/'/g, "\\'")}'` )
    : ''

  // —— A. 弹框显式传了 base → 必须生效 ——
  if (quotedBase) {
    if (fse.pathExistsSync(configPath)) {
      const result = await replaceBaseInConfig(configPath, quotedBase, rawBase)
      const written = readBaseFromConfigFile(configPath)
      console.log('[blog-config-writer] base 由弹框覆盖 -> %s (mode=%s)', written, result.mode)
      return {
        action: 'base-overwritten',
        path: configPath,
        baseInjected: rawBase,
        baseMode: result.mode
      }
    }
    // config.js 还没有 → 落到下面 theme 分支创建
  }

  if (fse.pathExistsSync(configPath)) {
    // 弹框未传 base + 已存在 → 完全保留
    if (!quotedBase) {
      console.log('[blog-config-writer] config.js 已存在且弹框未传 base,保留原文件')
      return { action: 'kept', path: configPath }
    }
    // 兜底：弹框传了 base 但走到这里 → 再覆盖一次
    const result = await replaceBaseInConfig(configPath, quotedBase, rawBase)
    return {
      action: 'base-overwritten',
      path: configPath,
      baseInjected: rawBase,
      baseMode: result.mode
    }
  }

  // —— theme 分支：hope / reco / vdoing / default ——
  const baseLine = `${quotedBase || "'./'"}${quotedBase ? ` // memocast: base=${rawBase}` : ''}`

  if (theme === 'hope') {
    // vuepress-theme-hope@1.x 用 config()
    const content =
`const { config } = require('vuepress-theme-hope')

module.exports = config({
  base: ${baseLine},
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: '/logo.png' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  themeConfig: {
    logo: '/logo.png',
    darkMode: true,
    navbar: require('./utils/nav-builder.js').buildNav(),
    sidebar: require('./utils/sidebar-builder.js').buildSidebar()
  },
  markdown: { lineNumbers: true }
})
`
    await fse.writeFile(configPath, content, 'utf-8')
    return { action: 'created', path: configPath, baseInjected: quotedBase ? rawBase : undefined }
  }

  if (theme === 'reco') {
    // vuepress-theme-reco@1.x 直接用 theme: 'reco'
    const content =
`module.exports = {
  base: ${baseLine},
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: '/logo.png' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  theme: 'reco',
  themeConfig: {
    logo: '/logo.png',
    darkmode: 'auto',
    author: 'Author',
    navbar: require('./utils/nav-builder.js').buildNav(),
    sidebar: require('./utils/sidebar-builder.js').buildSidebar()
  },
  markdown: { lineNumbers: true }
}
`
    await fse.writeFile(configPath, content, 'utf-8')
    return { action: 'created', path: configPath, baseInjected: quotedBase ? rawBase : undefined }
  }

  if (theme === 'vdoing') {
    // vuepress-theme-vdoing@1.x 直接用 theme: 'vdoing'
    const content =
`module.exports = {
  base: ${baseLine},
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  theme: 'vdoing',
  markdown: { lineNumbers: true }
}
`
    await fse.writeFile(configPath, content, 'utf-8')
    return { action: 'created', path: configPath, baseInjected: quotedBase ? rawBase : undefined }
  }

  // default
  const content =
`const path = require('path')
const { buildSidebar } = require(path.join(__dirname, 'utils', 'sidebar-builder.js'))
const { buildNav }     = require(path.join(__dirname, 'utils', 'nav-builder.js'))

module.exports = {
  title: ${JSON.stringify(opts.title || 'My Blog')},
  description: ${JSON.stringify(opts.description || '')},
  base: ${baseLine},
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: './favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  themeConfig: {
    nav: buildNav(),
    sidebar: buildSidebar(),
    sidebarDepth: 2,
    lastUpdated: true
  }
}
`
  await fse.writeFile(configPath, content, 'utf-8')
  return {
    action: 'created',
    path: configPath,
    baseInjected: quotedBase ? rawBase : undefined
  }
}

// ============================================================
// §11.3 runSmokeTest
// ============================================================

async function runSmokeTest ({ workdir, positive = true } = {}) {
  const os = require('os')
  const root = workdir || path.join(os.tmpdir(), `memocast-blog-smoke-${Date.now()}`)
  await fse.ensureDir(root)
  await fse.ensureDir(path.join(root, '_posts'))

  const items = [
    { id: 'aaaa1111bbbb2222', fileName: '序章.md',    title: '序章',    category: '技术/前端', seq: 1 },
    { id: 'cccc3333dddd4444', fileName: 'Hello.md',  title: 'Hello',  category: '技术/前端', seq: 2 },
    { id: 'eeee5555ffff6666', fileName: 'note-c.md', title: 'Note C', category: '随笔',      seq: 3 },
    { id: 'gggg7777hhhh8888', fileName: 'note-d.md', title: 'Note D', category: '',          seq: 4 }
  ]

  const idMap = { mappings: [], stats: { total: items.length, conflicts: [] } }
  const seq = {}
  let n = 1
  for (const it of items) {
    if (positive) {
      const md = `---\ntitle: ${it.title}\ndate: 2026-07-05\npermalink: /${it.id}.html\n---\n\n# ${it.title}\n`
      await fse.writeFile(path.join(root, '_posts', it.id + '.md'), md)
    }
    const baseNoExt = it.fileName.replace(/\.md$/, '')
    const fullPath = (it.category ? it.category + '/' : '') + baseNoExt
    idMap.mappings.push({
      id: it.id,
      fileName: it.fileName,
      fullPath,
      title: it.title,
      category: it.category,
      defaultUrl: `/${it.id}.html`,
      shortUrl:   `/${it.id}.html`,
      level: it.category ? 2 : 1
    })
    seq[it.id] = it.seq || n++
  }

  const vpDir = path.join(root, '.vuepress')
  await fse.ensureDir(vpDir)
  await fse.writeJson(path.join(vpDir, 'id-mappings.json'), idMap, { spaces: 2 })
  await fse.writeJson(path.join(vpDir, 'seq-manifest.json'), seq, { spaces: 2 })

  await writeBlogUtilities(root)
  await writeVuepressConfig(root, 'default', { title: 'Smoke Blog', description: 'memocast smoke' })

  const sidebarBuilder = require(path.join(vpDir, 'utils', 'sidebar-builder.js'))
  const navBuilder     = require(path.join(vpDir, 'utils', 'nav-builder.js'))
  const verify         = require(path.join(vpDir, 'utils', 'verify-paths.js'))

  const sidebar = sidebarBuilder.buildSidebar()
  const nav     = navBuilder.buildNav()
  let verifyRes
  try {
    verifyRes = verify.main()
  } catch (e) {
    verifyRes = { error: e.message || String(e) }
  }

  // frontmatter 一致性
  const fmErrors = []
  if (positive) {
    for (const it of items) {
      const fp = path.join(root, '_posts', it.id + '.md')
      const md = await fse.readFile(fp, 'utf-8')
      const m = md.match(/^---[\s\S]*?---/)
      if (!m) { fmErrors.push(`${it.id}.md: missing frontmatter`); continue }
      const re = new RegExp(`permalink:\\s*/${it.id}\\.html`)
      if (!re.test(m[0])) fmErrors.push(`${it.id}.md: permalink missing /${it.id}.html`)
    }
  }

  return {
    workdir: root,
    vpDir,
    sidebarPath: path.join(vpDir, 'sidebar.json'),
    navPath:     path.join(vpDir, 'nav.json'),
    sidebar,
    nav,
    verify: verifyRes,
    fmErrors,
    positive
  }
}

module.exports = {
  SIDEBAR_BUILDER_SRC,
  NAV_BUILDER_SRC,
  VERIFY_PATHS_SRC,
  writeBlogUtilities,
  writeVuepressConfig,
  runSmokeTest
}