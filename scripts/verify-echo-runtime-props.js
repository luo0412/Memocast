// ============================================================================
// verify-echo-runtime-props.js —— EchoRuntime 运行时语义的护城河
//
// 直接 import EchoRuntime / safeEvalAnnoSource / echoAnnoSource
// 跑核心语义，验证「anno_source 落到运行时后行为正确」。
//
//   1) definition.render(props) 真的能拿到 props
//   2) definition.afterRender(node, props) 真的能拿到 node + props
//   3) props 合并顺序：卡片 defaults ∪ payload ∪ token props ∪ resolved value/id
//   4) fallback 路径：no anno_source / compile failed / render throws / no echo
//   5) graceful skip：未知 type 不抛错
//   6) payload round-trip
//   7) createEchoPlaceholderPayload 含基础设施字段
// ============================================================================
const path = require('path')

async function main () {
  const coreUrl = `file:///${path.resolve('src/components/echo/EchoRuntime.js').replace(/\\/g, '/')}`
  const annoSrcUrl = `file:///${path.resolve('src/components/echo/echoAnnoSource.js').replace(/\\/g, '/')}`
  const codecUrl = `file:///${path.resolve('src/components/echo/echoPayloadCodec.js').replace(/\\/g, '/')}`

  const EchoRuntimeMod = await import(coreUrl)
  const AnnoMod = await import(annoSrcUrl)
  const CodecMod = await import(codecUrl)

  const { default: EchoRuntime } = EchoRuntimeMod
  const { HANDLER_PRELUDE, safeEvalAnnoSource } = AnnoMod
  const { encodeEchoPayload, decodeEchoPayload, createEchoPlaceholderPayload } = CodecMod

  let pass = 0
  let fail = 0
  const fails = []

  function check (name, cond, info) {
    if (cond) { console.log('[OK]   ' + name); pass += 1 }
    else {
      console.log('[FAIL] ' + name + (info ? ' info=' + JSON.stringify(info) : ''))
      fails.push({ name, info })
      fail += 1
    }
  }

  // -------------------------------------------------------------------------
  // 1) definition.render(props) 真的能拿到 props
  // -------------------------------------------------------------------------
  const renderSource = `export default {
  type: 'echo', field: 'testRender', title: 'testRender', version: 1,
  props: {},
  render (props = {}) {
    return '<div data-injected-value="' + (props.value || '') + '" data-injected-id="' + (props.id || '') + '" data-injected-icon="' + (props.icon || '') + '"></div>'
  },
  afterRender (node, props = {}) { return () => {} }
}`
  const renderDef = safeEvalAnnoSource(renderSource, HANDLER_PRELUDE)()
  const html1 = renderDef.render({ value: 'hello', id: 'i1', icon: 'star' })
  check('render(props) 把 props.value 注入到 HTML',
    /data-injected-value="hello"/.test(html1), { html1 })
  check('render(props) 把 props.id 注入到 HTML',
    /data-injected-id="i1"/.test(html1), { html1 })
  check('render(props) 把 props.icon 注入到 HTML',
    /data-injected-icon="star"/.test(html1), { html1 })

  // -------------------------------------------------------------------------
  // 2) definition.afterRender(node, props) 真的能拿到 node + props
  // -------------------------------------------------------------------------
  const afterSource = `export default {
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
  const afterDef = safeEvalAnnoSource(afterSource, HANDLER_PRELUDE)()
  const fakeNode = { tagName: 'SPAN', dataset: {} }
  afterDef.afterRender(fakeNode, { value: 'afterVal', id: 'afterId' })
  check('afterRender 真的拿到 node',
    fakeNode.dataset.gotNode === 'SPAN', { got: fakeNode.dataset })
  const gotProps = JSON.parse(fakeNode.dataset.gotPropsJson || '{}')
  check('afterRender 真的拿到 props.value', gotProps.value === 'afterVal', { gotProps })
  check('afterRender 真的拿到 props.id', gotProps.id === 'afterId', { gotProps })

  // -------------------------------------------------------------------------
  // 3) EchoRuntime.render: props 合并顺序
  //    优先级：definition.props（卡片默认） < payload.props < token.props < resolved value/id
  // -------------------------------------------------------------------------
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
    getByName: (name) => {
      if (name === 'test1') return echoWithDefaults
      return null
    }
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
  const rendered = runtime.render(token, echoWithDefaults)
  check('EchoRuntime.render props.color 被 token props 覆盖',
    rendered.props && rendered.props.color === '#ccc', { props: rendered.props })
  check('EchoRuntime.render props.id = resolvedId，token.echoId 优先于 tokenProps.id',
    rendered.props && rendered.props.id === 'tk-1', { props: rendered.props })
  check('EchoRuntime.render props.tag 来自 definition defaults',
    rendered.props && rendered.props.tag === 'from-default', { props: rendered.props })
  check('EchoRuntime.render props.extra 来自 payload',
    rendered.props && rendered.props.extra === 'from-payload', { props: rendered.props })
  check('EchoRuntime.render props.fromToken 来自 token',
    rendered.props && rendered.props.fromToken === 'from-token', { props: rendered.props })
  check('EchoRuntime.render props.value = resolvedValue（mergedProps.value）',
    rendered.props && rendered.props.value === 'pp', { props: rendered.props })

  // -------------------------------------------------------------------------
  // 3b) handler / render 拿到的 props 必须包含 echo 名片 metadata
  //     —— 这样 handler 里可以 `props.title` / `props.field` / `props.type`
  //     直接读，省去从 echo 名片再 lookup 一次。
  // -------------------------------------------------------------------------
  check('EchoRuntime.render props.title 来自 definition.title',
    rendered.props && rendered.props.title === 'test1', { props: rendered.props })
  check('EchoRuntime.render props.field 来自 definition.field',
    rendered.props && rendered.props.field === 'test1', { props: rendered.props })
  check('EchoRuntime.render props.type 来自 definition.type',
    rendered.props && rendered.props.type === 'echo', { props: rendered.props })
  check('EchoRuntime.render props.version 来自 definition.version',
    rendered.props && rendered.props.version === 1, { props: rendered.props })
  check('EchoRuntime.render props.definitionId 来自 matchedEcho.id',
    rendered.props && rendered.props.definitionId === 'test1', { props: rendered.props })
  check('EchoRuntime.render metadata 注入不破坏自定义 props 合并',
    rendered.props && rendered.props.tag === 'from-default' && rendered.props.color === '#ccc' && rendered.props.value === 'pp',
    { props: rendered.props })

  // -------------------------------------------------------------------------
  // 4) EchoRuntime fallback 路径
  // -------------------------------------------------------------------------
  // 4a. 无 anno_source 时降级到 fallback definition
  const fallbackEcho = { id: 'fb1', name: 'fb1', type: 'echo', anno_source: '' }
  const fallbackRendered = runtime.render({ echoName: 'fb1' }, fallbackEcho)
  check('无 anno_source → fallback 不报错',
    fallbackRendered && typeof fallbackRendered === 'object' && fallbackRendered.title === 'fb1',
    { fallbackRendered })

  // 4b. anno_source 编译失败时降级
  const brokenEcho = {
    id: 'br1', name: 'br1', type: 'echo',
    anno_source: 'export default { this is not valid javascript {'
  }
  const brokenRendered = runtime.render({ echoName: 'br1' }, brokenEcho)
  check('anno_source 编译失败 → fallback 不报错',
    brokenRendered && typeof brokenRendered === 'object',
    { brokenRendered })

  // 4c. render() 抛错时不传播给上游
  const throwEcho = {
    id: 'th1', name: 'th1', type: 'echo',
    anno_source: `export default {
      type: 'echo', field: 'th1', title: 'th1', version: 1,
      props: {},
      render () { throw new Error('boom') },
      afterRender () {}
    }`
  }
  const throwRendered = runtime.render({ echoName: 'th1' }, throwEcho)
  check('render 抛错 → 不传播（返回降级对象）',
    throwRendered && typeof throwRendered === 'object',
    { throwRendered })

  // 4d. echo 未注册时返回 missing 标记
  const noEcho = runtime.render({ echoName: 'not-registered' }, null)
  check('echo 未注册 → 返回 missing=true',
    noEcho && noEcho.missing === true,
    { noEcho })

  // -------------------------------------------------------------------------
  // 5) graceful skip: 未知 shape / type 不抛错
  // -------------------------------------------------------------------------
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
  let gracefulOk = true
  try {
    const r = runtime.render({ echoName: 'u1' }, unknownTypeEcho)
    gracefulOk = r && typeof r === 'object'
  } catch (e) {
    gracefulOk = false
  }
  check('未知 type 不抛错（graceful skip）', gracefulOk)

  // 5b. echo type=echo-chant 时缺 afterRender 不报错（afterRenderHook 不挂）
  const noAfterEcho = {
    id: 'na1', name: 'na1', type: 'echo-chant',
    anno_source: `export default {
      type: 'echo-chant', field: 'na1', title: 'na1', version: 1,
      props: {},
      render (props = {}) { return '<span class="ag-rune ag-rune--na1" data-echo-chant-id="na1">na1</span>' }
    }`
  }
  const naRendered = runtime.render({ echoName: 'na1' }, noAfterEcho)
  check('echo-chant 缺 afterRender 不报错',
    naRendered && typeof naRendered === 'object' && typeof naRendered.afterRenderHook === 'undefined',
    { naRendered })

  // -------------------------------------------------------------------------
  // 6) round-trip: encodeEchoPayload → decodeEchoPayload
  // -------------------------------------------------------------------------
  const r1 = encodeEchoPayload({ prompt: 'X', props: { value: 'V', a: 1, b: true } })
  const r2 = decodeEchoPayload(r1)
  check('round-trip: prompt 一致', r2.prompt === 'X', { r2 })
  check('round-trip: props.value 一致', r2.props.value === 'V', { r2 })
  check('round-trip: props.a 一致', r2.props.a === 1, { r2 })
  check('round-trip: props.b 一致', r2.props.b === true, { r2 })

  // -------------------------------------------------------------------------
  // 7) createEchoPlaceholderPayload 含 definitionId 等基础设施字段
  // -------------------------------------------------------------------------
  const ph = createEchoPlaceholderPayload(
    { id: 'defId1', name: 'card1' },
    { inheritFromPrevious: true, inheritedValue: 'prev' }
  )
  const dec = decodeEchoPayload(ph)
  check('createEchoPlaceholderPayload 注入 definitionId',
    dec.props.definitionId === 'defId1', { dec })
  check('createEchoPlaceholderPayload 注入 title',
    dec.props.title === 'card1', { dec })
  check('createEchoPlaceholderPayload inherit=true 把 prev 灌入 value',
    dec.props.value === 'prev' && dec.prompt === 'prev',
    { dec })
  check('createEchoPlaceholderPayload inherit=true 标记 inheritFromPrevious',
    dec.props.inheritFromPrevious === true, { dec })

  console.log(`\n=== summary: pass=${pass}, fail=${fail}, total=${pass + fail}`)
  if (fail > 0) {
    console.log('\n--- 失败明细 ---')
    fails.forEach(f => console.log('  -', f.name, f.info ? JSON.stringify(f.info) : ''))
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})