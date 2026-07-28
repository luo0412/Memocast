// ============================================================================
// echoRuntime —— EchoRuntime 类（registry 的运行时引擎）
//
// 职责：
//   1. compileDefinition(echo) —— 把 anno_source 字符串编译成 definition 对象（render + afterRender）
//   2. render(token, echo)     —— 给定 token + echo 定义，输出 { type, icon, color, title, description, prompt, props, html, afterRenderHook }
//   3. renderToHtml(token, echo)—— 输出注入 ABI 属性的最终 HTML
//   4. afterRender(container)  —— DOM paint 后对所有 [data-echo-inline] 调 definition.afterRender
//   5. disposeAll()            —— 清掉所有已注册的 cleanup
//
// 不变量：
//   - definition.render 签名 = (node, props) -> result
//   - definition.afterRender 签名 = (node, props) -> cleanup|undefined
//     （node = echo host DOM element，props = 编译期算好的 context.props，含 resolved value）
//   - DOM ABI：data-echo-inline / data-echo-name / data-echo-id / data-echo-definition-id
//     / data-echo-value / data-echo-props / data-echo-props-json / data-echo-node-id
// ============================================================================

import {
  DEFAULT_ECHO_COLOR,
  DEFAULT_ECHO_ICON
} from './builtin-echo-shared.js'
import {
  decodeEchoPayload
} from './echoPayloadCodec.js'
import {
  isInheritFromPreviousEnabled
} from './echoInherit.js'
import {
  HANDLER_PRELUDE,
  safeEvalAnnoSource
} from './echoAnnoSource.js'

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const safeQueryAll = (root, selector) => {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  try { return Array.from(root.querySelectorAll(selector)) }
  catch (error) { console.warn('[echoRuntime] safeQueryAll failed:', error); return [] }
}

// === 把 extraAttrs（形如 `data-x="y" data-z="w"`）注入到 html 的第一个起始标签内 ===
const injectAttrsIntoFirstTag = (html, extraAttrs = '', extraClass = '') => {
  const src = String(html || '')
  if (!src || (!extraAttrs && !extraClass)) return src
  const tagMatch = src.match(/^<([a-zA-Z][\w-]*)\b([^>]*)>/)
  if (!tagMatch) {
    return `<span ${extraClass ? `class="${extraClass}" ` : ''}${extraAttrs}>${src}</span>`
  }
  let tagInner = tagMatch[2]
  let insertTail = ''
  if (extraClass) {
    const classMatch = tagInner.match(/\bclass\s*=\s*("([^"]*)"|'([^']*)')/i)
    if (classMatch) {
      const quote = classMatch[1][0]
      const current = classMatch[2] !== undefined ? classMatch[2] : classMatch[3]
      const next = current ? `${current} ${extraClass}` : extraClass
      tagInner = tagInner.replace(classMatch[0], `class=${quote}${next}${quote}`)
    } else {
      insertTail = ` class="${extraClass}"`
    }
  }
  const attrInsertAt = tagMatch[0].length - 1
  return `${src.slice(0, attrInsertAt)}${insertTail}${extraAttrs ? ` ${extraAttrs}` : ''}${src.slice(attrInsertAt)}`
}

const createFallbackRenderResult = (context = {}) => {
  const props = context.props || {}
  return {
    type: 'card',
    icon: props.icon || context.echo?.icon || DEFAULT_ECHO_ICON,
    color: props.color || context.echo?.color || DEFAULT_ECHO_COLOR,
    title: props.title || context.echo?.name || context.name || '回响',
    description: props.desc || context.echo?.desc || '',
    prompt: context.prompt || '',
    props,
    html: props.html || ''
  }
}

const readEchoPropsFromHost = (node) => {
  const card = node.querySelector('[data-echo-props]') || node
  if (!card) return {}
  try {
    const raw = card.getAttribute('data-echo-props')
    if (raw) return JSON.parse(raw)
  } catch (error) { /* ignore */ }
  try {
    const ownerHost = (typeof node.closest === 'function') ? node.closest('[data-echo-node-id]') : null
    const hostRaw = ownerHost && ownerHost.getAttribute('data-echo-props-json')
    if (hostRaw) return JSON.parse(hostRaw)
  } catch (error) { /* ignore */ }
  const result = {}
  const attrSource = (typeof node.attributes !== 'undefined') ? node : card
  Array.from(attrSource.attributes || []).forEach(attr => {
    if (attr.name.startsWith('data-echo-prop-')) {
      const key = attr.name.replace(/^data-echo-prop-/, '')
      try { result[key] = JSON.parse(attr.value) } catch (error) { result[key] = attr.value }
    }
  })
  return result
}

