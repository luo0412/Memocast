const DEFAULT_ECHO_COLOR = '#26A69A'
const DEFAULT_ECHO_ICON = 'graphic_eq'
const ECHO_PAYLOAD_VERSION = 1
const LEGACY_ECHO_INSERT_RE = /@([^\s{}()@]+)\{\}\(\)/g
const CURRENT_ECHO_PLACEHOLDER_RE = /@([^\s{}()@]*)\{([\s\S]*?)\}\(([^)]*)\)/g

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const unescapeQuotedString = (value = '') => String(value || '')
  .replace(/\\'/g, "'")
  .replace(/\\"/g, '"')
  .replace(/\\n/g, '\n')
  .replace(/\\r/g, '\r')
  .replace(/\\t/g, '\t')

const parsePrimitiveValue = (rawValue = '') => {
  const source = String(rawValue || '').trim()
  if (!source) return ''
  if ((source.startsWith("'") && source.endsWith("'")) || (source.startsWith('"') && source.endsWith('"'))) {
    return unescapeQuotedString(source.slice(1, -1))
  }
  if (/^(true|false)$/i.test(source)) {
    return /^true$/i.test(source)
  }
  if (/^-?\d+(?:\.\d+)?$/.test(source)) {
    return Number(source)
  }
  return source
}

const splitTopLevel = (source = '', separator = ',') => {
  const result = []
  let current = ''
  let quote = ''
  let escape = false
  let braceDepth = 0
  let bracketDepth = 0
  let parenDepth = 0

  for (const char of String(source || '')) {
    if (escape) {
      current += char
      escape = false
      continue
    }
    if (char === '\\') {
      current += char
      escape = true
      continue
    }
    if (quote) {
      current += char
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '{') braceDepth += 1
    if (char === '}') braceDepth = Math.max(0, braceDepth - 1)
    if (char === '[') bracketDepth += 1
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (char === '(') parenDepth += 1
    if (char === ')') parenDepth = Math.max(0, parenDepth - 1)

    if (char === separator && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
      result.push(current)
      current = ''
      continue
    }
    current += char
  }

  if (current) result.push(current)
  return result
}

export const parseEchoAttrs = (source = '') => {
  const raw = String(source || '').trim()
  if (!raw) return {}
  return splitTopLevel(raw)
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const separatorIndex = pair.indexOf(':')
      if (separatorIndex === -1) return acc
      const key = pair.slice(0, separatorIndex).trim()
      const value = pair.slice(separatorIndex + 1).trim()
      if (!key) return acc
      acc[key] = parsePrimitiveValue(value)
      return acc
    }, {})
}

export const createDefaultEchoAnnoSource = (echoName = '回响') => `export default {
  kind: 'echo',
  version: 1,
  name: '${String(echoName || '回响').replace(/'/g, "\\'")}',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    const icon = attrs.icon || context.echo?.icon || '${DEFAULT_ECHO_ICON}'
    const color = attrs.color || context.echo?.color || '${DEFAULT_ECHO_COLOR}'
    const title = attrs.title || context.echo?.name || '${String(echoName || '回响').replace(/'/g, "\\'")}'
    const description = attrs.desc || context.echo?.desc || ''

    return {
      type: 'card',
      icon,
      color,
      title,
      description,
      prompt,
      attrs,
      html: attrs.html || ''
    }
  }
}`

// 默认的 rune 类（"影响附近元素/符文排版"）模板。
// 关键点：
//  - kind: 'rune'，render() 仍然返回标准的 { type, icon, color, title, ... }，用于卡片/host 外观
//  - handler(runeNode, scopeContainer, meta) 是副作用钩子，编译时被自动注册到 EchoRuntime.customHandlers
//    meta = { runeId, kind, attrs }，attrs 已经从 host 的 data-echo-attrs-json / data-rune-attrs / dataset 里聚合
//    可选地返回 cleanup 函数，在卸载/重渲染时被调用
//  - renderToHtml 输出的 <span> 会带上 data-rune-id / data-rune-kind，所以 afterRender() 会派发到这个 handler
export const createDefaultRuneAnnoSource = (echoName = '回响') => `export default {
  kind: 'rune',
  version: 1,
  name: '${String(echoName || '回响').replace(/'/g, "\\'")}',
  runeId: 'my-rune',

  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'auto_awesome',
      color: attrs.color || context.echo?.color || '${DEFAULT_ECHO_COLOR}',
      title: attrs.title || context.echo?.name || '${String(echoName || '回响').replace(/'/g, "\\'")}',
      description: attrs.desc || context.echo?.desc || '影响附近元素或符文',
      prompt,
      attrs: { ...attrs, kind: 'rune', runeId: this.runeId },
      html: ''
    }
  },

  // 副作用钩子 —— 在容器 paint 完成时由 EchoRuntime.afterRender() 调用
  //   runeNode      当前 echo 对应的 <span data-rune-id="...">
  //   container     编辑器根 DOM 容器
  //   meta          { runeId, kind, attrs }，attrs 已经聚合自 data-echo-attrs-json / data-rune-attrs / dataset
  // 返回值可选：返回 cleanup 函数，将在编辑器下次重渲染/卸载时被调用
  handler (runeNode, container, meta) {
    const scope = meta?.attrs?.scope || 'siblings'
    // 简单示例：给同段落所有兄弟加个调试 outline
    const block = runeNode.closest('[data-block-type], .mu-block, p, pre, h1, h2, h3, h4, h5, h6, li, blockquote') || runeNode.parentElement
    const target = block && block.parentElement ? block.parentElement : container
    if (!target) return () => {}
    const previous = target.getAttribute('data-my-rune-active')
    target.setAttribute('data-my-rune-active', 'true')
    target.style.outline = '1px dashed #9C27B0'
    return () => {
      if (previous === null) target.removeAttribute('data-my-rune-active')
      else target.setAttribute('data-my-rune-active', previous)
      target.style.outline = ''
    }
  }
}`

