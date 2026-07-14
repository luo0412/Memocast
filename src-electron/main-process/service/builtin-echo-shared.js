/**
 * 内置回响共享样板（main 端，CommonJS）
 *
 * ⚠️ 与 renderer 端的 src/components/ui/editor/echo/builtin-echo-shared.js
 *    内容基本保持一致；本文件严禁 require 跨目录文件。
 *
 * ⚠️ 2026-07 jQuery 化改造说明：
 *    - renderer 端已把 helper 全部切到 jQuery（`$(node).closest(...)` 等），
 *      并要求 HANDLER_PRELUDE_SOURCE 注入 `const $ = window.jQuery`。
 *    - main 进程**不会执行** anno_source（只把它当字符串塞进 SQLite），所以
 *      本文件保留原生 DOM 实现，仅作为「DB 覆写时的语义镜像」。如果未来 main
 *      端需要真正 `new Function` 编译 anno_source，必须同步切到 jQuery 版本。
 *
 * 提供 11 个内置 rune anno_source 共用的辅助函数源码 + 默认常量。
 */
const banner = (lines) => lines.map(line => `//   ${line}`).join('\n  ')

const resolveScopeContainerSource = `
const __resolveScopeContainer = (node, scope) => {
  if (!node) return null
  const block = node.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol') || node.parentElement
  const documentRoot = node.closest('[data-echo-document], .mu-editor, article, [data-doc-id]') || document.body
  switch (String(scope || 'siblings').toLowerCase()) {
    case 'prev-block': {
      let prev = block && block.previousElementSibling
      while (prev && !prev.firstElementChild && (prev.textContent || '').trim() === '') {
        prev = prev.previousElementSibling
      }
      return prev || block
    }
    case 'block':      return block
    case 'document':   return documentRoot
    case 'siblings':
    default:           return block && block.parentElement ? block.parentElement : documentRoot
  }
}`.trim()

const safeQueryAllSource = `
const __safeQueryAll = (root, sel) => {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  try { return Array.from(root.querySelectorAll(sel)) } catch (error) { return [] }
}`.trim()

const withAttrsSource = `
const __withAttrs = (meta, defaults) => Object.assign({}, defaults || {}, (meta && meta.attrs) || {})`.trim()

const sampleShuffleSource = `
const __sampleShuffle = (arr, n) => {
  if (!Array.isArray(arr) || arr.length === 0 || n <= 0) return []
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
  }
  return copy.slice(0, Math.min(n, copy.length))
}`.trim()

const handlerPrelude = [
  resolveScopeContainerSource,
  safeQueryAllSource,
  withAttrsSource,
  sampleShuffleSource
].join('\n\n')

// ---- handlerFieldSource(fieldName) ----
//   返回 `${fieldName}: function (...) {` + 3 个 helper 局部 const 声明。
//   闭合由调用方负责。
const handlerFieldSource = (fieldName) => `${fieldName}: function (runeNode, scopeContainer, meta) {
    const __resolveScopeContainer = (node, scope) => {
      if (!node) return null
      const block = node.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol') || node.parentElement
      const documentRoot = node.closest('[data-echo-document], .mu-editor, article, [data-doc-id]') || document.body
      switch (String(scope || 'siblings').toLowerCase()) {
        case 'prev-block': {
          let prev = block && block.previousElementSibling
          while (prev && !prev.firstElementChild && (prev.textContent || '').trim() === '') {
            prev = prev.previousElementSibling
          }
          return prev || block
        }
        case 'block':      return block
        case 'document':   return documentRoot
        case 'siblings':
        default:           return block && block.parentElement ? block.parentElement : documentRoot
      }
    }
    const __safeQueryAll = (root, sel) => {
      if (!root || typeof root.querySelectorAll !== 'function') return []
      try { return Array.from(root.querySelectorAll(sel)) } catch (error) { return [] }
    }
    const __withAttrs = (meta, defaults) => Object.assign({}, defaults || {}, (meta && meta.attrs) || {})
    const __sampleShuffle = (arr, n) => {
      if (!Array.isArray(arr) || arr.length === 0 || n <= 0) return []
      const copy = arr.slice()
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
      }
      return copy.slice(0, Math.min(n, copy.length))
    }

    // === 模仿者写的 handler 逻辑（紧随 prelude 之后） ===`

// ---- handlerAndExampleDoc(docLines) ----
//   返回"banner + handler 字段头 + handlerExample 字段头"。
//   调用方写完模仿者逻辑后用 `}` 闭合函数 + `,` 闭合 handlerExample 字段。
const handlerAndExampleDoc = (docLines) => {
  const bannerText = banner(docLines)
  return `${bannerText}

  ${handlerFieldSource('handler')}

    // === 模仿者写的 handler 逻辑（紧随 prelude 之后） ===
  },
  ${bannerText}

  ${handlerFieldSource('handlerExample')}

    // === 模仿者写的 handler 逻辑（紧随 prelude 之后） ===`
}

// ---- handlerExampleDoc(docLines) —— 兼容旧 API ----
const handlerExampleDoc = (docLines) => `${banner(docLines)}

  ${handlerFieldSource('handlerExample')}

    // === 模仿者写的 handler 逻辑（紧随 prelude 之后） ===`

const DEFAULT_ECHO_COLOR = '#26A69A'
const DEFAULT_ECHO_ICON = 'graphic_eq'

module.exports = {
  banner,
  handlerAndExampleDoc,
  handlerExampleDoc,
  handlerFieldSource,
  handlerPrelude,
  resolveScopeContainerSource,
  safeQueryAllSource,
  withAttrsSource,
  DEFAULT_ECHO_COLOR,
  DEFAULT_ECHO_ICON,
  SCOPE_TYPES: Object.freeze({
    SIBLINGS: 'siblings',
    PREV_BLOCK: 'prev-block',
    BLOCK: 'block',
    DOCUMENT: 'document'
  })
}