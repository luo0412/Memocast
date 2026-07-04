/**
 * build-sidebar.js —— 串联 M1 scan + shortlink 二次转换 + 落盘 sidebar.json
 *
 * 用法：
 *   node scripts/blog/build-sidebar.js [--docs <dir>] [--out <file>]
 *
 * 输入：stage-docs 输出的目录（含 seq-manifest.json）
 * 输出：sidebar.json（包含 nav / sidebar / seqMap / shortlinks 后的版本）
 */

'use strict'

const fs = require('fs')
const path = require('path')

const { scanDocs } = require('./scan-nav')
const { rewriteTree } = require('./shortlink')

function parseArgs(argv) {
  const args = {
    docs: process.env.MEMOCAST_STAGE_DIR || path.join(process.cwd(), '_docs'),
    out: process.env.MEMOCAST_SIDEBAR_OUT || ''
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--docs') args.docs = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log('用法: node build-sidebar.js [--docs <dir>] [--out <file>]')
      process.exit(0)
    }
  }
  return args
}

function loadSeqManifest(docsRoot) {
  const p = path.join(docsRoot, 'seq-manifest.json')
  if (!fs.existsSync(p)) return { files: {}, dirs: {} }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (_e) {
    return { files: {}, dirs: {} }
  }
}

function buildSidebar(args) {
  args = args || parseArgs(process.argv)
  const docsRoot = path.resolve(args.docs)
  if (!fs.existsSync(docsRoot)) {
    throw new Error(`[build-sidebar] docs 根目录不存在: ${docsRoot}`)
  }
  const seqManifest = loadSeqManifest(docsRoot)
  const seqMap = { ...(seqManifest.files || {}), ...(seqManifest.dirs || {}) }
  // 1) 原始 nav / sidebar
  const raw = scanDocs(docsRoot, { seqManifest: seqMap })
  // 2) 短链改写
  const navShort = rewriteTree(raw.nav, { seqMap })
  const sidebarShort = rewriteTree(raw.sidebar, { seqMap })
  // 3) 落盘
  const outFile = args.out
    ? path.resolve(args.out)
    : path.join(docsRoot, '.vuepress', 'sidebar.json')
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    nav: navShort,
    sidebar: sidebarShort,
    seqMap
  }
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`[build-sidebar] 输出: ${outFile}`)
  console.log(`[build-sidebar] nav 项数: ${Array.isArray(raw.nav) ? raw.nav.length : 0}, sidebar 路由数: ${Object.keys(raw.sidebar).length}`)
  return { outFile, payload }
}

module.exports = { buildSidebar, loadSeqManifest }

if (require.main === module) {
  try {
    buildSidebar()
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}