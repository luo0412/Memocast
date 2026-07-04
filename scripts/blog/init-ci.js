/**
 * init-ci.js —— 一键生成 GitHub Actions workflow 文件 + vuepress skeleton
 *
 * 设计目标：
 *   1) yml 文件 **永远由 templates/*.template 渲染出来**，不让用户手写后被遗弃。
 *      即使 .github/workflows/*.yml 在 GitHub 上被修改，下次 yarn blog:init-ci
 *      也以模板为准重新覆盖（--no-overwrite 可阻止）。
 *   2) 同时支持**目标目录**：
 *        --target ci         → 仓库根 .github/workflows/        （开发态用）
 *        --target electron   → dist-electron/.github/workflows/  （打包后给用户）
 *        --target both       → 两个地方都生成
 *      这样用户在本地调好模板后，Electron 打包产物里也会自带最新的 yml。
 *   3) 同时也能生成 vuepress skeleton（enhanceApp.js / public/ / styles/），
 *      让 `yarn blog:build` 后的 _docs/ 是真正可 build 的 vuepress 项目。
 *
 * 用法：
 *   node scripts/blog/init-ci.js [--target ci|electron|both] [--no-overwrite] [--quiet]
 *
 * 配置（也可走环境变量）：
 *   MEMOCAST_CI_BRANCHES    空格分隔，默认 "master main"
 *   MEMOCAST_NODE_VERSION   默认 "20"
 *   MEMOCAST_VUEPRESS_VER   默认 "^1.9.10"
 *   MEMOCAST_BLOG_BASE      默认 "/"
 */

'use strict'

const fs = require('fs')
const path = require('path')
const yaml = require('yaml')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const TEMPLATE_DIR = path.resolve(__dirname, 'templates')
const WORKFLOW_TEMPLATES = path.join(TEMPLATE_DIR, 'workflows')

const DEFAULT_CONFIG = {
  branches: (process.env.MEMOCAST_CI_BRANCHES || 'master main').split(/\s+/).filter(Boolean),
  nodeVersion: process.env.MEMOCAST_NODE_VERSION || '20',
  vuepressVersion: process.env.MEMOCAST_VUEPRESS_VER || '^1.9.10',
  blogBase: process.env.MEMOCAST_BLOG_BASE || '/'
}

function parseArgs(argv) {
  const args = {
    target: 'both',
    overwrite: true,
    quiet: false,
    config: { ...DEFAULT_CONFIG }
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--target') args.target = argv[++i]
    else if (a === '--no-overwrite') args.overwrite = false
    else if (a === '--quiet' || a === '-q') args.quiet = true
    else if (a === '--branches') args.config.branches = argv[++i].split(',').map(s => s.trim())
    else if (a === '--node-version') args.config.nodeVersion = argv[++i]
    else if (a === '--vuepress-version') args.config.vuepressVersion = argv[++i]
    else if (a === '--blog-base') args.config.blogBase = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log([
        'usage: node scripts/blog/init-ci.js [options]',
        '',
        'options:',
        '  --target <ci|electron|both>   默认 both',
        '  --no-overwrite                存在时不覆盖',
        '  --quiet                       不打印细节',
        '  --branches <a,b,c>            触发分支列表',
        '  --node-version <ver>',
        '  --vuepress-version <ver>',
        '  --blog-base <path>'
      ].join('\n'))
      process.exit(0)
    }
  }
  return args
}

function renderTemplate(templateText, vars) {
  // 简单 {{KEY}} 替换；保留 YAML 缩进
  return templateText.replace(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`模板变量 ${key} 未提供`)
    return String(vars[key])
  })
}

function branchesToYamlList(branches) {
  // 第一个分支前面加 indent + "- "，其余接 "\n + indent + "- "
  // 模板里已有前缀缩进 "{{BRANCHES_LIST}}"，所以这里只给 "- master\n      - main"
  if (!branches.length) return ''
  const indent = '      '
  return branches
    .map(b => `${indent}- ${b}`)
    .join('\n') + '\n'
}

function templateVars(config) {
  return {
    NODE_VERSION: config.nodeVersion,
    VUEPRESS_VERSION: config.vuepressVersion,
    BLOG_BASE_DEFAULT: config.blogBase,
    BRANCHES_LIST: branchesToYamlList(config.branches)
  }
}

function listWorkflowTemplates() {
  if (!fs.existsSync(WORKFLOW_TEMPLATES)) return []
  return fs.readdirSync(WORKFLOW_TEMPLATES)
    .filter(n => n.endsWith('.yml.template'))
    .map(n => ({
      tmpl: path.join(WORKFLOW_TEMPLATES, n),
      outName: n.replace(/\.yml\.template$/, '.yml'),
      kind: n.replace(/\.yml\.template$/, '')
    }))
}

