// ============================================================================
// tests/unit/echo/main-builtin-echoes.test.js
// 从 scripts/verify-main-builtin-echoes.js 迁移而来（v2026-07-29 接入 Jest）。
//
// 锁定的契约：main 端 src-electron/main-process/service/builtin-echoes.js
// 是由 renderer 端 echoBuiltins.js 经 transform-main-builtin-echoes.js 转译而来，
// 类型契约必须与 renderer 端一致（type 三态合法、kind 不再出现）。
// ============================================================================
const HANDLER_PRELUDE_SOURCE = "const __safeDollar = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null\nconst $ = __safeDollar\n"

const { BUILTIN_ECHO_CARDS } = require('../../../src-electron/main-process/service/builtin-echoes.js')

// 静默 echoBaseRender 的 FALLBACK 警告 log（运行时噪音，不影响契约）
let logSpy
beforeAll(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
})
afterAll(() => {
  logSpy.mockRestore()
})

describe('echo/main 端 16 张内置 anno_source 编译', () => {
  test('BUILTIN_ECHO_CARDS 是 16 项数组', () => {
    expect(Array.isArray(BUILTIN_ECHO_CARDS)).toBe(true)
    expect(BUILTIN_ECHO_CARDS.length).toBe(16)
  })

  describe.each(BUILTIN_ECHO_CARDS.map(c => [c.id, c]))('[%s]', (id, card) => {
    let obj
    beforeAll(() => {
      const src = card.anno_source
      const normalized = String(src || '').replace(/export\s+default/, 'return ')
      // eslint-disable-next-line no-new-func
      const fn = new Function(HANDLER_PRELUDE_SOURCE + normalized)
      obj = fn()
    })

    test('main 端 anno_source 编译结果是对象', () => {
      expect(typeof obj).toBe('object')
    })

    test('render 是 function', () => {
      expect(typeof obj.render).toBe('function')
    })

    test('顶层 type 必须是 echo / echo-chant / echo-tbd 之一', () => {
      expect(['echo', 'echo-chant', 'echo-tbd']).toContain(obj.type)
    })

    test('main 端 definition 不应再含顶层 kind 字段', () => {
      expect('kind' in obj).toBe(false)
    })

    test('type=echo-chant 必须有 afterRender', () => {
      if (obj.type === 'echo-chant') {
        expect(typeof obj.afterRender).toBe('function')
      }
    })

    test('render({}) 必须返回 string', () => {
      expect(typeof obj.render({})).toBe('string')
    })
  })
})