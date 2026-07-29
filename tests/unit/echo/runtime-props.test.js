// ============================================================================
// tests/unit/echo/runtime-props.test.js
// 从 scripts/verify-echo-runtime-props.js 迁移而来（v2026-07-29 接入 Jest）。
//
// 锁定的契约（EchoRuntime 运行时语义）：
//   1) definition.render(props) 真的能拿到 props
//   2) definition.afterRender(node, props) 真的能拿到 node + props
//   3) props 合并顺序：definition.props < payload.props < token.props < resolved value/id
//   4) echo 名片 metadata 注入（title/field/type/version/definitionId）
//   5) fallback 路径：no anno_source / compile failed / render throws / no echo
//   6) graceful skip：未知 type 不抛错
//   7) payload round-trip
//   8) createEchoPlaceholderPayload 含基础设施字段
// ============================================================================
const EchoRuntimeMod = require('../../../src/components/echo/echoRuntime.js')
const AnnoMod = require('../../../src/components/echo/echoAnnoSource.js')
const CodecMod = require('../../../src/components/echo/echoPayloadCodec.js')

const EchoRuntime = EchoRuntimeMod.default
const { HANDLER_PRELUDE, safeEvalAnnoSource } = AnnoMod
const { encodeEchoPayload, decodeEchoPayload, createEchoPlaceholderPayload } = CodecMod

// 静默 echoBaseRender 的 FALLBACK 警告 log（运行时噪音，不影响契约）
let logSpy
beforeAll(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
})
afterAll(() => {
  logSpy.mockRestore()
})

