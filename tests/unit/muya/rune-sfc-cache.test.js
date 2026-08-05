// ============================================================================
// tests/unit/muya/rune-sfc-cache.test.js
//
// 锁定 RunePreviewRenderer.createRuneRendererCtor 的"缓存 + in-flight 去重"契约
// （v2026-08-05 起固定）：
//   1) 同一 cacheKey 两次串行调用，第二次应直接命中缓存（不再发 IPC）。
//   2) 同一 cacheKey 在第一次编译未完成时并发调用两次，应共享同一个 Promise
//      (in-flight 去重)，且 IPC 只会被调用一次。
//   3) 编译失败时缓存条目必须被删除（fail-fast + 次次重试）。
//   4) hasTemplate=false（空模板）时返回 null，不污染缓存。
//
// === 测试策略 ===
//   Muya.vue 的 createRuneRendererCtor 直接依赖 @vue/compiler-sfc 的运行时
//   行为（Vue.extend + 模板编译），无法在 jsdom 下精确模拟。
//   这里直接复用 src/components/muya/runeSfcRendererFactory.js 暴露出的
//   工厂函数（纯粹 JS），模拟 parseVueSfc 为可控 Promise，验证缓存逻辑。
// ============================================================================

const path = require('path')

// 隔离 Muya.vue 的 Vue 依赖：runeSfcRendererFactory 是个纯 JS 工廠，依赖 Vue 是
// 软依赖（仅在构造 cached 组件时用），我们在该工厂内部用 jest.mock 把 Vue 替换成
// 一个轻量 stub。
jest.mock('vue', () => ({
  extend: function (options) {
    // 把 Vue.extend 收编成 object + 一个 _render 函数（用 options.render 即可）
    return Object.assign(function RuneStub () { return options }, { options, _isVueStub: true })
  }
}))

// 隔离 ApiInvoker.parseVueSfc，让 factory 内部的 normalizeRuneSfc 走我们可控的 mock
const mockParseVueSfc = jest.fn()

jest.mock('src/ApiInvoker', () => ({
  parseVueSfc: (...args) => mockParseVueSfc(...args)
}))

const factory = require('../../../src/components/muya/runeSfcRendererFactory.js').default

// 等待 micro-tasks flush
const flush = () => new Promise(resolve => setImmediate(resolve))

const SAMPLE_SFC = `<template><div class="x">{{ msg }}</div></template>
<script>
export default { props: ['msg'] }
</script>`

const COMPILED = {
  template: 'var render = function () { return null }\nvar staticRenderFns = []\n',
  script: { content: 'export default { props: ["msg"] }' },
  style: '.x{color:red;}',
  customBlocks: []
}

