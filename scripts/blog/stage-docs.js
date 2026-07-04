/**
 * stage-docs.js —— 把 export-from-sqlite 输出的目录整理为最终 vuepress 输入目录
 *
 * 主要工作：
 *   1) 把目录名 `nav.1-技术` -> `nav.技术`（去掉序号），但把序号写进 seq-manifest.json
 *   2) 把 `01-foo.md` -> `foo.md`（去掉文件名序号），同样写进 seq-manifest.json
 *   3) 自动给每个目录补 README.md（如不存在）
 *   4) 清理空目录、清理 `_misc`（如果为空）
 *   5) 写 `seq-manifest.json` 到目标根目录，供 shortlink 阶段使用
 *
 * 幂等：可重复运行（先还原再 stage）。
 */

'use strict'

const fs = require('fs')
const path = require('path')

const SEQ_FILENAME_REGEX = /^(\d+[a-zA-Z]*)[-_](.+)$/
const NAV_DIR_PREFIX_REGEX = /^(nav|ch|sec)[.\-_]/

/**
 * 还原阶段：把已经处理过的目录重命名回原样，以便重新 stage。
 * 通过 manifest 反向操作。
 */
function restoreFromManifest(stageRoot, manifest) {
  if (!manifest) return
  // 1) 文件名还原
  for (const [relPath, seq] of Object.entries(manifest.files || {})) {
    const origBase = manifest.originals && manifest.originals[relPath] || relPath
    const fullSrc = path.join(stageRoot, relPath)
    if (!fs.existsSync(fullSrc)) continue
    const dir = path.dirname(fullSrc)
    // 已处理过的文件应当是 foo.md；现在还原成 01-foo.md
    const target = path.join(dir, origBase)
    if (!fs.existsSync(target)) fs.renameSync(fullSrc, target)
  }
  // 2) 目录名还原（自底向上）
  for (const [relPath, seq] of Object.entries(manifest.dirs || {})) {
    const origName = manifest.dirOriginals && manifest.dirOriginals[relPath] || relPath
    const parent = path.dirname(relPath)
    const newDir = path.join(stageRoot, parent, origName)
    const curDir = path.join(stageRoot, relPath)
    if (!fs.existsSync(curDir)) continue
    if (!fs.existsSync(newDir)) fs.renameSync(curDir, newDir)
  }
}

/**
 * 递归扫 stage 根目录，收集：
 *   - files: { <stage-relative-no-ext> : seq }（文件序号映射）
 *   - dirs:  { <stage-relative>         : seq }（目录序号映射）
 *   - originals: { <stage-relative-no-ext> : originalBasename }
 *   - dirOriginals: { <stage-relative>     : originalDirname }
 *
 * 注意：本函数会把目录 `nav.1-技术` 视为"已被处理的格式"——
 * 也就是说输入 stage 根目录应为 export 后的原始 _docs-export。
 */
function collectSeqMappings(root) {
  const files = {}
  const dirs = {}
  const originals = {}
  const dirOriginals = {}

  function walk(dir, relBase) {
    const names = fs.readdirSync(dir)
    for (const name of names) {
      const full = path.join(dir, name)
      const stat = fs.lstatSync(full)
      if (stat.isDirectory()) {
        const rel = relBase ? `${relBase}/${name}` : name
        // 目录名通常形如 'nav.1-技术'：需要先剥离 nav./ch./sec. 前缀
        // 再识别数字序号前缀
        const m = NAV_DIR_PREFIX_REGEX.exec(name)
        const navPrefix = m ? m[0] : ''
        const stripped = navPrefix ? name.slice(navPrefix.length) : name
        const sm = stripped.match(SEQ_FILENAME_REGEX)
        if (sm) {
          const seq = parseInt(sm[1], 10)
          // 重命名时去掉数字序号，保留 nav./ch./sec. 前缀
          const cleaned = navPrefix + sm[2]
          const cleanedRel = relBase ? `${relBase}/${cleaned}` : cleaned
          dirs[cleanedRel] = seq
          dirOriginals[cleanedRel] = name
          // 物理改名
          const newFull = path.join(dir, cleaned)
          if (!fs.existsSync(newFull)) fs.renameSync(full, newFull)
          walk(newFull, cleanedRel)
        } else {
          walk(full, rel)
        }
      } else if (stat.isFile() && name.endsWith('.md')) {
        const base = name.slice(0, -3)
        const m = base.match(SEQ_FILENAME_REGEX)
        if (m) {
          const seq = parseInt(m[1], 10)
          const cleaned = base.replace(SEQ_FILENAME_REGEX, '$2')
          const rel = relBase ? `${relBase}/${cleaned}` : cleaned
          files[rel] = seq
          originals[rel] = name
          // 物理改名
          const newName = cleaned + '.md'
          const newFull = path.join(dir, newName)
          if (!fs.existsSync(newFull)) fs.renameSync(full, newFull)
        }
      }
    }
  }

  walk(root, '')
  return { files, dirs, originals, dirOriginals }
}