/**
 * 在目标目录生成 workflows。
 *
 * @param {string} targetDir .github 根目录绝对路径
 * @param {object} args parseArgs() 结果
 * @returns {{written: string[], skipped: string[], errors: string[]}}
 */
function generateInto(targetDir, args) {
  const wfDir = path.join(targetDir, 'workflows')
  fs.mkdirSync(wfDir, { recursive: true })
  const vars = templateVars(args.config)
  const written = []
  const skipped = []
  const errors = []
  for (const { tmpl, outName, kind } of listWorkflowTemplates()) {
    const out = path.join(wfDir, outName)
    let body
    try {
      body = renderTemplate(fs.readFileSync(tmpl, 'utf8'), vars)
      // 在写入前再次尝试解析模板渲染结果，保证无效 yml 不会被写入
      yaml.parse(body)
    } catch (e) {
      errors.push(`${outName}: ${e.message}`)
      continue
    }
    if (fs.existsSync(out) && !args.overwrite) {
      skipped.push(outName)
      continue
    }
    fs.writeFileSync(out, body, 'utf8')
    written.push(outName)
    if (!args.quiet) {
      const rel = path.relative(REPO_ROOT, out)
      console.log(`[init-ci] write ${rel}`)
    }
  }
  return { written, skipped, errors }
}

/**
 * 生成 vuepress skeleton（enhanceApp.js / public/ / styles/）。
 * 写到 _docs/.vuepress/ 下，复用 gen-vuepress-config 已经写好的 config.js。
 *
 * 这个函数被 init-ci 调用，也被 pipeline 调用。
 */
