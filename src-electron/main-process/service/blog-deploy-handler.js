/**
 * 博客打包部署 Handler
 * 策略：
 * 1. 检测 Node.js 是否安装，未安装则引导用户
 * 2. 优先使用博客目录自己的 node_modules
 * 3. 若博客目录无 node_modules，创建软链接指向 Memocast 内置 node_modules
 * 4. 生产模式使用 Electron 打包后的 node_modules
 */
const { spawn, exec } = require('child_process')
const path = require('path')
const fs = require('fs-extra')
const { BrowserWindow, app } = require('electron')
const { dispatchWorkflow } = require('./github-api')
const { uploadDirectory: sftpUpload, backupRemoteDir, testConnection: sftpTestConnection } = require('./sftp-service')
const blogConfigWriter = require('./blog-config-writer')

let currentProcess = null
let cancelled = false

// ==================== Node.js 检测 ====================

/**
 * 检测系统是否安装了 Node.js
 * 返回: { installed: boolean, version: string, path: string }
 */
async function checkNodeJSInstalled () {
  return new Promise((resolve) => {
    exec('node --version', { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ installed: false, version: '', path: '' })
      } else {
        exec('where node', { windowsHide: true }, (err, out) => {
          const nodePath = out ? out.trim().split('\n')[0] : ''
          resolve({
            installed: true,
            version: stdout.trim(),
            path: nodePath
          })
        })
      }
    })
  })
}

/**
 * 引导用户安装 Node.js
 * 返回安装指引信息
 */
function getNodeJSInstallGuide () {
  const isWin = process.platform === 'win32'
  if (isWin) {
    return {
      title: 'Node.js 未安装',
      message: '博客打包需要 Node.js 环境',
      steps: [
        '1. 访问 https://nodejs.org/zh-cn/ 下载 LTS 版本',
        '2. 安装时勾选 "Add to PATH"',
        '3. 重启 Memocast 后重试'
      ],
      url: 'https://nodejs.org/zh-cn/download/'
    }
  } else {
    return {
      title: 'Node.js Not Installed',
      message: 'Blog build requires Node.js runtime',
      steps: [
        '1. Install via: brew install node (macOS)',
        '2. Or: sudo apt install nodejs (Ubuntu/Debian)',
        '3. Restart Memocast and try again'
      ],
      url: 'https://nodejs.org/en/download/'
    }
  }
}

// ==================== node_modules 检查 ====================

/**
 * 检查博客目录的 node_modules 状态
 * 只检查是否存在，不创建任何软链接
 */
async function checkBlogNodeModules (blogDir) {
  const blogNodeModules = path.join(blogDir, 'node_modules')
  const exists = fs.existsSync(blogNodeModules)
  console.log('[BlogDeploy] Blog node_modules exists:', exists)
  return { exists }
}

function sendProgress (webContents, stage, message, percent) {
  webContents.send('blog-deploy-progress', { stage, message, percent })

  // 更新任务栏进度条
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) {
    win.setProgressBar(percent / 100)
  }
}

function clearProgressBar (webContents) {
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) {
    win.setProgressBar(-1) // -1 表示清除进度条
  }
}

function sendDone (webContents, success, outputDir, url, guide) {
  webContents.send('blog-deploy-done', { success, outputDir, url, guide })
  clearProgressBar(webContents)
}

/**
 * 从博客目录的 node_modules 获取 vuepress 二进制路径
 * 优先使用博客自己的 vuepress
 */
function getBuiltInVuepressBin (blogDir) {
  const isWin = process.platform === 'win32'

  console.log('[BlogDeploy] blogDir:', blogDir)

  // 只从博客目录的 node_modules 获取
  const blogNodeModules = path.join(blogDir, 'node_modules')

  if (fs.existsSync(blogNodeModules)) {
    // 尝试 vuepress/cli.js
    const vuepressCli = path.join(blogNodeModules, 'vuepress', 'cli.js')
    if (fs.existsSync(vuepressCli)) {
      console.log('[BlogDeploy] Found vuepress in blog node_modules:', vuepressCli)
      return { bin: vuepressCli }
    }

    // 尝试 .bin/vuepress
    const binPath = path.join(blogNodeModules, '.bin', isWin ? 'vuepress.cmd' : 'vuepress')
    if (fs.existsSync(binPath)) {
      console.log('[BlogDeploy] Found vuepress in blog .bin:', binPath)
      return { bin: binPath }
    }
  }

  console.error('[BlogDeploy] VuePress not found in blog node_modules!')
  return { bin: '' }
}

/**
 * 验证博客目录是否满足基本要求
 * 返回: { valid: boolean, errors: string[], warnings: string[] }
 */
