// scripts/verify-jquery-echo-compile.js
// 验证 renderer 端 echoBuiltins.js 的 16 个 anno_source 在 jQuery 化的新 prelude 下:
//   1) 能被 new Function(prelude + source) 编译
//   2) 顶层 kind/type/field/title/props 元数据齐全（v2026-07-28 新结构）
//   3) render(props) 返回 string
//   4) kind=echo-chant 必须有 afterRender；kind=echo 不强求
//   5) jQuery 化的 helper 不抛 ReferenceError
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../src/components/echo')

// 注入精简版 helper：仅 banner + handlerDoc（renderer 端 builtin-echo-shared.js 当前只导出这两个）
const helperInjection = `
const banner = (lines) => lines.map(line => '//   ' + line).join('\\n  ')
const handlerDoc = (docLines = []) => {
  const b = (Array.isArray(docLines) ? docLines : []).map(line => '//   ' + line).join('\\n  ')
  return b + '\\n  afterRender (node, props = {}) {'
}
`

function loadBuiltinEchoes () {
  const builtinRaw = fs.readFileSync(path.join(ROOT, 'echoBuiltins.js'), 'utf8')
  const builtinStripped = builtinRaw
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+function\s+/gm, 'function ')
    .replace(/^export\s+default\s+/gm, 'const __echoRuntimeDefault = ')

  const fullCode = helperInjection + '\n' + builtinStripped
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
  "const $ = __safeDollarRuntime"
].join('\n')

function main () {
  let BUILTIN_ECHO_CARDS
  try {
    BUILTIN_ECHO_CARDS = loadBuiltinEchoes()
  } catch (e) {
    console.log('FAIL: loadBuiltinEchoes 抛错:', e.message)
    process.exit(1)
  }

  if (!Array.isArray(BUILTIN_ECHO_CARDS) || BUILTIN_ECHO_CARDS.length !== 16) {
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
      if (!def || typeof def !== 'object') throw new Error('definition 不是对象')

      // === 新结构（v2026-07-28）：顶层元数据 ===
      const validKinds = new Set(['echo', 'echo-chant', 'echo-tbd'])
      if (!validKinds.has(def.kind)) throw new Error('顶层 kind 必须是 echo / echo-chant / echo-tbd，实际=' + def.kind)
      if (def.type !== 'echo') throw new Error('顶层 type 必须等于 echo，实际=' + def.type)
      if (!def.field) throw new Error('顶层 field 不能为空（id 别名）')
      if (!def.title) throw new Error('顶层 title 不能为空（name 别名）')
      if (typeof def.version !== 'number') throw new Error('顶层 version 必须为 number')
      if (def.props && typeof def.props !== 'object') throw new Error('顶层 props 必须是 object 或 undefined')

      if (typeof def.render !== 'function') throw new Error('render 不是 function')

      // === render(props) 必须返回字符串 ===
      const rendered = def.render({})
      if (typeof rendered !== 'string') throw new Error('render() 必须返回 string，实际=' + typeof rendered)

      // === afterRender：kind=echo-chant 必有；kind=echo 不强求 ===
      const hasAfterRender = typeof def.afterRender === 'function'
      if (def.kind === 'echo-chant' && !hasAfterRender) {
        throw new Error('echo-chant 缺少 afterRender')
      }

      pass += 1
      console.log('[OK]   ' + label + ' (kind=' + def.kind + ', afterRender=' + hasAfterRender + ')')
    } catch (err) {
      fail += 1
      console.log('[FAIL] ' + label + ' -> ' + err.message)
    }
  }

  console.log(`\n=== summary: pass=${pass} fail=${fail}`)
  if (fail) process.exit(1)
}

main()