import('./src/components/echo/builtinEchoes.js').then(async (m) => {
  // 模拟 EchoRuntime: encode/decode/render
  const decodeEchoPayload = (s) => {
    try { return JSON.parse(s || '{}') || {} } catch (e) { return {} }
  }
  const encodeEchoPayload = (o) => JSON.stringify(o)

  const builtin = m.BUILTIN_ECHO_CARDS
  console.log('16 builtin echo cards:', builtin.length, builtin.map(c => c.name).join(', '))

  // 构造一段 echo token：模拟 @disperse{density:"tight", color:"#F00"}() 然后写入 payload
  const echoName = 'disperse'
  const props = { value: '回归紧凑排版', density: 'tight', color: '#F00', id: 'X1', definitionId: '__builtin_disperse__' }
  const payload = encodeEchoPayload({ prompt: '回归紧凑排版', props })
  const token = {
    type: 'echo_anno',
    echoName,
    echoId: 'X1',
    propsRaw: '',
    propsParsed: props,
    prompt: '回归紧凑排版',
    value: '回归紧凑排版',
    raw: '@disperse{...}()',
    payload,
    payloadRaw: payload,
    range: { start: 0, end: 20 }
  }

  // mock window.jQuery
  globalThis.window = {
    jQuery: (n) => {
      const makeWrapper = (target) => ({
        addClass() { return makeWrapper(target) },
        removeClass() { return makeWrapper(target) },
        attr(name, val) {
          if (val !== undefined) return makeWrapper(target)
          return target && target['__' + name] || undefined
        },
        removeAttr() { return makeWrapper(target) },
        css() { return makeWrapper(target) },
        closest() { return makeWrapper(target) },
        parent() { return makeWrapper(target) },
        find() { return { filter() { return { get() { return [] } } } } },
        get(i) { return [target][i] },
        length: 1,
        first() { return makeWrapper(target) },
        filter() { return makeWrapper(target) }
      })
      return makeWrapper(n)
    }
  }

  // 模拟 EchoRuntime 的 renderToHtml 流程
  const registry = await import('./src/components/echo/EchoRegistry.js').then(r => r.default)
  const reg = new registry(builtin)
  const result = reg.render(token, reg.getById('__builtin_disperse__'))
  console.log('render result keys:', Object.keys(result).sort())
  console.log('icon/color/title/density present:', ['icon', 'color', 'title', 'description'].every(k => k in result))
  console.log('props.density resolved:', result.props.density, '(expected tight)')
  console.log('props.color resolved:', result.props.color, '(expected #F00)')
  console.log('html prefix:', result.html.slice(0, 60))

  // 验证 handler 能解析：instance 出来后 handler 拿 (node, props)
  const fakeToken = { echoName, echoId: 'X1', definitionId: '__builtin_disperse__', propsParsed: props, prompt: '回归紧凑排版' }
  if (typeof result.afterRenderHook === 'function') {
    try {
      result.afterRenderHook('<chantNode-placeholder>')
      console.log('afterRenderHook OK')
    } catch (e) {
      console.log('afterRenderHook ERR:', e.message)
    }
  }

  // 模拟旧的 `propsComputed` 形态：render(context) 拿到的 context.props
  console.log('icon via merged.echo:', result.icon, 'color:', result.color, 'title:', result.title)
}).catch(e => console.error('error:', e.message))