function generateSkeleton(stageDocsRoot, opts = {}) {
  const vuepressDir = path.join(stageDocsRoot, '.vuepress')
  const publicDir = path.join(vuepressDir, 'public')
  const stylesDir = path.join(vuepressDir, 'styles')
  fs.mkdirSync(publicDir, { recursive: true })
  fs.mkdirSync(stylesDir, { recursive: true })

  const written = []

  // enhanceApp.js — 注入 window.__BLOG_BASE__，给自定义组件用
  const enhanceAppPath = path.join(vuepressDir, 'enhanceApp.js')
  const enhanceAppBody = `// 由 scripts/blog/init-ci.js 生成；可手工改，下次 init-ci 会被覆盖。
'use strict'

export default ({ Vue, options, router, siteData }) => {
  // 把 vuepress 配置里的 base 暴露给客户端
  // 自定义组件 / GA / 第三方 SDK 需要拼完整 URL 时用 window.__BLOG_BASE__
  if (typeof window !== 'undefined') {
    window.__BLOG_BASE__ = siteData && siteData.base ? siteData.base : '/'
    window.__SITE_TITLE__ = siteData && siteData.title ? siteData.title : 'Memocast Blog'
  }

  // 自定义：vuepress 默认不处理 404（GitHub Pages SPA fallback），
  // 这里给 client-side router 加一个 catch-all：在 hashchange / popstate 时，
  // 检查路径命中短链；命中则跳转。
  // 不依赖任何外部包。
  if (typeof window !== 'undefined' && window.history && window.history.pushState) {
    const orig = window.history.pushState.bind(window.history)
    window.history.pushState = function (state, title, url) {
      orig(state, title, url)
      // 给所有 <a> 内部链接点击前，自动判断 base
      interceptInternalLinks()
    }
    document.addEventListener('DOMContentLoaded', interceptInternalLinks)
  }

  function interceptInternalLinks() {
    if (!document) return
    document.querySelectorAll('a[href]').forEach(el => {
      const href = el.getAttribute('href')
      if (!href) return
      if (/^(?:[a-z]+:|\/\/|#|mailto:|tel:)/i.test(href)) return
      // 给相对路径加 window.__BLOG_BASE__ 前缀
      if (href.startsWith('/')) return // 已经是绝对路径，vuepress 会自己处理
      el.setAttribute('data-mc-base', String(window.__BLOG_BASE__ || ''))
    })
  }
}
`
  fs.writeFileSync(enhanceAppPath, enhanceAppBody, 'utf8')
  written.push(path.relative(REPO_ROOT, enhanceAppPath))

  // public/index.html — 自定义 SPA shell（可选；默认不覆盖）
  if (opts.writePublicIndex !== false) {
    const indexPath = path.join(publicDir, 'index.html')
    const indexBody = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Memocast Blog</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; font-family: system-ui, sans-serif; }
    .mc-shell { display: flex; align-items: center; justify-content: center; height: 100%; color: #888; }
    .mc-shell code { font-family: ui-monospace, Menlo, Consolas, monospace; }
  </style>
</head>
<body>
  <div class="mc-shell">
    <div>
      <p><code>__BLOG_BASE__</code> shell — vuepress 启动后会替换此页。</p>
      <p>如果看到这个页面说明 vuepress 的 <code>enhanceApp</code> 出错或还没加载。</p>
    </div>
  </div>
  <script>
    // vuepress 1.x 在 index.html 加载后会 hydrate 真实 SPA 进来；
    // 这个 fallback 仅作最后兜底（GitHub Pages 上 404 重定向到此）。
  </script>
</body>
</html>
`
    fs.writeFileSync(indexPath, indexBody, 'utf8')
    written.push(path.relative(REPO_ROOT, indexPath))
  }

  // styles/index.styl — 中文回退字体 + 代码高亮主题
  const stylesPath = path.join(stylesDir, 'index.styl')
  const stylesBody = `// 由 scripts/blog/init-ci.js 生成。可手工改，下次 init-ci 不会覆盖
// （让用户对样式的修改不被自动脚本擦除）。要重置就删掉此文件再 init-ci。

// 中文回退字体（vuepress 1.x 默认主题对中文 fallback 很不理想）
$font-family = -apple-system, BlinkMacSystemFont, "PingFang SC",
  "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif

$codeFontFamily = "JetBrains Mono", "Source Code Pro", Consolas,
  "Courier New", monospace

// sidebar 缩进
.sidebar
  font-family $font-family

.content
  font-family $font-family

// 代码块中文注释不换行
pre, code
  font-family $codeFontFamily
`
  if (!fs.existsSync(stylesPath) || opts.overwriteStyles) {
    fs.writeFileSync(stylesPath, stylesBody, 'utf8')
    written.push(path.relative(REPO_ROOT, stylesPath))
  }

  return { written, skeletonDir: vuepressDir }
}

function main() {
  const args = parseArgs(process.argv)
  const summary = {
    ci: null,
    electron: null,
    skeleton: null
  }

  // 决定 target 列表
  const targets = []
  if (args.target === 'ci' || args.target === 'both') targets.push({
    name: 'ci',
    dir: path.join(REPO_ROOT, '.github')
  })
  if (args.target === 'electron' || args.target === 'both') {
    // Electron 打包后的资源目录
    const electronDir = path.join(REPO_ROOT, 'dist-electron')
    if (!fs.existsSync(electronDir)) {
      // 用户没构建过 electron，先跳过 electron target
      if (!args.quiet) {
        console.log('[init-ci] dist-electron/ 不存在，跳过 electron target')
        console.log('[init-ci] （提示：用 yarn build-publish 一次后会自动出现）')
      }
    } else {
      targets.push({ name: 'electron', dir: path.join(electronDir, '.github') })
    }
  }

  for (const t of targets) {
    if (!args.quiet) console.log(`\n=== target: ${t.name} (${path.relative(REPO_ROOT, t.dir)}) ===`)
    const r = generateInto(t.dir, args)
    summary[t.name] = r
    if (r.errors.length) {
      console.error(`[init-ci] ${t.name} 错误:`)
      for (const e of r.errors) console.error(`  - ${e}`)
    }
  }

  // 同时生成 skeleton（写一份到 _docs/.vuepress/）
  const stageDir = process.env.MEMOCAST_STAGE_DIR || path.join(REPO_ROOT, '_docs')
  if (fs.existsSync(stageDir)) {
    const sk = generateSkeleton(stageDir, {
      writePublicIndex: false,  // 用户可能有自己的 index.html
      overwriteStyles: false
    })
    summary.skeleton = sk
    if (!args.quiet) {
      console.log(`\n=== skeleton (${path.relative(REPO_ROOT, sk.skeletonDir)}) ===`)
      for (const f of sk.written) console.log(`  + ${f}`)
    }
  } else if (!args.quiet) {
    console.log(`[init-ci] ${stageDir} 不存在，跳过 skeleton 生成`)
    console.log('[init-ci] （提示：先跑 yarn blog:sidebar 建立目录）')
  }

  if (!args.quiet) {
    console.log('\n=== 汇总 ===')
    for (const [k, v] of Object.entries(summary)) {
      if (!v) continue
      console.log(`  ${k}: 写入 ${v.written.length}，跳过 ${v.skipped.length}，错误 ${v.errors.length}`)
    }
  }
  return summary
}

module.exports = {
  main,
  parseArgs,
  templateVars,
  branchesToYamlList,
  renderTemplate,
  generateInto,
  generateSkeleton,
  DEFAULT_CONFIG,
  REPO_ROOT,
  TEMPLATE_DIR,
  WORKFLOW_TEMPLATES
}

if (require.main === module) {
  try {
    main()
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}