const createFallbackRenderResult = (context = {}) => {
  const attrs = context.attrs || {}
  return {
    type: 'card',
    icon: attrs.icon || context.echo?.icon || DEFAULT_ECHO_ICON,
    color: attrs.color || context.echo?.color || DEFAULT_ECHO_COLOR,
    title: attrs.title || context.echo?.name || context.name || '回响',
    description: attrs.desc || context.echo?.desc || '',
    prompt: context.prompt || '',
    attrs,
    html: attrs.html || ''
  }
}

export const encodeEchoPayload = (payload = {}) => {
  try {
    const normalized = {
      version: ECHO_PAYLOAD_VERSION,
      prompt: typeof payload.prompt === 'string' ? payload.prompt : '',
      attrs: payload.attrs && typeof payload.attrs === 'object' ? payload.attrs : {}
    }
    if (!Object.prototype.hasOwnProperty.call(normalized.attrs, 'value')) {
      normalized.attrs.value = normalized.prompt
    }
    return JSON.stringify(normalized)
  } catch (error) {
    console.error('[EchoRuntime] encode payload failed:', error)
    return JSON.stringify({ version: ECHO_PAYLOAD_VERSION, prompt: '', attrs: {} })
  }
}

export const decodeEchoPayload = (payload = '') => {
  const source = String(payload || '').trim()
  if (!source) {
    return {
      version: ECHO_PAYLOAD_VERSION,
      prompt: '',
      attrs: {}
    }
  }

  try {
    const parsed = JSON.parse(source)
    return {
      version: Number(parsed?.version) || ECHO_PAYLOAD_VERSION,
      prompt: typeof parsed?.prompt === 'string' ? parsed.prompt : typeof parsed?.attrs?.value === 'string' ? parsed.attrs.value : '',
      attrs: parsed?.attrs && typeof parsed.attrs === 'object' ? parsed.attrs : {}
    }
  } catch (error) {
    console.warn('[EchoRuntime] decode payload fallback:', error)
    return {
      version: ECHO_PAYLOAD_VERSION,
      prompt: source,
      attrs: {}
    }
  }
}

export const createEchoPlaceholderPayload = (echo = {}) => {
  return encodeEchoPayload({
    prompt: '',
    attrs: {
      value: '',
      definitionId: String(echo?.id || '').trim(),
      title: echo?.name || '回响',
      desc: echo?.desc || '',
      icon: echo?.icon || DEFAULT_ECHO_ICON,
      color: echo?.color || DEFAULT_ECHO_COLOR
    }
  })
}

