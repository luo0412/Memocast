// ============================================================================
// tests/unit/rune/templates.test.js
// 从 scripts/verify-rune-templates.js 迁移而来（v2026-07-29 接入 Jest）。
//
// 锁定的契约（13 个内置 rune 模板）：
//   1) 每个模板的 <script> 块语法可编译（new Function 不抛错）
//   2) 每个 SFC 字符串模板都声明了 props.value（mountRuneVueHosts 硬约定）
//   3) 源文件 rune-templates.js 里的 </script> 都被转义成 <\/script>
//      （否则放在 .vue 文件里会被 Vue 编译器截断）
//   4) SFC 的回写通道：$emit('input', ...) 必须存在（非纯展示型 rune）
// ============================================================================
const fs = require('fs')
const path = require('path')

const TEMPLATE_NAMES = [
  'createBlankTemplate',
  'createInheritDemoTemplate',
  'createInputTemplate',
  'createHolyShieldTemplate',
  'createFireflyTemplate',
  'createJsxGraphTemplate',
  'createElInputTemplate',
  'createElSelectTemplate',
  'createElDatePickerTemplate',
  'createResumeBasicInfoTemplate',
  'createResumeTitleTemplate',
  'createResumeExperienceTemplate',
  'createResumeTextTemplate',
  'createResumeSkillTemplate'
]

const SKIP_PROPS_VALUE = ['createBlankTemplate']
const SKIP_EMIT_INPUT = [
  'createBlankTemplate',
  'createResumeBasicInfoTemplate',
  'createResumeTitleTemplate',
  'createResumeExperienceTemplate',
  'createResumeTextTemplate',
  'createResumeSkillTemplate'
]

const fileSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'rune', 'rune-templates.js'),
  'utf8'
)
const mod = require('../../../src/components/rune/rune-templates.js')

describe('rune/14 个内置 SFC 模板契约', () => {
  describe.each(TEMPLATE_NAMES.map(name => [name]))('[%s]', (name) => {
    let runtime
    beforeAll(() => {
      runtime = mod[name]()
    })

    test('必须导出', () => {
      expect(typeof mod[name]).toBe('function')
    })

    test('运行时含 <template>', () => {
      expect(runtime).toMatch(/<template>/)
    })

    test('运行时含 <script>', () => {
      expect(runtime).toMatch(/<script>/)
    })

    test('运行时含 </style>', () => {
      expect(runtime).toMatch(/<\/style>/)
    })

    test('在源文件里能找到函数定义', () => {
      const fnHeaderRegex = new RegExp(`(const|export\\s+const)\\s+${name}\\s*=\\s*\\(?\\s*\\)?\\s*=>\\s*\\{`, 'm')
      expect(fileSrc.match(fnHeaderRegex)).toBeTruthy()
    })

    test('源文件内 </script> 必须转义成 <\\/script>', () => {
      const fnHeaderRegex = new RegExp(`(const|export\\s+const)\\s+${name}\\s*=\\s*\\(?\\s*\\)?\\s*=>\\s*\\{`, 'm')
      const headerMatch = fileSrc.match(fnHeaderRegex)
      expect(headerMatch).toBeTruthy()
      const fnBodyStart = headerMatch.index + headerMatch[0].length
      const fnBody = fileSrc.slice(fnBodyStart, fnBodyStart + 20000)
      expect(fnBody).toMatch(/<\\\/script>/)
    })

    describe('script 块 + props.value + $emit 通道', () => {
      let scriptBody
      let defMatch
      beforeAll(() => {
        const match = runtime.match(/<script>([\s\S]*?)<\/script>/i)
        expect(match).toBeTruthy()
        scriptBody = match[1]
        defMatch = scriptBody.match(/export\s+default\s+(\{[\s\S]*?\n\})/m)
      })

      test('能提取 <script> 块', () => {
        expect(scriptBody).toBeDefined()
      })

      test('能找到 export default {...} 块', () => {
        expect(defMatch).toBeTruthy()
      })

      test('<script> 块语法可编译', () => {
        if (defMatch) {
          const compileBody = scriptBody.replace(/export\s+default\s+\{/m, 'return {')
          expect(() => {
            // eslint-disable-next-line no-new-func
            new Function(compileBody)
          }).not.toThrow()
        }
      })

      if (!SKIP_PROPS_VALUE.includes(name)) {
        test('SFC 声明了 props.value（mountRuneVueHosts 硬约定）', () => {
          expect(defMatch).toBeTruthy()
          expect(defMatch[1]).toMatch(/props\s*:\s*\{[\s\S]*?\bvalue\b/)
        })
      }

      if (!SKIP_EMIT_INPUT.includes(name)) {
        test('含 $emit(\'input\', ...) 回写通道', () => {
          expect(runtime).toMatch(/\$emit\(\s*['"]input['"]/)
        })
      }
    })
  })
})