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
  const binName = isWin ? 'vuepress.cmd' : 'vuepress'
  console.log('[BlogDeploy] app.getAppPath():', app.getAppPath())
  console.log('[BlogDeploy] process.resourcesPath:', process.resourcesPath)

  // 开发模式：app.getAppPath() 指向 .quasar/electron，vuepress 在项目根 node_modules
  const isDev = app.getAppPath().includes('.quasar')
  const projectRoot = isDev
    ? path.join(path.dirname(app.getAppPath()), '..', '..')
    : path.dirname(path.dirname(app.getAppPath()))

  const candidates = [
    path.join(projectRoot, 'node_modules'),          // 项目根 node_modules
    path.join(app.getAppPath(), 'node_modules'),      // app 内置
    path.join(process.resourcesPath, 'app', 'node_modules'),
    path.join(process.resourcesPath, 'app.asar', 'node_modules'),
  ]

  for (const nm of candidates) {
    const bin = path.join(nm, '.bin', binName)
    console.log('[BlogDeploy] Checking:', bin, fs.existsSync(bin) ? '(exists)' : '(missing)')
    if (fs.existsSync(bin)) {
      return bin
    }
  }
  return path.join(candidates[0], '.bin', binName)
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
    const vuepressBin = getBuiltInVuepressBin()
    sendProgress(webContents, 'config', 'Checking VuePress...', 5)

    if (!fs.existsSync(vuepressBin)) {
      console.error('[BlogDeploy] VuePress binary not found at:', vuepressBin)
      return { error: 'vuepressNotFound' }
    }

    // 2. 确定主题：优先用配置值，其次 auto-detect
    const theme = themeOverride || detectBlogTheme(blogDir)
    const isVdoing = theme === 'vdoing'
    sendProgress(webContents, 'config', `Theme: ${isVdoing ? 'vdoing' : 'VuePress default'}`, 10)

    // 3. 执行 vuepress build
    sendProgress(webContents, 'build', 'Starting VuePress build...', 40)

    const buildResult = await runVuepressBuild(blogDir, vuepressBin, isVdoing, (msg) => {
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

function runVuepressBuild (blogDir, vuepressBin, isVdoing, onProgress) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const nodeBin = isWin ? 'node.cmd' : 'node'

    // vdoing 使用 `vuepress vdoing build`，原生使用 `vuepress build`
    const buildArgs = isVdoing
      ? [vuepressBin, 'vdoing', 'build', blogDir]
      : [vuepressBin, 'build', blogDir]

    const child = spawn(nodeBin, buildArgs, {
      cwd: blogDir,
      shell: true,
      env: { ...process.env },
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
