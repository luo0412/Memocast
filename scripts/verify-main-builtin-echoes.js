// 验证 main 端 builtin-echoes.js 中所有 anno_source 可编译
const path = require('path')
const { BUILTIN_ECHO_CARDS } = require('../src-electron/main-process/service/builtin-echoes.js')

// 与 EchoRuntime.HANDLER_PRELUDE_SOURCE 保持完全一致
const HANDLER_PRELUDE_SOURCE = [
  "const __resolveScopeContainer = (node, scope) => {",
  "  if (!node) return null",
  "  const block = node.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol') || node.parentElement",
  "  const documentRoot = node.closest('[data-echo-document], .mu-editor, article, [data-doc-id]') || document.body",
  "  switch (String(scope || 'siblings').toLowerCase()) {",
  "    case 'prev-block': {",
  "      let prev = block && block.previousElementSibling",
  "      while (prev && !prev.firstElementChild && (prev.textContent || '').trim() === '') {",
  "        prev = prev.previousElementSibling",
  "      }",
  "      return prev || block",
  "    }",
  "    case 'block':      return block",
  "    case 'document':   return documentRoot",
  "    case 'siblings':",
  "    default:           return block && block.parentElement ? block.parentElement : documentRoot",
  "  }",
  "}",
  "const __safeQueryAll = (root, sel) => {",
  "  if (!root || typeof root.querySelectorAll !== 'function') return []",
  "  try { return Array.from(root.querySelectorAll(sel)) } catch (error) { return [] }",
  "}",
  "const __withAttrs = (meta, defaults) => Object.assign({}, defaults || {}, (meta && meta.attrs) || {})",
  ""
].join('\n')

let pass = 0
let fail = 0
const errors = []

for (const card of BUILTIN_ECHO_CARDS) {
  const src = card.anno_source
  try {
    // 模拟 EchoRuntime.compileDefinition：用 prelude + safeEvalFactory(source)
    const prelude = HANDLER_PRELUDE_SOURCE
    const normalized = String(src || '').replace(/export\s+default/, 'return')
    const fn = new Function(prelude + normalized)
    const obj = fn()
    if (!obj || typeof obj !== 'object') throw new Error('not an object')
    if (typeof obj.render !== 'function') throw new Error('render missing or not function')

    // 模拟 compileDefinition 的"handlerExample → handler 提升"逻辑
    if (!obj.handler && obj.handlerExample) {
      obj.handler = obj.handlerExample
    }

    if (obj.handler && typeof obj.handler !== 'function') throw new Error('handler must be function if present')
    if (obj.handlerExample && typeof obj.handlerExample !== 'function') {
      throw new Error('handlerExample must be function for documentation purposes')
    }

    // 对 rune 类型验证 handler 必须存在
    const kind = String(obj.kind || '').trim()
    if ((kind === 'rune' || kind === 'rune-tbd') && typeof obj.handler !== 'function') {
      throw new Error('rune must have handler (or auto-promoted from handlerExample)')
    }

    console.log(`[OK]   ${card.id.padEnd(30)}  runeId=${obj.runeId || '(echo)'}  kind=${obj.kind}  handler=${typeof obj.handler === 'function' ? 'fn' : '—'}`)
    pass++
  } catch (err) {
    console.log(`[FAIL] ${card.id.padEnd(30)}  ${err.message}`)
    errors.push({ id: card.id, error: err.message })
    fail++
  }
}

console.log(`\n=== summary: pass=${pass}, fail=${fail}, total=${BUILTIN_ECHO_CARDS.length}`)
if (fail > 0) process.exit(1)