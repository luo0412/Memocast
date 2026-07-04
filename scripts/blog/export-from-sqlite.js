/**
 * 从 Memocast 本地 SQLite 导出 markdown + 资源
 *
 * 用法：
 *   node scripts/blog/export-from-sqlite.js [--source <dbPath>] [--out <dir>] [--dry-run] [--sys <kb>]
 *
 * 默认数据库路径（Windows）：
 *   %APPDATA%/coolma/memocast.db
 * 默认输出目录：
 *   <repo>/_docs-export
 *
 * 关键规则：
 *   - 仅导出 `published` 标签（或 front-matter `published: true`）的笔记
 *   - `OFFLINE_ROOT_CATEGORY` (/My Notes/) 默认排除（除非显式 published）
 *   - 资源（base64 图片、引用图片）落到 out/.vuepress/public/assets/<note-id>/
 *   - markdown 中的 `data:image/...;base64,xxx` 自动解码落盘并替换为相对路径
 *
 * 不引新依赖，复用项目内的 sql.js。
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const initSqlJs = require('sql.js')

const incremental = require('./incremental')
const { shortlinkForExport } = require('./shortlink')

// 与项目 src/utils/constants.js 保持一致
const OFFLINE_ROOT_CATEGORY = '/My Notes/'

// 默认 db 路径：Windows 上 %APPDATA%/coolma/memocast.db，macOS 上 ~/Library/Application Support/coolma/memocast.db
function defaultDbPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'coolma', 'memocast.db')
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'coolma', 'memocast.db')
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(xdg, 'coolma', 'memocast.db')
}

function parseArgs(argv) {
  const args = {
    source: process.env.MEMOCAST_DB || defaultDbPath(),
    out: process.env.MEMOCAST_BLOG_OUT || path.join(process.cwd(), '_docs-export'),
    dryRun: false,
    sys: process.env.BLOG_SYS || ''
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--source') args.source = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--sys') args.sys = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log('用法: node export-from-sqlite.js [--source <db>] [--out <dir>] [--dry-run] [--sys <kb>]')
      process.exit(0)
    }
  }
  return args
}

/**
 * 把分类路径（如 /My Notes/技术/前端/）拆成段，每段做 sanitize。
 * 返回 ['技术', '前端']，不含根。
 */
function splitCategory(category) {
  if (!category || category === '/' || category === OFFLINE_ROOT_CATEGORY) return []
  return category
    .split('/')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => s !== 'My Notes')
}

/**
 * sanitize 单段目录名：去掉不安全字符、保留中英文与常见符号。
 */
function sanitizeSegment(seg) {
  return String(seg || '')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80) || 'untitled'
}

/**
 * 给出 nav./ch./sec. 前缀策略：
 *   第 1 段 -> nav.
 *   第 2 段 -> ch.
 *   第 3+ 段 -> sec.
 * 输入 segments 长度不限。
 */
function decorateSegments(segments) {
  const prefixes = ['nav', 'ch', 'sec']
  return segments.map((s, i) => `${prefixes[Math.min(i, prefixes.length - 1)]}.${sanitizeSegment(s)}`)
}

/**
 * 把分类路径转成输出目录（绝对路径）。
 */
function categoryToOutDir(outRoot, category) {
  const segments = splitCategory(category)
  if (segments.length === 0) return path.join(outRoot, '_misc')
  const decorated = decorateSegments(segments)
  return path.join(outRoot, ...decorated)
}

/**
 * 提取 front-matter 中 `published: true` 的标记。
 * 仅识别 YAML 顶层或 HTML 注释形式，不引入 yaml 解析库。
 */
function isPublishedFrontMatter(content) {
  if (!content) return false
  // HTML 注释形式：<!-- published: true -->
  const m1 = content.match(/<!--\s*published\s*[:=]\s*(true|1)\s*-->/i)
  if (m1) return true
  // YAML 顶层
  const m2 = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (m2) {
    const line = m2[1].split(/\r?\n/).find(l => /^published\s*[:=]/i.test(l))
    if (line && /\b(true|1)\b/i.test(line)) return true
  }
  return false
}

/**
 * 提取 front-matter 中的 `order: N`。
 */
function extractOrder(content) {
  if (!content) return undefined
  const m1 = content.match(/<!--\s*order\s*[:=]\s*(\d+)\s*-->/i)
  if (m1) return parseInt(m1[1], 10)
  const m2 = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (m2) {
    const line = m2[1].split(/\r?\n/).find(l => /^order\s*[:=]/i.test(l))
    if (line) {
      const num = line.match(/(\d+)/)
      if (num) return parseInt(num[1], 10)
    }
  }
  return undefined
}

/**
 * 提取 front-matter 中的 `title: ...`（供文件名兜底）。
 */
