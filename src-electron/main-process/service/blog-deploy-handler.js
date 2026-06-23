/**
 * 博客打包部署 Handler
 * 策略：使用 Memocast 内置 vuepress（node_modules），自动检测目标目录主题
 */
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs-extra')
const { BrowserWindow, app } = require('electron')
const { dispatchWorkflow } = require('./github-api')

let currentProcess = null
let cancelled = false

function sendProgress (webContents, stage, message, percent) {
  webContents.send('blog-deploy-progress', { stage, message, percent })
}

function sendDone (webContents, success, outputDir, url) {
  webContents.send('blog-deploy-done', { success, outputDir, url })
}

/**
 * 从 Memocast 内置 node_modules 获取 vuepress 二进制路径
 */
function getBuiltInVuepressBin () {
  const isWin = process.platform === 'win32'
  console.log('[BlogDeploy] app.getAppPath():', app.getAppPath())
  console.log('[BlogDeploy] app.isPackaged:', app.isPackaged)
  console.log('[BlogDeploy] process.resourcesPath:', process.resourcesPath)

  // 使用 app.isPackaged 判断是否是打包后的应用，更可靠
  const appPath = app.getAppPath()
  const isDev = !app.isPackaged

  // 开发模式：appPath 指向 .quasar/app 文件夹
  // 打包模式：appPath 指向 asar 内部
  const projectRoot = isDev
    ? path.join(appPath, '..', '..', '..')
    : path.dirname(path.dirname(appPath))

  console.log('[BlogDeploy] isDev:', isDev, 'projectRoot:', projectRoot)

  // 直接指向 vuepress 的 JS 入口，不走 .bin/.cmd 包装
  const candidates = [
    path.join(projectRoot, 'node_modules', 'vuepress', 'cli.js'),
    path.join(projectRoot, 'node_modules', '.bin', isWin ? 'vuepress.cmd' : 'vuepress'),
    path.join(appPath, 'node_modules', 'vuepress', 'cli.js'),
    path.join(process.resourcesPath, 'app', 'node_modules', 'vuepress', 'cli.js'),
    path.join(process.resourcesPath, 'app.asar', 'node_modules', 'vuepress', 'cli.js'),
  ]

  for (const cli of candidates) {
    console.log('[BlogDeploy] Checking:', cli, fs.existsSync(cli) ? '(exists)' : '(missing)')
    if (fs.existsSync(cli)) {
      return { bin: cli, projectRoot }
    }
  }
  return { bin: candidates[0], projectRoot }
}

/**
 * 验证博客目录是否满足基本要求
 * 返回: { valid: boolean, errors: string[] }
 */
function validateBlogDir (blogDir) {
  const errors = []

  // 检查目录是否存在
  if (!fs.existsSync(blogDir)) {
    errors.push(`博客目录不存在: ${blogDir}`)
    return { valid: false, errors }
  }

  // 检查必要的配置文件（至少要有 config.js 或 config.ts）
  const configDir = path.join(blogDir, '.vuepress')
  if (!fs.existsSync(configDir)) {
    errors.push(`缺少 .vuepress 目录，请先在博客目录运行 vuepress 初始化`)
  } else {
    const hasConfig = fs.existsSync(path.join(configDir, 'config.js')) ||
                      fs.existsSync(path.join(configDir, 'config.ts'))
    if (!hasConfig) {
      errors.push(`缺少 .vuepress/config.js 配置文件`)
    }
  }

  // 检查 _posts 目录
  const postsDir = path.join(blogDir, '_posts')
  if (!fs.existsSync(postsDir)) {
    errors.push(`缺少 _posts 目录，请先导出笔记`)
  } else {
    const mdFiles = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'))
    if (mdFiles.length === 0) {
      errors.push(`_posts 目录中没有 MD 文件`)
    }
  }

  return { valid: errors.length === 0, errors }
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
    // 0. 验证博客目录
    sendProgress(webContents, 'config', 'Validating blog directory...', 2)
    const validation = validateBlogDir(blogDir)
    if (!validation.valid) {
      const errorMsg = validation.errors.join('; ')
      console.error('[BlogDeploy] Validation failed:', errorMsg)
      return { error: 'blogDirInvalid', details: validation.errors }
    }

    // 1. 确定 vuepress 命令
    const { bin: vuepressBin, projectRoot } = getBuiltInVuepressBin()
    sendProgress(webContents, 'config', 'Checking VuePress...', 5)

    if (!fs.existsSync(vuepressBin)) {
      console.error('[BlogDeploy] VuePress binary not found at:', vuepressBin)
      return { error: 'vuepressNotFound' }
    }

    // 2. 确定主题：优先用配置值，其次 auto-detect
    const theme = themeOverride || detectBlogTheme(blogDir)
    const isVdoing = theme === 'vdoing'
    sendProgress(webContents, 'config', `Theme: ${isVdoing ? 'vdoing' : 'VuePress default'}`, 10)

    // 3. 执行 vuepress build（先清理旧的 dist，避免缓存不一致）
    sendProgress(webContents, 'build', 'Starting VuePress build...', 40)

    const distDir = path.join(blogDir, '.vuepress', 'dist')
    if (fs.existsSync(distDir)) {
      await fs.remove(distDir)
    }
    const cacheDir = path.join(blogDir, '.vuepress', 'cache')
    if (fs.existsSync(cacheDir)) {
      await fs.remove(cacheDir)
    }

    const buildResult = await runVuepressBuild(blogDir, vuepressBin, projectRoot, isVdoing, (msg) => {
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

function runVuepressBuild (blogDir, vuepressBin, projectRoot, isVdoing, onProgress) {
  return new Promise((resolve) => {
    // vdoing 使用 `vuepress vdoing build`，原生使用 `vuepress build`
    // cwd 设为 blogDir，所以不需要再传 sourceDir 参数
    const vuepressArgs = isVdoing ? ['vdoing', 'build'] : ['build']

    // 用 node 直接执行 vuepress 模块，绕过 .cmd shell 解析问题
    // NODE_PATH 顺序很重要：博客目录在前（用户可能在那里装了 vuepress 配置相关的东西），
    // Memocast 在后（提供 vuepress CLI 和 vdoing 主题）
    const vuepressEnv = {
      ...process.env,
      NODE_PATH: [
        path.join(blogDir, 'node_modules'),       // 博客目录的依赖（可能为空，但需在路径中）
        path.join(projectRoot, 'node_modules'),  // Memocast 的 vuepress 和 vdoing
        process.env.NODE_PATH || ''
      ].filter(Boolean).join(path.delimiter)
    }

    const child = spawn('node', [vuepressBin, ...vuepressArgs], {
      cwd: blogDir,
      env: vuepressEnv,
      windowsHide: true
    })

    currentProcess = child
    let stderr = ''

    child.stderr.on('data', (data) => {
      stderr += data.toString()
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