export default class EchoRuntime {
  constructor ({ registry } = {}) {
    this.registry = registry
    this.definitionCache = new Map()
    this._installed = []
    this._afterRenderTimer = null
  }

  invalidate (echoId) {
    if (!echoId) { this.definitionCache.clear(); return }
    this.definitionCache.delete(String(echoId))
  }

  compileDefinition (echo = {}) {
    const cacheKey = String(echo.id || echo.name || '')
    const source = String(echo.anno_source || echo.template || '').trim()
    const cached = this.definitionCache.get(cacheKey)
    if (cached && cached.source === source) return cached.definition

    let definition = null
    try {
      if (source) definition = safeEvalAnnoSource(source, HANDLER_PRELUDE)()
    } catch (error) {
      console.error('[echoRuntime] compileDefinition failed:', error)
    }

    if (!definition || typeof definition !== 'object') {
      definition = { name: echo.name || '', render: context => createFallbackRenderResult(context) }
    }

    this.definitionCache.set(cacheKey, { source, definition })
    return definition
  }

  render (token = {}, echo = null) {
    const matchedEcho = echo || this.registry?.getByName?.(token.echoName)
    const payload = decodeEchoPayload(token.payloadRaw || token.payload || '')
    const tokenProps = (token.propsParsed && typeof token.propsParsed === 'object') ? token.propsParsed : {}
    const mergedProps = { ...(payload.props || {}), ...tokenProps }

    if (token && isInheritFromPreviousEnabled(mergedProps) && !String(mergedProps.value || '').trim()) {
      const inheritedValue = String(token.prevValue || '')
      if (inheritedValue) mergedProps.value = inheritedValue
    }

    const payloadValue = typeof payload?.props?.value === 'string' ? payload.props.value : ''
    const tokenPrompt = typeof token.prompt === 'string' ? token.prompt : ''
    const payloadPrompt = typeof payload.prompt === 'string' ? payload.prompt : payloadValue
    const mergedValue = typeof mergedProps.value === 'string' ? mergedProps.value : ''
    const resolvedValue = mergedValue || payloadValue || tokenPrompt || payloadPrompt || ''
    const resolvedPrompt = tokenPrompt || payloadPrompt || resolvedValue || ''
    const resolvedId = String(token.echoId || tokenProps.id || payload?.props?.id || '').trim()

    const context = {
      name: token.echoName || matchedEcho?.name || '',
      id: resolvedId,
      props: { ...mergedProps, value: resolvedValue, id: resolvedId },
      propsRaw: token.propsRaw || '',
      prompt: resolvedPrompt,
      value: resolvedValue,
      raw: token.raw || '',
      echo: matchedEcho || null,
      token,
      payload
    }

    if (!matchedEcho) {
      return { ...createFallbackRenderResult(context), missing: true, title: context.name || '未注册回响' }
    }

    const definition = this.compileDefinition(matchedEcho)
    let result = null
    let afterRenderHook = null
    try {
      if (definition && typeof definition.render === 'function') {
        const tokenWithMeta = Object.assign({}, token, { propsParsed: mergedProps, _echoMeta: matchedEcho })
        result = definition.render(tokenWithMeta, context.props)
        if (typeof definition.afterRender === 'function') {
          const def = definition
          afterRenderHook = (domElement) => {
            try { def.afterRender(domElement, context.props) }
            catch (error) { console.error('[echoRuntime] afterRender hook failed:', error) }
          }
        }
      }
    } catch (error) {
      console.error('[echoRuntime] render failed:', error)
    }

    const normalized = {
      ...createFallbackRenderResult(context),
      ...(result && typeof result === 'object' ? result : {})
    }
    if (afterRenderHook) normalized.afterRenderHook = afterRenderHook

    normalized.icon = normalized.icon || matchedEcho.icon || DEFAULT_ECHO_ICON
    normalized.color = normalized.color || matchedEcho.color || DEFAULT_ECHO_COLOR
    normalized.title = normalized.title || matchedEcho.name || context.name || '回响'
    normalized.description = typeof normalized.description === 'string' ? normalized.description : matchedEcho.desc || ''
    normalized.prompt = typeof normalized.prompt === 'string' ? normalized.prompt : context.prompt || ''
    normalized.value = typeof normalized.value === 'string' ? normalized.value : context.value
    normalized.html = typeof normalized.html === 'string' ? normalized.html : ''
    normalized.props = (normalized.props && typeof normalized.props === 'object') ? normalized.props : context.props
    normalized.echo = matchedEcho

    return normalized
  }