function extractTitle(content) {
  if (!content) return ''
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (m) {
    const line = m[1].split(/\r?\n/).find(l => /^title\s*[:=]/i.test(l))
    if (line) return line.split(/[:=]/)[1].trim().replace(/^['"]|['"]$/g, '')
  }
  return ''
}

/**
 * 把 markdown 中的 base64 图片解码并落盘，替换为相对路径。
 * 仅处理 `<noteId>/img-N.ext` 形式。
 *
 * @returns {string} 替换后的 markdown
 */
function inlineBase64Images(md, noteId, assetDir) {
  fs.mkdirSync(assetDir, { recursive: true })
  let counter = 0
  return md.replace(
    /!\[([^\]]*)\]\(data:image\/([a-zA-Z0-9+]+);base64,([^)]+)\)/g,
    (_match, alt, ext, b64) => {
      counter++
      const safeExt = ext === 'jpeg' ? 'jpg' : ext
      const filename = `img-${counter}.${safeExt}`
      const filePath = path.join(assetDir, filename)
      try {
        const buf = Buffer.from(b64, 'base64')
        fs.writeFileSync(filePath, buf)
      } catch (e) {
        console.warn(`[export] base64 写入失败 ${filePath}: ${e.message}`)
        return _match // 保留原样
      }
      return `![${alt || ''}](${path.posix.join('assets', noteId, filename)})`
    }
  )
}

/**
 * 规范化标题到文件名（保留中英文、空格转 -）。
 */
function titleToFilename(title, id, order) {
  let base = String(title || '').trim()
  if (!base) base = id
  base = base
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80)
  if (!base) base = id
  const prefix = order !== undefined ? `${String(order).padStart(2, '0')}-` : ''
  return `${prefix}${base}.md`
}

/**
 * 主入口。
 */
