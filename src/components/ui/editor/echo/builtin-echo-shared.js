// ============================================================================
// 内置回响共享样板（renderer 端）
//
// 提供 11 个内置 rune anno_source 共用的辅助函数 + 共享代码片段。
// 消除 builtinEchoes.js 里 11 份重复的 banner 注释、scope 工具、
// 数据属性读 helper、cleanup 写法。
//
// === 主要导出 ===
//   banner(lines)                把多行教学注释格式化进 anno_source 顶部
//   handlerAndExampleDoc(lines)  同时输出"handler + handlerExample"两个字段
//                                （同一段函数体），让运行时直接接管 handler，
//                                同时保留 handlerExample 作为文档备份
//   resolveScopeContainerSource  scope 解析工具源码（jQuery 版）
//   safeQueryAllSource           防错 querySelectorAll 工具源码（jQuery 版）
//   withAttrsSource              meta.attrs 默认值合并 helper 源码
//   handlerPrelude               上面几个 helper 源码拼成的 prelude 串
//
// === anno_source 约定 ===
//   这些函数**字符串化**后塞进 anno_source 用！所以 "banner()" 之类的
//   内部调用都用普通 JS 字符串拼接，不能用 ES module 语法。
//
// === jQuery 集成 ===
//   handler 闭包内由 EchoRuntime 的 HANDLER_PRELUDE_SOURCE 先注入
//   `const $ = window.jQuery` 与 `const __$ = $`，下面 helper 全部以
//   jQuery 选择器 API 为前提；调用方拿到的是 jQuery 对象实例，可继续用
//   `.addClass` / `.removeClass` / `.css` / `.attr` / `.on` / `.off` 等。
// ============================================================================

// ---- 单行注释 banner：避免 /* */ 多行注释后直接接 , 触发 "Unexpected token ','" ----
export const banner = (lines) => lines.map(line => `//   ${line}`).join('\n  ')

// ---- scope 解析工具源码（jQuery 版） ----
export const resolveScopeContainerSource = `
const __resolveScopeContainer = (node, scope) => {
  if (!node || typeof node.closest !== 'function') return null
  const $node = $(node)
  const block = $node.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').get(0) || node.parentElement
  const documentRoot = $node.closest('[data-echo-document], .mu-editor, article, [data-doc-id]').get(0) || document.body
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

// ---- 防错 querySelectorAll（jQuery 版：直接返回 jQuery 实例） ----
export const safeQueryAllSource = `
const __safeQueryAll = (root, sel) => {
  if (!root || typeof root.querySelectorAll !== 'function') return $([])
  try { return $(root).find(sel) } catch (error) { return $([]) }
}`.trim()

// ---- meta.attrs 合并 helper 源码（仍是纯 JS，不需要 $） ----
export const withAttrsSource = `
const __withAttrs = (meta, defaults) => Object.assign({}, defaults || {}, (meta && meta.attrs) || {})`.trim()

// ---- 随机抽样 helper 源码（纯 JS） ----
export const sampleShuffleSource = `
const __sampleShuffle = (arr, n) => {
  if (!Array.isArray(arr) || arr.length === 0 || n <= 0) return []
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
  }
  return copy.slice(0, Math.min(n, copy.length))
}`.trim()

// ---- 给 anno_source 内嵌入 helper 的整段 prelude ----
export const handlerPrelude = [
  resolveScopeContainerSource,
  safeQueryAllSource,
  withAttrsSource,
  sampleShuffleSource
].join('\n\n')

// ---- 默认图标/颜色 ----
export const DEFAULT_ECHO_COLOR = '#26A69A'
export const DEFAULT_ECHO_ICON = 'graphic_eq'
export const LEGACY_ECHO_INSERT_RE = /@([^\s{}()@]+)\{\}\(\)/g
export const CURRENT_ECHO_PLACEHOLDER_RE = /@([^\s{}()@]*)\{([\s\S]*?)\}\(([^)]*)\)/g

// ============================================================================
// handlerFieldSource(fieldName)
//   返回 `${fieldName}: function (runeNode, scopeContainer, meta) {`
//   加 4 个 helper 局部 const 声明（jQuery 版 + __safeQueryAll 返回 jQuery）。
//   闭合由调用方负责（写 `}` + `,`）。
// ============================================================================
const handlerFieldSource = (fieldName) => `${fieldName}: function (runeNode, scopeContainer, meta) {
    const __resolveScopeContainer = (node, scope) => {
      if (!node || typeof node.closest !== 'function') return null
      const $node = $(node)
      const block = $node.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').get(0) || node.parentElement
      const documentRoot = $node.closest('[data-echo-document], .mu-editor, article, [data-doc-id]').get(0) || document.body
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
      if (!root || typeof root.querySelectorAll !== 'function') return $([])
      try { return $(root).find(sel) } catch (error) { return $([]) }
    }
    const __withAttrs = (meta, defaults) => Object.assign({}, defaults || {}, (meta && meta.attrs) || {})

    // === 模仿者写的 handler 逻辑（紧随 prelude 之后） ===`

// ============================================================================
// handlerAndExampleDoc(docLines)
//   返回"banner + handler 字段头 + handlerExample 字段头"——
//   模仿者写完逻辑后用 \`}\` 闭合函数 + \`,\` 闭合 handlerExample 字段。
//   两段代码必须**逐字一致**，由编译时复制保证。
//
//   完整拼接形如：
//     // banner 注释
//
//     handler: function (runeNode, scopeContainer, meta) {
//       const __resolveScopeContainer = ...
//       const __safeQueryAll = ...
//       const __withAttrs = ...
//
//       // === 模仿者写的逻辑 ===
//     },
//     handlerExample: function (runeNode, scopeContainer, meta) {
//       const __resolveScopeContainer = ...
//       const __safeQueryAll = ...
//       const __withAttrs = ...
//
//       // === 模仿者写的逻辑 ===
//
//   调用方在最后写：
//     <模仿者写的逻辑>
//     }       ← 闭合 handlerExample 函数体
//
//   然后再以 \`}\` 闭合 \`export default { ... }\`。
//
//   注意：handler 和 handlerExample 之间共享同一份函数体字符串，
//   模仿者只需写一遍逻辑。但因为 JS 对象字面量的字段值必须是表达式，
//   我们必须**复制一份**——这正是"代码同步"的工程负担点。
// ============================================================================
export const handlerAndExampleDoc = (docLines) => {
  const bannerText = banner(docLines)
  return `${bannerText}

  ${handlerFieldSource('handler')}

    // === 模仿者写的 handler 逻辑（紧随 prelude 之后） ===
  },
  ${bannerText}

  ${handlerFieldSource('handlerExample')}

    // === 模仿者写的 handler 逻辑（紧随 prelude 之后） ===`
}

// ============================================================================
// handlerExampleDoc(docLines) —— 兼容旧 API
//   仅输出 handlerExample 字段（不接管运行时）。
//   用法：给尚未写完整 handler 的占位 rune 使用。
// ============================================================================
export const handlerExampleDoc = (docLines) => `${banner(docLines)}

  ${handlerFieldSource('handlerExample')}

    // === 模仿者写的 handler 逻辑（紧随 prelude 之后） ===`