// 静默 EchoRuntime 的 compileDefinition failed / render failed console.error
// （graceful skip fallback 路径的内部告警，契约已由 not.toThrow() + 返回值守住）
let errorSpy
beforeAll(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterAll(() => {
  errorSpy.mockRestore()
})

describe('echo/echoRuntime 运行时语义', () => {
  describe('1) definition.render(props) 真的能拿到 props', () => {
    let def
    beforeAll(() => {
      const src = `export default {
        type: 'echo', field: 'testRender', title: 'testRender', version: 1,
        props: {},
        render (props = {}) {
          return '<div data-injected-value="' + (props.value || '') + '" data-injected-id="' + (props.id || '') + '" data-injected-icon="' + (props.icon || '') + '"></div>'
        },
        afterRender (node, props = {}) { return () => {} }
      }`
      def = safeEvalAnnoSource(src, HANDLER_PRELUDE)()
    })

    test('render 把 props.value 注入到 HTML', () => {
      const html = def.render({ value: 'hello', id: 'i1', icon: 'star' })
      expect(html).toMatch(/data-injected-value="hello"/)
    })
    test('render 把 props.id 注入到 HTML', () => {
      const html = def.render({ value: 'hello', id: 'i1', icon: 'star' })
      expect(html).toMatch(/data-injected-id="i1"/)
    })
    test('render 把 props.icon 注入到 HTML', () => {
      const html = def.render({ value: 'hello', id: 'i1', icon: 'star' })
      expect(html).toMatch(/data-injected-icon="star"/)
    })
  })

  describe('2) definition.afterRender(node, props) 真的能拿到 node + props', () => {
    let def
    let fakeNode
    beforeAll(() => {
      const src = `export default {
        type: 'echo', field: 'testAfter', title: 'testAfter', version: 1,
        props: {},
        render (props = {}) { return '<span></span>' },
        afterRender (node, props = {}) {
          if (node && node.dataset) {
            node.dataset.gotNode = node.tagName || 'NONODE'
            node.dataset.gotPropsJson = JSON.stringify(props || {})
          }
          return () => {}
        }
      }`
      def = safeEvalAnnoSource(src, HANDLER_PRELUDE)()
      fakeNode = { tagName: 'SPAN', dataset: {} }
      def.afterRender(fakeNode, { value: 'afterVal', id: 'afterId' })
    })

    test('afterRender 真的拿到 node', () => {
      expect(fakeNode.dataset.gotNode).toBe('SPAN')
    })
    test('afterRender 真的拿到 props.value', () => {
      expect(JSON.parse(fakeNode.dataset.gotPropsJson).value).toBe('afterVal')
    })
    test('afterRender 真的拿到 props.id', () => {
      expect(JSON.parse(fakeNode.dataset.gotPropsJson).id).toBe('afterId')
    })
  })

  describe('3) EchoRuntime.render props 合并顺序', () => {
    let runtime, rendered
    beforeAll(() => {
      const echoWithDefaults = {
        id: 'test1',
        name: 'test1',
        type: 'echo',
        anno_source: `export default {
          type: 'echo', field: 'test1', title: 'test1', version: 1,
          props: { color: '#aaa', icon: 'default-icon', tag: 'from-default' },
          render (props = {}) { return '<span></span>' },
          afterRender (node, props = {}) { return () => {} }
        }`
      }
      const registry = {
        getByName: (name) => (name === 'test1' ? echoWithDefaults : null)
      }
      runtime = new EchoRuntime({ registry })
      const payloadStr = encodeEchoPayload({
        prompt: 'pp',
        props: { color: '#bbb', id: 'p-id', definitionId: 'test1', extra: 'from-payload' }
      })
      const token = {
        echoName: 'test1',
        echoId: 'tk-1',
        payloadRaw: payloadStr,
        propsParsed: { color: '#ccc', id: 'tk-id', fromToken: 'from-token' }
      }
      rendered = runtime.render(token, echoWithDefaults)
    })

    test('props.color 被 token props 覆盖', () => {
      expect(rendered.props.color).toBe('#ccc')
    })
    test('props.id = resolvedId（token.echoId 优先于 tokenProps.id）', () => {
      expect(rendered.props.id).toBe('tk-1')
    })
    test('props.tag 来自 definition defaults', () => {
      expect(rendered.props.tag).toBe('from-default')
    })
    test('props.extra 来自 payload', () => {
      expect(rendered.props.extra).toBe('from-payload')
    })
    test('props.fromToken 来自 token', () => {
      expect(rendered.props.fromToken).toBe('from-token')
    })
    test('props.value = resolvedValue', () => {
      expect(rendered.props.value).toBe('pp')
    })
  })

  describe('3b) handler/render 拿到的 props 包含 echo 名片 metadata', () => {
    let rendered
    beforeAll(() => {
      const echoWithDefaults = {
        id: 'test1',
        name: 'test1',
        type: 'echo',
        anno_source: `export default {
          type: 'echo', field: 'test1', title: 'test1', version: 1,
          props: { color: '#aaa', tag: 'from-default' },
          render (props = {}) { return '<span></span>' },
          afterRender (node, props = {}) { return () => {} }
        }`
      }
      const registry = {
        getByName: (name) => (name === 'test1' ? echoWithDefaults : null)
      }
      const runtime = new EchoRuntime({ registry })
      const payloadStr = encodeEchoPayload({
        prompt: 'pp',
        props: { color: '#bbb', id: 'p-id', definitionId: 'test1', extra: 'from-payload' }
      })
      const token = {
        echoName: 'test1',
        echoId: 'tk-1',
        payloadRaw: payloadStr,
        propsParsed: { color: '#ccc', id: 'tk-id', fromToken: 'from-token' }
      }
      rendered = runtime.render(token, echoWithDefaults)
    })

    test('props.title 来自 definition.title', () => {
      expect(rendered.props.title).toBe('test1')
    })
    test('props.field 来自 definition.field', () => {
      expect(rendered.props.field).toBe('test1')
    })
    test('props.type 来自 definition.type', () => {
      expect(rendered.props.type).toBe('echo')
    })
    test('props.version 来自 definition.version', () => {
      expect(rendered.props.version).toBe(1)
    })
    test('props.definitionId 来自 matchedEcho.id', () => {
      expect(rendered.props.definitionId).toBe('test1')
    })
    test('metadata 注入不破坏自定义 props 合并', () => {
      expect(rendered.props.tag).toBe('from-default')
      expect(rendered.props.color).toBe('#ccc')
      expect(rendered.props.value).toBe('pp')
    })
  })

  describe('4) EchoRuntime fallback 路径', () => {
    let runtime
    beforeAll(() => {
      const anyRegistry = {
        getByName: () => null
      }
      runtime = new EchoRuntime({ registry: anyRegistry })
    })

    test('无 anno_source → fallback 不报错', () => {
      const fallbackEcho = { id: 'fb1', name: 'fb1', type: 'echo', anno_source: '' }
      const r = runtime.render({ echoName: 'fb1' }, fallbackEcho)
      expect(r).toBeDefined()
      expect(r.title).toBe('fb1')
    })

    test('anno_source 编译失败 → fallback 不报错', () => {
      const brokenEcho = {
        id: 'br1', name: 'br1', type: 'echo',
        anno_source: 'export default { this is not valid javascript {'
      }
      const r = runtime.render({ echoName: 'br1' }, brokenEcho)
      expect(r).toBeDefined()
      expect(typeof r).toBe('object')
    })

    test('render() 抛错 → 不传播（返回降级对象）', () => {
      const throwEcho = {
        id: 'th1', name: 'th1', type: 'echo',
        anno_source: `export default {
          type: 'echo', field: 'th1', title: 'th1', version: 1,
          props: {},
          render () { throw new Error('boom') },
          afterRender () {}
        }`
      }
      const r = runtime.render({ echoName: 'th1' }, throwEcho)
      expect(r).toBeDefined()
      expect(typeof r).toBe('object')
    })

    test('echo 未注册 → 返回 missing=true', () => {
      const r = runtime.render({ echoName: 'not-registered' }, null)
      expect(r).toBeDefined()
      expect(r.missing).toBe(true)
    })
  })

  describe('5) graceful skip: 未知 shape / type 不抛错', () => {
    let runtime
    beforeAll(() => {
      runtime = new EchoRuntime({ registry: { getByName: () => null } })
    })

    test('未知 type 不抛错', () => {
      const unknownTypeEcho = {
        id: 'u1', name: 'u1',
        type: 'future-type-not-yet-known',
        anno_source: `export default {
          type: 'echo', field: 'u1', title: 'u1', version: 1,
          props: {},
          render (props = {}) { return '<span></span>' },
          afterRender (node, props = {}) { return () => {} }
        }`
      }
      expect(() => {
        const r = runtime.render({ echoName: 'u1' }, unknownTypeEcho)
        expect(r).toBeDefined()
      }).not.toThrow()
    })

    test('echo-chant 缺 afterRender 不报错', () => {
      const noAfterEcho = {
        id: 'na1', name: 'na1', type: 'echo-chant',
        anno_source: `export default {
          type: 'echo-chant', field: 'na1', title: 'na1', version: 1,
          props: {},
          render (props = {}) { return '<span class="ag-echo-placeholder-marker ag-rune ag-rune--na1" data-echo-chant-id="na1">na1</span>' }
        }`
      }
      const r = runtime.render({ echoName: 'na1' }, noAfterEcho)
      expect(r).toBeDefined()
      expect(typeof r.afterRenderHook).toBe('undefined')
    })
  })

  describe('6) encode/decode payload round-trip', () => {
    test('round-trip: prompt + props 全部一致', () => {
      const enc = encodeEchoPayload({ prompt: 'X', props: { value: 'V', a: 1, b: true } })
      const dec = decodeEchoPayload(enc)
      expect(dec.prompt).toBe('X')
      expect(dec.props.value).toBe('V')
      expect(dec.props.a).toBe(1)
      expect(dec.props.b).toBe(true)
    })
  })

  describe('7) createEchoPlaceholderPayload 含基础设施字段', () => {
    let decoded
    beforeAll(() => {
      const ph = createEchoPlaceholderPayload(
        { id: 'defId1', name: 'card1' },
        { inheritFromPrevious: true, inheritedValue: 'prev' }
      )
      decoded = decodeEchoPayload(ph)
    })

    test('注入 definitionId', () => {
      expect(decoded.props.definitionId).toBe('defId1')
    })
    test('注入 title', () => {
      expect(decoded.props.title).toBe('card1')
    })
    test('inherit=true 把 prev 灌入 value', () => {
      expect(decoded.props.value).toBe('prev')
      expect(decoded.prompt).toBe('prev')
    })
    test('inherit=true 标记 inheritFromPrevious', () => {
      expect(decoded.props.inheritFromPrevious).toBe(true)
    })
  })

  // ============================================================================
  // 8) _doAfterRender：afterRender 成功返回 cleanup 时不抛 ReferenceError
  //    （v2026-07-29 触发回归发现：try 块里的 `const node` 是 block-scoped，
  //    离开 try 块进入 installed.push({ node, ... }) 时 node 已不可见，
  //    浏览器渲染时会抛 "ReferenceError: node is not defined"。
  //    Node 端 reproduce 不出来，因为 Node 端 jQuery 为 null，handler 抛 NPE 被
  //    catch 捕获、cleanup 保持 null，永远不进 installed.push 分支。
  //    这里直接给 host / registry 喂真实能跑通的环境，验证 _doAfterRender）
  // ============================================================================
  describe('8) _doAfterRender 在 cleanup=function 时能跑通 installed.push({ node })', () => {
    test('afterRender 返回 () => {} 不报 ReferenceError: node is not defined', () => {
      // 用最朴素的 afterRender：不调用 $ / 不调用 node（Node 端没有 jQuery wrapped 实例方法），
      // 关键是要让 definition.afterRender 返回 function，触发 installed.push({ node, ... }) 分支。
      const echo = {
        id: 'tk1', name: 'tk1',
        type: 'echo-chant', category: 'builtin',
        anno_source: `export default {
          type: 'echo-chant', field: 'tk1', title: 'tk1', version: 1,
          props: {},
          render (props = {}) { return '<span></span>' },
          afterRender (node, props = {}) { return function cleanup () {} }
        }`
      }
      const rt = new EchoRuntime({
        registry: {
          // _doAfterRender 同时查 getByName 和 getById；两个都给到
          getByName: (name) => name === 'tk1' ? echo : null,
          getById: (id) => id === '__builtin_tk1__' || id === 'defId-tk1' ? echo : null
        }
      })
      // 真实 DOM（jsdom 已注入 window.document）
      const host = document.createElement('div')
      host.setAttribute('data-echo-host', 'true')
      host.setAttribute('data-echo-name', 'tk1')
      host.setAttribute('data-echo-id', '__builtin_tk1__')
      host.setAttribute('data-echo-definition-id', 'defId-tk1')
      const child = document.createElement('span')
      host.appendChild(child)
      document.body.appendChild(host)

      // 静默 compileDefinition 的 console.error（如果 unsafeEval 失败的话）
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      let installed
      try {
        expect(() => {
          // _doAfterRender 第一参数是根容器（一般是 .mu-editor / contentContainer），
          // 内部走 safeQueryAll(root, '[data-echo-host="true"]') 找 host。
          installed = rt._doAfterRender(document.body, { cleanupFirst: false })
        }).not.toThrow()
      } finally {
        errSpy.mockRestore()
      }
      expect(Array.isArray(installed)).toBe(true)
      expect(installed.length).toBe(1)
      expect(installed[0].id).toBe('__afterRender_tk1___builtin_tk1__')
      expect(typeof installed[0].cleanup).toBe('function')

      // 反向验证：installed 项里的 node 必须引用 host 本身（v2026-07-29 起锁定）
      // —— handler 拿到的就是 ag-echo-anno-token 那层 outer span，
      //    不是 host.firstElementChild（marker outer），这样 .prev() 才能拿到 line 里前一个 sibling。
      expect(installed[0].node).toBe(host)

      // 清理
      host.parentNode && host.parentNode.removeChild(host)
    })

    // v2026-07-29 起契约：handler 拿到的 node 必须是 host（ag-echo-anno-token 那层），
    // 这样 handler 在 line / block 里能 .prev() 拿到 host 之前的文本节点（nice / twinbloom
    // / peek 等需要这个语义才能正常工作）。
    test('handler 拿到的 node 必须是 host 本身：host 之前有 sibling 时 handler 能看到', () => {
      // 构造一个父节点 + prev 兄弟 + host，让 host 之前真的有 sibling
      const parent = document.createElement('div')
      const prev = document.createElement('span')
      prev.className = 'prev-text'
      prev.textContent = '前面这段文本'
      const host = document.createElement('span')
      host.setAttribute('data-echo-host', 'true')
      host.setAttribute('data-echo-name', 'tk2')
      host.setAttribute('data-echo-id', '__builtin_tk2__')
      host.setAttribute('data-echo-definition-id', 'defId-tk2')
      const marker = document.createElement('span')
      marker.className = 'ag-echo-placeholder-marker'
      host.appendChild(marker)
      parent.appendChild(prev)
      parent.appendChild(host)
      document.body.appendChild(parent)

      let receivedNode = null
      let receivedNodeTag = null
      // handler 用全局 node / window 拿到调用进来的 node（不依赖 jQuery 实例方法）
      const echo = {
        id: 'tk2', name: 'tk2',
        type: 'echo-chant', category: 'builtin',
        anno_source: `export default {
          type: 'echo-chant', field: 'tk2', title: 'tk2', version: 1,
          props: {},
          render (props = {}) { return '<span></span>' },
          afterRender (node, props = {}) {
            // 让 node 暴露到 closure：测试外层读 receivedNode
            globalThis.__lastAfterRenderNode = node
            return function cleanup () {}
          }
        }`
      }
      const rt = new EchoRuntime({
        registry: {
          getByName: (name) => name === 'tk2' ? echo : null,
          getById: (id) => id === '__builtin_tk2__' || id === 'defId-tk2' ? echo : null
        }
      })
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      try {
        expect(() => {
          rt._doAfterRender(document.body, { cleanupFirst: false })
        }).not.toThrow()
      } finally {
        errSpy.mockRestore()
      }

      receivedNode = globalThis.__lastAfterRenderNode
      receivedNodeTag = receivedNode && receivedNode.tagName
      delete globalThis.__lastAfterRenderNode

      // 契约 1：handler 拿到的 node 必须是 host，不是 marker
      expect(receivedNode).toBe(host)
      expect(receivedNodeTag).toBe(host.tagName)

      // 契约 2：handler 用这个 node 去访问 prev sibling 应当能拿到前面的文本
      // （这里用 native previousElementSibling 验证，handler 内部用 jQuery.prev() 行为一致）
      expect(host.previousElementSibling).toBe(prev)
      expect(prev.textContent).toBe('前面这段文本')

      // 清理
      parent.parentNode && parent.parentNode.removeChild(parent)
    })
  })
})
