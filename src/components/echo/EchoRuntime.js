import {
  DEFAULT_ECHO_COLOR,
  DEFAULT_ECHO_ICON,
  CURRENT_ECHO_PLACEHOLDER_RE
} from './builtin-echo-shared.js'

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

// 把 extraAttrs（形如 `data-x="y" data-z="w"`）注入到 html 的第一个起始标签内。
//   - 同步在第一个起始标签的 class 列表里追加 extraClass（不去重，原有 class 保留）
//   - 若 html 整体不是以标签开头，会退化为外面包一层 <span extraAttrs extraClass>...</span>。
//   - 用于 render 自带 HTML 时，给根元素补 echo host 所需的 ABI 元数据
//     （data-echo-inline="true" / data-echo-name / data-echo-id / ...），
//     并确保根元素同时拥有 `ag-echo-inline` class 以兼容 .ag-echo-inline 选择器。
const injectAttrsIntoFirstTag = (html, extraAttrs = '', extraClass = '') => {
  const src = String(html || '')
  if (!src) return src
  if (!extraAttrs && !extraClass) return src
  const tagMatch = src.match(/^<([a-zA-Z][\w-]*)\b([^>]*)>/)
  if (!tagMatch) {
    return `<span ${extraClass ? `class="${extraClass}" ` : ''}${extraAttrs}>${src}</span>`
  }
  let tagInner = tagMatch[2] // 起始标签内除标签名外的部分（"<span TAG_INNER>"）
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
  return `${src.slice(0, attrInsertAt)}${insertTail ? insertTail : ''}${extraAttrs ? ` ${extraAttrs}` : ''}${src.slice(attrInsertAt)}`
}

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
  namespace: '回响',

  // === 新模板签名（TODO 提议）：node + ancestors ===
  //   - node     : token = { type:'echo_anno', echoName, echoId, attrsParsed, prompt, raw, range, ... }
  //   - ancestors: { echo: echoCard, block, document, parent }
  // 模仿者如果只想要旧形态 render(context)，把函数改成单参即可。
  render (node, ancestors) {
    const attrs = (node && node.attrsParsed) || {}
    const prompt = (node && node.prompt) || ''
    const echoMeta = (ancestors && ancestors.echo) || {}
    return {
      type: 'card',
      icon: attrs.icon || echoMeta.icon || '${DEFAULT_ECHO_ICON}',
      color: attrs.color || echoMeta.color || '${DEFAULT_ECHO_COLOR}',
      title: attrs.title || echoMeta.name || '${String(echoName || '回响').replace(/'/g, "\\'")}',
      description: attrs.desc || echoMeta.desc || '',
      prompt,
      attrs,
      html: attrs.html || ''
    }
  },

  // === 后渲染钩子：domElement 已插入到 DOM ===
  // 第 1 参就是 echo host DOM element（jQuery 能直接 $(node) 选中），
  // 第 2 参 attrs = attrsParsed（实例的业务参数对象）由 EchoRuntime 注入。
  // 形参名 echo 定义里可以自由用 node / domElement / host，参数语义不变。
  afterRender (node, attrs = {}) {
    $(node).addClass('ag-echo-default-mounted')
  }
}`

// ============================================================================
// Echo 体系 enum 与运行时命名（v2026-07 起固定）
//
//   kind              取值：'echo'
//
// 渲染管线（renderEchoPlaceholders → EchoRuntime.renderToHtml → host.innerHTML
//         → EchoRuntime.afterRender）：
//   1. parseEchoAttrs / decodeEchoPayload 解析 token
//   2. registry.render 拿到定义（matchedEcho → this.compileDefinition）
//   3. definition.render(context) 返回 { type, attrs, html, ... }
//      definition.html 写到 host.innerHTML（host 自带 data-echo-inline="true"）
//   4. 容器完成 paint 后调用 registry.afterRender(container)
//      按 [data-echo-inline="true"] 逐个调 definition.afterRender(fakeToken, node, ancestors)
//      cleanup 统一从 afterRender 返回值收集
//
// 16 个内置 echo 都以 jQuery 写 afterRender，
// 所有副作用都通过 $(domElement) / $(ancestors.document) / ancestors.echo.attrs 等上下文拿到。
//
// DOM ABI：data-echo-inline / data-echo-id / data-echo-name / data-echo-value
//          / data-echo-definition-id / data-echo-attrs / data-echo-attrs-json
//          / data-echo-node-id
// CSS class（字面保留）：ag-rune-*（视觉样式锚点；避免触发回归）。
// ============================================================================

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

export const createEchoPlaceholderPayload = (echo = {}, options = {}) => {
  const inheritEnabled = echoInheritFromPrevious(echo) || (options && options.inheritFromPrevious === true)
  const inheritedValue = inheritEnabled ? String(options && options.inheritedValue || '') : ''
  return encodeEchoPayload({
    prompt: inheritedValue,
    attrs: {
      value: inheritedValue,
      definitionId: String(echo?.id || '').trim(),
      title: echo?.name || '回响',
      desc: echo?.desc || '',
      icon: echo?.icon || DEFAULT_ECHO_ICON,
      color: echo?.color || DEFAULT_ECHO_COLOR,
      inheritFromPrevious: inheritEnabled
    }
  })
}

// === 上一节点 value 继承（默认关闭） ===
//
// 当 echo 名片层的 anno_source 通过 render 把 attrs.inheritFromPrevious 显式设为 true 时，
// 创建新回响实例的 placeholder / migrate 流程会从「同一 markdown 中当前位置之前最近的 echo token」
// 提取 attrs.value（或 prompt）注入新实例的 value。用户没显式声明时，行为是关闭的。
//
// 设计意图：
//   - 默认 createDefaultEchoAnnoSource 不会输出 inheritFromPrevious，因此默认行为是「不继承」。
//   - 用户可在自己的 anno_source render 里把 inheritFromPrevious 设为 true 开启。
//   - 真正"提取上一节点 value"的责任在 caller（Muya Vue 那一层扫描整段 markdown 时做）。
const INHERIT_FROM_PREVIOUS_KEYS = ['inheritFromPrevious', 'inherit_from_previous', 'inheritPrevValue']

export const isInheritFromPreviousEnabled = (input = {}) => {
  if (!input || typeof input !== 'object') return false
  for (const key of INHERIT_FROM_PREVIOUS_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue
    const raw = input[key]
    if (raw === true) return true
    if (typeof raw === 'string') {
      const norm = raw.trim().toLowerCase()
      if (norm === 'true' || norm === '1' || norm === 'yes' || norm === 'on') return true
    }
    if (typeof raw === 'number' && raw === 1) return true
  }
  return false
}

/**
 * 解析一个 echo 名片（registry 注册的回响定义）是否声明了「继承上一节点 value」。
 * 支持三种字段挂载位置：
 *   - echo.inheritFromPrevious         直接挂在 echo 顶层
 *   - echo.attrs.inheritFromPrevious    挂在 echo.attrs 里
 *   - echo.definitionAttrs.inheritFromPrevious  备用挂载
 */
export const echoInheritFromPrevious = (echo = {}) => {
  if (!echo || typeof echo !== 'object') return false
  if (isInheritFromPreviousEnabled(echo)) return true
  if (isInheritFromPreviousEnabled(echo.attrs)) return true
  if (isInheritFromPreviousEnabled(echo.definitionAttrs)) return true
  return false
}

/**
 * 从 markdown 字符串的 currentIndex 之前，找最近一个 echo token 的 value。
 * 没有匹配则返回空字符串。仅依赖 CURRENT_ECHO_PLACEHOLDER_RE（与 backfill 同源）。
 *
 * @param {string} markdown
 * @param {number} currentIndex  当前正在构造/处理的位置（即 "当前节点" 之前的 markdown 末尾）
 * @param {{ echoName?: string }} [options]  当 echoName 非空时，仅匹配同名回响；否则匹配任意 echo
 * @returns {string}  上一节点 token 的 attrs.value / prompt；找不到返回 ''
 */
export const extractPrevEchoTokenValue = (markdown = '', currentIndex = -1, options = {}) => {
  const source = String(markdown || '')
  if (!source) return ''
  const upperBound = (typeof currentIndex === 'number' && currentIndex >= 0 && currentIndex <= source.length)
    ? currentIndex
    : source.length
  const prefix = source.slice(0, upperBound)
  if (!prefix || prefix.indexOf('@') === -1) return ''

  const onlyName = (options && options.echoName) ? String(options.echoName).trim() : ''
  let lastValue = ''
  const localRe = new RegExp(CURRENT_ECHO_PLACEHOLDER_RE.source, 'g')
  let match
  while ((match = localRe.exec(prefix)) !== null) {
    const rawEchoName = String(match[1] || '').trim()
    if (!rawEchoName) continue
    if (onlyName && rawEchoName !== onlyName) continue
    const attrsRaw = String(match[2] || '')
    const promptRaw = String(match[3] || '')
    const attrs = parseEchoAttrs(attrsRaw)
    lastValue = String(attrs.value || promptRaw || '')
  }
  return lastValue
}

// safeEvalFactory(source, prelude?) —— 把 anno_source 编译成一个工厂函数。
//   - source:  'export default {...}' 形式的 anno_source 字符串
//   - prelude: 可选顶层声明（如 helper 常量），拼接在 source 前面。
//     当前 prelude 只注入 `const $ = window.jQuery`，
//     让 handler 函数体能直接用 jQuery 操作 DOM。
//
// HANDLER_PRELUDE_SOURCE：默认注入到 anno_source 编译环境的常量源码。
//   jQuery 由应用层（Muya 编辑器 / app boot）保证 window.jQuery 存在，
//   不在此处做运行时判空，示例越简单越好。
//   handler 模板直接用 `const $ = window.jQuery` 拿到 jQuery 对象。
const HANDLER_PRELUDE_SOURCE = 'const $ = window.jQuery\n'

const safeEvalFactory = (source = '', prelude = '') => {
  const normalized = String(source || '').replace(/export\s+default/, 'return ')
  return new Function(String(prelude || '') + normalized)
}

// ============================================================================
// EchoRuntime.afterRender 派发模型（v2026-07 起统一）
// ============================================================================
// 所有 echo（含 16 个内置 + 用户自定义）通过 afterRender(node, attrs) 派发：
//   - node : { echoName, echoId, definitionId, attrsParsed, prompt, ... } token 元数据
//           （第 1 参当 jQuery 选择器使用也行：$(node) 选中 echo host）
//   - attrs: 实例的业务参数对象（= node.attrsParsed），方便 echo 定义直接用 `attrs.color` 等
// domElement / ancestors / document 由 echo 定义自己拿：
//   - domElement: jQuery(node) 或 jQuery(node).get(0)
//   - document:   闭包内 window.document 或 jQuery(node).closest('[data-block-type]').parent()
//   - ancestors:  jQuery(node).parents(...) / closest(...)
// 16 个内置 echo 的 anno_source 都以 jQuery 写 afterRender，
// handler 体内通过 `const $ = window.jQuery` 拿到 jQuery 对象（见 HANDLER_PRELUDE_SOURCE）。

const safeQueryAll = (root, selector) => {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  try {
    return Array.from(root.querySelectorAll(selector))
  } catch (error) {
    console.warn('[EchoRuntime] safeQueryAll failed:', error)
    return []
  }
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
        // 为 anno_source 注入 `const $ = window.jQuery`，让 handler 函数体
        // 能直接调用 jQuery 操作 DOM。
        const factory = safeEvalFactory(source, HANDLER_PRELUDE_SOURCE)
        if (process.env.NODE_ENV !== 'production') {
          // 调试：把实际编译产物打到 console，方便排查 "Unexpected identifier" 等 parse 错误
          try {
            console.log('[EchoRuntime.compileDefinition] >>> source begin', cacheKey)
            console.log(source)
            console.log('[EchoRuntime.compileDefinition] <<< source end', cacheKey)
          } catch (e) { /* ignore */ }
        }
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
    // 运行期兜底：如果 token 上声明了 inheritFromPrevious: true 且当前 value 为空，
    // 用 caller 传入的 token.prevValue（来自 Muya 扫描同一 markdown 中前一个 echo token）填入。
    // 这层兜底的存在是：当 caller 来不及提前把 inheritFromPrevious 写进 attrs.value，
    // 也能在 render 出口处补上继承值。
    let inheritedValue = ''
    if (token && isInheritFromPreviousEnabled(mergedAttrs) && !String(mergedAttrs.value || '').trim()) {
      inheritedValue = String(token.prevValue || '')
      if (inheritedValue) mergedAttrs.value = inheritedValue
    }
    const payloadValue = typeof payload?.attrs?.value === 'string' ? payload.attrs.value : ''
    const tokenAttrValue = typeof tokenAttrs.value === 'string' ? tokenAttrs.value : ''
    const mergedAttrValue = typeof mergedAttrs.value === 'string' ? mergedAttrs.value : ''
    const payloadPrompt = typeof payload.prompt === 'string' ? payload.prompt : payloadValue
    const tokenPrompt = typeof token.prompt === 'string' ? token.prompt : ''
    // resolvedValue 优先级：tokenAttrs.value > mergedAttrs.value (含继承值) > payload.attrs.value > token.prompt > payload.prompt
    const resolvedValue = tokenAttrValue || mergedAttrValue || payloadValue || tokenPrompt || payloadPrompt || ''
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
        // 双轨：render.length === 2 视为新模板签名 render(node, ancestors)，
        // 单参或无 length 信息视为旧 render(context)。
        const isNewShape = definition.render.length === 2
        if (isNewShape) {
          const ancestors = {
            echo: matchedEcho,
            block: token?.range && matchedEcho,
            document: typeof window !== 'undefined' ? window.document : null
          }
          result = definition.render(token, ancestors)
        } else {
          result = definition.render(context)
        }
        if (typeof definition.afterRender === 'function') {
          normalized.afterRenderHook = (domElement) => {
            try {
              const attrs = (token && token.attrsParsed && typeof token.attrsParsed === 'object')
                ? token.attrsParsed
                : {}
              definition.afterRender(domElement, attrs)
            } catch (error) {
              console.error('[EchoRuntime] afterRender hook failed:', error)
            }
          }
        }
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
    // 注释保留：调试时把下面 block 解开即可
    // if (typeof window !== 'undefined' && window.__ECHO_TRACE__ !== false) {
    //   console.log('[EchoRuntime.renderToHtml]', {
    //     echoName: token?.echoName || echo?.name || '',
    //     echoId: token?.echoId || '',
    //     matchedEchoId: echo?.id || '',
    //     kind: rendered?.attrs?.kind || '',
    //     htmlLen: (rendered?.html || '').length
    //   })
    // }

    // === 优先使用 render 自带的 HTML（优先级最高）===
    // 约定：render 自带的 HTML 根元素是 echo host（通常是 <span>）。
    // 我们在根元素上补充 echo ABI 属性，让 afterRender 派发与 [data-echo-inline="true"] 选择器都能命中。
    const renderedHtml = String(rendered.html || '').trim()
    if (renderedHtml) {
      const echoName = escapeHtml(token?.echoName || echo?.name || '')
      const echoId = escapeHtml(token?.echoId || echo?.id || '')
      const definitionId = escapeHtml(token?.attrsParsed?.definitionId || echo?.id || '')
      const value = escapeHtml(rendered.value || rendered.prompt || '')
      const injectedAttrs = [
        `data-echo-inline="true"`,
        `data-echo-name="${echoName}"`,
        `data-echo-id="${echoId}"`,
        `data-echo-definition-id="${definitionId}"`,
        `data-echo-value="${value}"`
      ].join(' ')
      return injectAttrsIntoFirstTag(renderedHtml, injectedAttrs, 'ag-echo-inline ag-echo-anno-token')
    }

    // === 默认占位渲染（render 没给 html 时）===
    const icon = escapeHtml(rendered.icon || DEFAULT_ECHO_ICON)
    const color = escapeHtml(rendered.color || DEFAULT_ECHO_COLOR)
    const title = escapeHtml(rendered.title || '回响')
    const description = escapeHtml(rendered.description || '')
    const prompt = escapeHtml(rendered.prompt || '')
    const descriptionHtml = description ? `<div class="ag-echo-inline__desc">${description}</div>` : ''
    const promptHtml = prompt ? `<div class="ag-echo-inline__prompt">${prompt}</div>` : ''

    return `<span class="ag-echo-inline ag-echo-anno-token" data-echo-inline="true" data-echo-name="${escapeHtml(token?.echoName || echo?.name || '')}" data-echo-id="${escapeHtml(token?.echoId || echo?.id || '')}" data-echo-definition-id="${escapeHtml(token?.attrsParsed?.definitionId || echo?.id || '')}" data-echo-value="${escapeHtml(rendered.value || rendered.prompt || '')}" style="--echo-color:${color}"><span class="ag-echo-inline__badge"><i class="material-icons ag-echo-inline__icon">${icon}</i><span class="ag-echo-inline__title">${title}</span></span><span class="ag-echo-inline__body">${descriptionHtml}${promptHtml}</span></span>`
  }

  // 渲染完成后的副作用入口。
  //   container     —— 编辑器渲染容器的根 DOM
  //   options.cleanupFirst —— 编辑器重建时先卸载上一次 handler
  afterRender (container, options = {}) {
    if (!container || typeof container.querySelectorAll !== 'function') return []

    // 每次调用先清除上一次的 debounce 定时器，避免累积
    if (this._afterRenderTimer) {
      clearTimeout(this._afterRenderTimer)
      this._afterRenderTimer = null
    }

    this._afterRenderTimer = setTimeout(() => {
      this._doAfterRender(container, options)
    }, 250)
  }

  _doAfterRender (container, options = {}) {
    const cleanupFirst = Boolean(options.cleanupFirst)
    if (cleanupFirst) {
      this.disposeAll(container)
    }

    const echoNodes = safeQueryAll(container, '[data-echo-inline="true"]')
    const installed = []

    //   对每个 echo host 调一次；hook 可访问 domElement 与 neighbors。
    echoNodes.forEach(node => {
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
        const fakeToken = {
          echoName,
          echoId,
          definitionId,
          attrsParsed: this._readEchoAttrs(node),
          prompt: node.getAttribute('data-echo-value') || ''
        }
        const attrs = fakeToken.attrsParsed || {}
        cleanup = definition.afterRender(fakeToken, attrs) || null
      } catch (error) {
        console.error('[EchoRuntime] afterRender hook failed:', echoName, error)
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
      try {
        item.cleanup(item.node)
      } catch (error) {
        console.warn('[EchoRuntime] dispose cleanup failed:', item.id, error)
      }
      if (item.node) delete item.node.__agEchoCleanup
    }
  }

  // === _readEchoAttrs：从 <span data-echo-attrs> 读 echo 实例参数（id/value/业务字段等） ===
  _readEchoAttrs (node) {
    const card = node.querySelector('[data-echo-attrs]') || node
    if (!card) return {}
    try {
      const raw = card.getAttribute('data-echo-attrs')
      if (raw) return JSON.parse(raw)
    } catch (error) { /* ignore */ }
    // 再回退：直接从当前 echo host（node 自身）读 data-echo-attrs-json，
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
      if (attr.name.startsWith('data-echo-attr-')) {
        const key = attr.name.replace(/^data-echo-attr-/, '')
        try {
          result[key] = JSON.parse(attr.value)
        } catch (error) {
          result[key] = attr.value
        }
      }
    })
    // 兜底：把 host 上数据集中可能写着的 attrs.* 关键字段（kind/id/scope/...）
    // 也一并合并进来，让运行时 handler 可以无依赖使用。
    try {
      const host = (typeof node.closest === 'function')
        ? node.closest('[data-echo-node-id]')
        : null
      if (host && host.dataset) {
        for (const key of Object.keys(host.dataset)) {
          if (Object.prototype.hasOwnProperty.call(result, key)) continue
          if (['echoName', 'echoId', 'echoDefinitionId', 'echoNodeId', 'echoValue'].includes(key)) continue
          if (!['kind', 'id', 'scope', 'trigger', 'target', 'theme', 'layout', 'density', 'mode', 'targets', 'placeholder', 'source', 'label', 'action', 'model'].includes(key)) continue
          result[key] = host.dataset[key]
        }
      }
    } catch (error) { /* ignore */ }
    return result
  }
}