  renderToHtml (token = {}, echo = null) {
    const rendered = this.render(token, echo)
    const renderedHtml = String(rendered.html || '').trim()

    if (renderedHtml) {
      const echoName = escapeHtml(token?.echoName || echo?.name || '')
      const echoId = escapeHtml(token?.echoId || echo?.id || '')
      const definitionId = escapeHtml(token?.propsParsed?.definitionId || echo?.id || '')
      const value = escapeHtml(rendered.value || rendered.prompt || '')
      const injectedAttrs = [
        `data-echo-inline="true"`,
        `data-echo-name="${echoName}"`,
        `data-echo-id="${echoId}"`,
        `data-echo-definition-id="${definitionId}"`,
        `data-echo-value="${value}"`
      ].join(' ')
      const propsJson = escapeHtml(JSON.stringify(rendered.props || {}))
      const propsAttr = `data-echo-props="${propsJson}"`
      return injectAttrsIntoFirstTag(renderedHtml, `${injectedAttrs} ${propsAttr}`, 'ag-echo-inline ag-echo-anno-token')
    }

    // 默认占位渲染
    const icon = escapeHtml(rendered.icon || DEFAULT_ECHO_ICON)
    const color = escapeHtml(rendered.color || DEFAULT_ECHO_COLOR)
    const title = escapeHtml(rendered.title || '回响')
    const description = escapeHtml(rendered.description || '')
    const prompt = escapeHtml(rendered.prompt || '')
    const descriptionHtml = description ? `<div class="ag-echo-inline__desc">${description}</div>` : ''
    const promptHtml = prompt ? `<div class="ag-echo-inline__prompt">${prompt}</div>` : ''

    return `<span class="ag-echo-inline ag-echo-anno-token" data-echo-inline="true" data-echo-name="${escapeHtml(token?.echoName || echo?.name || '')}" data-echo-id="${escapeHtml(token?.echoId || echo?.id || '')}" data-echo-definition-id="${escapeHtml(token?.propsParsed?.definitionId || echo?.id || '')}" data-echo-value="${escapeHtml(rendered.value || rendered.prompt || '')}" style="--echo-color:${color}"><span class="ag-echo-inline__badge"><i class="material-icons ag-echo-inline__icon">${icon}</i><span class="ag-echo-inline__title">${title}</span></span><span class="ag-echo-inline__body">${descriptionHtml}${promptHtml}</span></span>`
  }

  afterRender (container, options = {}) {
    if (!container || typeof container.querySelectorAll !== 'function') return []

    if (this._afterRenderTimer) {
      clearTimeout(this._afterRenderTimer)
      this._afterRenderTimer = null
    }
    this._afterRenderTimer = setTimeout(() => this._doAfterRender(container, options), 250)
  }

  _doAfterRender (container, options = {}) {
    if (options.cleanupFirst) this.disposeAll(container)

    const installed = []
    safeQueryAll(container, '[data-echo-inline="true"]').forEach(node => {
      const echoName = node.getAttribute('data-echo-name') || ''
      const echoId = node.getAttribute('data-echo-id') || ''
      const definitionId = node.getAttribute('data-echo-definition-id') || ''
      const matchedEcho = (definitionId && this.registry?.getById?.(definitionId))
        || (echoName && this.registry?.getByName?.(echoName))
        || null
      if (!matchedEcho) return
      const definition = this.compileDefinition(matchedEcho)
      if (!definition || typeof definition.afterRender !== 'function') return

      let cleanup = null
      try {
        // props 从 DOM 读（_doAfterRender 是延迟回调，render 期的 context.props 已丢失）
        const props = readEchoPropsFromHost(node)
        cleanup = definition.afterRender(node, props) || null
      } catch (error) {
        console.error('[echoRuntime] afterRender hook failed:', echoName, error)
      }
      if (typeof cleanup === 'function') {
        installed.push({ node, id: `__afterRender_${echoName}_${echoId}`, cleanup })
        node.__agEchoCleanup = cleanup
      }
    })

    this._installed = installed
    return installed
  }

  disposeAll (_container) {
    if (this._afterRenderTimer) {
      clearTimeout(this._afterRenderTimer)
      this._afterRenderTimer = null
    }
    if (!Array.isArray(this._installed)) return
    while (this._installed.length) {
      const item = this._installed.pop()
      try { item.cleanup(item.node) }
      catch (error) { console.warn('[echoRuntime] dispose cleanup failed:', item.id, error) }
      if (item.node) delete item.node.__agEchoCleanup
    }
  }
}