export const buildUpdatedEchoAnnotationText = ({ raw, echo, keepInstanceId = false } = {}) => {
  const source = String(raw || '').trim()
  if (!source) return source

  const nameMatch = source.match(/^@([^\s{}()@]*)\{/)
  const echoName = nameMatch ? nameMatch[1] : '回响'

  const legacy = source.match(/^@([^\s{}()@]+)\{\}\(\)$/)
  if (!legacy) {
    return source
  }

  const placeholderPayload = createEchoPlaceholderPayload(echo)
  const payload = decodeEchoPayload(placeholderPayload)
  const value = payload.prompt || payload?.attrs?.value || ''
  const instanceId = keepInstanceId ? `id: '${escapeEchoAttrValue(echo.id || '')}'` : ''

  return `@${echoName}{${[instanceId, `value: '${escapeEchoAttrValue(value)}'`].filter(Boolean).join(', ')}()`
}

export const backfillEchoAnnotationsInMarkdown = ({ markdown = '', echoCards = [] } = {}) => {
  const source = String(markdown || '')
  if (!source || source.indexOf('@') === -1) return source

  const echoMap = (Array.isArray(echoCards) ? echoCards : []).reduce((acc, echo) => {
    const name = String(echo?.name || '').trim()
    if (name) acc.set(name, echo)
    return acc
  }, new Map())
  if (!echoMap.size) return source

  return source.replace(LEGACY_ECHO_INSERT_RE, (match, rawEchoName = '') => {
    const echoName = String(rawEchoName || '').trim()
    const echo = echoMap.get(echoName)
    if (!echo) return match
    return buildUpdatedEchoAnnotationText({ raw: match, echo, keepInstanceId: false })
  }).replace(CURRENT_ECHO_PLACEHOLDER_RE, (match, rawEchoName = '', attrsRaw = '', promptRaw = '') => {
    const echoName = String(rawEchoName || '').trim() || '回响'
    const echo = echoMap.get(echoName)
    if (!echo) return match

    const parsed = parseEchoAttrs(attrsRaw)
    const instanceId = String(parsed.id || echo.id || '').trim()
    const placeholderPayload = createEchoPlaceholderPayload({
      ...echo,
      ...(parsed.definitionId ? { id: parsed.definitionId } : {})
    })
    const payload = decodeEchoPayload(placeholderPayload)
    const value = payload.prompt || payload?.attrs?.value || ''
    const nextAttrs = `id: '${escapeEchoAttrValue(instanceId)}', value: '${escapeEchoAttrValue(value)}'`

    return `@${echoName || '回响'}{${nextAttrs}}(${escapeEchoAttrValue(promptRaw)})`
  })
}

const safeEvalFactory = (source = '') => {
  const normalized = String(source || '').replace(/export\s+default/, 'return ')
  return new Function(normalized)
}

// ============================================================================
// 多符文运行时（EchoRuntime + rune handlers）
// ============================================================================
// 渲染管线：
//   1. parseEchoAttrs / decodeEchoPayload 解析 token
//   2. definition.render() 拿到标准化结果（包含 attrs.kind / attrs.runeId）
//   3. EchoRuntime.render() 在 kind === 'rune' | 'rune-tbd' 时挂 runeMeta
//   4. 编辑器把 rendered HTML 插入到内容容器
//   5. 容器完成 paint 后调用 registry.afterRender(container, runes)
//      逐个调用对应 handler，给附近节点施加运行时副作用
//
// scope 约定：
//   siblings   —— 同段落（或同 block）的兄弟节点（默认）
//   prev-block —— 前一块节点
//   block      —— 当前 block（含自身）
//   document   —— 整篇容器
// ============================================================================

const RUNE_KINDS = new Set(['rune', 'rune-tbd'])

const safeQueryAll = (root, selector) => {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  try {
    return Array.from(root.querySelectorAll(selector))
  } catch (error) {
    console.warn('[EchoRuntime] safeQueryAll failed:', error)
    return []
  }
}

const resolveScopeContainer = (runeNode, scope = 'siblings') => {
  if (!runeNode) return null
  const block = runeNode.closest('[data-block-type], .mu-block, p, pre, h1, h2, h3, h4, h5, h6, li, blockquote, table, ul, ol') || runeNode.parentElement
  const documentRoot = runeNode.closest('[data-echo-document], .mu-editor, article, [data-doc-id]') || document.body

  switch (String(scope || 'siblings').toLowerCase()) {
    case 'prev-block': {
      let prev = block && block.previousElementSibling
      while (prev && !prev.firstElementChild && prev.textContent.trim() === '') {
        prev = prev.previousElementSibling
      }
      return prev || block
    }
    case 'block':
      return block
    case 'document':
      return documentRoot
    case 'siblings':
    default:
      return block && block.parentElement ? block.parentElement : documentRoot
  }
}

const addClassOnce = (el, className) => {
  if (!el || !className) return
  el.classList.add(...String(className).split(/\s+/).filter(Boolean))
}

const removeClasses = (el, classNames = []) => {
  if (!el) return
  String(classNames || '').split(/\s+/).filter(Boolean).forEach(name => el.classList.remove(name))
}

// ----- 9 个 rune 的 handler -----

const growthHandler = {
  id: 'growth',
  match (meta) { return meta && meta.runeId === 'growth' },
  apply (runeNode, _scopeContainer, meta) {
    const scope = (meta && meta.attrs && meta.attrs.scope) || 'siblings'
    const container = resolveScopeContainer(runeNode, scope)
    if (!container) return () => {}
    const trigger = (meta && meta.attrs && meta.attrs.trigger) || 'auto'
    const targetSelector = (meta && meta.attrs && meta.attrs.target) || '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table'
    const targets = safeQueryAll(container, targetSelector)
    targets.forEach((node, index) => {
      addClassOnce(node, 'ag-rune-growth-target')
      if (trigger === 'auto') {
        node.style.setProperty('--ag-rune-growth-delay', `${Math.min(index, 8) * 120}ms`)
      }
    })
    addClassOnce(runeNode, 'ag-rune-growth-active')
    return () => {
      targets.forEach(node => removeClasses(node, 'ag-rune-growth-target'))
      removeClasses(runeNode, 'ag-rune-growth-active')
    }
  }
}

const shatterHandler = {
  id: 'shatter',
  match (meta) { return meta && meta.runeId === 'shatter' },
  apply (runeNode, _scopeContainer, meta) {
    const target = (meta && meta.attrs && meta.attrs.target) || 'line'
    const container = resolveScopeContainer(runeNode, target === 'block' ? 'block' : 'siblings')
    if (!container) return () => {}
    const echoNodes = safeQueryAll(container, '[data-echo-inline="true"]')
    echoNodes.forEach(node => {
      if (node === runeNode) return
      node.setAttribute('data-shatter-disabled', 'true')
      node.classList.add('ag-rune-shatter-disabled')
    })
    addClassOnce(runeNode, 'ag-rune-shatter-active')
    return () => {
      echoNodes.forEach(node => {
        if (node === runeNode) return
        node.removeAttribute('data-shatter-disabled')
        removeClasses(node, 'ag-rune-shatter-disabled')
      })
      removeClasses(runeNode, 'ag-rune-shatter-active')
    }
  }
}

const skywalkHandler = {
  id: 'skywalk',
  match (meta) { return meta && meta.runeId === 'skywalk' },
  apply (runeNode, _scopeContainer, meta) {
    const theme = (meta && meta.attrs && meta.attrs.theme) || 'auto'
    const layout = (meta && meta.attrs && meta.attrs.layout) || 'enhanced'
    const container = resolveScopeContainer(runeNode, 'document')
    if (!container) return () => {}
    const previous = {
      theme: container.getAttribute('data-skywalk-theme'),
      layout: container.getAttribute('data-skywalk-layout')
    }
    container.setAttribute('data-skywalk-theme', theme)
    container.setAttribute('data-skywalk-layout', layout)
    addClassOnce(runeNode, 'ag-rune-skywalk-active')
    return () => {
      if (previous.theme === null) container.removeAttribute('data-skywalk-theme')
      else container.setAttribute('data-skywalk-theme', previous.theme)
      if (previous.layout === null) container.removeAttribute('data-skywalk-layout')
      else container.setAttribute('data-skywalk-layout', previous.layout)
      removeClasses(runeNode, 'ag-rune-skywalk-active')
    }
  }
}

const twinbloomHandler = {
  id: 'twinbloom',
  match (meta) { return meta && meta.runeId === 'twinbloom' },
  apply (runeNode, _scopeContainer, meta) {
    const placeholder = (meta && meta.attrs && meta.attrs.placeholder) || '双生节点'
    const block = runeNode.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote') || runeNode.parentElement
    if (!block) return () => {}
    const previous = block.nextElementSibling
    if (previous && previous.getAttribute('data-twinbloom-of') === runeNode.getAttribute('data-rune-id')) {
      return () => {}
    }
    const cloned = block.cloneNode(true)
    cloned.setAttribute('data-twinbloom-of', runeNode.getAttribute('data-rune-id') || 'twinbloom')
    cloned.classList.add('ag-rune-twinbloom-clone')
    cloned.setAttribute('data-twinbloom-placeholder', placeholder)
    const originalText = (cloned.textContent || '').trim()
    if (!originalText) {
      cloned.textContent = placeholder
    }
    if (block.parentElement) {
      block.parentElement.insertBefore(cloned, block.nextSibling)
    }
    addClassOnce(runeNode, 'ag-rune-twinbloom-active')
    return () => {
      if (cloned.parentElement) cloned.parentElement.removeChild(cloned)
      removeClasses(runeNode, 'ag-rune-twinbloom-active')
    }
  }
}

const mindstealHandler = {
  id: 'mindsteal',
  match (meta) { return meta && meta.runeId === 'mindsteal' },
  apply (runeNode, _scopeContainer, meta) {
    const mode = (meta && meta.attrs && meta.attrs.mode) || 'override'
    const container = resolveScopeContainer(runeNode, 'siblings')
    if (!container) return () => {}
    const runeTargets = safeQueryAll(container, '[data-rune-id]')
    runeTargets.forEach(node => {
      if (node === runeNode) return
      node.setAttribute('data-mindsteal-mode', mode)
      node.style.setProperty('animation', 'none', 'important')
    })
    addClassOnce(runeNode, 'ag-rune-mindsteal-active')
    return () => {
      runeTargets.forEach(node => {
        if (node === runeNode) return
        node.removeAttribute('data-mindsteal-mode')
        node.style.removeProperty('animation')
      })
      removeClasses(runeNode, 'ag-rune-mindsteal-active')
    }
  }
}

const luckyHandler = {
  id: 'lucky',
  match (meta) { return meta && meta.runeId === 'lucky' },
  apply (runeNode, _scopeContainer, meta) {
    addClassOnce(runeNode, 'ag-rune-lucky-active')
    runeNode.style.cursor = 'pointer'
    runeNode.setAttribute('role', 'button')
    runeNode.setAttribute('tabindex', '0')
    runeNode.setAttribute('title', (meta && meta.attrs && meta.attrs.label) || '点击触发 AI 校对')

    const trigger = async (event) => {
      event.preventDefault()
      event.stopPropagation()
      runeNode.classList.add('ag-rune-lucky-loading')
      try {
        const handler = (typeof window !== 'undefined') ? window.__memocastRuneHandlers?.lucky : null
        if (typeof handler === 'function') {
          await handler({ runeNode, meta })
        } else {
          console.info('[EchoRuntime] lucky: no global handler registered (window.__memocastRuneHandlers.lucky)')
        }
      } catch (error) {
        console.error('[EchoRuntime] lucky handler failed:', error)
      } finally {
        runeNode.classList.remove('ag-rune-lucky-loading')
      }
    }

    const onClick = (event) => { trigger(event) }
    const onKey = (event) => {
      if (event.key === 'Enter' || event.key === ' ') trigger(event)
    }
    runeNode.addEventListener('click', onClick)
    runeNode.addEventListener('keydown', onKey)

    return () => {
      runeNode.removeEventListener('click', onClick)
      runeNode.removeEventListener('keydown', onKey)
      removeClasses(runeNode, 'ag-rune-lucky-active ag-rune-lucky-loading')
      runeNode.style.cursor = ''
      runeNode.removeAttribute('role')
      runeNode.removeAttribute('tabindex')
      runeNode.removeAttribute('title')
    }
  }
}

const disperseHandler = {
  id: 'disperse',
  match (meta) { return meta && meta.runeId === 'disperse' },
  apply (runeNode, _scopeContainer, meta) {
    const density = (meta && meta.attrs && meta.attrs.density) || 'loose'
    const container = resolveScopeContainer(runeNode, 'block')
    if (!container) return () => {}
    const previous = container.getAttribute('data-disperse-density')
    container.setAttribute('data-disperse-density', density)
    addClassOnce(runeNode, 'ag-rune-disperse-active')
    return () => {
      if (previous === null) container.removeAttribute('data-disperse-density')
      else container.setAttribute('data-disperse-density', previous)
      removeClasses(runeNode, 'ag-rune-disperse-active')
    }
  }
}

const tbdHandler = {
  id: '__tbd__',
  match (meta) { return meta && meta.kind === 'rune-tbd' },
  apply (runeNode, _scopeContainer, _meta) {
    addClassOnce(runeNode, 'ag-rune-tbd-active')
    return () => removeClasses(runeNode, 'ag-rune-tbd-active')
  }
}

export const RUNE_HANDLERS = [
  growthHandler,
  shatterHandler,
  skywalkHandler,
  twinbloomHandler,
  mindstealHandler,
  luckyHandler,
  disperseHandler,
  tbdHandler
]

export const findRuneHandler = (runeId = '') => {
  const target = String(runeId || '').trim()
  return RUNE_HANDLERS.find(handler => handler.id === target) || null
}

// 让运行时能挂载"由 echo anno_source 内置 handler 字段动态声明"的 rune handler
// - id 必须唯一（建议用 `echo:${definitionId}` 或自定义 runeId）
// - match(runeMeta) -> boolean，决定该 handler 是否对该 rune 起作用
// - apply(runeNode, scopeContainer, runeMeta) -> cleanupFn? 与内置 handler 同样语义
export const normalizeCustomHandler = (raw = {}, fallbackId = '') => {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || raw.runeId || fallbackId || '').trim()
  if (!id) return null
  const match = (typeof raw.match === 'function')
    ? raw.match
    : (meta) => Boolean(meta) && (meta.runeId === id || meta?.attrs?.runeId === id)
  const apply = (typeof raw.apply === 'function')
    ? raw.apply
    : (typeof raw.handler === 'function')
      ? raw.handler
      : null
  if (!apply) return null
  const cleanupFn = (typeof raw.cleanup === 'function') ? raw.cleanup : null
  return {
    id,
    match,
    apply,
    cleanup: cleanupFn,
    description: typeof raw.description === 'string' ? raw.description : '',
    source: typeof raw.source === 'string' ? raw.source : ''
  }
}

