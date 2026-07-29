// ============================================================================
// tests/unit/echo/jquery-echo-compile.test.js
// 从 scripts/verify-jquery-echo-compile.js 迁移而来（v2026-07-29 接入 Jest）。
//
// 锁定的契约（v2026-07-28 起 echo 新结构）：
//   1) 16 张内置 anno_source 都能被 new Function(prelude + source) 编译
//   2) 顶层 type/field/title/version/props 元数据齐全
//   3) render(props) 必须返回 string
//   4) kind 字段已合并到 type（不应再出现独立 kind 字段）
//   5) type=echo-chant 必须有 afterRender
//   6) jQuery 化的 helper 不抛 ReferenceError
// ============================================================================
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'echo')

// 注入精简版 helper：renderer 端 echoBuiltinsShared.js 当前只导出 banner + handlerDoc
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

// 注入 jQuery 化后的 prelude（jsdom 环境下 window.jQuery 已由 tests/fixtures/jquery-setup.js 注入）
const HANDLER_PRELUDE_SOURCE = [
  "const __safeDollarRuntime = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null",
  "const $ = __safeDollarRuntime"
].join('\n')

// 同步加载：describe.each / test.each 必须在 describe 阶段就拿到数组，所以不能放进 beforeAll
const BUILTIN_ECHO_CARDS = loadBuiltinEchoes()

// 静默 echoBaseRender 的 FALLBACK 警告 log（运行时噪音，不影响契约）
let logSpy
beforeAll(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
})
afterAll(() => {
  logSpy.mockRestore()
})

describe('echo/renderer 端 16 张内置 anno_source 编译', () => {
  test('BUILTIN_ECHO_CARDS 是 16 项数组', () => {
    expect(Array.isArray(BUILTIN_ECHO_CARDS)).toBe(true)
    expect(BUILTIN_ECHO_CARDS.length).toBe(16)
  })

  describe.each(BUILTIN_ECHO_CARDS.map(ec => [ec.id, ec]))('[%s] %s', (id, ec) => {
    let def
    beforeAll(() => {
      const normalized = ec.anno_source.replace(/export\s+default/, 'return')
      const code = HANDLER_PRELUDE_SOURCE + '\n' + normalized + '\n'
      // eslint-disable-next-line no-new-func
      const fn = new Function(code)
      def = fn()
    })

    test('anno_source 能被 new Function() 编译', () => {
      expect(typeof def).toBe('object')
    })

    test('顶层 type 必须是 echo / echo-chant / echo-tbd 之一', () => {
      expect(['echo', 'echo-chant', 'echo-tbd']).toContain(def.type)
    })

    test('definition 不应再含顶层 kind 字段（已合并到 type）', () => {
      expect('kind' in def).toBe(false)
    })

    test('顶层 field / title / version 存在', () => {
      expect(def.field).toBeTruthy()
      expect(def.title).toBeTruthy()
      expect(typeof def.version).toBe('number')
    })

    test('render 是 function', () => {
      expect(typeof def.render).toBe('function')
    })

    test('render({}) 必须返回 string', () => {
      expect(typeof def.render({})).toBe('string')
    })

    test('type=echo-chant 必须有 afterRender', () => {
      if (def.type === 'echo-chant') {
        expect(typeof def.afterRender).toBe('function')
      }
    })
  })
})