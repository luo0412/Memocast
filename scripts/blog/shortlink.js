/**
 * 短链转换 —— 把 sidebar / nav JSON 树中的 path 字段映射为 /<id>.html
 *
 * 与 E:\work-前端\note\_docs\.vuepress\utils\utils-shortlink.js 对齐：
 *   - 输入是 sidebar/nav JSON（对象树，节点可能是 string 或 { title, children, ... }）
 *   - 输出是改写后的 JSON，字符串节点 'foo/bar' -> '/<id>.html'
 *   - id 由 genId(origBasename, dir) 决定；文件名剥离后的序号从 seqMap 取
 *   - 转换是确定性的（基于 hash + seqMap），多次运行结果一致
 *
 * 注意：
 *   - 不改写外部链接（http/https、//、mailto:）
 *   - 不改写 *.html / *.png 等已是绝对/资源链接
 *   - 不递归修改非链接字段（如 title、text、items）
 */

'use strict'

const path = require('path')
const { genId, extractSeq } = require('./hash-id')

const ABSOLUTE_LINK_REGEX = /^(?:[a-z]+:\/\/|\/\/|mailto:|tel:|data:|#)/i
const ASSET_EXT_REGEX = /\.(?:html|png|jpe?g|gif|svg|webp|mp4|m4v|mov|webm|pdf|zip|tar|gz|mp3|wav|ico|json|css|js)(?:\?.*)?(?:#.*)?$/i

function isExternalOrAsset(value) {
  if (!value) return false
  if (typeof value !== 'string') return false
  if (ABSOLUTE_LINK_REGEX.test(value)) return true
  if (ASSET_EXT_REGEX.test(value)) return true
  return false
}

/**
 * 把单个 path（如 'nav.1-tech/ch.1-fe/01-react' 或 'nav.1-tech/ch.1-fe/'）
 * 转成 '/<id>.html'。
 *
 * @param {string} p 原始 path
 * @param {object} [opts]
 * @param {object} [opts.seqMap] 序号映射（显式优先）
 * @returns {string}
 */
function shortlink(p, opts = {}) {
  if (isExternalOrAsset(p)) return p
  if (!p) return p
  const seqMap = opts.seqMap || {}
  // 去掉前导/尾部斜杠
  const trimmed = String(p).replace(/^\/+|\/+$/g, '')
  if (!trimmed) return p

  // 如果是目录（以 / 结尾），不参与 hash
  const isDir = /\/$/.test(p)
  // 取文件名（不含扩展名）
  const segs = trimmed.split('/')
  const last = segs[segs.length - 1]
  const dir = segs.slice(0, -1).join('/')

  // 显式序号从 seqMap 取；否则从文件名提取
  let seq
  if (seqMap[trimmed] !== undefined) {
    seq = seqMap[trimmed]
  } else if (seqMap[last] !== undefined) {
    seq = seqMap[last]
  } else {
    seq = extractSeq(last)
  }

  // 喂入 hash 的 basename 应当是去掉 seq 前缀的形式（如 'react' 而非 '01-react'）
  const basename = seq !== null && seq !== undefined
    ? last.replace(/^\d+[a-zA-Z]*[-_]/, '')
    : last

  const id = genId(basename || 'index', dir || '')
  if (isDir) return `/${id}/`
  return `/${id}.html`
}

/**
 * 把对象里所有 'link' / 'path' 字段按 shortlink 规则转换。
 * 不动 title / text / items / children 这些结构字段。
 */
// 已知结构字段：
//   - items/children: 数组，需要递归
//   - text/title: 叶子字符串，保留原值
const ARRAY_KEYS = new Set(['items', 'children'])

function rewriteTree(node, opts = {}) {
  if (node == null) return node
  if (typeof node === 'string') {
    return shortlink(node, opts)
  }
  if (Array.isArray(node)) {
    return node.map(item => rewriteTree(item, opts))
  }
  if (typeof node === 'object') {
    const out = {}
    for (const k of Object.keys(node)) {
      const v = node[k]
      if (k === 'link' || k === 'path') {
        // link/path 必须是字符串，但下游传对象过来也宽容处理
        out[k] = typeof v === 'string' ? shortlink(v, opts) : rewriteTree(v, opts)
      } else if (ARRAY_KEYS.has(k)) {
        out[k] = rewriteTree(v, opts)
      } else if (v && typeof v === 'object') {
        // 任意对象/数组值都递归处理（覆盖 sidebar 这种 Object<string, Array>）
        out[k] = rewriteTree(v, opts)
      } else {
        // text/title/其他叶子字段：原样保留
        out[k] = v
      }
    }
    return out
  }
  return node
}

/**
 * 为 export 阶段计算 permalink ——
 * 喂入 (basename, dir) 而不是完整 path，因为 export 阶段还没跑 stage
 *（不知道最终文件是否还有 01- 前缀），但希望与 sidebar.json 阶段算出的
 * shortlink 完全一致。
 *
 * 关键点：export 阶段喂入的 basename 已经带 `01-` 前缀；shortlink() 内部
 * 会先剥掉 seq 前缀再算 hash，所以这里不需要再处理。
 *
 * @param {string} basename 例如 '01-Hello.md' 或 'My Note.md'（带 .md 也可）
 * @param {string} dir      例如 '<out>/nav.技术'（绝对路径，函数内部会提取最后一层）
 * @param {object} [opts]
 * @param {boolean} [opts.isDir] 如果 true，permalink 以 / 结尾（用于目录 README）
 * @returns {string}         例如 '/abc123.html' 或 '/abc123/'
 */
function shortlinkForExport(basename, dir, opts = {}) {
  // 只关心相对 out 的最后一段（nav.技术 这种）；取 basename 的纯文件名
  const lastDir = (dir || '').split(/[\\/]/).filter(Boolean).pop() || ''
  const base = String(basename || '').replace(/\.md$/i, '')
  if (!base) {
    // 没有 basename = 目录 permalink
    const id = genId('index', lastDir)
    return `/${id}/`
  }
  const seq = extractSeq(base)
  const stripped = seq !== null && seq !== undefined
    ? base.replace(/^\d+[a-zA-Z]*[-_]/, '')
    : base
  const id = genId(stripped || 'index', lastDir)
  if (opts.isDir) return `/${id}/`
  return `/${id}.html`
}

module.exports = {
  shortlink,
  rewriteTree,
  isExternalOrAsset,
  shortlinkForExport
}