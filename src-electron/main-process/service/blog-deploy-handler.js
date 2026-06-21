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
  console.log('[BlogDeploy] process.resourcesPath:', process.resourcesPath)

  const appPath = app.getAppPath()
  const isDev = appPath.includes('.quasar') || appPath.includes('quasar')
  const projectRoot = isDev
    ? path.join(appPath, '..', '..')
    : path.dirname(path.dirname(appPath))

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
    // 通过 NODE_PATH 让 vuepress 能找到 Memocast root node_modules 中的依赖
    const vuepressEnv = {
      ...process.env,
      NODE_PATH: [
        path.join(projectRoot, 'node_modules'),
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