export const extractRuneMeta = (rendered = {}) => {
  const attrs = (rendered && rendered.attrs && typeof rendered.attrs === 'object') ? rendered.attrs : {}
  const kind = String(attrs.kind || '').trim()
  if (!RUNE_KINDS.has(kind)) return null
  return {
    runeId: String(attrs.runeId || '').trim(),
    kind,
    attrs: { ...attrs },
    title: rendered.title || '',
    description: rendered.description || ''
  }
}

export default class EchoRuntime {
  constructor ({ registry } = {}) {
    this.registry = registry
    this.definitionCache = new Map()
    // 用户/动态注册 rune handler，id -> { id, match, apply, cleanup, ... }
    this.customHandlers = new Map()
  }

  invalidate (echoId) {
    if (!echoId) {
      this.definitionCache.clear()
      return
    }
    this.definitionCache.delete(String(echoId))
  }

  /**
   * 动态注册一个 rune handler。
   *  - raw 可以是已规整的 { id, match, apply } 或 anno_source 里的 handler 字段。
   *  - 注册后，afterRender() 派发时会优先命中 custom handler；找不到再退到 RUNE_HANDLERS。
   *  - 同一 id 重复 register 会覆盖。
   *  - 返回注册的 id，失败返回空串。
   */
  registerRuneHandler (raw = {}, fallbackId = '') {
    const normalized = normalizeCustomHandler(raw, fallbackId)
    if (!normalized) {
      console.warn('[EchoRuntime] registerRuneHandler: invalid handler', raw)
      return ''
    }
    this.customHandlers.set(normalized.id, normalized)
    return normalized.id
  }

