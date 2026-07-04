/**
 * 生成 vuepress 1.x 的 .vuepress/config.js
 *
 * 用法：
 *   node scripts/blog/gen-vuepress-config.js [--docs <dir>] [--base <path>]
 *
 * 与 E:\work-前端\note\_docs\.vuepress\config.js 的双模切换对齐：
 *   - BLOG_BASE='/'   → base: '/'   （部署到根域名，例如 vercel.com/<project>）
 *   - BLOG_BASE='/memocast-blog/'   → base: '/memocast-blog/'  （子路径部署）
 *
 * 不使用任何模板引擎，直接字符串拼接生成 config.js 内容。
 * 这样产出的 config.js 可读、可 diff、可手动微调。
 */

'use strict'

const fs = require('fs')
const path = require('path')

function parseArgs(argv) {
  const args = {
    docs: process.env.MEMOCAST_STAGE_DIR || path.join(process.cwd(), '_docs'),
    base: process.env.BLOG_BASE || process.env.MEMOCAST_BASE || '/',
    out: ''
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--docs') args.docs = argv[++i]
    else if (a === '--base') args.base = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log('用法: node gen-vuepress-config.js [--docs <dir>] [--base <path>] [--out <file>]')
      process.exit(0)
    }
  }
  // 强制 base 以 / 开头、以 / 结尾
  if (!args.base.startsWith('/')) args.base = '/' + args.base
  if (args.base !== '/' && !args.base.endsWith('/')) args.base = args.base + '/'
  return args
}

/**
 * 加载 sidebar.json（由 build-sidebar.js 生成）。
 */
function loadSidebarJson(sidebarFile) {
  if (!fs.existsSync(sidebarFile)) {
    throw new Error(`[gen-config] sidebar.json 不存在: ${sidebarFile}\n先运行 build-sidebar.js`)
  }
  return JSON.parse(fs.readFileSync(sidebarFile, 'utf8'))
}

/**
 * 把 sidebar 对象 key 调整为相对 base 后的短链（base 不影响 sidebar key，运行时由 vuepress 处理）。
 *
 * 实际行为：vuepress 1.x 的 sidebar 字段直接用对象/数组结构，不做路径前缀处理。
 * 我们只保证生成的 nav 链接和 sidebar link 都已是绝对短链 '/<id>.html'，
 * base 由 vuepress 自己追加。
 */
function normalizeBase(base) {
  if (!base) return '/'
  if (base === '/') return '/'
  // 去掉尾部所有 /，再加一个
  return base.replace(/\/+$/, '') + '/'
}

/**
 * 生成 config.js 文本内容。
 */
function renderConfig({ base, nav, sidebar, title, description, themeConfig = {} }) {
  // 序列化时保证 JSON 稳定
  const navJson = JSON.stringify(nav, null, 2)
  const sidebarJson = JSON.stringify(sidebar, null, 2)
  const themeJson = JSON.stringify({
    sidebarDepth: 2,
    ...themeConfig
  }, null, 2)

  return `/*
 * 由 scripts/blog/gen-vuepress-config.js 自动生成，请勿手工修改。
 * 修改方式：调整 .env / BLOG_BASE 环境变量后重跑 yarn blog:config
 */
'use strict'

const base = ${JSON.stringify(base)}
const nav = ${navJson}
const sidebar = ${sidebarJson}
const themeConfig = ${themeJson}

module.exports = {
  base,
  title: ${JSON.stringify(title || 'Memocast Blog')},
  description: ${JSON.stringify(description || '由 Memocast 本地笔记导出的静态博客')},
  themeConfig: Object.assign({}, themeConfig, {
    nav,
    sidebar
  }),
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#1890ff' }]
  ]
}
`
}

function main() {
  const args = parseArgs(process.argv)
  const docsRoot = path.resolve(args.docs)
  const sidebarFile = path.join(docsRoot, '.vuepress', 'sidebar.json')
  const out = args.out
    ? path.resolve(args.out)
    : path.join(docsRoot, '.vuepress', 'config.js')

  const sb = loadSidebarJson(sidebarFile)
  const base = normalizeBase(args.base)

  // themeConfig 注入运行时 base，方便自定义组件在 .vuepress/components/* 里直接读取
  const themeConfig = {
    sidebarDepth: 2,
    // 暴露到 window.__BLOG_BASE__
    enhanceApp: [
      './enhanceApp.js'
    ]
  }

  const content = renderConfig({
    base,
    nav: sb.nav || [],
    sidebar: sb.sidebar || {},
    themeConfig
  })

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, content, 'utf8')
  console.log(`[gen-config] base: ${base}`)
  console.log(`[gen-config] 输出: ${out}`)

  // 同步生成 skeleton（enhanceApp.js / styles/index.styl）
  // 使用静默模式：避免重复打印 init-ci 的日志
  const { generateSkeleton } = require('./init-ci')
  const sk = generateSkeleton(docsRoot, {
    writePublicIndex: false,
    overwriteStyles: false
  })
  console.log(`[gen-config] skeleton: ${sk.written.length} 文件就绪`)

  return { out, base, skeleton: sk }
}

module.exports = {
  main,
  renderConfig,
  parseArgs,
  normalizeBase,
  // re-export 以便外部调用
  generateSkeleton: require('./init-ci').generateSkeleton
}

if (require.main === module) {
  try {
    main()
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}