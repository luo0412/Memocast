// scripts/verify-jquery-echo-compile.js
// 验证 renderer 端 builtinEchoes.js 的 11 个 anno_source 在 jQuery 化的新 prelude 下:
//   1) 能被 new Function(prelude + source) 编译
//   2) render() 返回合法对象
//   3) jQuery 化的 helper 不抛 ReferenceError
//
// 实现策略：
//   - 把 builtinEchoes.js + EchoRuntime.js 整段读出来，去掉 ESM import / export 语法，
//     注入精简版的 helper（banner / handlerAndExampleDoc 等），拼成一段普通 script
//     通过 new Function(globalThis => { ...; globalThis.__...__ = BUILTIN_ECHO_CARDS }) 执行，
//     这样顶层 const/function 会正常 hoist。
//   - 对每个 anno_source 做 `export default` → `return` 的规范化后，
//     用与 EchoRuntime 一致的 HANDLER_PRELUDE_SOURCE 拼起来，丢给 new Function() 编译。
//   - 再调用 def.render() 验证返回的对象有 type / title。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../src/components/ui/editor/echo')

function loadBuiltinEchoes () {
  // 注入 helper banner / handlerAndExampleDoc / handlerExampleDoc / handlerFieldSource
  // 这些是 builtinEchoes.js 的 import 来源 ./builtin-echo-shared.js。
  // 我们提供一个精简但足够让模板插值求值的版本（只用到了 banner / handlerAndExampleDoc / handlerExampleDoc）。
  const helperInjection = `
const banner = (lines) => lines.map(line => '//   ' + line).join('\\n  ')
const __resolveScopeContainer = (node, scope) => {
  if (!node || typeof node.closest !== 'function') return null
  const $node = (typeof window !== 'undefined' && (window.jQuery || window.$)) ? (window.jQuery || window.$)(node) : null
  const block = ($node && $node.closest) ? ($node.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').get(0) || node.parentElement) : node.parentElement
  const documentRoot = ($node && $node.closest) ? ($node.closest('[data-echo-document], .mu-editor, article, [data-doc-id]').get(0) || document.body) : document.body
  return block
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
const handlerFieldSource = (fieldName) => fieldName + ': function (chantNode, scopeContainer, meta) {\\n    const __resolveScopeContainer = ' + __resolveScopeContainer.toString() + '\\n    const __safeQueryAll = ' + __safeQueryAll.toString() + '\\n    const __withAttrs = ' + __withAttrs.toString() + '\\n    // === handler logic ==='
const handlerAndExampleDoc = (docLines) => {
  const b = banner(docLines)
  return b + '\\n\\n  ' + handlerFieldSource('handler') + '\\n\\n    // === handler logic ===\\n  },\\n  ' + b + '\\n\\n  ' + handlerFieldSource('handlerExample') + '\\n\\n    // === handler logic ==='
}
const handlerExampleDoc = (docLines) => banner(docLines) + '\\n\\n  ' + handlerFieldSource('handlerExample') + '\\n\\n    // === handler logic ==='
const handlerPrelude = ''
const resolveScopeContainerSource = ''
const safeQueryAllSource = ''
const withAttrsSource = ''
const sampleShuffleSource = ''
`

  // 把 EchoRuntime.js 跑出来,但需要 strip 掉 export default class,因为我们不要 EchoRuntime 类本身。
  // 只要其中的 createDefaultEchoAnnoSource / createDefaultChantAnnoSource。
  const runtimeRaw = fs.readFileSync(path.join(ROOT, 'EchoRuntime.js'), 'utf8')
  const runtimeStripped = runtimeRaw
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+function\s+/gm, 'function ')
    .replace(/^export\s+default\s+class\s+(\w+)\s*\{/gm, 'class $1 {')

  // builtinEchoes.js 里有 "const createDefaultEchoAnnoSource = ..." 这一行会与 EchoRuntime 重名，
  // 我们把 builtinEchoes.js 的这一行重命名,避免 duplicate identifier 报错。
  const builtinRaw = fs.readFileSync(path.join(ROOT, 'builtinEchoes.js'), 'utf8')
  const builtinStripped = builtinRaw
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+function\s+/gm, 'function ')
    // 关键：去掉 builtinEchoes.js 内部的 createDefaultEchoAnnoSource 局部别名，让 import 来源生效
    .replace(/^const createDefaultEchoAnnoSource = \(echoName = ['"]回响['"]\) => createRuntimeDefaultAnnoSource\(echoName\)$/m,
      '// stripped: local createDefaultEchoAnnoSource alias; using the one from EchoRuntime')

  const fullCode = helperInjection + '\n' + runtimeStripped + '\n' + builtinStripped

  // eslint-disable-next-line no-new-func
  const fn = new Function('globalThis', `
    ${fullCode}
    globalThis.__TEST_BUILTIN_ECHO_CARDS__ = BUILTIN_ECHO_CARDS
    return globalThis.__TEST_BUILTIN_ECHO_CARDS__
  `)
  return fn(globalThis)
}

const HANDLER_PRELUDE_SOURCE = [
  "const __safeDollarRuntime = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null",
  "if (!__safeDollarRuntime) console.warn('[EchoRuntime] jQuery is missing on window; echo handlers will fall back to no-op')",
  "const $ = __safeDollarRuntime",
  "const __resolveScopeContainer = (node, scope) => {",
  "  if (!node || typeof node.closest !== 'function') return null",
  "  const $node = $(node)",
  "  const block = $node.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').get(0) || node.parentElement",
  "  const documentRoot = $node.closest('[data-echo-document], .mu-editor, article, [data-doc-id]').get(0) || document.body",
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
  "  if (!root || typeof root.querySelectorAll !== 'function') return $([])",
  "  try { return $(root).find(sel) } catch (error) { return $([]) }",
  "}",
  "const __withAttrs = (meta, defaults) => Object.assign({}, defaults || {}, (meta && meta.attrs) || {})",
  ""
].join('\n')

function main () {
  let BUILTIN_ECHO_CARDS
  try {
    BUILTIN_ECHO_CARDS = loadBuiltinEchoes()
  } catch (e) {
    console.log('FAIL: loadBuiltinEchoes 抛错:', e.message)
    process.exit(1)
  }

  if (!Array.isArray(BUILTIN_ECHO_CARDS) || BUILTIN_ECHO_CARDS.length !== 11) {
    console.log('FAIL: BUILTIN_ECHO_CARDS count', BUILTIN_ECHO_CARDS && BUILTIN_ECHO_CARDS.length)
    process.exit(1)
  }

  let pass = 0
  let fail = 0

  for (const ec of BUILTIN_ECHO_CARDS) {
    const label = `[${ec.id}] ${ec.name}`
    try {
      const normalized = ec.anno_source.replace(/export\s+default/, 'return ')
      const code = HANDLER_PRELUDE_SOURCE + normalized
      // eslint-disable-next-line no-new-func
      const fn = new Function(code)
      if (typeof fn !== 'function') throw new Error('new Function() 没返回 function')

      const def = fn()
      if (!def || typeof def.render !== 'function') throw new Error('render 不是 function')

      const rendered = def.render({ name: ec.name, attrs: {}, prompt: '', echo: ec }, { echo: ec })
      if (!rendered || typeof rendered !== 'object') throw new Error('render() 没返回对象')
      if (!rendered.type || !rendered.title) throw new Error('render() 返回对象缺少 type/title')

      // kind=echo-chant 必须有 handler / handlerExample;kind=echo (如 nice) 可以都没有
      const hasHandler = typeof def.handler === 'function'
      const hasExample = typeof def.handlerExample === 'function'
      if (def.kind === 'echo-chant' && !hasHandler && !hasExample) {
        throw new Error('echo-chant 缺少 handler 与 handlerExample')
      }

      pass += 1
      console.log('[OK]   ' + label + ' (handler=' + hasHandler + ', example=' + hasExample + ')')
    } catch (err) {
      fail += 1
      console.log('[FAIL] ' + label + ' -> ' + err.message)
    }
  }

  console.log(`\n=== summary: pass=${pass} fail=${fail}`)
  if (fail) process.exit(1)
}

main()