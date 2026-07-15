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
  // 直接用 jQuery 操作节点，简洁明了。
  afterRender (node, domElement, ancestors) {
    $(domElement).addClass('ag-echo-default-mounted')
  }
}`

// ============================================================================
// KIND 别名表（v2026-07-15 重命名）
//
// 重命名历史：
//   'rune'        → 'echo-chant'      影响附近元素的 echo（咏唱派发）
//   'rune-tbd'    → 'echo-tbd'        兜底 echo（占位）
//
// 同时迁移的名字：
//   RUNE_HANDLERS        → ECHO_CHANT_HANDLERS
//   RUNE_KINDS           → ECHO_CHANT_KINDS
//   customHandlers       → echoChantHandlers
//   findRuneHandler      → findEchoChantHandler
//   registerRuneHandler  → registerEchoChantHandler
//   unregisterRuneHandler→ unregisterEchoChantHandler
//   listCustomRuneHandlers→ listCustomEchoChantHandlers
//   resolveRuneHandler   → resolveEchoChantHandler
//   extractRuneMeta      → extractEchoChantMeta
//   runeMeta             → echoChantMeta
//   _readRuneAttrs       → _readChantAttrs（method 名）
//
// DOM ABI（保留不改名）：
//   data-rune-id / data-rune-kind / data-rune-attrs / data-rune-attr-*
//   —— 已写入 markdown 源 ABI 中，迁移会破坏既有笔记。
//
// CSS class 名（保留不改名）：
//   ag-rune-*（避免触发视觉回归，仅在注释中写明：ag-rune-* 是 echo 体系的"咏唱样式"）
// ============================================================================
export const KIND_ALIASES = Object.freeze({
  'echo-chant': 'echo-chant',
  'echo-tbd': 'echo-tbd',
  rune: 'echo-chant',
  'rune-tbd': 'echo-tbd'
})

export const normalizeKindAlias = (raw = '') => KIND_ALIASES[String(raw || '').trim()] || ''

// 默认的 echo-chant（"咏唱派发 / 影响附近元素"）模板。
// 关键点：
//  - kind: 'echo-chant'，render() 仍然返回标准的 { type, icon, color, title, ... }
//  - handler(chantNode, scopeContainer, meta) 是副作用钩子，编译时被自动注册到 EchoRuntime.echoChantHandlers
//    meta = { runeId, kind, attrs }，kind 已经过 normalizeKindAlias 转译
export const createDefaultChantAnnoSource = (echoName = '回响') => `export default {
  kind: 'echo-chant',
  version: 1,
  name: '${String(echoName || '回响').replace(/'/g, "\\'")}',
  runeId: 'my-chant',

  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'auto_awesome',
      color: attrs.color || context.echo?.color || '${DEFAULT_ECHO_COLOR}',
      title: attrs.title || context.echo?.name || '${String(echoName || '回响').replace(/'/g, "\\'")}',
      description: attrs.desc || context.echo?.desc || '影响附近元素或排版',
      prompt,
      attrs: { ...attrs, kind: 'echo-chant', runeId: this.runeId },
      html: ''
    }
  },

  // 副作用钩子 —— 在容器 paint 完成时由 EchoRuntime.afterRender() 调用
  //   chantNode      当前 echo 对应的 <span data-rune-id="...">
  //   container     编辑器根 DOM 容器
  //   meta          { runeId, kind, attrs }，attrs 已经聚合自 data-echo-attrs-json / data-rune-attrs / dataset
  // 返回值可选：返回 cleanup 函数，将在编辑器下次重渲染/卸载时被调用
  // 直接用 jQuery 写，简洁明了。
  handler (chantNode, container, meta) {
    const $chant = $(chantNode)
    const $target = $chant.closest('[data-block-type], .mu-block, p, pre, h1, h2, h3, h4, h5, h6, li, blockquote').parent()
    const target = $target.length ? $target.get(0) : container
    if (!target) return () => {}
    const $targetEl = $(target)
    const previous = $targetEl.attr('data-my-chant-active') || null
    $targetEl.attr('data-my-chant-active', 'true').css('outline', '1px dashed #9C27B0')
    return () => {
      if (previous === null) $targetEl.removeAttr('data-my-chant-active')
      else $targetEl.attr('data-my-chant-active', previous)
      $targetEl.css('outline', '')
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
  // 用一个与文件顶部 CURRENT_ECHO_PLACEHOLDER_RE 等价的本地正则（不可跨文件复用变量，
  // 否则拿到的是 defined 时的旧引用），逐 match 取最后一个值
  const localRe = /@([^\s{}()@]*)\{([\s\S]*?)\}\(([^)]*)\)/g
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

/**
 * 应用上一节点 value 继承：attrs.inheritFromPrevious === true 且当前 value 空 → 用 prevValue 填充。
 * 返回新的 attrs 对象（不修改入参）。值变化时 `inherited === true`。
 */
export const applyInheritedEchoValue = (attrs = {}, prevValue = '') => {
  const source = (attrs && typeof attrs === 'object') ? attrs : {}
  if (!isInheritFromPreviousEnabled(source)) return { attrs: source, inherited: false }
  const currentValue = typeof source.value === 'string' ? source.value : ''
  if (currentValue.trim()) return { attrs: source, inherited: false }
  const filled = String(prevValue || '')
  if (!filled) return { attrs: source, inherited: false }
  return { attrs: { ...source, value: filled }, inherited: true }
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

// safeEvalFactory(source, prelude?) —— 把 anno_source 编译成一个工厂函数。
//   - source:  'export default {...}' 形式的 anno_source 字符串
//   - prelude: 可选顶层声明（如 helper 常量），拼接在 source 前面。
//     这样 anno_source 的 handlerExample 函数体可直接引用 prelude 中
//     定义的 __resolveScopeContainer / __safeQueryAll / __withAttrs。
//
// HANDLER_PRELUDE_SOURCE：默认注入到 anno_source 编译环境的 helper 常量源码。
//   所有 builtinEchoes.js 提供的 handlerExample 模板都依赖这三个 helper。
//   用户自定义 rune 的 handlerExample 函数体也可直接使用。
//
//   2026-07 jQuery 化改造：在 prelude 顶部加
//     const $ = window.jQuery || window.$
//   + __resolveScopeContainer / __safeQueryAll / __withAttrs 一并保持 jQuery 语义
//     （__safeQueryAll 返回 jQuery 实例，__resolveScopeContainer 返回原生 DOM 以
//      兼容部分 .style / .dataset 直接读写的场景）。
const HANDLER_PRELUDE_SOURCE = [
  "const __safeDollarRuntime = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null",
  "if (!__safeDollarRuntime) console.warn('[EchoRuntime] jQuery is missing on window; rune handlers will fall back to no-op')",
  "const $ = __safeDollarRuntime",
  "const __resolveScopeContainer = (node, scope) => {",
  "  if (!node || typeof node.closest !== 'function') return null",
  "  const $node = $(node)",
  "  const block = $node.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').get(0) || node.parentElement",
  "  const documentRoot = $node.closest('[data-echo-document], .mu-editor, article, [data-doc-id]').get(0) || document.body",
  "  switch (String(scope || 'siblings').toLowerCase()) {",
  "    case 'prev-block': {",
  "      let prev = block && block.previousElementSibling",
  "      while (prev && !prev.firstElementChild && (prev.textContent || '').trim() === '') {",
  "        prev = prev.previousElementSibling",
  "      }",
  "      return prev || block",
  "    }",
  "    case 'block':      return block",
  "    case 'document':   return documentRoot",
  "    case 'siblings':",
  "    default:           return block && block.parentElement ? block.parentElement : documentRoot",
  "  }",
  "}",
  "const __safeQueryAll = (root, sel) => {",
  "  if (!root || typeof root.querySelectorAll !== 'function') return $([])",
  "  try { return $(root).find(sel) } catch (error) { return $([]) }",
  "}",
  "const __withAttrs = (meta, defaults) => Object.assign({}, defaults || {}, (meta && meta.attrs) || {})",
  ""
].join('\n')

const safeEvalFactory = (source = '', prelude = '') => {
  const normalized = String(source || '').replace(/export\s+default/, 'return ')
  return new Function(String(prelude || '') + normalized)
}

// ============================================================================
// 多符文运行时（EchoRuntime + echo-chant handlers）
// ============================================================================
// 渲染管线：
//   1. parseEchoAttrs / decodeEchoPayload 解析 token
//   2. definition.render() 拿到标准化结果（包含 attrs.kind / attrs.runeId）
//   3. EchoRuntime.render() 在 kind === 'echo-chant' | 'echo-tbd'（旧 'rune' | 'rune-tbd'）
//      时挂 echoChantMeta（旧 runeMeta 双轨同步保留）
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

const ECHO_CHANT_KINDS = new Set(['echo-chant', 'echo-tbd'])
// 历史 ABI 兼容说明：
//   旧 'rune' / 'rune-tbd' 通过 normalizeKindAlias() 一次性映射成新名，
//   本文件不再单独维护 Set 兼容表，统一归口到 KIND_ALIASES。
const isChantKind = (kind = '') => {
  const normalized = normalizeKindAlias(kind)
  return normalized === 'echo-chant' || normalized === 'echo-tbd'
}

const safeQueryAll = (root, selector) => {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  try {
    return Array.from(root.querySelectorAll(selector))
  } catch (error) {
    console.warn('[EchoRuntime] safeQueryAll failed:', error)
    return []
  }
}

const resolveScopeContainer = (chantNode, scope = 'siblings') => {
  if (!chantNode) return null
  const block = chantNode.closest('[data-block-type], .mu-block, p, pre, h1, h2, h3, h4, h5, h6, li, blockquote, table, ul, ol') || chantNode.parentElement
  const documentRoot = chantNode.closest('[data-echo-document], .mu-editor, article, [data-doc-id]') || document.body

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
  apply (chantNode, _scopeContainer, meta) {
    const scope = (meta && meta.attrs && meta.attrs.scope) || 'siblings'
    const container = resolveScopeContainer(chantNode, scope)
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
    addClassOnce(chantNode, 'ag-rune-growth-active')
    return () => {
      targets.forEach(node => removeClasses(node, 'ag-rune-growth-target'))
      removeClasses(chantNode, 'ag-rune-growth-active')
    }
  }
}

const shatterHandler = {
  id: 'shatter',
  match (meta) { return meta && meta.runeId === 'shatter' },
  apply (chantNode, _scopeContainer, meta) {
    const target = (meta && meta.attrs && meta.attrs.target) || 'line'
    const container = resolveScopeContainer(chantNode, target === 'block' ? 'block' : 'siblings')
    if (!container) return () => {}
    const echoNodes = safeQueryAll(container, '[data-echo-inline="true"]')
    echoNodes.forEach(node => {
      if (node === chantNode) return
      node.setAttribute('data-shatter-disabled', 'true')
      node.classList.add('ag-rune-shatter-disabled')
    })
    addClassOnce(chantNode, 'ag-rune-shatter-active')
    return () => {
      echoNodes.forEach(node => {
        if (node === chantNode) return
        node.removeAttribute('data-shatter-disabled')
        removeClasses(node, 'ag-rune-shatter-disabled')
      })
      removeClasses(chantNode, 'ag-rune-shatter-active')
    }
  }
}

const skywalkHandler = {
  id: 'skywalk',
  match (meta) { return meta && meta.runeId === 'skywalk' },
  apply (chantNode, _scopeContainer, meta) {
    const theme = (meta && meta.attrs && meta.attrs.theme) || 'auto'
    const layout = (meta && meta.attrs && meta.attrs.layout) || 'enhanced'
    const container = resolveScopeContainer(chantNode, 'document')
    if (!container) return () => {}
    const previous = {
      theme: container.getAttribute('data-skywalk-theme'),
      layout: container.getAttribute('data-skywalk-layout')
    }
    container.setAttribute('data-skywalk-theme', theme)
    container.setAttribute('data-skywalk-layout', layout)
    addClassOnce(chantNode, 'ag-rune-skywalk-active')
    return () => {
      if (previous.theme === null) container.removeAttribute('data-skywalk-theme')
      else container.setAttribute('data-skywalk-theme', previous.theme)
      if (previous.layout === null) container.removeAttribute('data-skywalk-layout')
      else container.setAttribute('data-skywalk-layout', previous.layout)
      removeClasses(chantNode, 'ag-rune-skywalk-active')
    }
  }
}

const twinbloomHandler = {
  id: 'twinbloom',
  match (meta) { return meta && meta.runeId === 'twinbloom' },
  apply (chantNode, _scopeContainer, meta) {
    const placeholder = (meta && meta.attrs && meta.attrs.placeholder) || '双生节点'
    const block = chantNode.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote') || chantNode.parentElement
    if (!block) return () => {}
    const previous = block.nextElementSibling
    if (previous && previous.getAttribute('data-twinbloom-of') === chantNode.getAttribute('data-rune-id')) {
      return () => {}
    }
    const cloned = block.cloneNode(true)
    cloned.setAttribute('data-twinbloom-of', chantNode.getAttribute('data-rune-id') || 'twinbloom')
    cloned.classList.add('ag-rune-twinbloom-clone')
    cloned.setAttribute('data-twinbloom-placeholder', placeholder)
    const originalText = (cloned.textContent || '').trim()
    if (!originalText) {
      cloned.textContent = placeholder
    }
    if (block.parentElement) {
      block.parentElement.insertBefore(cloned, block.nextSibling)
    }
    addClassOnce(chantNode, 'ag-rune-twinbloom-active')
    return () => {
      if (cloned.parentElement) cloned.parentElement.removeChild(cloned)
      removeClasses(chantNode, 'ag-rune-twinbloom-active')
    }
  }
}

const mindstealHandler = {
  id: 'mindsteal',
  match (meta) { return meta && meta.runeId === 'mindsteal' },
  apply (chantNode, _scopeContainer, meta) {
    const mode = (meta && meta.attrs && meta.attrs.mode) || 'override'
    const container = resolveScopeContainer(chantNode, 'siblings')
    if (!container) return () => {}
    const runeTargets = safeQueryAll(container, '[data-rune-id]')
    runeTargets.forEach(node => {
      if (node === chantNode) return
      node.setAttribute('data-mindsteal-mode', mode)
      node.style.setProperty('animation', 'none', 'important')
    })
    addClassOnce(chantNode, 'ag-rune-mindsteal-active')
    return () => {
      runeTargets.forEach(node => {
        if (node === chantNode) return
        node.removeAttribute('data-mindsteal-mode')
        node.style.removeProperty('animation')
      })
      removeClasses(chantNode, 'ag-rune-mindsteal-active')
    }
  }
}

const luckyHandler = {
  id: 'lucky',
  match (meta) { return meta && meta.runeId === 'lucky' },
  apply (chantNode, _scopeContainer, meta) {
    addClassOnce(chantNode, 'ag-rune-lucky-active')
    chantNode.style.cursor = 'pointer'
    chantNode.setAttribute('role', 'button')
    chantNode.setAttribute('tabindex', '0')
    chantNode.setAttribute('title', (meta && meta.attrs && meta.attrs.label) || '点击触发 AI 校对')

    const trigger = async (event) => {
      event.preventDefault()
      event.stopPropagation()
      chantNode.classList.add('ag-rune-lucky-loading')
      try {
        const handler = (typeof window !== 'undefined') ? window.__memocastRuneHandlers?.lucky : null
        if (typeof handler === 'function') {
          await handler({ chantNode, meta })
        } else {
          console.info('[EchoRuntime] lucky: no global handler registered (window.__memocastRuneHandlers.lucky)')
        }
      } catch (error) {
        console.error('[EchoRuntime] lucky handler failed:', error)
      } finally {
        chantNode.classList.remove('ag-rune-lucky-loading')
      }
    }

    const onClick = (event) => { trigger(event) }
    const onKey = (event) => {
      if (event.key === 'Enter' || event.key === ' ') trigger(event)
    }
    chantNode.addEventListener('click', onClick)
    chantNode.addEventListener('keydown', onKey)

    return () => {
      chantNode.removeEventListener('click', onClick)
      chantNode.removeEventListener('keydown', onKey)
      removeClasses(chantNode, 'ag-rune-lucky-active ag-rune-lucky-loading')
      chantNode.style.cursor = ''
      chantNode.removeAttribute('role')
      chantNode.removeAttribute('tabindex')
      chantNode.removeAttribute('title')
    }
  }
}

const disperseHandler = {
  id: 'disperse',
  match (meta) { return meta && meta.runeId === 'disperse' },
  apply (chantNode, _scopeContainer, meta) {
    const density = (meta && meta.attrs && meta.attrs.density) || 'loose'
    const container = resolveScopeContainer(chantNode, 'block')
    if (!container) return () => {}
    const previous = container.getAttribute('data-disperse-density')
    container.setAttribute('data-disperse-density', density)
    addClassOnce(chantNode, 'ag-rune-disperse-active')
    return () => {
      if (previous === null) container.removeAttribute('data-disperse-density')
      else container.setAttribute('data-disperse-density', previous)
      removeClasses(chantNode, 'ag-rune-disperse-active')
    }
  }
}

const tbdHandler = {
  id: '__echo_chant_tbd__',
  match (meta) { return normalizeKindAlias(meta && meta.kind) === 'echo-tbd' },
  apply (chantNode, _scopeContainer, _meta) {
    addClassOnce(chantNode, 'ag-rune-tbd-active')
    return () => removeClasses(chantNode, 'ag-rune-tbd-active')
  }
}

export const ECHO_CHANT_HANDLERS = [
  growthHandler,
  shatterHandler,
  skywalkHandler,
  twinbloomHandler,
  mindstealHandler,
  luckyHandler,
  disperseHandler,
  tbdHandler
]

export const findEchoChantHandler = (chantId = '') => {
  const target = String(chantId || '').trim()
  return ECHO_CHANT_HANDLERS.find(handler => handler.id === target) || null
}

// 兼容旧导出名（外部若直接 import {RUNE_HANDLERS, findRuneHandler}）
export const RUNE_HANDLERS = ECHO_CHANT_HANDLERS
export const findRuneHandler = findEchoChantHandler

// 让运行时能挂载"由 echo anno_source 内置 handler 字段动态声明"的 rune handler
// - id 必须唯一（建议用 `echo:${definitionId}` 或自定义 runeId）
// - match(runeMeta) -> boolean，决定该 handler 是否对该 rune 起作用
// - apply(chantNode, scopeContainer, runeMeta) -> cleanupFn? 与内置 handler 同样语义
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

export const extractEchoChantMeta = (rendered = {}) => {
  const attrs = (rendered && rendered.attrs && typeof rendered.attrs === 'object') ? rendered.attrs : {}
  const rawKind = String(attrs.kind || '').trim()
  const kind = normalizeKindAlias(rawKind)
  if (!kind) return null
  return {
    runeId: String(attrs.runeId || '').trim(),
    kind,
    attrs: { ...attrs, kind },
    title: rendered.title || '',
    description: rendered.description || ''
  }
}

// 兼容旧导出名
export const extractRuneMeta = extractEchoChantMeta

export default class EchoRuntime {
  constructor ({ registry } = {}) {
    this.registry = registry
    this.definitionCache = new Map()
    // 用户/动态注册 echo-chant handler，id -> { id, match, apply, cleanup, ... }
    this.echoChantHandlers = new Map()
    // 同步旧字段，供老 import 链读
    this.customHandlers = this.echoChantHandlers
  }

  invalidate (echoId) {
    if (!echoId) {
      this.definitionCache.clear()
      return
    }
    this.definitionCache.delete(String(echoId))
  }

  /**
   * 动态注册一个 echo-chant handler。
   *  - raw 可以是已规整的 { id, match, apply } 或 anno_source 里的 handler 字段。
   *  - 注册后，afterRender() 派发时会优先命中 echoChant handler；找不到再退到 ECHO_CHANT_HANDLERS。
   *  - 同一 id 重复 register 会覆盖。
   *  - 返回注册的 id，失败返回空串。
   */
  registerEchoChantHandler (raw = {}, fallbackId = '') {
    const normalized = normalizeCustomHandler(raw, fallbackId)
    if (!normalized) {
      console.warn('[EchoRuntime] registerEchoChantHandler: invalid handler', raw)
      return ''
    }
    this.echoChantHandlers.set(normalized.id, normalized)
    return normalized.id
  }

  unregisterEchoChantHandler (id = '') {
    const target = String(id || '').trim()
    if (!target) return false
    return this.echoChantHandlers.delete(target)
  }

  listCustomEchoChantHandlers () {
    return Array.from(this.echoChantHandlers.values())
  }

  // 兼容旧方法名
  registerRuneHandler (raw = {}, fallbackId = '') { return this.registerEchoChantHandler(raw, fallbackId) }
  unregisterRuneHandler (id = '') { return this.unregisterEchoChantHandler(id) }
  listCustomRuneHandlers () { return this.listCustomEchoChantHandlers() }

  /**
   * 查找 handler（custom 优先于内置）。
   * 提供给内部 afterRender() 使用，外部也可直接调用。
   */
  resolveEchoChantHandler (runeMeta = {}) {
    const id = String(runeMeta?.runeId || '').trim()
    const kind = normalizeKindAlias(runeMeta?.kind) || 'echo-chant'
    // 1) 自定义 handler（精确按 id）
    if (id && this.echoChantHandlers.has(id)) {
      return this.echoChantHandlers.get(id)
    }
    // 2) 自定义 handler（按 match 探测）
    for (const handler of this.echoChantHandlers.values()) {
      try {
        if (typeof handler.match === 'function' && handler.match(runeMeta)) {
          return handler
        }
      } catch (error) {
        console.warn('[EchoRuntime] echoChant handler.match failed:', handler.id, error)
      }
    }
    // 3) 内置 echo-chant handler
    const builtIn = findEchoChantHandler(id)
    if (builtIn) return builtIn
    // 4) echo-tbd 兜底（兼容旧 'rune-tbd' 也已经过 normalizeKindAlias 转译）
    if (kind === 'echo-tbd') return findEchoChantHandler('__echo_chant_tbd__')
    return null
  }

  // 兼容旧方法名
  resolveRuneHandler (runeMeta = {}) { return this.resolveEchoChantHandler(runeMeta) }

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
        // 为 anno_source 注入共享 helper 常量，让 handlerExample 函数体
        // 能直接调用 __resolveScopeContainer / __safeQueryAll / __withAttrs。
        const factory = safeEvalFactory(source, HANDLER_PRELUDE_SOURCE)
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

    // === 自动从 handlerExample 提升为 handler ===
    // 约定：内置 rune 的 anno_source 只写 handlerExample（演示槽），
    // 运行时 compileDefinition 在缺省 handler 时**自动复制**一份给 handler。
    // 模仿者如果想禁用此行为，显式声明 `handler: null` 即可。
    if (!definition.handler && definition.handlerExample) {
      definition.handler = definition.handlerExample
    }

    // === 自动注册 anno_source 内置的 echo-chant handler ===
    // 约定：definition.handler = function (chantNode, scopeContainer, runeMeta) { ... }
    // （函数参数名历史 ABI 仍用 'runeNode' / 'runeMeta'，本注释用新名字解释）
    // 同时 definition.kind === 'echo-chant' | 'echo-tbd'（旧 'rune' | 'rune-tbd'）且
    // definition.runeId / definition.id 已声明。
    try {
      const rawKind = String(definition.kind || definition?.attrs?.kind || '').trim()
      const kind = normalizeKindAlias(rawKind)
      if (kind === 'echo-chant' || kind === 'echo-tbd') {
        const handlerSpec = definition.handler || definition
        const fallbackId = String(definition.runeId || definition.id || cacheKey || '').trim()
        if (typeof handlerSpec?.apply === 'function' || typeof handlerSpec === 'function' || typeof handlerSpec?.match === 'function') {
          const normalized = normalizeCustomHandler({
            ...(typeof handlerSpec === 'object' ? handlerSpec : {}),
            // 函数形式：apply(chantNode, container, meta)
            apply: (typeof handlerSpec === 'function')
              ? handlerSpec
              : (typeof handlerSpec?.apply === 'function' ? handlerSpec.apply : undefined),
            id: String(definition.runeId || definition.id || fallbackId || '').trim(),
            source: `definition:${cacheKey}`
          }, fallbackId)
          if (normalized) {
            this.echoChantHandlers.set(normalized.id, normalized)
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
              const ancestors = {
                echo: matchedEcho,
                block: token?.range && matchedEcho,
                document: typeof window !== 'undefined' ? window.document : null
              }
              definition.afterRender(token, domElement, ancestors)
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

    const echoChantMeta = extractEchoChantMeta(normalized)
    if (echoChantMeta) {
      // 双轨：旧字段 normalized.runeMeta 仍同步一份，供外部老 import 链读
      normalized.echoChantMeta = echoChantMeta
      normalized.runeMeta = echoChantMeta
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

    // DOM 属性 ABI：data-rune-id / data-rune-kind —— 不改名（写进 markdown 源 ABI）
    const echoChantAttr = rendered.echoChantMeta || rendered.runeMeta
      ? ` data-rune-id="${escapeHtml((rendered.echoChantMeta || rendered.runeMeta)?.runeId || 'unknown')}" data-rune-kind="${escapeHtml((rendered.echoChantMeta || rendered.runeMeta)?.kind || 'echo-chant')}"`
      : ''

    return `<span class="ag-echo-inline" data-echo-inline="true" data-echo-name="${escapeHtml(token?.echoName || echo?.name || '')}" data-echo-id="${escapeHtml(token?.echoId || echo?.id || '')}" data-echo-definition-id="${escapeHtml(token?.attrsParsed?.definitionId || echo?.id || '')}" data-echo-value="${escapeHtml(rendered.value || rendered.prompt || '')}"${echoChantAttr} style="--echo-color:${color}"><span class="ag-echo-inline__badge"><i class="material-icons ag-echo-inline__icon">${icon}</i><span class="ag-echo-inline__title">${title}</span></span><span class="ag-echo-inline__body">${descriptionHtml}${promptHtml}${customHtml}</span></span>`
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

    const echoNodes = safeQueryAll(container, '[data-echo-inline="true"]')
    const installed = []

    //   对每个 echo host 调一次（无论是否有 runeId）；hook 可访问 domElement 与 neighbors。
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
          attrsParsed: this._readChantAttrs(node),
          prompt: node.getAttribute('data-echo-value') || ''
        }
        const ancestors = { echo: matchedEcho, document: container }
        cleanup = definition.afterRender(fakeToken, node, ancestors) || null
      } catch (error) {
        console.error('[EchoRuntime] afterRender hook failed:', echoName, error)
      }
      if (typeof cleanup === 'function') {
        installed.push({ node, runeId: `__afterRender_${echoName}_${echoId}`, cleanup })
        node.__agEchoCleanup = cleanup
      }
    })

    const chantNodes = safeQueryAll(container, '[data-rune-id]')
    chantNodes.forEach(node => {
      const runeId = node.getAttribute('data-rune-id') || ''
      const meta = {
        runeId,
        // DOM 里的 data-rune-kind 仍是 ABI，旧值 'rune' / 'rune-tbd' 在 normalizeKindAlias 转译
        kind: node.getAttribute('data-rune-kind') || 'echo-chant',
        attrs: this._readChantAttrs(node)
      }
      const handler = this.resolveEchoChantHandler(meta)
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

  // === _readChantAttrs：从 <span data-rune-attrs> 读 echo 实例参数（kind/scope/density 等） ===
  // DOM 属性名 [data-rune-attrs] 是 markdown 源 ABI，所以读它没错；
  // 方法名与 'rune' 解耦成 _readChantAttrs 以统一口径。
  _readChantAttrs (node) {
    const card = node.querySelector('[data-rune-attrs]') || node
    if (!card) return {}
    try {
      const raw = card.getAttribute('data-rune-attrs')
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

  // 兼容旧方法名（_readRuneAttrs）—— 外部可能直接调 EchoRuntime 实例的 _readRuneAttrs
  _readRuneAttrs (node) { return this._readChantAttrs(node) }
}
