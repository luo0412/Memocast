// ============================================================================
// tests/unit/muya/rune-sfc-cache.test.js
//
// 锁定 RunePreviewRenderer.createRuneRendererCtor 的「缓存 + in-flight 去重」契约
// （v2026-08-08 起固定）：
//   1) 同一 cacheKey 两次串行调用，第二次应直接命中缓存（不再调编译器）。
//   2) 同一 cacheKey 在第一次编译未完成时并发调用两次，应共享同一个 Promise
//      (in-flight 去重)，且编译器只会被调一次。
//   3) 编译失败时缓存条目必须被删除（fail-fast + 次次重试）。
//   4) hasTemplate=false（空模板）时返回 null，不污染缓存。
//
// === 测试策略 ===
//   runeSfcRendererFactory 走渲染进程内同步 vue-template-compiler，不绕 IPC。
//   这里用 jest.mock 把 vue-template-compiler 的两个入口（parseComponent /
//   compileToFunctions）替换成可控 stub，验证缓存与 in-flight 不变量。
// ============================================================================

// 用 fake timers + 可控 Promise 来验证「in-flight 去重」，
// 因此 vue-template-compiler 必须支持异步返回结果。
let mockParseComponentImpl = null
let mockCompileToFunctionsImpl = null

jest.mock('vue-template-compiler', () => ({
  parseComponent: (...args) => (typeof mockParseComponentImpl === 'function'
    ? mockParseComponentImpl(...args)
    : { template: { content: '<div>x</div>' }, script: { content: 'export default {}' }, styles: [] }),
  compileToFunctions: (...args) => (typeof mockCompileToFunctionsImpl === 'function'
    ? mockCompileToFunctionsImpl(...args)
    : { render: function () {}, staticRenderFns: [] })
}))

jest.mock('vue', () => ({
  extend: function (options) {
    return Object.assign(function RuneStub () { return options }, { options, _isVueStub: true })
  }
}))

const factory = require('../../../src/components/muya/runeSfcRendererFactory.js').default

// 等待 micro-tasks flush
const flush = () => new Promise(resolve => setImmediate(resolve))

const SAMPLE_SFC = `<template><div class="x">{{ msg }}</div></template>
<script>
export default { props: ['msg'] }
</script>`

