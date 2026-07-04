/**
 * 博客流水线串联器
 *
 * 一条命令完成：
 *   1) export-from-sqlite: 从 memocast.db 导出 _docs-export/
 *   2) stage-docs:          整理为 _docs/，写 seq-manifest.json
 *   3) build-sidebar:       生成 .vuepress/sidebar.json（短链版）
 *   4) gen-vuepress-config: 生成 .vuepress/config.js（按 BLOG_BASE）
 *
 * 用法：
 *   node scripts/blog/pipeline.js [--export-only|--stage-only|--sidebar-only|--config-only]
 *   yarn blog:build              # 全流程
 *   yarn blog:export             # 仅 export
 *   yarn blog:stage              # export + stage
 *   yarn blog:sidebar            # stage + sidebar
 *   yarn blog:config             # sidebar + config
 */

'use strict'

const path = require('path')

const { exportFromSqlite, parseArgs: exportArgs } = require('./export-from-sqlite')
const { stageDocs } = require('./stage-docs')
const { buildSidebar } = require('./build-sidebar')
const { main: genConfig } = require('./gen-vuepress-config')

const ROOT = path.resolve(__dirname, '..', '..')

function parseArgs(argv) {
  const args = {
    source: process.env.MEMOCAST_DB || '',
    outRoot: process.env.MEMOCAST_BLOG_OUT || path.join(ROOT, '_docs-export'),
    stageDir: process.env.MEMOCAST_STAGE_DIR || path.join(ROOT, '_docs'),
    base: process.env.BLOG_BASE || '/',
    sys: process.env.BLOG_SYS || '',
    dryRun: false,
    skipExport: false,
    skipStage: false,
    skipSidebar: false,
    skipConfig: false
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--source') args.source = argv[++i]
    else if (a === '--out') args.outRoot = argv[++i]
    else if (a === '--stage') args.stageDir = argv[++i]
    else if (a === '--base') args.base = argv[++i]
    else if (a === '--sys') args.sys = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--export-only') {
      args.skipStage = args.skipSidebar = args.skipConfig = true
    } else if (a === '--stage-only') {
      args.skipExport = args.skipSidebar = args.skipConfig = true
    } else if (a === '--sidebar-only') {
      args.skipExport = args.skipStage = args.skipConfig = true
    } else if (a === '--config-only') {
      args.skipExport = args.skipStage = args.skipSidebar = true
    } else if (a === '--help' || a === '-h') {
      console.log(`用法: node pipeline.js [options]

  --source <path>     memocast.db 路径（默认: %APPDATA%/coolma/memocast.db）
  --out <dir>         export 输出目录（默认: <repo>/_docs-export）
  --stage <dir>       stage 输出目录（默认: <repo>/_docs）
  --base <path>       BLOG_BASE 路径（默认: "/"）
  --sys <kb>          按 kb_guid 过滤
  --dry-run           仅打印 export 计划
  --export-only       只跑 export
  --stage-only        只跑 stage
  --sidebar-only      只跑 build-sidebar
  --config-only       只跑 gen-config`)
      process.exit(0)
    }
  }
  return args
}

function log(stage, msg) {
  console.log(`\n\x1b[36m[pipeline]\x1b[0m ${stage}: ${msg}`)
}

async function runPipeline(args) {
  args = args || parseArgs(process.argv)

  let exportResult = null
  let stageResult = null
  let sidebarResult = null
  let configResult = null

  if (!args.skipExport) {
    log('export', `source=${args.source || '(default)'}, out=${args.outRoot}`)
    exportResult = await exportFromSqlite({
      source: args.source || undefined,
      out: args.outRoot,
      dryRun: args.dryRun,
      sys: args.sys
    })
    if (args.dryRun) {
      console.log('[pipeline] --dry-run 模式，后续阶段跳过')
      return { export: exportResult }
    }
    if (!exportResult || exportResult.exported === 0) {
      console.log('[pipeline] 没有需要导出的笔记，提前结束')
      return { export: exportResult }
    }
  }

  if (!args.skipStage) {
    log('stage', `${args.outRoot} -> ${args.stageDir}`)
    stageResult = stageDocs(args.outRoot, args.stageDir)
  }

  if (!args.skipSidebar) {
    log('sidebar', `${args.stageDir}`)
    sidebarResult = buildSidebar({
      docs: args.stageDir,
      out: path.join(args.stageDir, '.vuepress', 'sidebar.json')
    })
  }

  if (!args.skipConfig) {
    log('config', `base=${args.base}`)
    process.env.MEMOCAST_STAGE_DIR = args.stageDir
    process.env.BLOG_BASE = args.base
    // 清缓存，避免 ENV 不被重新读取
    delete require.cache[require.resolve('./gen-vuepress-config')]
    const { main: genConfigFresh } = require('./gen-vuepress-config')
    configResult = genConfigFresh()
  }

  log('done', `output: ${args.stageDir}`)
  return { export: exportResult, stage: stageResult, sidebar: sidebarResult, config: configResult }
}

module.exports = { runPipeline, parseArgs }

if (require.main === module) {
  runPipeline().then(
    r => {
      console.log('\n[pipeline] 完成')
      console.log(JSON.stringify({
        exported: r.export && r.export.exported,
        files: r.stage && r.stage.mappings && Object.keys(r.stage.mappings.files || {}).length,
        sidebarKeys: r.sidebar && r.sidebar.payload && Object.keys(r.sidebar.payload.sidebar).length,
        base: r.config && r.config.base
      }, null, 2))
    },
    err => { console.error(err); process.exit(1) }
  )
}