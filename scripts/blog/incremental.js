/**
 * 增量构建缓存 —— 基于内容 hash 跳过未变文件
 *
 * 设计：
 *   - 每次 export + stage 后，会把每个最终输出的 .md 文件的内容 hash、
 *     size、mtime、relPath 写进 `<stageRoot>/.vuepress/.blog-build-manifest.json`
 *   - 下次 export 时，对比相同 relPath 的 hash：相同则跳过磁盘写
 *   - manifest 本身可被 git 忽略（写入 .gitignore 建议）
 *
 * 算法：
 *   hash = sha256(content) 取前 16 个 hex 字符
 *   稳定性：纯文本内容 hash，不依赖 mtime
 *
 * 不引第三方包；Node 内置 crypto。
 */

'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MANIFEST_FILE = '.blog-build-manifest.json'
const MANIFEST_VERSION = 1
const HASH_LEN = 16 // 取 sha256 前 16 字符 = 64 bit，碰撞概率极低

/**
 * 计算内容 hash。
 */
function contentHash(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex').slice(0, HASH_LEN)
}

/**
 * 加载 manifest；不存在或损坏返回空对象。
 */
function loadManifest(stageRoot) {
  const file = path.join(stageRoot, '.vuepress', MANIFEST_FILE)
  if (!fs.existsSync(file)) return { version: MANIFEST_VERSION, entries: {} }
  try {
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!obj || typeof obj !== 'object' || !obj.entries) return { version: MANIFEST_VERSION, entries: {} }
    return obj
  } catch (_e) {
    return { version: MANIFEST_VERSION, entries: {} }
  }
}

/**
 * 写 manifest（原子：先写临时文件再 rename）。
 */
function saveManifest(stageRoot, manifest) {
  const dir = path.join(stageRoot, '.vuepress')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, MANIFEST_FILE)
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    entries: manifest.entries || {}
  }, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

/**
 * 对一段 markdown 内容（已含最终 YAML front-matter）做增量决策：
 *   - 若 manifest 中存在 relPath 且 hash 相同 → 返回 { skip: true, hash }
 *   - 否则返回 { skip: false, hash }
 *
 * @param {object} manifest 已有 manifest 对象
 * @param {string} relPath stage-relative path（不带 .md 也可，但建议统一）
 * @param {string} content 已渲染好的完整 markdown 内容
 */
function shouldSkip(manifest, relPath, content) {
  const hash = contentHash(content)
  const entry = manifest.entries[relPath]
  if (entry && entry.hash === hash) return { skip: true, hash }
  return { skip: false, hash }
}

/**
 * 把单条内容写入磁盘并更新 manifest。返回是否真的写盘。
 */
function writeIncremental(stageRoot, manifest, relPath, content) {
  const { skip, hash } = shouldSkip(manifest, relPath, content)
  if (skip) return { written: false, hash }
  const fullPath = path.join(stageRoot, relPath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content, 'utf8')
  const stat = fs.lstatSync(fullPath)
  manifest.entries[relPath] = {
    hash,
    size: stat.size,
    mtime: stat.mtimeMs,
    builtAt: Date.now()
  }
  return { written: true, hash }
}

/**
 * 清理 manifest 中不再存在的 stale 条目。
 */
function pruneManifest(stageRoot, manifest) {
  const before = Object.keys(manifest.entries).length
  for (const rel of Object.keys(manifest.entries)) {
    const full = path.join(stageRoot, rel)
    if (!fs.existsSync(full)) delete manifest.entries[rel]
  }
  const after = Object.keys(manifest.entries).length
  return { removed: before - after }
}

module.exports = {
  loadManifest,
  saveManifest,
  shouldSkip,
  writeIncremental,
  pruneManifest,
  contentHash,
  MANIFEST_FILE,
  MANIFEST_VERSION,
  HASH_LEN
}