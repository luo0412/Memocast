/**
 * 目录扫描与 nav / sidebar JSON 生成
 *
 * 设计目标：
 *   1) 与 E:\work-前端\note\_docs\.vuepress\utils\utils.js 行为对齐
 *      - 目录名前缀 `nav.` / `ch.` / `sec.` 决定其进 nav 还是 sidebar
 *      - `maxLevel` 控制 sidebar 嵌套深度
 *      - 导航目录只在子项无 README 时报错
 *   2) 输出纯 JSON 结构，供后续 shortlink 阶段二次转换
 *   3) 不依赖任何 markdown-it / glob / lodash，保持脚本轻量、可单测
 *
 * 约定：
 *   - 输入根目录下，所有 .md 文件默认都进 sidebar
 *   - README.md 作为目录的索引页（不直接出现在 sidebar 中，但参与 multiSide 派生）
 *   - front-matter 中 `order:` 字段（数字）作为排序的次级 key
 *   - 目录名以 `--` 结尾可携带参数（`--nc` 不可折叠、`--d2` 限制深度等）
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { extractSeq } = require('./hash-id')

const NAV_PREFIXES = ['nav', 'ch', 'sec']
const DEFAULT_EXCLUDE_DIRS = [
  '.vuepress', '.nodeppt', 'node_modules', '.git', '.idea', '.vscode',
  'static', 'public', 'appendix', 'dist-blog', '.quasar'
]

// 默认折叠的子目录命名约定（参考参考项目的 SUB_FOLDERS）
const DEFAULT_COLLAPSABLE_FOLDERS = [
  'tpl', 'tpl2', 'tpl3', 'tpl4', 'tpl5', 'tpl6',
  'rank2', 'rank3', 'rank4', 'rank5', 'rank6',
  'faq', 'misc',
  'coll', 'coll2', 'coll3', 'coll4', 'coll5', 'coll6',
  'bigv', 'bigv2', 'bigv3', 'bigv4',
  'bug', 'bugs', 'bugss', 'bugsss',
  'group', 'stack', 'ele', 'fn', 'able',
  'news', 'news2', 'news3',
  'cmpt', 'frame',
  'soft', 'soft2', 'soft3', 'soft4', 'soft5',
  'lib', 'lib2', 'lib3', 'lib4', 'lib5',
  'libs', 'libs2', 'libs3', 'libs4', 'libs5',
  'plat', 'platform',
  'diff', 'diff2', 'diff3', 'diff4', 'diff5', 'diff6',
  'case', 'case2', 'case3', 'case4', 'case5', 'case6',
  'demo', 'demo2', 'demo3',
  'code', 'code2', 'code3',
  'record', 'record2', 'record3',
  'tag', 'tag2', 'tag3',
  'old', 'bak', 'ext',
  'vhooks', 'mpa',
  'biz', 'bizpro',
  'plus', 'pro', 'promax', 'ultra',
  't0', 't1', 't2', 't3', 't4', 't5',
  'easy', 'med', 'hard'
]

/**
 * 解析目录名后缀参数：`xxx--nc,d2` → { collapsable: false, sidebarDepth: 2 }
 */
function parseSidebarParameters(dirname) {
  const idx = dirname.lastIndexOf('--')
  if (idx === -1) return {}
  const args = dirname.substring(idx + 2).split(',')
  const params = {}
  for (const arg of args) {
    if (arg === 'nc') {
      params.collapsable = false
    } else if (/^d\d+$/.test(arg)) {
      params.sidebarDepth = parseInt(arg.substring(1), 10)
    }
  }
  return params
}

/**
 * 把 `nav.1-foo` / `ch.2-bar` / `1-foo` 这种目录名转成展示名（去前缀、去序号、转 startCase）
 */
function getName(rawName, { navPrefixArr = NAV_PREFIXES } = {}) {
  let name = String(rawName || '')
  // 目录名里如果带 --xxx 参数，先剥离再处理
  const paramIdx = name.lastIndexOf('--')
  let params = {}
  if (paramIdx > -1) {
    params = parseSidebarParameters(name)
    name = name.substring(0, paramIdx)
  }
  // 去掉 nav./ch./sec. 前缀
  for (const prefix of navPrefixArr) {
    const re = new RegExp(`^${prefix}[.\\-_]`)
    name = name.replace(re, '')
  }
  // 去掉前面的多级序号 `1-2-3` `1-2.` `1.`
  name = name.replace(/^\d+[a-zA-Z]*\-\d+[a-zA-Z]*\-\d+[a-zA-Z]*[\.\-_]?/, '')
  name = name.replace(/^\d+[a-zA-Z]*\-\d+[a-zA-Z]*[\.\-_]?/, '')
  name = name.replace(/^\d+[a-zA-Z]*[\.\-_]?/, '')
  // startCase: 用空格切分，每个词首字母大写
  const titled = name
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  return titled || rawName
}

function isDirectory(p) {
  try {
    return fs.lstatSync(p).isDirectory()
  } catch (_e) {
    return false
  }
}

