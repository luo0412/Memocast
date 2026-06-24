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

// ==================== node_modules 软链接策略 ====================

/**
 * 获取 Memocast 内置 node_modules 的路径
 * 开发模式：项目根目录
 * 生产模式：Electron app 目录下的 node_modules
 */
function getMemocastNodeModules () {
  const isWin = process.platform === 'win32'
  
  // 可能的 Memocast 根目录
  const possibleRoots = [
    // 1. process.cwd() (最可靠)
    path.resolve(process.cwd()),
    // 2. __dirname (src-electron/main-process/service -> 项目根)
    path.resolve(__dirname, '..', '..', '..'),
    // 3. app.getAppPath() (.quasar/electron -> 项目根)
    path.resolve(app.getAppPath(), '..', '..', '..'),
  ]

  // 生产模式下 Electron 的实际路径
  if (app.isPackaged) {
    // 打包后的 app.asar 路径
    const appPath = app.getAppPath()
    // 通常 .asar 文件在 Content Resources 目录下
    // 尝试找到 .asar 同级的 node_modules
    const resourcesPath = path.dirname(appPath)
    const nodeModulesPath = path.join(resourcesPath, 'node_modules')
    if (fs.existsSync(nodeModulesPath)) {
      return { path: nodeModulesPath, mode: 'packaged' }
    }
    
    // 备选：在 app 目录内查找 (某些打包配置会把 node_modules 放在 app 内)
    const altPath = path.join(appPath, '..', 'app', 'node_modules')
    if (fs.existsSync(altPath)) {
      return { path: altPath, mode: 'packaged' }
    }
  }

  // 开发模式：从可能的根目录找
  const uniqueRoots = [...new Set(possibleRoots)]
  for (const projectRoot of uniqueRoots) {
    const nodeModulesPath = path.join(projectRoot, 'node_modules')
    if (fs.existsSync(nodeModulesPath)) {
      console.log('[BlogDeploy] Dev mode node_modules at:', nodeModulesPath)
      return { path: nodeModulesPath, mode: 'development' }
    }
  }

  return { path: '', mode: 'not_found' }
}

/**
 * 创建软链接指向 Memocast 的 node_modules
 * Windows 使用 junction（无需管理员权限），Unix 使用 symlink
 */
async function createNodeModulesSymlink (blogDir, memocastNodeModules) {
  const isWin = process.platform === 'win32'
  const targetLink = path.join(blogDir, 'node_modules')
  
  // 确保目标不存在
  if (fs.existsSync(targetLink)) {
    const stat = fs.lstatSync(targetLink)
    if (stat.isSymbolicLink()) {
      // 已是软链接，先删除
      await fs.remove(targetLink)
    } else if (stat.isDirectory()) {
      // 是真实目录，保留（用户可能有自己安装的依赖）
      console.log('[BlogDeploy] Blog already has its own node_modules, using it')
      return false
    }
  }

  if (!memocastNodeModules || !fs.existsSync(memocastNodeModules)) {
    console.error('[BlogDeploy] Memocast node_modules not found:', memocastNodeModules)
    return false
  }

  return new Promise((resolve) => {
    if (isWin) {
      // Windows: 使用 junction (不需要管理员权限，不会跨驱动器)
      // junction 只能用于目录
      exec(`mklink /J "${targetLink}" "${memocastNodeModules}"`, { windowsHide: true }, (error) => {
        if (error) {
          console.error('[BlogDeploy] Failed to create junction:', error.message)
          resolve(false)
        } else {
          console.log('[BlogDeploy] Created junction:', targetLink, '->', memocastNodeModules)
          resolve(true)
        }
      })
    } else {
      // macOS/Linux: 使用 symlink
      fs.ensureSymlink(memocastNodeModules, targetLink, 'junction', (err) => {
        if (err) {
          console.error('[BlogDeploy] Failed to create symlink:', err.message)
          resolve(false)
        } else {
          console.log('[BlogDeploy] Created symlink:', targetLink, '->', memocastNodeModules)
          resolve(true)
        }
      })
    }
  })
}

/**
 * 确保博客目录有可用的 node_modules
 * 优先使用博客自己的，否则创建软链接
 */