  unregisterRuneHandler (id = '') {
    const target = String(id || '').trim()
    if (!target) return false
    return this.customHandlers.delete(target)
  }

  listCustomRuneHandlers () {
    return Array.from(this.customHandlers.values())
  }

  /**
   * 查找 handler（custom 优先于内置）。
   * 提供给内部 afterRender() 使用，外部也可直接调用。
   */
  resolveRuneHandler (runeMeta = {}) {
    const id = String(runeMeta?.runeId || '').trim()
    const kind = String(runeMeta?.kind || 'rune')
    // 1) 自定义 handler（精确按 id）
    if (id && this.customHandlers.has(id)) {
      return this.customHandlers.get(id)
    }
    // 2) 自定义 handler（按 match 探测）
    for (const handler of this.customHandlers.values()) {
      try {
        if (typeof handler.match === 'function' && handler.match(runeMeta)) {
          return handler
        }
      } catch (error) {
        console.warn('[EchoRuntime] custom handler.match failed:', handler.id, error)
      }
    }
    // 3) 内置 rune handler
    const builtIn = findRuneHandler(id)
    if (builtIn) return builtIn
    // 4) rune-tbd 兜底
    if (kind === 'rune-tbd') return findRuneHandler('__tbd__')
    return null
  }

  compileDefinition (echo = {}) {
    const cacheKey = String(echo.id || echo.name || '')
    const source = String(echo.anno_source || echo.template || '').trim()
    const cached = this.definitionCache.get(cacheKey)
    if (cached && cached.source === source) {
      return cached.definition
    }

    let definition = null
    try {
      if (source) {
        const factory = safeEvalFactory(source)
        definition = factory()
      }
    } catch (error) {
      console.error('[EchoRuntime] compile definition failed:', error)
    }

    if (!definition || typeof definition !== 'object') {
      definition = {
        name: echo.name || '',
        render: context => createFallbackRenderResult(context)
      }
    }

    // === 自动注册 anno_source 内置的 rune handler ===
    // 约定：definition.handler = function (runeNode, scopeContainer, runeMeta) { ... }
    // 同时 definition.kind === 'rune' | 'rune-tbd' 且 definition.runeId / definition.id 已声明。
    try {
      const kind = String(definition.kind || definition?.attrs?.kind || '').trim()
      if (kind === 'rune' || kind === 'rune-tbd') {
        const handlerSpec = definition.handler || definition
        const fallbackId = String(definition.runeId || definition.id || cacheKey || '').trim()
        if (typeof handlerSpec?.apply === 'function' || typeof handlerSpec === 'function' || typeof handlerSpec?.match === 'function') {
          const normalized = normalizeCustomHandler({
            ...(typeof handlerSpec === 'object' ? handlerSpec : {}),
            // 函数形式：apply(runeNode, container, meta)
            apply: (typeof handlerSpec === 'function')
              ? handlerSpec
              : (typeof handlerSpec?.apply === 'function' ? handlerSpec.apply : undefined),
            id: String(definition.runeId || definition.id || fallbackId || '').trim(),
            source: `definition:${cacheKey}`
          }, fallbackId)
          if (normalized) {
            this.customHandlers.set(normalized.id, normalized)
          }
        }
      }
    } catch (error) {
      console.warn('[EchoRuntime] auto-register definition handler failed:', error)
    }

    this.definitionCache.set(cacheKey, { source, definition })
    return definition
  }

