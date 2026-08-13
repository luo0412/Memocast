// ============================================================================
// tests/unit/vue-layerx/layer-singleton.test.js
//
// 锁定的契约（vue-layerx 二件套工厂层 —— 见 .cursor/skills/vue-layerx-integration）：
//
//   1) 模块顶层 import 即创建单例：_layer 必须是同一个 instance
//      （防「重 import 导致双 drawer」——这是推广 5+ 弹层时最大的坑）
//   2) 命令式 API 形状：open / close / toggle / isVisible / bindHost
//      5 个 export 全部存在，签名正确
//   3) toggle() 语义：visible 时关、不可见时开；不带 props
//      （v2026-08-13 推广时拍板决定的语义，要锁住别被改回去）
//   4) open({ props }) 透传：把调用方传的 props 原样丢给 layer.open
//      （不传 / 改 key 都会让 runeFormDialog / echoFormDialog 的
//       codeGenCallback 函数 props 丢光，整个 AI 帮写链路挂）
//
// 不测的内容（明确边界）：
//   - Drawer 容器是否真的弹出来（要 mount + bindHost，jsdom 改造成本高，
//     跟项目其它 verify 套风格不符 —— 那是 vue 组件测试范畴）
//   - Content.vue 内部业务（chat 流、code-gen），本次重构没动业务逻辑
//   - createLayer 内部行为（model 透传、title i18n），那是 vue-layerx 自己的活
//
// Mock 策略（lazy mock pattern）：
//   - jest.mock 工厂内部全用 jest.fn() 自创建 mock + 通过 module.exports
//     把 instance / useLayer / createLayer 三个引用挂出来
//   - test 侧用 require('vue-layerx') 拿这些引用做 spy
//   - 不引用 out-of-scope 变量（jest 26+ 限制）
// ============================================================================

// ---- vue-layerx mock ----
jest.mock('vue-layerx', () => {
  const instance = {
    open: jest.fn(),
    close: jest.fn(),
    toggle: jest.fn(),
    bindHost: jest.fn(),
    visible: false,
    content: null,
    container: null
  }
  const useLayer = jest.fn(() => instance)
  const createLayer = jest.fn(() => useLayer)
  // 把 instance / useLayer 也挂出来，test 侧用 require 拿引用
  return { createLayer, _instance: instance, _useLayer: useLayer }
})

// ---- element-ui mock ----
jest.mock('element-ui', () => ({
  Drawer: { name: 'ElDrawer' }
}))

// ---- AiHelperDrawerContent.vue mock ----
jest.mock('../../../src/components/ai/AiHelperDrawerContent.vue', () => ({
  name: 'AiHelperDrawerContent'
}))

// ---- 拿到 mock 后的 vue-layerx 引用 ----
const { _instance, _useLayer, createLayer } = require('vue-layerx')

// ---- 触发模块顶层 createLayer(Container, { ... })(Content) 链路 ----
const aiHelperDrawerContent = require('../../../src/components/ai/aiHelperDrawerContent.js')
const aiHelperDrawerContentAgain = require('../../../src/components/ai/aiHelperDrawerContent.js')