function validateBlogDir (blogDir) {
  const errors = []
  const warnings = []

  // 检查目录是否存在
  if (!fs.existsSync(blogDir)) {
    errors.push(`博客目录不存在: ${blogDir}`)
    return { valid: false, errors, warnings }
  }

  // 检查 package.json（VuePress 必需）
  const pkgPath = path.join(blogDir, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    warnings.push(`缺少 package.json，将自动生成`)
  }

  // 检查必要的配置文件（至少要有 config.js 或 config.ts）
  const configDir = path.join(blogDir, '.vuepress')
  if (!fs.existsSync(configDir)) {
    warnings.push(`缺少 .vuepress 目录，将自动生成`)
  } else {
    const hasConfig = fs.existsSync(path.join(configDir, 'config.js')) ||
                      fs.existsSync(path.join(configDir, 'config.ts'))
    if (!hasConfig) {
      warnings.push(`缺少 .vuepress/config.js 配置文件，将自动生成`)
    }
  }

  // 检查 _posts 目录（可选，如果没有会自动创建）
  const postsDir = path.join(blogDir, '_posts')
  if (!fs.existsSync(postsDir)) {
    warnings.push(`缺少 _posts 目录，将自动创建`)
  } else {
    const mdFiles = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'))
    if (mdFiles.length === 0) {
      warnings.push(`_posts 目录中没有 MD 文件，请先导出笔记`)
    }
  }

  // 检查 node_modules（可选，如果没有会自动创建软链接）
  const nodeModulesDir = path.join(blogDir, 'node_modules')
  if (!fs.existsSync(nodeModulesDir)) {
    warnings.push(`缺少 node_modules，将自动创建软链接`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * 读取已存在的 .vuepress/config.js 中的 `base` 字段 —— 在不解析整个 JS 的前提下。
 *
 * 走静态文本扫描：找形如 `base: '/something'` 或 `base: "/something"` 或 `base: './'` 的赋值。
 * 命中不到时返回 ''（视为缺失）。
 *
 * 为什么不做 AST 解析：vuepress 1.x 的 config.js 内容由 memocast 生成，结构稳定；
 * 文本扫描覆盖所有合理写法，且不需要引入额外依赖。
 *
 * @param {string} configPath
 * @returns {string} 原始 base 字面量（含引号）；空串表示缺失
 */
function readBaseFromConfigFile (configPath) {
  if (!fs.existsSync(configPath)) return ''
  try {
    const src = fs.readFileSync(configPath, 'utf-8')
    // 同时匹配单引号/双引号/反引号；值里允许 / 与 ./ 等
    const m = src.match(/base\s*:\s*(['"`])([^'"`]*)\1/)
    return m ? m[2] : ''
  } catch (e) {
    console.warn('[BlogDeploy] readBaseFromConfigFile failed:', e.message)
    return ''
  }
}

/**
 * 判断已存在的 base 是不是 memocast 自己的"默认兜底"值。
 * 这些值是先前部署/模板默认写的，并不是用户手工编辑的产物——
 * 用户期望"我在弹框里改了 base = /xxx/，就该是 /xxx/"，
 * 而不是被静默忽略。
 */
function isMemocastDefaultBase (existingBase) {
  if (!existingBase) return false
  const v = String(existingBase).trim()
  return v === './' || v === '/' || v === ''
}

/**
 * 替换（或插入）config.js 里的 `base` 字段。
 *
 * 与 injectBaseIntoConfig 不同：这是"覆盖"语义。
 * 命中到已有 `base: 'x'` → 整段替换为新值
 * 命中到 `module.exports = {` 但缺 base → 在 `{` 后立即插入 `base: ...,`
 * 兜底 → 在文件末尾追加 `module.exports.base = ...`
 */
async function replaceBaseInConfig (configPath, quotedBase, rawBaseForLog) {
  const src = await fs.readFile(configPath, 'utf-8')
  const inner = quotedBase.slice(1, -1).replace(/\\'/g, "'")
  // 整段替换 `base: 'x'` → `base: 'new', // memocast: base=...
  // 必须显式把尾部的 `,` 拉回到注释前,否则它会落在 `//` 之后,
  // JS 解析器会把 `//` 当注释头,下一行的 key 就少了一个分隔符,触发 SyntaxError。
  const replaced = src.replace(
    /(\bbase\s*:\s*)(['"`])([^'"`]*)\2(\s*,)?/,
    (_m, head, quote, _old, trailingComma) => {
      const tail = trailingComma || ','
      return `${head}${quote}${inner}${quote}${tail} // memocast: base=${rawBaseForLog}`
    }
  )
  if (replaced !== src) {
    await fs.writeFile(configPath, replaced, 'utf-8')
    return { mode: 'replaced' }
  }
  // 缺 base + 有 module.exports = { → 在 { 后插入
  const marker = 'module.exports = {'
  const idx = src.indexOf(marker)
  if (idx >= 0) {
    const insertAt = idx + marker.length
    const out = src.slice(0, insertAt) + `\n  base: ${quotedBase}, // memocast: base=${rawBaseForLog}\n` + src.slice(insertAt)
    await fs.writeFile(configPath, out, 'utf-8')
    return { mode: 'inserted' }
  }
  // 兜底
  await fs.writeFile(configPath, src + `\nmodule.exports.base = ${quotedBase} // memocast: base=${rawBaseForLog}\n`, 'utf-8')
  return { mode: 'appended' }
}

/**
 * 把用户输入的 base 字符串规范化成 vuepress 期望的形态。
 *
 * 约定（与 vuepress 1.x base 文档一致: 绝对 base 必须以 / 开头和结尾）：
 *   ''        → ''           (空 = 不强制覆盖)
 *   './'      → './'         (相对路径保留原样,常见于 github-pages)
 *   './foo'   → './foo/'     (相对路径补尾斜杠)
 *   '/foo'    → '/foo/'      (绝对路径补尾斜杠)
 *   '/foo/'   → '/foo/'      (已是规范形式)
 *   '/'       → '/'          (整站根)
 *   '/foo///' → '/foo/'      (多余尾斜杠折叠)
 *
 * 不在这里加引号、不在这里转义单引号——那是 quoteBase 的职责。
 * 这个函数只在"裸字符串"层面规范化字面值。
 *
 * @param {unknown} base
 * @returns {string}
 */
function normalizeBase (base) {
  if (!base || typeof base !== 'string') return ''
  const trimmed = base.trim()
  if (!trimmed) return ''
  if (trimmed === './') return './'

  // 已经带引号 → 解开再规范化、再让 quoteBase 重新加引号
  const quotedMatch = trimmed.match(/^(['"`])(.*)\1$/)
  const raw = quotedMatch ? quotedMatch[2] : trimmed

  // 绝对路径: 折叠前导/尾随多余斜杠
  if (raw.startsWith('/')) {
    const collapsed = '/' + raw.replace(/^\/+/, '').replace(/\/+$/, '')
    if (collapsed === '/') return '/'           // 输入是 '/'
    return collapsed + '/'
  }
  // 相对路径(./ 或 ../ 等): 补尾斜杠
  if (raw.startsWith('./') || raw.startsWith('../')) {
    return raw.endsWith('/') ? raw : raw + '/'
  }
  // 既不是绝对也不是 ./ 开头的相对 → 视为非法,直接原样返回,
  // 不强行猜(避免给用户静默改成奇怪值)
  return raw
}

/**
 * 把 base 字符串包裹成可写入 JS 文件的字面量。
 * - 缺失/空值/纯空白 → 返回 ''
 * - 已经带引号 → 解开+规范化+重新加引号
 * - 内部单引号用反斜杠转义
 */
function quoteBase (base) {
  const normalized = normalizeBase(base)
  if (!normalized) return ''
  if (/^['"`].*['"`]$/.test(normalized)) return normalized
  return `'${normalized.replace(/'/g, "\\'")}'`
}

/**
 * 生成必要的博客配置文件
 *
 * 关键策略（防止 config.js 每次被强行覆盖 + 让 base 注入真生效）：
 *
 *   A. 弹框传入了 base（opts.base 非空）：
 *      - 这是用户的最新意图 → **必须** 反映到 config.js
 *      - 不管现存 config.js 里 base 是 './'、'/foo/' 还是别的,都用 opts.base 替换
 *      - 已存在的 config.js 中其它字段(title/head/themeConfig 等)绝不破坏
 *      - 通过 replaceBaseInConfig 实现覆盖(已有 base 整段替换、缺失则在 { 后插入)
 *
 *   B. 弹框**没**传 base：
 *      - config.js 不存在 → 默认模板,base 写 './'
 *      - 已存在 → 完全保留原文件(包含原 base)
 *      - 此时用户手工编辑过的 config.js 不被触碰
 *
 * 注释同步：替换/插入时附加 `// memocast: base=<值>`,便于用户在编辑器里看到是谁改的。
 *
 * @param {string} blogDir
 * @param {string} theme 'default' | 'vdoing'
 * @param {object} [opts]
 * @param {string} [opts.base] 用户在弹框里输入的 base；空串视为"不强制"
 * @returns {Promise<{action: 'kept'|'created'|'base-overwritten'|'base-injected', path: string, baseInjected?: string, baseMode?: string}>}
 */
async function ensureBlogConfig (blogDir, theme = 'default', opts = {}) {
  const configDir = path.join(blogDir, '.vuepress')
  const postsDir = path.join(blogDir, '_posts')
  const rawBase = (opts.base && typeof opts.base === 'string') ? opts.base.trim() : ''
  const baseInput = quoteBase(rawBase)

  // 创建必要的目录
  await fs.ensureDir(configDir)
  await fs.ensureDir(postsDir)

  // 创建 package.json
  const pkgPath = path.join(blogDir, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    await fs.writeFile(pkgPath, JSON.stringify(buildBlogPackageJson(theme), null, 2))
  }

  const configPath = path.join(configDir, 'config.js')

  // —— A. 弹框显式传了 base → 必须生效(覆盖既有或首次写入)——
  if (baseInput) {
    if (fs.existsSync(configPath)) {
      const result = await replaceBaseInConfig(configPath, baseInput, rawBase)
      const written = readBaseFromConfigFile(configPath) // 重新读取一次确认
      console.log('[BlogDeploy] base 由弹框覆盖 -> %s (mode=%s)', written, result.mode)
      return {
        action: 'base-overwritten',
        path: configPath,
        baseInjected: rawBase,
        baseMode: result.mode
      }
    }
    // config.js 还没有 → 落到下面 default/vdoing 创建分支,模板里会用到 baseInput
  }

  // —— B. vdoing 主题 ——
  if (theme === 'vdoing') {
    if (fs.existsSync(configPath)) {
      // 弹框未传 base + 已存在 → 保留原文件
      return { action: 'kept', path: configPath }
    }
    const vdoingConfigContent = `// vdoing 主题配置
// vuepress-theme-vdoing@1.x 直接使用 theme: 'vdoing'

module.exports = {
  base: ${baseInput || "'./'"},${baseInput ? ` // memocast: base=${rawBase}` : ''}
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: './favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  theme: 'vdoing',
  markdown: { lineNumbers: true }
}
`
    await fs.writeFile(configPath, vdoingConfigContent)
    console.log('[BlogDeploy] Generated vdoing theme config.js (base=%s)', baseInput ? rawBase : './')
    return {
      action: 'created',
      path: configPath,
      baseInjected: baseInput ? rawBase : undefined
    }
  }

  // —— C. Hope 主题 (vuepress-themeHope, vuepress 1.x) ——
  if (theme === 'hope') {
    if (fs.existsSync(configPath)) {
      return { action: 'kept', path: configPath }
    }
    const hopeConfigContent = `// VuePress Theme Hope 配置
const { config } = require('vuepress-theme-hope')

module.exports = config({
  base: ${baseInput || "'./'"},${baseInput ? ` // memocast: base=${rawBase}` : ''}
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: './favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  themeConfig: {
    logo: './logo.png',
    darkMode: true,
    socialLinks: { github: 'https://github.com' },
    navbar: require('./utils/nav-builder.js').buildNav(),
    sidebar: require('./utils/sidebar-builder.js').buildSidebar()
  },
  markdown: {
    lineNumbers: true,
    extractTitleLevel: [2, 3, 4]
  }
})
`
    await fs.writeFile(configPath, hopeConfigContent)
    console.log('[BlogDeploy] Generated hope theme config.js (base=%s)', baseInput ? rawBase : './')
    return {
      action: 'created',
      path: configPath,
      baseInjected: baseInput ? rawBase : undefined
    }
  }

  // —— D. Reco 主题 (vuepress-theme-reco, vuepress 1.x) ——
  if (theme === 'reco') {
    if (fs.existsSync(configPath)) {
      return { action: 'kept', path: configPath }
    }
    const recoConfigContent = `// VuePress Theme Reco 配置
// vuepress-theme-reco@1.x 直接使用 theme: 'reco'，无需 require

module.exports = {
  base: ${baseInput || "'./'"},${baseInput ? ` // memocast: base=${rawBase}` : ''}
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: './favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  theme: 'reco',
  themeConfig: {
    logo: './logo.png',
    darkmode: 'auto',
    author: 'Author',
    authorAvatar: './avatar.png',
    navbar: require('./utils/nav-builder.js').buildNav(),
    sidebar: require('./utils/sidebar-builder.js').buildSidebar()
  },
  markdown: {
    lineNumbers: true
  }
}
`
    await fs.writeFile(configPath, recoConfigContent)
    console.log('[BlogDeploy] Generated reco theme config.js (base=%s)', baseInput ? rawBase : './')
    return {
      action: 'created',
      path: configPath,
      baseInjected: baseInput ? rawBase : undefined
    }
  }

  // —— E. 默认主题 (兜底) ——
  if (fs.existsSync(configPath)) {
    // 弹框未传 base + 已存在 → 完全保留原文件(包括用户手工编辑的 base)
    if (!baseInput) {
      return { action: 'kept', path: configPath }
    }
    // 弹框传了 base 但走到了这里(理论上分支 A 应已覆盖,兜底)→ 再覆盖一次
    const result = await replaceBaseInConfig(configPath, baseInput, rawBase)
    return {
      action: 'base-overwritten',
      path: configPath,
      baseInjected: rawBase,
      baseMode: result.mode
    }
  }

  // —— D. 全新生成 default config.js ——
  const defaultConfigContent = `// 修复高版本 Node.js 下 VuePress 1.x 编译时 lodash 各种未定义 (assignWith, arrayEach 等) 的 Bug
if (typeof global !== 'undefined') {
  const lodashInternal = ['assignWith', 'arrayEach', 'baseAssignValue', 'baseEach']
  lodashInternal.forEach(method => {
    if (!global[method]) {
      try {
        global[method] = require(\`lodash/\${method}\`);
      } catch (e) {
        // 兜底处理
        if (method === 'assignWith') global[method] = Object.assign;
        if (method === 'arrayEach') global[method] = (arr, iter) => arr?.forEach(iter);
      }
    }
  });
}

// —— v2: relative base + sidebar/nav 从 utils 加载 ——
//  使用相对路径,github-pages 不需 repo 子路径
//  即时执行 buildSidebar()/buildNav() 而非 require,确保第一次构建也能拿到值
const path = require('path')
const fs = require('fs')

module.exports = {
  title: 'My Blog',
  description: 'Blog powered by Memocast',
  base: ${baseInput || "'./'"},${baseInput ? ` // memocast: base=${rawBase}` : ''}
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: './favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  themeConfig: (function () {
    const sidebarObj = require(path.join(__dirname, 'utils', 'sidebar-builder.js')).buildSidebar()
    const navObj     = require(path.join(__dirname, 'utils', 'nav-builder.js')).buildNav()
    return {
      nav: navObj,
      sidebar: sidebarObj,
      sidebarDepth: 2,
      lastUpdated: true
    }
  })(),
  markdown: { lineNumbers: true }
}
`
  await fs.writeFile(configPath, defaultConfigContent)
  console.log('[BlogDeploy] Generated default config.js (base=%s)', baseInput ? rawBase : './')
  return {
    action: 'created',
    path: configPath,
    baseInjected: baseInput ? rawBase : undefined
  }
}

/**
 * 把 `base: <quotedValue>` 注入到一个已存在的 config.js 顶层 module.exports。
 *
 * 简化策略：找到第一个 `module.exports = {` 后，在 `{` 后立即插入 `base: ...,`。
 * 不解析整个 JS（避免依赖 babel/acorn）。
 *
 * 如果找不到 `module.exports = {`（少见，比如用户写的是 `module.exports = defineUserConfig({...})`），
 * 则降级为在文件最末追加一行 `module.exports.base = <base>` 兜底。
 *
 * @param {string} configPath
 * @param {string} quotedBase 已经过 quoteBase 处理
 */
async function injectBaseIntoConfig (configPath, quotedBase) {
  const src = await fs.readFile(configPath, 'utf-8')
  const marker = 'module.exports = {'
  const idx = src.indexOf(marker)
  if (idx >= 0) {
    const insertAt = idx + marker.length
    const head = src.slice(0, insertAt)
    const tail = src.slice(insertAt)
    const next = ` base: ${quotedBase},\n`
    await fs.writeFile(configPath, head + next + tail, 'utf-8')
    return
  }
  // 兜底：在文件末追加 module.exports.base = ...
  await fs.writeFile(configPath, src + `\nmodule.exports.base = ${quotedBase}\n`, 'utf-8')
}

/**
 * 生成博客 package.json
 * @param {string} theme - 主题类型 'default' | 'vdoing' | 'hope' | 'reco'
 * @returns {object} package.json 内容
 */
function buildBlogPackageJson (theme = 'default') {
  const isVdoing = theme === 'vdoing'
  const isHope   = theme === 'hope'
  const isReco   = theme === 'reco'

  const packageJson = {
    name: 'blog',
    version: '1.0.0',
    private: true,
    scripts: {
      'build': 'set NODE_OPTIONS=--openssl-legacy-provider && vuepress build'
    },
    dependencies: {
      vuepress: '^1.9.0',
      lodash: '^4.17.21'
    },
    overrides: {
      lodash: '^4.17.21',
      'lodash.template': '^4.5.0'
    }
  }

  if (isVdoing) {
    packageJson.dependencies['vuepress-theme-vdoing'] = '^1.5.0'
  } else if (isHope) {
    packageJson.dependencies['vuepress-theme-hope'] = '^1.30.0'
  } else if (isReco) {
    packageJson.dependencies['vuepress-theme-reco'] = '^1.6.17'
  }

  return packageJson
}

/**
 * 检测目标博客目录的主题类型
 * 返回: 'vdoing' | 'hope' | 'reco' | 'default'
 */
function detectBlogTheme (blogDir) {
  const pkgPath = path.join(blogDir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = fs.readJsonSync(pkgPath)
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['vuepress-theme-vdoing']) return 'vdoing'
      if (deps['vuepress-theme-hope'])  return 'hope'
      if (deps['vuepress-theme-reco'])   return 'reco'
    } catch (_) {}
  }

  // 回退：检查 node_modules
  const check = name => fs.existsSync(path.join(blogDir, 'node_modules', name))
  if (check('vuepress-theme-vdoing')) return 'vdoing'
  if (check('vuepress-theme-hope'))  return 'hope'
  if (check('vuepress-theme-reco'))  return 'reco'

  return 'default'
}

async function execBlogBuild (blogDir, githubConfig, event, themeOverride, sftpConfig, customBuildCommand, baseOverride, packageManager) {
  cancelled = false
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { error: 'No window' }
  const webContents = win.webContents

  try {
    // 0. 检测 Node.js 是否安装
    sendProgress(webContents, 'config', 'Checking Node.js...', 1)
    const nodeCheck = await checkNodeJSInstalled()
    
    if (!nodeCheck.installed) {
      const guide = getNodeJSInstallGuide()
      console.error('[BlogDeploy] Node.js not found')
      sendDone(webContents, false, '', '', guide)
      return { error: 'nodeNotFound', guide }
    }
    
    console.log('[BlogDeploy] Node.js found:', nodeCheck.version, 'at', nodeCheck.path)
    sendProgress(webContents, 'config', `Node.js ${nodeCheck.version}`, 2)

    // 0.5 验证博客目录
    sendProgress(webContents, 'config', 'Checking blog directory...', 3)
    let validation = validateBlogDir(blogDir)
    
    // 显示警告但继续
    if (validation.warnings.length > 0) {
      console.log('[BlogDeploy] Warnings:', validation.warnings)
    }
    
    if (validation.errors.length > 0) {
      const errorMsg = validation.errors.join('; ')
      console.error('[BlogDeploy] Validation errors:', errorMsg)
      return { error: 'blogDirInvalid', details: validation.errors }
    }

    // 决定主题：优先使用前端传来的 themeOverride，否则自动检测
    const theme = themeOverride && ['default', 'vdoing', 'hope', 'reco'].includes(themeOverride)
      ? themeOverride
      : detectBlogTheme(blogDir)

    // 0.6 生成必要的配置文件（package.json, config.js 等）
    sendProgress(webContents, 'config', 'Setting up blog config...', 4)
    const configResult = await ensureBlogConfig(blogDir, theme, { base: baseOverride })
    console.log('[BlogDeploy] Blog config ensured:', configResult)
    event.sender.send('blog-deploy-warn',
      `[config.js] ${configResult.action}` +
      (configResult.baseInjected ? ` (base=${configResult.baseInjected})` : '')
    )

    // 0.7 防 404: 写 .vuepress/utils/*.js (sidebar/nav/verify builders) 并跑一次 verify-paths
    //         - 若 id-mappings.json 或 _posts/<id>.md 不全,verify 会抛错,这里仅 warning 不阻断构建
    //         - 与 TODO-vuepress部署优化.md §9 行为一致
    sendProgress(webContents, 'config', 'Verifying permalinks...', 5)
    try {
      await blogConfigWriter.writeBlogUtilities(blogDir)
      const verifyResult = await blogConfigWriter.runVerifyPaths(blogDir)
      console.log('[BlogDeploy] verify-paths OK:', verifyResult)
    } catch (verifyErr) {
      const msg = (verifyErr && verifyErr.message) ? verifyErr.message : String(verifyErr)
      console.warn('[BlogDeploy] verify-paths warning (non-blocking):', msg)
      event.sender.send('blog-deploy-warn', `[verify-paths] ${msg}`)
    }

    // 1. 检查博客目录的 node_modules
    sendProgress(webContents, 'config', 'Checking node_modules...', 5)
    const nodeModulesResult = await checkBlogNodeModules(blogDir)
    console.log('[BlogDeploy] node_modules exists:', nodeModulesResult.exists)

    // 2. 处理 package.json（修复旧版本 / 自动生成）
    sendProgress(webContents, 'build', 'Checking package.json...', 15)

    const vuepressDir = path.join(blogDir, '.vuepress')
    const configPath = path.join(vuepressDir, 'config.js')
    const packageJsonPath = path.join(blogDir, 'package.json')

    // 确保 .vuepress 目录存在
    await fs.ensureDir(vuepressDir)

    const isVdoing = theme === 'vdoing'
    const isHope   = theme === 'hope'
    const isReco   = theme === 'reco'
    const isWin    = process.platform === 'win32'

    const themeDepMap = {
      vdoing: 'vuepress-theme-vdoing',
      hope: 'vuepress-theme-hope',
      reco: 'vuepress-theme-reco'
    }
    const targetThemeDep = themeDepMap[theme]

    // 读取现有 package.json
    let existingPkg = null
    if (fs.existsSync(packageJsonPath)) {
      try {
        existingPkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      } catch (e) {
        console.error('[BlogDeploy] Error reading package.json:', e)
      }
    }

    // 检测是否需要重建（旧版 vuepress v2 或主题变化）
    const vuepressVersion = existingPkg?.dependencies?.vuepress || ''
    const hasOldV2 = vuepressVersion.startsWith('^2.') || vuepressVersion.startsWith('2.')
    const hasVdoingDep = existingPkg?.dependencies?.['vuepress-theme-vdoing']
    const hasHopeDep  = existingPkg?.dependencies?.['vuepress-theme-hope']
    const hasRecoDep  = existingPkg?.dependencies?.['vuepress-theme-reco']
    const currentThemeDep = existingPkg?.dependencies?.[targetThemeDep]
    const depMismatch = targetThemeDep
      ? !currentThemeDep
      : (hasVdoingDep || hasHopeDep || hasRecoDep)
    const needRebuild = hasOldV2 || depMismatch

    if (needRebuild) {
      console.log('[BlogDeploy] Rebuilding package.json, theme:', theme, 'reason:', hasOldV2 ? 'old v2' : 'theme mismatch')
      sendProgress(webContents, 'build', 'Updating package.json...', 20)
      
      const packageJson = {
        name: 'blog',
        version: '1.0.0',
        private: true,
        scripts: {
          'build': 'set NODE_OPTIONS=--openssl-legacy-provider && vuepress build'
        },
        dependencies: {
          vuepress: '^1.9.0',
          lodash: '^4.17.21'
        },
        overrides: {
          lodash: '^4.17.21',
          'lodash.template': '^4.5.0'
        }
      }
      if (isVdoing) {
        packageJson.dependencies['vuepress-theme-vdoing'] = '^1.5.0'
      } else if (isHope) {
        packageJson.dependencies['vuepress-theme-hope'] = '^1.30.0'
      } else if (isReco) {
        packageJson.dependencies['vuepress-theme-reco'] = '^1.6.17'
      }
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
    } else if (!existingPkg) {
      // 自动生成 package.json（不存在时）
      sendProgress(webContents, 'build', 'Generating package.json...', 20)

      const packageJson = {
        name: 'blog',
        version: '1.0.0',
        private: true,
        scripts: {
          'build': 'set NODE_OPTIONS=--openssl-legacy-provider && vuepress build'
        },
        dependencies: {
          vuepress: '^1.9.0',
          lodash: '^4.17.21'
        },
        overrides: {
          lodash: '^4.17.21',
          'lodash.template': '^4.5.0'
        }
      }
      if (isVdoing) {
        packageJson.dependencies['vuepress-theme-vdoing'] = '^1.5.0'
      } else if (isHope) {
        packageJson.dependencies['vuepress-theme-hope'] = '^1.30.0'
      } else if (isReco) {
        packageJson.dependencies['vuepress-theme-reco'] = '^1.6.17'
      }

      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
      console.log('[BlogDeploy] Generated package.json with theme:', theme)
    }

    // 清理 vuepress 在 build 期间产生的 cache（dist 已在上面彻底重建）
    const cacheDir = path.join(vuepressDir, 'cache')
    const distDir = path.join(vuepressDir, 'dist')

    if (fs.existsSync(cacheDir)) {
      await fs.remove(cacheDir)
      console.log('[BlogDeploy] Cleaned .vuepress/cache directory')
    }
    if (fs.existsSync(distDir)) {
      await fs.remove(distDir)
      console.log('[BlogDeploy] Cleaned .vuepress/dist directory')
    }

    // 4. 处理 node_modules（首次需要 install，或 node_modules 里 vuepress 不存在时也重新 install）
    sendProgress(webContents, 'build', 'Checking node_modules...', 15)
    const blogNodeModules = path.join(blogDir, 'node_modules')
    const vuepressBin = path.join(blogDir, 'node_modules', 'vuepress', 'cli.js')
    const vuepressBinExists = fs.existsSync(vuepressBin)
    const vuepressBinCmd = path.join(blogDir, 'node_modules', '.bin', isWin ? 'vuepress.cmd' : 'vuepress')
    const vuepressBinCmdExists = fs.existsSync(vuepressBinCmd)
    const needInstall = !fs.existsSync(blogNodeModules) || (!vuepressBinExists && !vuepressBinCmdExists)
    const pm = packageManager || 'npm'

    if (needInstall || customBuildCommand) {
      sendProgress(webContents, 'build', `Installing dependencies (${pm})...`, 40)
      const installResult = await runNpmInstall(blogDir, pm, (msg) => {
        sendProgress(webContents, 'build', msg, 45)
      })

      if (installResult.error) {
        console.error(`[BlogDeploy] ${pm} install failed:`, installResult.error)
        return { error: installResult.error }
      }
      console.log(`[BlogDeploy] ${pm} install completed`)

      // install 完成后再次确认 vuepress 可用
      const afterBin = path.join(blogDir, 'node_modules', 'vuepress', 'cli.js')
      const afterBinCmd = path.join(blogDir, 'node_modules', '.bin', isWin ? 'vuepress.cmd' : 'vuepress')
      if (!fs.existsSync(afterBin) && !fs.existsSync(afterBinCmd)) {
        console.error('[BlogDeploy] vuepress still not found after npm install!')
        return { error: 'vuepress not found after install' }
      }
    } else {
      console.log('[BlogDeploy] node_modules exists and vuepress found, skipping install')
    }

    // 5. 执行构建
    sendProgress(webContents, 'build', 'Building...', 50)

    let buildResult
    if (customBuildCommand) {
      // 使用自定义构建命令
      console.log('[BlogDeploy] Using custom build command:', customBuildCommand)
      buildResult = await runCustomBuild(blogDir, customBuildCommand, (msg) => {
        sendProgress(webContents, 'build', msg, 60)
      })
    } else {
      // 使用默认 vuepress 构建
      const { bin: vuepressBin } = getBuiltInVuepressBin(blogDir)
      
      if (!vuepressBin || !fs.existsSync(vuepressBin)) {
        const errorMsg = '未找到 vuepress，请确保博客目录已安装 vuepress@1.x 依赖'
        console.error('[BlogDeploy] Error:', errorMsg)
        return { error: errorMsg }
      }
      
      buildResult = await runVuepressBuild(blogDir, vuepressBin, pm, (msg) => {
        sendProgress(webContents, 'build', msg, 60)
      })
    }

    if (buildResult.error) {
      return { error: buildResult.error }
    }

    // 4. 触发 GitHub Actions（若配置了）
    if (githubConfig?.token && githubConfig?.owner && githubConfig?.workflowId) {
      sendProgress(webContents, 'trigger', 'Triggering GitHub Actions...', 85)

      const ghResult = await dispatchWorkflow({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        workflowId: githubConfig.workflowId,
        branch: githubConfig.branch || 'main',
        token: githubConfig.token,
        inputs: githubConfig.inputs || {}
      })

      if (!ghResult.success) {
        console.warn('GitHub API trigger failed:', ghResult.error)
      }
    }

    // 5. SFTP 上传（若配置了）
    if (sftpConfig?.enabled) {
      const outputDir = path.join(blogDir, '.vuepress/dist')
      
      sendProgress(webContents, 'sftp', 'Preparing SFTP upload...', 92)

      // 备份远程目录（可选）
      if (sftpConfig.backupEnabled) {
        try {
          sendProgress(webContents, 'sftp', 'Backing up remote directory...', 94)
          await backupRemoteDir(sftpConfig)
        } catch (backupErr) {
          console.warn('[BlogDeploy] Backup failed, continuing anyway:', backupErr.message)
        }
      }

      // 上传文件
      sendProgress(webContents, 'sftp', 'Uploading to server...', 96)
      const sftpResult = await sftpUpload(sftpConfig, outputDir, (filename, uploaded, total) => {
        const percent = 96 + Math.round((uploaded / total) * 4)
        sendProgress(webContents, 'sftp', `Uploading: ${filename} (${uploaded}/${total})`, percent)
      })

      if (!sftpResult.success) {
        console.error('[BlogDeploy] SFTP upload failed:', sftpResult.error)
        sendDone(webContents, false, outputDir, '', { message: `SFTP upload failed: ${sftpResult.error}` })
        return { error: 'sftpUploadFailed', details: sftpResult.error }
      }
      
      console.log('[BlogDeploy] SFTP upload complete, uploaded', sftpResult.uploaded, 'files')
    }

    sendProgress(webContents, 'done', 'Deploy triggered!', 100)
    sendDone(webContents, true, path.join(blogDir, '.vuepress/dist'))
    return { success: true }
  } catch (err) {
    console.error('Blog deploy error:', err)
    sendDone(webContents, false)
    return { error: err.message }
  }
}

function runVuepressBuild (blogDir, vuepressBin, packageManager, onProgress) {
  return new Promise((resolve) => {
    // 根据用户选择的包管理器执行构建命令
    const pm = packageManager || 'npm'
    const buildScript = pm === 'npm' ? 'npm run build' : `${pm} run build`
    console.log(`[BlogDeploy] Running via ${pm}:`, buildScript)

    const child = spawn('cmd.exe', ['/c', buildScript], {
      cwd: blogDir,
      shell: false,
      windowsHide: true,
      env: { ...process.env }
    })

    currentProcess = child
    let stderr = ''
    let stdout = ''

    child.stderr.on('data', (data) => {
      stderr += data.toString()
      console.error('[VuePress stderr]:', data.toString())
    })

    child.stdout.on('data', (data) => {
      const msg = data.toString().trim()
      stdout += msg + '\n'
      if (msg) {
        onProgress(msg)
      }
    })

    child.on('close', (code) => {
      currentProcess = null
      if (cancelled) {
        resolve({ error: 'cancelled' })
      } else if (code === 0) {
        resolve({ success: true })
      } else {
        // 如果有 stderr 错误，优先返回 stderr
        const errorMsg = stderr.trim() || `Exit code: ${code}`
        resolve({ error: errorMsg })
      }
    })

    child.on('error', (err) => {
      currentProcess = null
      resolve({ error: err.message })
    })
  })
}

/**
 * 执行包安装（支持 npm / yarn / pnpm）
 * @param {string} blogDir - 博客目录
 * @param {string} packageManager - 'npm' | 'yarn' | 'pnpm'
 * @param {function} onProgress - 进度回调
 */
function runNpmInstall (blogDir, packageManager, onProgress) {
  return new Promise((resolve) => {
    const pm = packageManager || 'npm'
    console.log(`[BlogDeploy] Installing dependencies with ${pm} in:`, blogDir)

    // yarn / pnpm 不需要 --include=dev，默认行为一致；npm 需要显式覆盖全局 --omit=dev
    const installCmd = pm === 'npm'
      ? 'npm install --include=dev --loglevel=info'
      : `${pm} install --loglevel=info`

    // npm cache clean 仅 npm 需要；yarn / pnpm 用各自缓存机制
    if (pm === 'npm') {
      const cleanChild = spawn('cmd.exe', ['/c', 'npm cache clean --force'], {
        cwd: blogDir,
        shell: false,
        windowsHide: true,
        env: { ...process.env }
      })

      cleanChild.on('close', (code) => {
        console.log('[BlogDeploy] npm cache clean exited with code:', code)
        doInstall()
      })

      cleanChild.on('error', (err) => {
        console.warn('[BlogDeploy] npm cache clean failed, continuing anyway:', err.message)
        doInstall()
      })
    } else {
      doInstall()
    }

    function doInstall () {
      const installChild = spawn('cmd.exe', ['/c', installCmd], {
        cwd: blogDir,
        shell: false,
        windowsHide: true,
        env: { ...process.env }
      })

      currentProcess = installChild
      let stderr = ''

      installChild.stderr.on('data', (data) => {
        stderr += data.toString()
        console.error(`[${pm}Install stderr]:`, data.toString())
      })

      installChild.stdout.on('data', (data) => {
        const msg = data.toString().trim()
        if (msg) {
          onProgress(msg)
        }
      })

      installChild.on('close', (code) => {
        currentProcess = null
        if (cancelled) {
          resolve({ error: 'cancelled' })
        } else if (code === 0) {
          resolve({ success: true })
        } else {
          const errorMsg = stderr.trim() || `Exit code: ${code}`
          resolve({ error: errorMsg })
        }
      })

      installChild.on('error', (err) => {
        currentProcess = null
        resolve({ error: err.message })
      })
    }
  })
}

/**
 * 执行自定义构建命令
 * @param {string} blogDir - 博客目录
 * @param {string} customCommand - 用户自定义的构建命令
 * @param {function} onProgress - 进度回调
 */
function runCustomBuild (blogDir, customCommand, onProgress) {
  return new Promise((resolve) => {
    console.log('[BlogDeploy] Running custom command via cmd.exe:', customCommand)

    const child = spawn('cmd.exe', ['/c', customCommand], {
      cwd: blogDir,
      shell: false,
      windowsHide: true,
      env: { ...process.env }
    })

    currentProcess = child
    let stderr = ''

    child.stderr.on('data', (data) => {
      stderr += data.toString()
      console.error('[CustomBuild stderr]:', data.toString())
    })

    child.stdout.on('data', (data) => {
      const msg = data.toString().trim()
      if (msg) {
        onProgress(msg)
      }
    })

    child.on('close', (code) => {
      currentProcess = null
      if (cancelled) {
        resolve({ error: 'cancelled' })
      } else if (code === 0) {
        resolve({ success: true })
      } else {
        const errorMsg = stderr.trim() || `Exit code: ${code}`
        resolve({ error: errorMsg })
      }
    })

    child.on('error', (err) => {
      currentProcess = null
      resolve({ error: err.message })
    })
  })
}

function cancelBlogBuild () {
  cancelled = true
  if (currentProcess) {
    try {
      process.platform === 'win32'
        ? spawn('taskkill', ['/pid', currentProcess.pid.toString(), '/f', '/t'], { shell: true })
        : currentProcess.kill('SIGTERM')
    } catch (e) {
      console.warn('Failed to kill child process:', e)
    }
    currentProcess = null
  }
}

module.exports = {
  execBlogBuild,
  cancelBlogBuild,
  detectBlogTheme
}