  render (token = {}, echo = null) {
    const matchedEcho = echo || this.registry?.getByName?.(token.echoName)
    const payload = decodeEchoPayload(token.payloadRaw || token.payload || '')
    const tokenAttrs = token.attrsParsed && typeof token.attrsParsed === 'object' ? token.attrsParsed : {}
    const mergedAttrs = {
      ...(payload.attrs || {}),
      ...tokenAttrs
    }
    const payloadValue = typeof payload?.attrs?.value === 'string' ? payload.attrs.value : ''
    const tokenAttrValue = typeof tokenAttrs.value === 'string' ? tokenAttrs.value : ''
    const payloadPrompt = typeof payload.prompt === 'string' ? payload.prompt : payloadValue
    const tokenPrompt = typeof token.prompt === 'string' ? token.prompt : ''
    const resolvedValue = tokenAttrValue || payloadValue || tokenPrompt || payloadPrompt || ''
    const resolvedPrompt = tokenPrompt || payloadPrompt || resolvedValue || ''
    const context = {
      name: token.echoName || matchedEcho?.name || '',
      id: String(token.echoId || tokenAttrs.id || payload?.attrs?.id || '').trim(),
      attrs: {
        ...mergedAttrs,
        value: resolvedValue,
        id: String(token.echoId || tokenAttrs.id || payload?.attrs?.id || '').trim()
      },
      attrsRaw: token.attrsRaw || '',
      prompt: resolvedPrompt,
      value: resolvedValue,
      raw: token.raw || '',
      echo: matchedEcho || null,
      token,
      payload
    }

    if (!matchedEcho) {
      return {
        ...createFallbackRenderResult(context),
        missing: true,
        title: context.name || '未注册回响'
      }
    }

    const definition = this.compileDefinition(matchedEcho)
    let result = null
    try {
      if (definition && typeof definition.render === 'function') {
        result = definition.render(context)
      }
    } catch (error) {
      console.error('[EchoRuntime] render failed:', error)
    }

    const normalized = {
      ...createFallbackRenderResult(context),
      ...(result && typeof result === 'object' ? result : {})
    }

    normalized.icon = normalized.icon || matchedEcho.icon || DEFAULT_ECHO_ICON
    normalized.color = normalized.color || matchedEcho.color || DEFAULT_ECHO_COLOR
    normalized.title = normalized.title || matchedEcho.name || context.name || '回响'
    normalized.description = typeof normalized.description === 'string' ? normalized.description : matchedEcho.desc || ''
    normalized.prompt = typeof normalized.prompt === 'string' ? normalized.prompt : context.prompt || ''
    normalized.value = typeof normalized.value === 'string' ? normalized.value : context.value
    normalized.html = typeof normalized.html === 'string' ? normalized.html : ''
    normalized.attrs = normalized.attrs && typeof normalized.attrs === 'object' ? normalized.attrs : context.attrs
    normalized.echo = matchedEcho

    const runeMeta = extractRuneMeta(normalized)
    if (runeMeta) {
      normalized.runeMeta = runeMeta
    }

    return normalized
  }

