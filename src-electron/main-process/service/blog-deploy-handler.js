/**
 * 博客打包部署 Handler
 * 策略：使用 Memocast 内置 vuepress（node_modules），自动检测目标目录主题
 */
const { spawn, exec } = require('child_process')
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
  
  console.log('[BlogDeploy] __dirname:', __dirname)
  console.log('[BlogDeploy] process.cwd():', process.cwd())
  console.log('[BlogDeploy] app.getAppPath():', app.getAppPath())
  console.log('[BlogDeploy] app.isPackaged:', app.isPackaged)

  // 尝试多个可能的 Memocast 根目录
  const possibleRoots = [
    // 1. 相对于 process.cwd() (最可靠)
    path.resolve(process.cwd()),
    // 2. 相对于 __dirname (开发模式: src-electron/main-process/service -> 项目根)
    path.resolve(__dirname, '..', '..', '..'),
    // 3. 相对于 app.getAppPath() (.quasar/electron -> 项目根)
    path.resolve(app.getAppPath(), '..', '..', '..'),
  ]

  // 去重
  const uniqueRoots = [...new Set(possibleRoots)]
  console.log('[BlogDeploy] Trying roots:', uniqueRoots)

  for (const projectRoot of uniqueRoots) {
    const vuepressCli = path.join(projectRoot, 'node_modules', 'vuepress', 'cli.js')
    console.log('[BlogDeploy] Checking:', vuepressCli, fs.existsSync(vuepressCli) ? '(exists)' : '(missing)')
    
    if (fs.existsSync(vuepressCli)) {
      console.log('[BlogDeploy] Found vuepress at:', vuepressCli)
      return { bin: vuepressCli, projectRoot }
    }
  }

  // 最后尝试 .bin 目录
  for (const projectRoot of uniqueRoots) {
    const binPath = path.join(projectRoot, 'node_modules', '.bin', isWin ? 'vuepress.cmd' : 'vuepress')
    if (fs.existsSync(binPath)) {
      console.log('[BlogDeploy] Found vuepress at:', binPath)
      return { bin: binPath, projectRoot }
    }
  }

  console.error('[BlogDeploy] VuePress not found in any location!')
  return { bin: '', projectRoot: uniqueRoots[0] }
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

  // 检查 package.json（VuePress 必需）
  const pkgPath = path.join(blogDir, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    errors.push(`缺少 package.json`)
  }

  // 检查必要的配置文件（至少要有 config.js 或 config.ts）
  const configDir = path.join(blogDir, '.vuepress')
  if (!fs.existsSync(configDir)) {
    errors.push(`缺少 .vuepress 目录`)
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
    errors.push(`缺少 _posts 目录`)
  } else {
    const mdFiles = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'))
    if (mdFiles.length === 0) {
      errors.push(`_posts 目录中没有 MD 文件`)
    }
  }

  return { valid: errors.length === 0, errors }
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
    // 0. 验证博客目录，若缺少配置文件则自动生成
    sendProgress(webContents, 'config', 'Checking blog directory...', 2)
    let validation = validateBlogDir(blogDir)
    
    if (!validation.valid) {
      // 自动生成缺失的配置文件
      sendProgress(webContents, 'config', 'Generating config files...', 5)
      await ensureBlogConfig(blogDir)
      
      // 重新验证
      validation = validateBlogDir(blogDir)
      if (!validation.valid) {
        const errorMsg = validation.errors.join('; ')
        console.error('[BlogDeploy] Validation failed:', errorMsg)
        return { error: 'blogDirInvalid', details: validation.errors }
      }
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
