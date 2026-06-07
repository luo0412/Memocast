const DEFAULT_ECHO_COLOR = '#26A69A'
const DEFAULT_ECHO_ICON = 'graphic_eq'
const ECHO_PAYLOAD_VERSION = 1

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

const safeEvalFactory = (source = '') => {
  const normalized = String(source || '').replace(/export\s+default/, 'return ')
  return new Function(normalized)
}

export default class EchoRuntime {
  constructor ({ registry } = {}) {
    this.registry = registry
    this.definitionCache = new Map()
  }

  invalidate (echoId) {
    if (!echoId) {
      this.definitionCache.clear()
      return
    }
    this.definitionCache.delete(String(echoId))
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

    return `<span class="ag-echo-inline" data-echo-inline="true" style="--echo-color:${color}"><span class="ag-echo-inline__badge"><i class="material-icons ag-echo-inline__icon">${icon}</i><span class="ag-echo-inline__title">${title}</span></span><span class="ag-echo-inline__body">${descriptionHtml}${promptHtml}${customHtml}</span></span>`
  }
}