async function ensureBlogNodeModules (blogDir) {
  const blogNodeModules = path.join(blogDir, 'node_modules')
  
  // 检查博客目录是否有自己的 node_modules
  if (fs.existsSync(blogNodeModules)) {
    console.log('[BlogDeploy] Blog has its own node_modules')
    return { source: 'blog', linked: false }
  }

  // 获取 Memocast 内置的 node_modules
  const { path: memocastPath, mode } = getMemocastNodeModules()
  
  if (!memocastPath || !fs.existsSync(memocastPath)) {
    console.error('[BlogDeploy] Memocast node_modules not available')
    return { source: 'none', linked: false }
  }

  // 创建软链接
  console.log(`[BlogDeploy] Creating node_modules symlink (${mode} mode)...`)
  const linked = await createNodeModulesSymlink(blogDir, memocastPath)
  
  return {
    source: linked ? 'memocast' : 'none',
    linked
  }
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
  
  console.log('[BlogDeploy] __dirname:', __dirname)
  console.log('[BlogDeploy] process.cwd():', process.cwd())
  console.log('[BlogDeploy] app.getAppPath():', app.getAppPath())
  console.log('[BlogDeploy] app.isPackaged:', app.isPackaged)
  console.log('[BlogDeploy] blogDir:', blogDir)

  // 1. 首先尝试从博客目录的 node_modules 获取
  const blogNodeModules = path.join(blogDir, 'node_modules')
  
  if (fs.existsSync(blogNodeModules)) {
    // 尝试 vuepress/cli.js
    const vuepressCli = path.join(blogNodeModules, 'vuepress', 'cli.js')
    if (fs.existsSync(vuepressCli)) {
      console.log('[BlogDeploy] Found vuepress in blog node_modules:', vuepressCli)
      return { bin: vuepressCli, source: 'blog' }
    }
    
    // 尝试 .bin/vuepress
    const binPath = path.join(blogNodeModules, '.bin', isWin ? 'vuepress.cmd' : 'vuepress')
    if (fs.existsSync(binPath)) {
      console.log('[BlogDeploy] Found vuepress in blog .bin:', binPath)
      return { bin: binPath, source: 'blog' }
    }
  }

  // 2. 回退：从 Memocast 内置 node_modules 获取
  const { path: memocastPath } = getMemocastNodeModules()
  
  if (memocastPath && fs.existsSync(memocastPath)) {
    const vuepressCli = path.join(memocastPath, 'vuepress', 'cli.js')
    if (fs.existsSync(vuepressCli)) {
      console.log('[BlogDeploy] Found vuepress in Memocast node_modules:', vuepressCli)
      return { bin: vuepressCli, source: 'memocast' }
    }
    
    const binPath = path.join(memocastPath, '.bin', isWin ? 'vuepress.cmd' : 'vuepress')
    if (fs.existsSync(binPath)) {
      console.log('[BlogDeploy] Found vuepress in Memocast .bin:', binPath)
      return { bin: binPath, source: 'memocast' }
    }
  }

  console.error('[BlogDeploy] VuePress not found!')
  return { bin: '', source: 'none' }
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
 * 生成必要的博客配置文件
 */
async function ensureBlogConfig (blogDir) {
  const configDir = path.join(blogDir, '.vuepress')
  const postsDir = path.join(blogDir, '_posts')

  // 创建必要的目录
  await fs.ensureDir(configDir)
  await fs.ensureDir(postsDir)

  // 创建 package.json
  const pkgPath = path.join(blogDir, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    await fs.writeFile(pkgPath, JSON.stringify({
      name: 'memocast-blog',
      version: '1.0.0',
      description: 'Blog powered by Memocast'
    }, null, 2))
  }

  // 创建或修复 config.js
  const configPath = path.join(configDir, 'config.js')
  const needsNewConfig = !fs.existsSync(configPath)
  
  if (needsNewConfig) {
    // 生成默认 config.js
    const configContent = `const path = require('path')
const fs = require('fs')

module.exports = {
  title: 'My Blog',
  description: 'Blog powered by Memocast',
  base: '/',
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  themeConfig: {
    nav: [{ text: 'Home', link: '/' }],
    sidebar: []
  },
  markdown: { lineNumbers: true }
}
`
    await fs.writeFile(configPath, configContent)
  } else {
    // 修复已有 config.js 中的相对路径问题
    let content = await fs.readFile(configPath, 'utf-8')
    console.log('[BlogDeploy] Original config.js first line:', content.split('\n')[0])
    
    // 修复 ./package.json -> ../package.json
    // .vuepress/config.js 引用上级目录的 package.json
    if (content.includes("require('./package.json')") || content.includes('require("./package.json")')) {
      content = content.replace(/require\(['"]\.\/package\.json['"]\)/g, "require('../package.json')")
      await fs.writeFile(configPath, content)
      console.log('[BlogDeploy] Fixed package.json path in config.js')
    } else if (content.includes('require')) {
      console.log('[BlogDeploy] Config.js contains require, checking path...')
      console.log('[BlogDeploy] Looking for package.json require pattern')
      const match = content.match(/require\(['"](\.\/?[^'"]+)['"]\)/)
      if (match) {
        console.log('[BlogDeploy] Found require:', match[1])
      }
    }
  }
}

/**
 * 检测目标博客目录的主题类型
 * 返回: 'vdoing' | 'default'
 */
function detectBlogTheme (blogDir) {
  const pkgPath = path.join(blogDir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = fs.readJsonSync(pkgPath)
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['vuepress-theme-vdoing']) {
        return 'vdoing'
      }
    } catch (_) {}
  }

  // 回退：检查 node_modules 中是否有 vdoing 主题
  const vdoingPath = path.join(blogDir, 'node_modules', 'vuepress-theme-vdoing')
  if (fs.existsSync(vdoingPath)) {
    return 'vdoing'
  }

  return 'default'
}

async function execBlogBuild (blogDir, githubConfig, event, themeOverride) {
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

    // 1. 确保博客目录有 node_modules（软链接策略）
    sendProgress(webContents, 'config', 'Setting up node_modules...', 5)
    const nodeModulesResult = await ensureBlogNodeModules(blogDir)
    
    if (nodeModulesResult.source === 'none') {
      console.error('[BlogDeploy] Failed to setup node_modules')
      return { error: 'nodeModulesSetupFailed' }
    }
    
    console.log('[BlogDeploy] node_modules source:', nodeModulesResult.source)
    sendProgress(webContents, 'config', `Using node_modules from: ${nodeModulesResult.source}`, 8)

    // 2. 确定 vuepress 命令
    const { bin: vuepressBin, source: vuepressSource } = getBuiltInVuepressBin(blogDir)
    sendProgress(webContents, 'config', 'Checking VuePress...', 10)

    if (!fs.existsSync(vuepressBin)) {
      console.error('[BlogDeploy] VuePress binary not found at:', vuepressBin)
      return { error: 'vuepressNotFound' }
    }
    
    console.log('[BlogDeploy] VuePress source:', vuepressSource)

    // 3. 确定主题：优先用配置值，其次 auto-detect
    const theme = themeOverride || detectBlogTheme(blogDir)
    const isVdoing = theme === 'vdoing'
    sendProgress(webContents, 'config', `Theme: ${isVdoing ? 'vdoing' : 'VuePress default'}`, 12)

    // 3. 执行 vuepress build（清理旧缓存，确保干净构建）
    sendProgress(webContents, 'build', 'Starting VuePress build...', 40)

    const vuepressDir = path.join(blogDir, '.vuepress')
    
    // 备份 config.js 和 sidebar.json
    const configPath = path.join(vuepressDir, 'config.js')
    const sidebarPath = path.join(vuepressDir, 'sidebar.json')
    let configBackup = null
    let sidebarBackup = null
    
    if (fs.existsSync(configPath)) {
      let content = fs.readFileSync(configPath, 'utf-8')
      // 修复 package.json 路径
      if (content.includes("require('./package.json')") || content.includes('require("./package.json")')) {
        content = content.replace(/require\(['"]\.\/package\.json['"]\)/g, "require('../package.json')")
        console.log('[BlogDeploy] Fixed package.json path in config.js')
      }
      configBackup = content
    }
    if (fs.existsSync(sidebarPath)) {
      sidebarBackup = fs.readFileSync(sidebarPath, 'utf-8')
    }

    // 清理整个 .vuepress 目录
    if (fs.existsSync(vuepressDir)) {
      await fs.remove(vuepressDir)
    }
    await fs.ensureDir(vuepressDir)
    console.log('[BlogDeploy] Cleaned .vuepress directory')

    // 恢复 config.js 和 sidebar.json
    if (configBackup) {
      fs.writeFileSync(configPath, configBackup)
      console.log('[BlogDeploy] Restored config.js')
    }
    if (sidebarBackup) {
      fs.writeFileSync(sidebarPath, sidebarBackup)
    }

    // 不创建 junction，直接执行构建
    // vuepress 会使用 Memocast 的 node_modules
    console.log('[BlogDeploy] Skipping junction creation, using Memocast node_modules directly')

    const buildResult = await runVuepressBuild(blogDir, vuepressBin, (msg) => {
      sendProgress(webContents, 'build', msg, 60)
    })

    if (buildResult.error) {
      return { error: buildResult.error }
    }

    // 4. 触发 GitHub Actions（若配置了）
    if (githubConfig?.token && githubConfig?.owner && githubConfig?.workflowId) {
      sendProgress(webContents, 'trigger', 'Triggering GitHub Actions...', 90)

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

    sendProgress(webContents, 'done', 'Deploy triggered!', 100)
    sendDone(webContents, true, path.join(blogDir, '.vuepress/dist'))
    return { success: true }
  } catch (err) {
    console.error('Blog deploy error:', err)
    sendDone(webContents, false)
    return { error: err.message }
  }
}

function runVuepressBuild (blogDir, vuepressBin, onProgress) {
  return new Promise((resolve) => {
    // vdoing 使用 `vuepress vdoing build`，原生使用 `vuepress build`
    const cmd = `set NODE_OPTIONS=--openssl-legacy-provider && node "${vuepressBin}" build`
    console.log('[BlogDeploy] Running:', cmd)

    const child = spawn(cmd, {
      cwd: blogDir,
      shell: true,
      windowsHide: true
    })

    currentProcess = child
    let stderr = ''

    child.stderr.on('data', (data) => {
      stderr += data.toString()
      console.error('[VuePress stderr]:', data.toString())
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
        resolve({ error: stderr || `Exit code: ${code}` })
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