function readdirSafe(p) {
  try {
    return fs.readdirSync(p)
  } catch (_e) {
    return []
  }
}

/**
 * 递归读所有 .md，并提取 front-matter 中的 order 字段。
 * 简单实现：不引入 markdown-it-meta，只识别首行 `<!-- order: N -->` 或 YAML 顶层 `order: N`。
 */
function readMarkdownMeta(filePath) {
  let content = ''
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch (_e) {
    return { order: undefined }
  }
  // 1) HTML 注释形式
  const m1 = content.match(/<!--\s*order\s*[:=]\s*(\d+)\s*-->/i)
  if (m1) return { order: parseInt(m1[1], 10) }
  // 2) YAML 顶层
  const m2 = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (m2) {
    const orderLine = m2[1].split(/\r?\n/).find(line => /^order\s*[:=]/i.test(line))
    if (orderLine) {
      const num = orderLine.match(/(\d+)/)
      if (num) return { order: parseInt(num[1], 10) }
    }
  }
  return { order: undefined }
}

/**
 * 子目录排序 key：先看 seq-manifest，再看数字前缀，最后 localeCompare
 */
function compareSidebarEntries(a, b, seqManifest = {}) {
  const leftSeq = seqManifest[a]
  const rightSeq = seqManifest[b]
  if (leftSeq !== undefined && rightSeq !== undefined && leftSeq !== rightSeq) {
    return leftSeq - rightSeq
  }
  if (leftSeq !== undefined && rightSeq === undefined) return -1
  if (leftSeq === undefined && rightSeq !== undefined) return 1
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function getDirectories(baseDir, excludeDirs, seqManifest) {
  return readdirSafe(baseDir)
    .filter(name => !excludeDirs.includes(name))
    .filter(name => isDirectory(path.join(baseDir, name)))
    .sort((a, b) => compareSidebarEntries(a, b, seqManifest))
}

function hasReadme(dir) {
  return readdirSafe(dir).includes('README.md')
}

function isNavDir(name, navPrefixArr) {
  return navPrefixArr.some(prefix => {
    const re = new RegExp(`^${prefix}[\\d+|.\\-_]`)
    return re.test(name)
  })
}

/**
 * 取某个目录下所有 .md 文件，返回 [{ path, order }] 形态。
 * path 是相对 baseDir 的路径，去掉 .md 扩展名、去掉 README 后缀。
 */
function getChildren(baseDir, relativeDir, seqManifest) {
  const fullDir = relativeDir ? path.join(baseDir, relativeDir) : baseDir
  const files = readdirSafe(fullDir)
    .filter(name => name.endsWith('.md') && isDirectory(path.join(fullDir, name)) === false)
    .filter(name => name !== 'README.md')
    .map(name => {
      const fullPath = path.join(fullDir, name)
      const { order } = readMarkdownMeta(fullPath)
      const relPath = relativeDir ? `${relativeDir}/${name}` : name
      const noExt = relPath.slice(0, -3) // 去掉 .md
      return { path: noExt, order }
    })
  return files.sort((a, b) => {
    const ao = a.order === undefined ? Number.MAX_SAFE_INTEGER : a.order
    const bo = b.order === undefined ? Number.MAX_SAFE_INTEGER : b.order
    if (ao !== bo) return ao - bo
    return compareSidebarEntries(a.path, b.path, seqManifest)
  }).map(f => f.path)
}

/**
 * 生成单个目录的 sidebar（递归到 maxLevel）。
 * 返回 Array<string|object> —— 与 vuepress 兼容。
 */
function buildSidebar(baseDir, opts, seqManifest, relativeDir = '', currentLevel = 1) {
  const {
    maxLevel = 5,
    navPrefixArr = NAV_PREFIXES,
    excludeDirs = DEFAULT_EXCLUDE_DIRS,
    collapsableFolders = DEFAULT_COLLAPSABLE_FOLDERS,
    mixDirsAndFiles = true
  } = opts

  const files = getChildren(baseDir, relativeDir, seqManifest)
  const items = [...files]

  if (currentLevel <= maxLevel) {
    const dirs = getDirectories(
      path.join(baseDir, relativeDir || '.'),
      excludeDirs,
      seqManifest
    ).filter(name => !isNavDir(name, navPrefixArr))

    for (const subDir of dirs) {
      const children = buildSidebar(baseDir, opts, seqManifest,
        relativeDir ? `${relativeDir}/${subDir}` : subDir,
        currentLevel + 1
      )
      if (children.length === 0) continue
      const isCollapsable = collapsableFolders.includes(subDir) ||
        collapsableFolders.some(c => subDir.startsWith(c))
      const dirItem = {
        title: getName(subDir, { navPrefixArr }),
        ...parseSidebarParameters(subDir),
        collapsable: isCollapsable,
        children
      }
      // 简单策略：直接 push（不强行混合排序，留给 shortlink 阶段统一处理）
      items.push(dirItem)
    }
  }

  return items
}

/**
 * 生成 nav 树。只扫描 `nav.` 前缀的顶层目录。
 * 递归终止条件：当前目录下不存在任何 nav./ch./sec. 子目录 → 返回 { text, link }
 */
function buildNav(baseDir, opts, seqManifest, relativeDir = '', currentLevel = 1) {
  const {
    navPrefixArr = NAV_PREFIXES,
    excludeDirs = DEFAULT_EXCLUDE_DIRS,
    requireReadme = false
  } = opts

  const fullDir = path.join(baseDir, relativeDir || '.')
  const allDirs = getDirectories(fullDir, excludeDirs, seqManifest)
  const navDirs = allDirs.filter(name => isNavDir(name, navPrefixArr))

  if (currentLevel > 1 && navDirs.length === 0) {
    // 叶子：作为单个 nav 项
    if (requireReadme && !hasReadme(fullDir)) {
      throw new Error(`[scan-nav] README.md required at ${fullDir}`)
    }
    const link = (relativeDir || '') + '/'
    return {
      text: getName(path.basename(fullDir), { navPrefixArr }),
      link
    }
  }

  if (navDirs.length === 0) return null

  const items = navDirs
    .map(sub => buildNav(baseDir, opts, seqManifest,
      relativeDir ? `${relativeDir}/${sub}` : sub,
      currentLevel + 1))
    .filter(Boolean)

  // 把 nav 自身的 link 也派生出 sidebar，方便用户停留在分类根页面
  if (items.length === 0) return null

  // 所有层级都带 link，让 multiSide 在每一层都派生 sidebar
  const selfLink = (relativeDir || '') + '/'
  if (currentLevel === 1) {
    // 第一层是数组，但每个元素都带 link/items
    return items.map(it => ({ ...it, link: it.link || selfLink }))
  }
  return {
    text: getName(path.basename(fullDir), { navPrefixArr }),
    items,
    link: selfLink
  }
}

/**
 * 由 nav 派生每个导航项对应的 sidebar。
 * 支持的节点形态：
 *   - { text, link }                          → 生成 sidebar[link]
 *   - { text, items: [...] }                  → 递归 walk
 *   - { text, link, items: [...] }            → 生成 sidebar[link] 后递归 walk
 */
function multiSide(baseDir, nav, opts, seqManifest) {
  const out = {}
  function walk(items) {
    for (const item of items) {
      if (item.link) {
        out[item.link] = buildSidebar(path.join(baseDir, item.link), opts, seqManifest)
      }
      if (item.items) walk(item.items)
    }
  }
  if (Array.isArray(nav)) walk(nav)
  return out
}

/**
 * 顶层入口：扫根目录，返回 { nav, sidebar, seqMap }
 *
 * @param {string} docsRoot markdown 根目录（导出后的 _docs/）
 * @param {object} [opts]
 * @returns {{nav: Array, sidebar: Object, seqMap: Object}}
 */
function scanDocs(docsRoot, opts = {}) {
  const seqManifest = opts.seqManifest || {}
  const root = path.resolve(docsRoot)
  if (!fs.existsSync(root)) {
    throw new Error(`[scan-nav] docs root not found: ${root}`)
  }
  const nav = buildNav(root, opts, seqManifest) || []
  const sidebar = multiSide(root, nav, opts, seqManifest)
  // 把扫描过程中遇到的所有 .md 的原始 basename → seq 也写进 seqMap
  const seqMap = {}
  for (const seq of Object.keys(seqManifest)) {
    seqMap[seq] = seqManifest[seq]
  }
  // 兜底：用 extractSeq 推断
  walkForSeq(root, opts, (rel, basename) => {
    const seq = extractSeq(basename)
    if (seq !== null && seqMap[rel] === undefined) seqMap[rel] = seq
  })
  return { nav, sidebar, seqMap }
}

function walkForSeq(dir, opts, cb, relBase = '') {
  const {
    excludeDirs = DEFAULT_EXCLUDE_DIRS,
    navPrefixArr = NAV_PREFIXES
  } = opts
  const names = readdirSafe(dir)
  for (const name of names) {
    if (excludeDirs.includes(name)) continue
    const full = path.join(dir, name)
    const rel = relBase ? `${relBase}/${name}` : name
    if (isDirectory(full)) {
      walkForSeq(full, opts, cb, rel)
    } else if (name.endsWith('.md')) {
      const basenameNoExt = name.slice(0, -3)
      // rel 也去掉 .md，与 sidebar 的 path 表达保持一致
      const relNoExt = relBase ? `${relBase}/${basenameNoExt}` : basenameNoExt
      cb(relNoExt, basenameNoExt)
    }
  }
}

module.exports = {
  scanDocs,
  buildNav,
  buildSidebar,
  parseSidebarParameters,
  getName,
  extractSeq,
  isNavDir,
  NAV_PREFIXES,
  DEFAULT_COLLAPSABLE_FOLDERS,
  DEFAULT_EXCLUDE_DIRS
}