async function exportFromSqlite(args) {
  args = args || parseArgs(process.argv)
  console.log('[export] 数据库:', args.source)
  console.log('[export] 输出目录:', args.out)
  if (args.dryRun) console.log('[export] DRY-RUN: 仅打印计划')

  if (!fs.existsSync(args.source)) {
    throw new Error(`[export] 数据库不存在: ${args.source}\n提示：先启动一次 coolma 应用，让本地数据库初始化完成。`)
  }

  const SQL = await initSqlJs({
    locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
  })
  const fileBuffer = fs.readFileSync(args.source)
  const db = new SQL.Database(fileBuffer)

  // 1) 笔记
  let notesSql = `
    SELECT id, doc_guid, kb_guid, title, content, category, tags,
           data_created, data_modified, local_modified
    FROM notes
    WHERE content IS NOT NULL AND TRIM(content) != ''
  `
  const noteParams = []
  if (args.sys) {
    notesSql += ' AND kb_guid = ?'
    noteParams.push(args.sys)
  }
  const notesRows = db.exec(notesSql, noteParams)[0]
  const notes = notesRows
    ? notesRows.values.map(row => {
      const obj = {}
      notesRows.columns.forEach((c, i) => { obj[c] = row[i] })
      return obj
    })
    : []

  // 2) 标签（用于判断 published）
  const tagsRows = db.exec('SELECT name FROM tags')[0]
  const tagSet = new Set(tagsRows ? tagsRows.values.map(r => r[0]) : [])

  // 3) 分类（用于映射排序与展示名）
  const catRows = db.exec('SELECT category FROM local_categories')[0]
  const categorySet = new Set(catRows ? catRows.values.map(r => r[0]) : [])

  console.log(`[export] 笔记总数 ${notes.length}，分类数 ${categorySet.size}，标签数 ${tagSet.size}`)

  // 4) 过滤 published
  const published = notes.filter(n => {
    const tags = String(n.tags || '').split(',').map(s => s.trim()).filter(Boolean)
    const hasPublishedTag = tags.some(t => t.toLowerCase() === 'published' || t === '发布')
    const hasFmPublished = isPublishedFrontMatter(n.content)
    if (!hasPublishedTag && !hasFmPublished) return false
    // 排除离线根目录笔记（除非显式 published tag）
    if (n.category === OFFLINE_ROOT_CATEGORY && !hasPublishedTag) return false
    return true
  })

  console.log(`[export] 通过 published 过滤: ${published.length} 篇`)
  if (published.length === 0) {
    db.close()
    return { exported: 0, skipped: notes.length - published.length, plan: [] }
  }

  // 5) 按 category 分组
  const grouped = new Map()
  for (const n of published) {
    const key = n.category || OFFLINE_ROOT_CATEGORY
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(n)
  }

  // 6) 排序（按 data_created 升序，data_modified 兜底）
  for (const list of grouped.values()) {
    list.sort((a, b) => {
      const ta = a.data_created || a.local_modified || 0
      const tb = b.data_created || b.local_modified || 0
      return ta - tb
    })
  }

  if (args.dryRun) {
    const plan = []
    for (const [cat, list] of grouped) {
      plan.push({ category: cat, outDir: categoryToOutDir(args.out, cat), count: list.length })
    }
    console.log('[export] DRY-RUN 计划:')
    for (const p of plan) console.log(`  ${p.category} -> ${p.outDir} (${p.count} 篇)`)
    db.close()
    return { exported: 0, skipped: 0, plan }
  }

  fs.mkdirSync(args.out, { recursive: true })
  const assetsRoot = path.join(args.out, '.vuepress', 'public', 'assets')
  fs.mkdirSync(assetsRoot, { recursive: true })

  // 加载增量 manifest（让 export 阶段也具备"内容未变则不覆盖"的能力）
  // 注意：incremental manifest 落在 stage 目录里（更适合与最终产物一同发布/忽略），
  // 但 export 阶段也能用同一份（写到 out/.vuepress/.blog-build-manifest.json），
  // 这样 stageDocs 不需要重复 hash。
  const manifest = incremental.loadManifest(args.out)

  let exported = 0
  let skippedByCache = 0
  for (const [category, list] of grouped) {
    const outDir = categoryToOutDir(args.out, category)
    fs.mkdirSync(outDir, { recursive: true })
    list.forEach((n, idx) => {
      const noteId = String(n.id)
      const order = extractOrder(n.content) ?? (idx + 1)
      const fmTitle = extractTitle(n.content) || n.title || `untitled-${noteId}`
      const fileName = titleToFilename(fmTitle, noteId, order)
      const assetDir = path.join(assetsRoot, noteId)

      let content = n.content || ''
      // 1) 内嵌 base64 图片落地
      content = inlineBase64Images(content, noteId, assetDir)

      // 2) 重新生成 YAML front-matter（保留关键元信息）
      const tags = String(n.tags || '').split(',').map(s => s.trim()).filter(Boolean).join(', ')
      const date = new Date((n.data_created || n.local_modified || Date.now()) * (n.data_created > 1e12 ? 1 : 1000))
      // permalink：用 shortlink 算法算出稳定短链，与 build-sidebar
      // 阶段保持完全一致（同样的 basename+dir，同样的 cyrb53）。
      // 这样 vuepress build 时按 permalink 渲染，与 sidebar.json 的
      // 链接始终吻合，不会出现"链接打不开"的问题。
      const permalink = shortlinkForExport(fileName, outDir)
      const yaml = [
        '---',
        `title: "${fmTitle.replace(/"/g, '\\"')}"`,
        `order: ${order}`,
        `permalink: ${permalink}`,
        `note_id: ${noteId}`,
        tags ? `tags: [${tags.split(',').map(t => `"${t.trim()}"`).join(', ')}]` : null,
        `created: "${date.toISOString()}"`,
        '---',
        ''
      ].filter(Boolean).join('\n')

      // 如果已有 front-matter，先剥离再注入新的
      content = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
      const finalContent = yaml + '\n' + content.trim() + '\n'

      const relPath = path.relative(args.out, path.join(outDir, fileName)).replace(/\\/g, '/')
      const { written } = incremental.writeIncremental(args.out, manifest, relPath, finalContent)
      if (written) exported++
      else skippedByCache++
    })

    // 给目录补一份 README.md（带 permalink: /<id>/），让 vuepress 把目录当页面
    const dirPermalink = shortlinkForExport('', outDir, { isDir: true })
    const catName = path.basename(outDir)
    const readmePath = path.join(outDir, 'README.md')
    const readmeYaml = [
      '---',
      `title: "${catName.replace(/^[^.]+\./, '')}"`,
      `permalink: ${dirPermalink}`,
      '---',
      '',
      `# ${catName.replace(/^[^.]+\./, '')}`,
      ''
    ].join('\n')
    const relReadme = path.relative(args.out, readmePath).replace(/\\/g, '/')
    const { written: readmeWritten } = incremental.writeIncremental(args.out, manifest, relReadme, readmeYaml)
    if (readmeWritten) {
      // README 不计入 exported 计分，仅作为目录索引
    }
  }
  // 清理 stale
  const prune = incremental.pruneManifest(args.out, manifest)
  incremental.saveManifest(args.out, manifest)

  db.close()
  console.log(`[export] 完成，导出 ${exported} 篇（跳过 ${skippedByCache}，清理 ${prune.removed} stale）`)
  return { exported, skipped: notes.length - published.length + skippedByCache, plan: [] }
}

module.exports = {
  exportFromSqlite,
  parseArgs,
  defaultDbPath,
  categoryToOutDir,
  isPublishedFrontMatter,
  extractOrder,
  extractTitle,
  OFFLINE_ROOT_CATEGORY
}

// CLI 入口
if (require.main === module) {
  const args = parseArgs(process.argv)
  exportFromSqlite(args).then(
    res => console.log('[export] 结果:', JSON.stringify(res)),
    err => { console.error(err); process.exit(1) }
  )
}