describe('RunePreviewRenderer.createRuneRendererCtor 缓存 + in-flight 契约', () => {
  beforeEach(() => {
    mockParseVueSfc.mockReset()
    factory.clearCaches()
  })

  test('正常路径：第二次同 cacheKey 调用应直接命中缓存，不再调用 parseVueSfc', async () => {
    mockParseVueSfc.mockResolvedValue(COMPILED)

    const a = await factory.createRuneRendererCtor({ id: 'r1', template: SAMPLE_SFC })
    const b = await factory.createRuneRendererCtor({ id: 'r1', template: SAMPLE_SFC })

    expect(mockParseVueSfc).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  test('in-flight 去重：第一次未完成时并发调用两次，共享同一个 Promise', async () => {
    let resolveFirst
    mockParseVueSfc.mockReturnValueOnce(new Promise(resolve => {
      resolveFirst = resolve
    }))

    const p1 = factory.createRuneRendererCtor({ id: 'r2', template: SAMPLE_SFC })
    const p2 = factory.createRuneRendererCtor({ id: 'r2', template: SAMPLE_SFC })

    // 两次调用都处于 in-flight，且只触发一次 parseVueSfc
    expect(mockParseVueSfc).toHaveBeenCalledTimes(1)

    // 释放第一个
    resolveFirst(COMPILED)
    const [a, b] = await Promise.all([p1, p2])
    expect(a).toBe(b)
  })

  test('编译失败时缓存条目必须被清除（下次同 key 可重试）', async () => {
    mockParseVueSfc
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'VUE_SFC_TEMPLATE_FAILED' }))
      .mockResolvedValueOnce(COMPILED)

    await expect(factory.createRuneRendererCtor({ id: 'r3', template: SAMPLE_SFC }))
      .rejects.toMatchObject({ code: 'VUE_SFC_TEMPLATE_FAILED' })

    // 第二次重试应能成功（缓存已清理）
    const ctor = await factory.createRuneRendererCtor({ id: 'r3', template: SAMPLE_SFC })
    expect(ctor).toBeDefined()
    expect(mockParseVueSfc).toHaveBeenCalledTimes(2)
  })

  test('hasTemplate=false（空模板）时返回 null，不污染缓存', async () => {
    mockParseVueSfc.mockResolvedValue({
      template: '',
      script: { content: 'export default {}' },
      style: '',
      customBlocks: []
    })

    const a = await factory.createRuneRendererCtor({ id: 'r4', template: SAMPLE_SFC })
    expect(a).toBeNull()

    // 第二次调用应直接命中 null 缓存，不再发 IPC
    const b = await factory.createRuneRendererCtor({ id: 'r4', template: SAMPLE_SFC })
    expect(b).toBeNull()
    expect(mockParseVueSfc).toHaveBeenCalledTimes(1)
  })

  test('compileFailure 下 in-flight 必须被清理（不卡下一次调用）', async () => {
    mockParseVueSfc.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'VUE_SFC_TEMPLATE_FAILED' }))

    await expect(factory.createRuneRendererCtor({ id: 'r5', template: SAMPLE_SFC }))
      .rejects.toBeDefined()

    // 第二次调用不应被前一次的 in-flight 卡住，必须重新发 IPC
    mockParseVueSfc.mockResolvedValueOnce(COMPILED)
    const ctor = await factory.createRuneRendererCtor({ id: 'r5', template: SAMPLE_SFC })
    expect(ctor).toBeDefined()
    expect(mockParseVueSfc).toHaveBeenCalledTimes(2)
  })

  test('不同 rune id 的相同模板应被独立缓存', async () => {
    mockParseVueSfc.mockResolvedValue(COMPILED)

    const a = await factory.createRuneRendererCtor({ id: 'r6-a', template: SAMPLE_SFC })
    const b = await factory.createRuneRendererCtor({ id: 'r6-b', template: SAMPLE_SFC })

    expect(mockParseVueSfc).toHaveBeenCalledTimes(2)
    expect(a).not.toBe(b)
  })

  test('空字符串 template 应被『不进入编译』命中（不写缓存）', async () => {
    const a = await factory.createRuneRendererCtor({ id: 'r7', template: '' })
    expect(a).toBeNull()
    expect(mockParseVueSfc).not.toHaveBeenCalled()
  })
})

describe('createRuneRendererCtor 输入合法性', () => {
  beforeEach(() => {
    mockParseVueSfc.mockReset()
    factory.clearCaches()
  })

  test('rune 参数为 null/undefined 时不应报错', async () => {
    const a = await factory.createRuneRendererCtor(null)
    const b = await factory.createRuneRendererCtor(undefined)
    expect(a).toBeNull()
    expect(b).toBeNull()
    expect(mockParseVueSfc).not.toHaveBeenCalled()
  })

  test('rune.template 为非字符串时应被强制转字符串', async () => {
    mockParseVueSfc.mockResolvedValue(COMPILED)

    const ctor = await factory.createRuneRendererCtor({ id: 'r8', template: 12345 })
    expect(ctor).toBeDefined()
    // parseVueSfc 应被调，参数是字符串
    expect(typeof mockParseVueSfc.mock.calls[0][0]).toBe('string')
  })
})