  renderToHtml (token = {}, echo = null) {
    const rendered = this.render(token, echo)
    const icon = escapeHtml(rendered.icon || DEFAULT_ECHO_ICON)
    const color = escapeHtml(rendered.color || DEFAULT_ECHO_COLOR)
    const title = escapeHtml(rendered.title || '回响')
    const description = escapeHtml(rendered.description || '')
    const prompt = escapeHtml(rendered.prompt || '')
    const bodyHtml = rendered.html || ''
    const descriptionHtml = description ? `<div class="ag-echo-inline__desc">${description}</div>` : ''
    const promptHtml = prompt ? `<div class="ag-echo-inline__prompt">${prompt}</div>` : ''
    const customHtml = bodyHtml ? `<div class="ag-echo-inline__html">${bodyHtml}</div>` : ''

    const runeAttr = rendered.runeMeta
      ? ` data-rune-id="${escapeHtml(rendered.runeMeta.runeId || 'unknown')}" data-rune-kind="${escapeHtml(rendered.runeMeta.kind || 'rune')}"`
      : ''

    return `<span class="ag-echo-inline" data-echo-inline="true"${runeAttr} style="--echo-color:${color}"><span class="ag-echo-inline__badge"><i class="material-icons ag-echo-inline__icon">${icon}</i><span class="ag-echo-inline__title">${title}</span></span><span class="ag-echo-inline__body">${descriptionHtml}${promptHtml}${customHtml}</span></span>`
  }