describe('vue-layerx 集成层 / aiHelperDrawerContent.js', () => {
  beforeEach(() => {
    // 只清 instance 上的命令式 API spy；createLayer / useLayer / _instance 引用
    // 在 module require 时就创建，不清零（清零会冲掉模块加载的那 1 次调用，
    // 导致「单例性」契约 test 看到 0 次）
    _instance.open.mockClear()
    _instance.close.mockClear()
    _instance.toggle.mockClear()
    _instance.bindHost.mockClear()
    _instance.visible = false
  })

  // --------------------------------------------------------------------------
  // 契约 1：模块顶层 import 即创建单例
  // --------------------------------------------------------------------------
  describe('1) 单例性：模块顶层 import 即创建 + 重 import 返回同一 instance', () => {
    test('createLayer 被调用了一次（不是 0 次，不是 2 次）', () => {
      expect(createLayer).toHaveBeenCalledTimes(1)
    })

    test('useLayer(Content) 被调用了一次（createLayer 拿到的 useLayer 必须立即被调）', () => {
      expect(_useLayer).toHaveBeenCalledTimes(1)
    })

    test('createLayer 第 1 参是 element-ui Drawer 容器', () => {
      const [Container] = createLayer.mock.calls[0]
      // Drawer 是 element-ui 导出的 Vue 组件（有 name / render / setup 之一即可）
      expect(Container).toBeDefined()
      expect(Container.name || Container.render || Container.setup).toBeTruthy()
    })

    test('createLayer 第 2 参含 model: "visible"（Element-UI 必须显式声明）', () => {
      const [, config] = createLayer.mock.calls[0]
      expect(config.model).toBe('visible')
    })

    test('createLayer 第 2 参 props.title 在模块 import 时一次性解析（i18n.t(aiAssistant)）', () => {
      const [, config] = createLayer.mock.calls[0]
      // i18n.t('aiAssistant') 在 setup() 之前就 resolve 完；这里只断言"是非空字符串"
      expect(typeof config.props.title).toBe('string')
      expect(config.props.title.length).toBeGreaterThan(0)
    })

    test('useLayer 第 1 参是 AiHelperDrawerContent Vue 组件', () => {
      const [Content] = _useLayer.mock.calls[0]
      expect(Content).toBeDefined()
      expect(Content.name).toBeTruthy()
    })

    test('两次 require 拿到的是同一个 module.exports（Node 缓存保证）', () => {
      expect(aiHelperDrawerContent).toBe(aiHelperDrawerContentAgain)
    })
  })

  // --------------------------------------------------------------------------
  // 契约 2：命令式 API 形状
  // --------------------------------------------------------------------------
  describe('2) 命令式 API 形状：5 个 export 全部存在', () => {
    test('open 是 function', () => {
      expect(typeof aiHelperDrawerContent.open).toBe('function')
    })
    test('close 是 function', () => {
      expect(typeof aiHelperDrawerContent.close).toBe('function')
    })
    test('toggle 是 function', () => {
      expect(typeof aiHelperDrawerContent.toggle).toBe('function')
    })
    test('isVisible 是 function', () => {
      expect(typeof aiHelperDrawerContent.isVisible).toBe('function')
    })
    test('bindHost 是 function', () => {
      expect(typeof aiHelperDrawerContent.bindHost).toBe('function')
    })
    test('exports 数量 = 5（不多不少）', () => {
      expect(Object.keys(aiHelperDrawerContent).sort()).toEqual(
        ['bindHost', 'close', 'isVisible', 'open', 'toggle']
      )
    })
  })

  // --------------------------------------------------------------------------
  // 契约 3：toggle() 语义
  //   v2026-08-13 拍板：toggle() 不带 props（"反向"语义不该传新参数）
  // --------------------------------------------------------------------------
  describe('3) toggle() 语义：visible 时关、不可见时开、不带 props', () => {
    test('visible=false → toggle() 调 open() 不带 props', () => {
      _instance.visible = false
      aiHelperDrawerContent.toggle()
      expect(_instance.open).toHaveBeenCalledTimes(1)
      // 转发层透传：open() 不带参 → _layer.open({ props: undefined })
      // 不强制把 undefined 兜底成 {} —— 当前实现透传 undefined，是已知边界
      // （实际调用方永远会带 props 进来，"不带 props" 只是 toggle 内部反向走 open 的场景）
      expect(_instance.open).toHaveBeenCalledWith({ props: undefined })
      expect(_instance.close).not.toHaveBeenCalled()
    })

    test('visible=true → toggle() 调 close()', () => {
      _instance.visible = true
      aiHelperDrawerContent.toggle()
      expect(_instance.close).toHaveBeenCalledTimes(1)
      expect(_instance.open).not.toHaveBeenCalled()
    })

    test('toggle() 不管 visible 状态如何都不直接调 layer.toggle（避免二次包装）', () => {
      // 我们的 toggle() 走 if/else 调 open/close，不应该把 layer.toggle 也包一层
      // —— 因为 layer.toggle 自身有"取反"语义，二次包装会出 bug
      _instance.visible = false
      aiHelperDrawerContent.toggle()
      expect(_instance.toggle).not.toHaveBeenCalled()

      _instance.visible = true
      aiHelperDrawerContent.toggle()
      expect(_instance.toggle).not.toHaveBeenCalled()
    })
  })

  // --------------------------------------------------------------------------
  // 契约 4：open({ props }) 透传
  //   调用方传 codeGenCallback / codeGenPrompt 等函数 props 进来，
  //   我们必须 1:1 透传给 layer.open({ props: {...} })，
  //   不能改 key（不能改成 {data: ...} / {payload: ...}）、不能包一层。
  // --------------------------------------------------------------------------
  describe('4) open({ props }) 透传：调用方 props 1:1 落到 layer.open', () => {
    test('open() 不带参 → layer.open 收到 { props: undefined }（边界，透传行为）', () => {
      aiHelperDrawerContent.open()
      expect(_instance.open).toHaveBeenCalledTimes(1)
      expect(_instance.open).toHaveBeenCalledWith({ props: undefined })
    })

    test('open({codeGenCallback: fn}) → layer.open 收到 {props: {codeGenCallback: fn}}', () => {
      const cb = () => 'hi'
      const props = { codeGenPrompt: 'p', codeGenType: 'rune', codeGenCallback: cb }
      aiHelperDrawerContent.open(props)
      expect(_instance.open).toHaveBeenCalledTimes(1)
      const call = _instance.open.mock.calls[0][0]
      expect(call).toEqual({ props })
      // 关键：函数引用必须 === 透传（不是 deep clone、不是 JSON.parse(JSON.stringify)）
      expect(call.props.codeGenCallback).toBe(cb)
    })

    test('open({codeGenType: "echo"}) → layer.open 收到 "echo"（字符串原样）', () => {
      aiHelperDrawerContent.open({ codeGenType: 'echo', codeGenPrompt: 'P', codeGenTargetName: '新回响' })
      expect(_instance.open).toHaveBeenCalledWith({
        props: { codeGenType: 'echo', codeGenPrompt: 'P', codeGenTargetName: '新回响' }
      })
    })
  })

  // --------------------------------------------------------------------------
  // 契约 5（顺手）：bindHost / close / isVisible 转发
  // --------------------------------------------------------------------------
  describe('5) bindHost / close / isVisible 纯转发', () => {
    test('bindHost() 直接调 layer.bindHost()', () => {
      aiHelperDrawerContent.bindHost()
      expect(_instance.bindHost).toHaveBeenCalledTimes(1)
    })

    test('close() 直接调 layer.close()', () => {
      aiHelperDrawerContent.close()
      expect(_instance.close).toHaveBeenCalledTimes(1)
    })

    test('isVisible() 返回 layer.visible 的布尔化（null/undefined → false）', () => {
      _instance.visible = true
      expect(aiHelperDrawerContent.isVisible()).toBe(true)
      _instance.visible = false
      expect(aiHelperDrawerContent.isVisible()).toBe(false)
      _instance.visible = null
      expect(aiHelperDrawerContent.isVisible()).toBe(false)
      _instance.visible = undefined
      expect(aiHelperDrawerContent.isVisible()).toBe(false)
    })
  })
})
