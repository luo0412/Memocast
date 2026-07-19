// ============================================================================
// 内置回响共享样板（renderer 端）
//
// 提供 15 个 echo-chant 内置 + nice 共用的辅助函数 + 共享代码片段。
// 消除 builtinEchoes.js 里 16 份重复的 banner 注释、scope 工具、
// 数据属性读 helper、cleanup 写法。
//
// === 主要导出 ===
//   banner(lines)                把多行教学注释格式化进 anno_source 顶部
//   handlerExampleDoc(lines)     输出 handlerExample 字段头；EchoRuntime 在
//                                compileDefinition() 阶段会自动把 handlerExample
//                                复制为 handler 字段，因此不再需要写两份
//   DEFAULT_ECHO_COLOR / ICON    echo 默认颜色 / 图标
//   CURRENT_ECHO_PLACEHOLDER_RE  @name{attrs}(prompt) 当前形态的正则；
//                                attrs 段可选，因此旧式 @name{}() 也匹配得上。
//                                与 parser/rules.js 中 echo_anno 的结构同源。
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

// ---- 默认图标/颜色 ----
export const DEFAULT_ECHO_COLOR = '#26A69A'
export const DEFAULT_ECHO_ICON = 'graphic_eq'

// 捕获组：[name, attrsRaw, promptRaw]；attrsRaw 可缺省（兼容早期 @name{}() 形态）。
// 单行 prompt（[^)]*）以避免误吞下游 markdown；name 必须 1+ 字符。
export const CURRENT_ECHO_PLACEHOLDER_RE = /@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)/g

// ============================================================================
// handlerFieldSource(fieldName)
//   返回 `${fieldName}: function (chantNode, scopeContainer, meta) {`
//   加 4 个 helper 局部 const 声明（jQuery 版 + __safeQueryAll 返回 jQuery）。
//   闭合由调用方负责（写 `}` + `,`）。
// ============================================================================
const handlerFieldSource = (fieldName) => `${fieldName}: function (chantNode, scopeContainer, meta) {
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
// handlerExampleDoc(docLines)
//   输出 handlerExample 字段头 + 模仿者追加逻辑的入口。
//   EchoRuntime 会在编译时把 handlerExample 自动复制为 handler（见 compileDefinition）。
// ============================================================================
export const handlerExampleDoc = (docLines) => `${banner(docLines)}

  ${handlerFieldSource('handlerExample')}

    // === 模仿者写的 handler 逻辑（紧随 prelude 之后） ===`