/**
 * 给没有 README.md 的目录补一个最小 README。
 * 内容用目录名（去前缀）作为标题。
 */
function ensureReadmes(root) {
  const cleanedNameToTitle = (name) => name
    .replace(/^(nav|ch|sec)[.\-_]/, '')
    .replace(/^(\d+[a-zA-Z]*)[-_\.]?/, '')
    .replace(/[-_]+/g, ' ')
    .trim()

  function walk(dir, relBase) {
    const names = fs.readdirSync(dir)
    let hasReadme = names.includes('README.md')
    for (const name of names) {
      const full = path.join(dir, name)
      const stat = fs.lstatSync(full)
      if (stat.isDirectory()) {
        walk(full, relBase ? `${relBase}/${name}` : name)
      }
    }
    // 仅当目录下存在其他 .md 时才补 README
    const hasContentMd = names.some(n => n.endsWith('.md') && n !== 'README.md')
    if (!hasReadme && hasContentMd) {
      const title = cleanedNameToTitle(path.basename(dir))
      const today = new Date().toISOString()
      const content = `---
title: "${title}"
order: 0
---

# ${title}

> 由脚本自动生成的目录索引。  
> 最后更新：${today}
`
      fs.writeFileSync(path.join(dir, 'README.md'), content, 'utf8')
    }
  }

  walk(root, '')
}

/**
 * 清理空目录与空 _misc。
 */
function cleanEmptyDirs(root) {
  function walk(dir) {
    const names = fs.readdirSync(dir)
    let removed = false
    for (const name of names) {
      const full = path.join(dir, name)
      const stat = fs.lstatSync(full)
      if (stat.isDirectory()) {
        if (walk(full)) removed = true
      }
    }
    // 再判断一次
    const remaining = fs.readdirSync(dir)
    if (remaining.length === 0 && dir !== root) {
      fs.rmdirSync(dir)
      return true
    }
    return removed
  }
  walk(root)
  // 额外：_misc 为空就删
  const misc = path.join(root, '_misc')
  if (fs.existsSync(misc)) {
    const rest = fs.readdirSync(misc)
    if (rest.length === 0) fs.rmdirSync(misc)
  }
}

/**
 * 写 seq-manifest.json。
 */
function writeManifest(stageRoot, mappings) {
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    files: mappings.files,
    dirs: mappings.dirs,
    originals: mappings.originals,
    dirOriginals: mappings.dirOriginals
  }
  const out = path.join(stageRoot, 'seq-manifest.json')
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2), 'utf8')
  return out
}

/**
 * 主入口。
 *
 * @param {string} srcDir export-from-sqlite 输出的目录
 * @param {string} [stageRoot] 处理后的目录（默认 srcDir 下新建 _docs）
 */
function stageDocs(srcDir, stageRoot) {
  stageRoot = stageRoot || path.join(path.dirname(srcDir), '_docs')
  if (!fs.existsSync(srcDir)) {
    throw new Error(`[stage] 源目录不存在: ${srcDir}`)
  }
  const samePath = path.resolve(srcDir) === path.resolve(stageRoot)
  // 清空旧 stage 目录（除非 srcDir == stageRoot，否则不能清空 src）
  if (!samePath && fs.existsSync(stageRoot)) {
    fs.rmSync(stageRoot, { recursive: true, force: true })
  }
  if (!samePath) {
    // 拷贝 src -> stage（递归）
    fs.mkdirSync(stageRoot, { recursive: true })
    copyTree(srcDir, stageRoot)
  } else {
    fs.mkdirSync(stageRoot, { recursive: true })
  }

  // 先扫一次拿到 mappings（同时物理改名）
  const mappings = collectSeqMappings(stageRoot)
  // 补 README
  ensureReadmes(stageRoot)
  // 清理空目录
  cleanEmptyDirs(stageRoot)
  // 写 manifest
  const manifestPath = writeManifest(stageRoot, mappings)
  console.log(`[stage] 完成：${stageRoot}`)
  console.log(`[stage] manifest: ${manifestPath}`)
  console.log(`[stage] 文件数：${Object.keys(mappings.files).length}，目录数：${Object.keys(mappings.dirs).length}`)
  return { stageRoot, mappings, manifestPath }
}

function copyTree(src, dest) {
  const stat = fs.lstatSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      copyTree(path.join(src, name), path.join(dest, name))
    }
  } else if (stat.isFile()) {
    fs.copyFileSync(src, dest)
  }
}

module.exports = {
  stageDocs,
  collectSeqMappings,
  ensureReadmes,
  cleanEmptyDirs,
  writeManifest,
  restoreFromManifest,
  SEQ_FILENAME_REGEX
}