  // 渲染完成后的副作用入口。
  //   container     —— 编辑器渲染容器的根 DOM
  //   options.cleanupFirst —— 编辑器重建时先卸载上一次 handler
  afterRender (container, options = {}) {
    if (!container || typeof container.querySelectorAll !== 'function') return []
    const cleanupFirst = Boolean(options.cleanupFirst)
    if (cleanupFirst) {
      this.disposeAll(container)
    }

    const runeNodes = safeQueryAll(container, '[data-rune-id]')
    const installed = []
    runeNodes.forEach(node => {
      const runeId = node.getAttribute('data-rune-id') || ''
      const meta = {
        runeId,
        kind: node.getAttribute('data-rune-kind') || 'rune',
        attrs: this._readRuneAttrs(node)
      }
      const handler = this.resolveRuneHandler(meta)
      if (!handler) return
      let cleanup = null
      try {
        cleanup = handler.apply(node, container, meta) || null
      } catch (error) {
        console.error('[EchoRuntime] handler failed:', runeId, error)
      }
      if (typeof cleanup === 'function') {
        installed.push({ node, runeId, cleanup })
        node.__agRuneCleanup = cleanup
      } else if (typeof handler.cleanup === 'function') {
        // 自定义 handler 可能把 cleanup 挂在自身而不是 apply 返回值
        const boundCleanup = handler.cleanup.bind(handler, node, container, meta)
        installed.push({ node, runeId, cleanup: boundCleanup })
        node.__agRuneCleanup = boundCleanup
      }
    })

    this._installed = installed
    return installed
  }

  disposeAll (_container) {
    if (!Array.isArray(this._installed)) return
    while (this._installed.length) {
      const item = this._installed.pop()
      try {
        item.cleanup(item.node)
      } catch (error) {
        console.warn('[EchoRuntime] dispose cleanup failed:', item.runeId, error)
      }
      if (item.node) delete item.node.__agRuneCleanup
    }
  }

  _readRuneAttrs (node) {
    // 优先从兄弟/回响容器读 payload；fallback 从 DOM data-* 上读
    const card = node.querySelector('[data-rune-attrs]') || node
    if (!card) return {}
    try {
      const raw = card.getAttribute('data-rune-attrs')
      if (raw) return JSON.parse(raw)
    } catch (error) { /* ignore */ }
    // 再回退：直接从当前 rune host（node 自身）读 data-echo-attrs-json，
    // 这样 Muya 端如果把 echo 实例属性只挂在 host.dataset 上也能命中。
    try {
      const ownerHost = (typeof node.closest === 'function')
        ? node.closest('[data-echo-node-id]')
        : null
      const hostRaw = ownerHost && ownerHost.getAttribute('data-echo-attrs-json')
      if (hostRaw) return JSON.parse(hostRaw)
    } catch (error) { /* ignore */ }
    const result = {}
    const attrSource = (typeof node.attributes !== 'undefined') ? node : card
    Array.from(attrSource.attributes || []).forEach(attr => {
      if (attr.name.startsWith('data-rune-attr-') || attr.name.startsWith('data-echo-attr-')) {
        const key = attr.name
          .replace(/^data-rune-attr-/, '')
          .replace(/^data-echo-attr-/, '')
        try {
          result[key] = JSON.parse(attr.value)
        } catch (error) {
          result[key] = attr.value
        }
      }
    })
    // 兜底：把 host 上数据集中可能写着的 attrs.* 关键字段（kind/runeId/scope/...）
    // 也一并合并进来，让运行时 handler 可以无依赖使用。
    try {
      const host = (typeof node.closest === 'function')
        ? node.closest('[data-echo-node-id]')
        : null
      if (host && host.dataset) {
        for (const key of Object.keys(host.dataset)) {
          if (Object.prototype.hasOwnProperty.call(result, key)) continue
          if (['echoName', 'echoId', 'echoDefinitionId', 'echoNodeId', 'echoValue'].includes(key)) continue
          if (!['kind', 'runeId', 'scope', 'trigger', 'target', 'theme', 'layout', 'density', 'mode', 'targets', 'placeholder', 'source', 'label', 'action', 'model'].includes(key)) continue
          result[key] = host.dataset[key]
        }
      }
    } catch (error) { /* ignore */ }
    return result
  }
}