describe('createRuneRendererCtor 缓存 + in-flight 契约', () => {
  beforeEach(() => {
    mockParseComponentImpl = null
    mockCompileToFunctionsImpl = null
    factory.clearCaches()
  })

  test('正常路径：第二次同 cacheKey 调用应直接命中缓存，不再调 parseComponent', async () => {
    let parseCallCount = 0
    mockParseComponentImpl = (source) => {
      parseCallCount++
      return {
        template: { content: '<div class="x">{{ msg }}</div>' },
        script: { content: 'export default { props: ["msg"] }' },
        styles: []
      }
    }
    mockCompileToFunctionsImpl = () => ({ render: function () {}, staticRenderFns: [] })

    const a = await factory.createRuneRendererCtor({ id: 'r1', template: SAMPLE_SFC })
    const b = await factory.createRuneRendererCtor({ id: 'r1', template: SAMPLE_SFC })

    expect(parseCallCount).toBe(1)
    expect(a).toBe(b)
  })

  test('in-flight 去重：第一次未完成时并发调用两次，共享同一个 Promise', async () => {
    let parseCallCount = 0
    let resolveFirst
    mockParseComponentImpl = () => new Promise(resolve => {
      parseCallCount++
      resolveFirst = () => resolve({
        template: { content: '<div>x</div>' },
        script: { content: 'export default {}' },
        styles: []
      })
    })
    mockCompileToFunctionsImpl = () => ({ render: function () {}, staticRenderFns: [] })

    const p1 = factory.createRuneRendererCtor({ id: 'r2', template: SAMPLE_SFC })
    const p2 = factory.createRuneRendererCtor({ id: 'r2', template: SAMPLE_SFC })

    expect(parseCallCount).toBe(1)

    resolveFirst()
    const [a, b] = await Promise.all([p1, p2])
    expect(a).toBe(b)
  })

  test('编译失败时缓存条目必须被清除（下次同 key 可重试）', async () => {
    let call = 0
    mockParseComponentImpl = () => {
      call++
      if (call === 1) throw Object.assign(new Error('boom'), { code: 'VUE_SFC_TEMPLATE_FAILED' })
      return {
        template: { content: '<div>x</div>' },
        script: { content: 'export default {}' },
        styles: []
      }
    }
    mockCompileToFunctionsImpl = () => ({ render: function () {}, staticRenderFns: [] })

    await expect(factory.createRuneRendererCtor({ id: 'r3', template: SAMPLE_SFC }))
      .rejects.toMatchObject({ code: 'VUE_SFC_TEMPLATE_FAILED' })

    const ctor = await factory.createRuneRendererCtor({ id: 'r3', template: SAMPLE_SFC })
    expect(ctor).toBeDefined()
    expect(call).toBe(2)
  })

  test('hasTemplate=false（空模板）时返回 null，不污染缓存', async () => {
    let callCount = 0
    mockParseComponentImpl = () => {
      callCount++
      // 模拟 parseComponent 拿到一段「已经是 markup 没有 <template> 包裹」的输入
      return { template: undefined, script: undefined, styles: [] }
    }
    mockCompileToFunctionsImpl = () => ({ render: function () {}, staticRenderFns: [] })

    const a = await factory.createRuneRendererCtor({ id: 'r4', template: '<div>no template block</div>' })
    expect(a).toBeNull()

    // 第二次调用应直接命中 null 缓存
    const b = await factory.createRuneRendererCtor({ id: 'r4', template: '<div>no template block</div>' })
    expect(b).toBeNull()
    expect(callCount).toBe(1)
  })

  test('compileFailure 下 in-flight 必须被清理（不卡下一次调用）', async () => {
    let call = 0
    mockParseComponentImpl = () => {
      call++
      if (call === 1) throw Object.assign(new Error('boom'), { code: 'VUE_SFC_TEMPLATE_FAILED' })
      return {
        template: { content: '<div>x</div>' },
        script: { content: 'export default {}' },
        styles: []
      }
    }
    mockCompileToFunctionsImpl = () => ({ render: function () {}, staticRenderFns: [] })

    await expect(factory.createRuneRendererCtor({ id: 'r5', template: SAMPLE_SFC }))
      .rejects.toBeDefined()

    const ctor = await factory.createRuneRendererCtor({ id: 'r5', template: SAMPLE_SFC })
    expect(ctor).toBeDefined()
    expect(call).toBe(2)
  })

  test('不同 rune id 的相同模板应被独立缓存', async () => {
    let callCount = 0
    mockParseComponentImpl = () => {
      callCount++
      return {
        template: { content: '<div>x</div>' },
        script: { content: 'export default {}' },
        styles: []
      }
    }
    mockCompileToFunctionsImpl = () => ({ render: function () {}, staticRenderFns: [] })

    const a = await factory.createRuneRendererCtor({ id: 'r6-a', template: SAMPLE_SFC })
    const b = await factory.createRuneRendererCtor({ id: 'r6-b', template: SAMPLE_SFC })

    expect(callCount).toBe(2)
    expect(a).not.toBe(b)
  })

  test('空字符串 template 应被「不进入编译」命中（不写缓存）', async () => {
    let called = false
    mockParseComponentImpl = () => { called = true; return {} }
    mockCompileToFunctionsImpl = () => { called = true; return { render: function () {} } }

    const a = await factory.createRuneRendererCtor({ id: 'r7', template: '' })
    expect(a).toBeNull()
    expect(called).toBe(false)
  })

  test('rune 参数为 null/undefined 时不应报错', async () => {
    const a = await factory.createRuneRendererCtor(null)
    const b = await factory.createRuneRendererCtor(undefined)
    expect(a).toBeNull()
    expect(b).toBeNull()
  })

  test('rune.template 为非字符串时应被强制转字符串（不会 throw）', async () => {
    mockParseComponentImpl = () => ({
      template: { content: '<div>x</div>' },
      script: { content: 'export default {}' },
      styles: []
    })
    mockCompileToFunctionsImpl = () => ({ render: function () {}, staticRenderFns: [] })

    const ctor = await factory.createRuneRendererCtor({ id: 'r8', template: 12345 })
    expect(ctor).toBeDefined()
  })
})

// 防 unused-vars 提示
void flush
