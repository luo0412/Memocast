// scripts/after-pack.js
// electron-builder afterPack 钩子：在 app 完全解压后裁剪 Electron 多余文件
const path = require('path')
const fs = require('fs')

module.exports = function afterPack(context) {
  const { appOutDir, packager } = context
  const platform = packager.platform.name // 'mac', 'windows', or 'linux'

  // 确定 locales 目录的实际路径（各平台位置不同）
  let localesPath
  let resourcesPath

  if (platform === 'mac') {
    // macOS: Electron locales 在 .app/Contents/Frameworks/Electron Framework.framework/ 中
    const appBundlePath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`)
    resourcesPath = path.join(appBundlePath, 'Contents', 'Resources')
    localesPath = path.join(appBundlePath, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Resources', 'locales')
  } else if (platform === 'windows') {
    // Windows: locales 直接在 win-unpacked\ 下，与 resources 同级
    resourcesPath = path.join(appOutDir, 'resources')
    localesPath = path.join(appOutDir, 'locales')
  } else {
    // Linux: locales 在 resources 目录下
    resourcesPath = path.join(appOutDir, 'resources')
    localesPath = path.join(resourcesPath, 'locales')
  }

  console.log(`[afterPack] 平台: ${platform}`)
  console.log(`[afterPack] resources: ${resourcesPath}`)
  console.log(`[afterPack] locales: ${localesPath}`)

  // ─── 1. 裁剪 locales，只保留中英文 ───
  if (fs.existsSync(localesPath)) {
    const whitelist = ['en-US.pak', 'en.pak', 'zh-CN.pak']
    const files = fs.readdirSync(localesPath)
    let removedCount = 0
    let removedSize = 0
    files.forEach((f) => {
      if (!whitelist.includes(f)) {
        const fullPath = path.join(localesPath, f)
        const size = fs.statSync(fullPath).size
        fs.unlinkSync(fullPath)
        removedCount++
        removedSize += size
      }
    })
    console.log(`[afterPack] locales 裁剪完成: 删除了 ${removedCount} 个文件 (${formatSize(removedSize)}), 保留了 en-US/en/zh-CN`)
  } else {
    console.log(`[afterPack] locales 目录不存在: ${localesPath}`)
  }

  // ─── 2. 删除调试文件 ───
  const debugLog = path.join(resourcesPath, 'debug.log')
  if (fs.existsSync(debugLog)) {
    fs.unlinkSync(debugLog)
    console.log('[afterPack] 已删除 debug.log')
  }

  // ─── 3. 清理 unpack 目录中的无用文件类型 ───
  // asarUnpack 的模块（monaco-editor, echarts, mermaid 等）会解压到 app.asar.unpacked 目录
  // 这些模块内部仍有 .d.ts .md .map 等无用文件，一并清理
  const unpackedPath = path.join(resourcesPath, 'app.asar.unpacked')
  if (fs.existsSync(unpackedPath)) {
    const result = cleanFileTypes(unpackedPath, ['.d.ts', '.md', '.map', '.ts'])
    console.log(`[afterPack] unpacked 目录清理: 删除了 ${result.count} 个文件 (${formatSize(result.size)})`)
  }

  // ─── 4. 清理 crashpad (生产环境不需要) ───
  if (platform === 'mac') {
    const crashpadDir = path.join(resourcesPath, 'crashpad')
    if (fs.existsSync(crashpadDir)) {
      rmrf(crashpadDir)
      console.log('[afterPack] 已删除 crashpad 目录')
    }
    // 删除 fmod 音频库（如果应用不使用音频功能）
    const fmodPath = path.join(resourcesPath, 'fmod.dll') || path.join(resourcesPath, 'libfmod.dylib')
    if (fs.existsSync(fmodPath)) {
      fs.unlinkSync(fmodPath)
      console.log('[afterPack] 已删除 fmod 库')
    }
  }
  if (platform === 'windows') {
    const crashpadClient = path.join(resourcesPath, 'crashpad_handler.exe')
    if (fs.existsSync(crashpadClient)) {
      fs.unlinkSync(crashpadClient)
      console.log('[afterPack] 已删除 crashpad_handler.exe')
    }
    const crashpadReports = path.join(resourcesPath, 'Crashpad')
    if (fs.existsSync(crashpadReports)) {
      rmrf(crashpadReports)
      console.log('[afterPack] 已删除 Crashpad 目录')
    }
    // 删除 fmod 音频库
    const fmodDll = path.join(appOutDir, 'fmod.dll')
    if (fs.existsSync(fmodDll)) {
      fs.unlinkSync(fmodDll)
      console.log('[afterPack] 已删除 fmod.dll')
    }
  }

  // ─── 5. 清理 Electron 其他无用资源 ───
  // 删除 Squirrel 自动更新器（如果你使用 electron-updater 而不是 Squirrel）
  if (platform === 'windows') {
    const squirrelExes = ['Update.exe', 'Update.com']
    squirrelExes.forEach(exe => {
      const exePath = path.join(resourcesPath, exe)
      if (fs.existsSync(exePath)) {
        fs.unlinkSync(exePath)
        console.log(`[afterPack] 已删除 ${exe}`)
      }
    })
  }

  // ─── 6. 清理 app.asar.unpacked 中的更多无用文件 ───
  // 在第 3 步的基础上，进一步清理
  if (fs.existsSync(unpackedPath)) {
    // 清理 node_modules 中常见的无用目录
    const uselessDirs = ['.github', '.vscode', 'example', 'examples', 'test', 'tests', 'docs', 'doc']
    uselessDirs.forEach(dir => {
      const result = cleanDirectoryByName(unpackedPath, dir)
      if (result.count > 0) {
        console.log(`[afterPack] 清理 ${dir} 目录: 删除了 ${result.count} 个 (${formatSize(result.size)})`)
      }
    })

    // 清理 LICENSE、README 等文件（大小写不敏感）
    const uselessFiles = ['LICENSE', 'LICENSE.md', 'README', 'README.md', 'CHANGELOG', 'CHANGELOG.md', 'CONTRIBUTING', 'AUTHORS', 'HISTORY']
    uselessFiles.forEach(file => {
      const result = cleanFileByName(unpackedPath, file)
      if (result.count > 0) {
        console.log(`[afterPack] 清理 ${file} 文件: 删除了 ${result.count} 个 (${formatSize(result.size)})`)
      }
    })

    // ─── 第二轮深度清理 ───

    // 清理测试文件
    const testFiles = ['test.js', 'tests.js', 'spec.js', 'spec.ts']
    testFiles.forEach(pattern => {
      const result = cleanFilesByPattern(unpackedPath, pattern)
      if (result.count > 0) {
        console.log(`[afterPack] 清理 ${pattern}: 删除了 ${result.count} 个 (${formatSize(result.size)})`)
      }
    })

    // 清理覆盖率报告和缓存
    const cacheDirs = ['coverage', 'nyc_output', '.cache', '.temp', 'tmp']
    cacheDirs.forEach(dir => {
      const result = cleanDirectoryByName(unpackedPath, dir)
      if (result.count > 0) {
        console.log(`[afterPack] 清理 ${dir} 缓存: 删除了 ${result.count} 个 (${formatSize(result.size)})`)
      }
    })

    // 清理构建产物
    const buildDirs = ['lib-cov', 'build', 'dist', 'out', 'output', 'typedoc', 'api']
    buildDirs.forEach(dir => {
      const result = cleanDirectoryByName(unpackedPath, dir)
      if (result.count > 0) {
        console.log(`[afterPack] 清理 ${dir} 构建产物: 删除了 ${result.count} 个 (${formatSize(result.size)})`)
      }
    })
  }
}

function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach((file) => {
      const cur = path.join(dir, file)
      if (fs.lstatSync(cur).isDirectory()) {
        rmrf(cur)
      } else {
        fs.unlinkSync(cur)
      }
    })
    fs.rmdirSync(dir)
  }
}

function cleanFileTypes(dir, extensions) {
  let count = 0
  let size = 0

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        // 如果目录清空后为空，也尝试删除（但保留 node_modules 结构）
        const remaining = fs.readdirSync(fullPath)
        if (remaining.length === 0 && !fullPath.endsWith('node_modules')) {
          try { fs.rmdirSync(fullPath) } catch (_) {}
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name)
        if (extensions.includes(ext) || extensions.includes(entry.name)) {
          try {
            const stat = fs.statSync(fullPath)
            size += stat.size
            fs.unlinkSync(fullPath)
            count++
          } catch (_) {}
        }
      }
    }
  }

  walk(dir)
  return { count, size }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function cleanDirectoryByName(rootDir, dirName) {
  let count = 0
  let size = 0

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        // 如果目录名匹配（忽略大小写）
        if (entry.name.toLowerCase() === dirName.toLowerCase()) {
          const result = getDirectorySize(fullPath)
          rmrf(fullPath)
          count++
          size += result.size
        } else {
          walk(fullPath)
        }
      }
    }
  }

  walk(rootDir)
  return { count, size }
}

function cleanFileByName(rootDir, fileName) {
  let count = 0
  let size = 0

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        // 如果文件名匹配（忽略大小写和扩展名）
        if (entry.name.toLowerCase().startsWith(fileName.toLowerCase())) {
          try {
            const stat = fs.statSync(fullPath)
            size += stat.size
            fs.unlinkSync(fullPath)
            count++
          } catch (_) {}
        }
      }
    }
  }

  walk(rootDir)
  return { count, size }
}

function getDirectorySize(dir) {
  let size = 0
  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        try {
          size += fs.statSync(fullPath).size
        } catch (_) {}
      }
    }
  }
  walk(dir)
  return { size }
}

function cleanFilesByPattern(rootDir, pattern) {
  let count = 0
  let size = 0

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        // 如果文件名以模式结尾（如 test.js、spec.ts）
        if (entry.name.endsWith(pattern)) {
          try {
            const stat = fs.statSync(fullPath)
            size += stat.size
            fs.unlinkSync(fullPath)
            count++
          } catch (_) {}
        }
      }
    }
  }

  walk(rootDir)
  return { count, size }
}
