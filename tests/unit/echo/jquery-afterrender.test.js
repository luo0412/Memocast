// ============================================================================
// tests/unit/echo/jquery-afterrender.test.js
// 从 scripts/verify-jquery-afterrender.js 迁移而来（v2026-07-29 接入 Jest）。
//
// 锁定的契约（v2026-07-28 起）：
//   - handlerBody 全部用 $(node) 拿 jQuery 句柄
//   - 不再出现 native DOM 兜底（document.querySelector / .classList.add / .style.x = / etc.）
//   - echoBuiltins.js 里已清除 safeDollarRef / __safeDollarInner / createDefaultChantAnnoSource
//   - echoAnnoSource.js 暴露 HANDLER_PRELUDE（含 window.jQuery）+ createDefaultEchoAnnoSource
// ============================================================================
const fs = require('fs')
const path = require('path')

const ROOT_BUILTINS = path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'echo', 'echoBuiltins.js')
const ROOT_RUNTIME = path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'echo', 'EchoRuntime.js')
const ROOT_ANNOSRC = path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'echo', 'echoAnnoSource.js')

const builtinSrc = fs.readFileSync(ROOT_BUILTINS, 'utf8')
const runtimeSrc = fs.readFileSync(ROOT_RUNTIME, 'utf8')
const annoSrc = fs.readFileSync(ROOT_ANNOSRC, 'utf8')

describe('echo/jQuery 化与历史包袱清理', () => {
  describe('历史包袱清理（这些命名/签名不应再出现）', () => {
    test.each([
      ['safeDollarRef', builtinSrc],
      ['__safeDollarInner', builtinSrc],
      ['createDefaultChantAnnoSource', builtinSrc],
      ['$(domElement)', builtinSrc],
      ['$(chantNode)', builtinSrc]
    ])('echoBuiltins.js 中不应再出现 %s', (pattern, src) => {
      expect(src).not.toMatch(new RegExp(pattern.replace(/[.()]/g, '\\$&')))
    })

    test('EchoRuntime.js 不应再使用 safeDollarRef', () => {
      expect(runtimeSrc).not.toMatch(/safeDollarRef/)
    })

    test('echoAnnoSource.js 已移除 createDefaultChantAnnoSource', () => {
      expect(annoSrc).not.toMatch(/createDefaultChantAnnoSource/)
    })
  })

  describe('handlerBody 直用 jQuery $(node)', () => {
    const handlerBodyPattern = /handlerBody:\s*`([\s\S]*?)`/g
    const handlerBodies = []
    let m
    while ((m = handlerBodyPattern.exec(builtinSrc)) !== null) {
      handlerBodies.push(m[1])
    }

    test('echoBuiltins.js 至少存在 1 个 handlerBody', () => {
      expect(handlerBodies.length).toBeGreaterThan(0)
    })

    test.each(handlerBodies.map((body, idx) => [idx, body]))(
      'handlerBody[#%i] 使用 $(node) jQuery 化',
      (idx, body) => {
        expect(body).toMatch(/\$\(node\)/)
      }
    )
  })

  describe('禁用 native DOM 兜底（在 handlerBody 中不应出现）', () => {
    const bannedPatterns = [
      { name: 'document.querySelector', re: /document\.querySelector/ },
      { name: '.classList.add', re: /\.classList\.add/ },
      { name: '.previousElementSibling / .nextElementSibling', re: /\.(previous|next)ElementSibling/ },
      { name: '.style.x = 赋值', re: /\.style\.[a-zA-Z]+\s*=/ }
    ]
    test.each(bannedPatterns)('echoBuiltins.js 不应再使用 %s', ({ re }) => {
      expect(builtinSrc).not.toMatch(re)
    })
  })

  describe('echoAnnoSource.js 暴露正确 API', () => {
    test('HANDLER_PRELUDE 注入 window.jQuery', () => {
      expect(annoSrc).toMatch(/HANDLER_PRELUDE\s*=\s*['"`].*\bwindow\.jQuery\b/)
    })
    test('export const createDefaultEchoAnnoSource 存在', () => {
      expect(annoSrc).toMatch(/export\s+const\s+createDefaultEchoAnnoSource\b/)
    })
  })
})