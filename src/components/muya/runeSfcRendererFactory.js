// ============================================================================
// src/components/muya/runeSfcRendererFactory.js
//
// 把 Muya.vue 里的 createRuneRendererCtor + 缓存层抽出成独立工廠。
// 目的：
//   1) 让 RunePreviewRenderer 的缓存 / in-flight 去重逻辑可单测
//   2) 让其它需要 rune SFC 实时编译的弹框（如 RuneFormDialog）复用同一份
//   3) 让 Muya.vue 自身只承担「Vue 组件渲染」，不堆业务逻辑
//
// === 契约 ===
//   - 输入：rune 对象 { id, name, template }
//   - 输出：Vue.extend 后的组件构造器（同步）| null（无 template / 编译失败 throw）
//   - 缓存策略：按 `${rune.id || rune.name || 'default'}:${template}` 作 cacheKey
//       - 同 key 命中缓存：直接返回
//       - 同 key in-flight：共享 promise
//       - 编译失败：清缓存，下次重试
//
// === 导出 ===
//   - createRuneRendererCtor: 主工厂
//   - normalizeRuneSfc: normalize 入口（仅在测试里使用，主项目通过 createRuneRendererCtor 调用）
//   - clearCaches: 测试 hook，清空两个 Map
// ============================================================================

import Vue from 'vue'
import { parseVueSfc } from 'src/ApiInvoker'

const runeRendererCtorCache = new Map()
const runeRendererCtorInflight = new Map()

export const normalizeRuneSfc = async (template = '', options = {}) => {
  const source = String(template || '').trim()
  if (!source) {
    return {
      templateCode: '',
      script: 'export default {}',
      style: '',
      hasTemplate: false
    }
  }

  const parsed = await parseVueSfc(source, {
    filename: options.filename || 'rune.vue',
    scopeId: options.scopeId
  })
  if (parsed && parsed.error) {
    const error = new Error(parsed.error.message || 'Vue SFC parse failed')
    error.code = parsed.error.code
    throw error
  }

  return {
    templateCode: parsed.template || '',
    script: parsed.script && parsed.script.content ? parsed.script.content : 'export default {}',
    style: parsed.style || '',
    hasTemplate: !!parsed.template
  }
}

const evalRuneScript = (scriptContent = '') => {
  const sanitized = scriptContent.replace(/export\s+default/, 'return ')
  const factory = new Function(sanitized)
  const result = factory()
  return result && typeof result === 'object' ? result : {}
}

const evalRuneTemplate = (templateCode = '') => {
  const factory = new Function(`${templateCode}\nreturn { render, staticRenderFns }`)
  return factory()
}

const ensureRuneStyle = (styleId, cssText) => {
  if (!styleId || typeof document === 'undefined') return
  let styleEl = document.getElementById(styleId)
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = styleId
    document.head.appendChild(styleEl)
  }
  if (styleEl.textContent !== cssText) {
    styleEl.textContent = cssText
  }
}

export const createRuneRendererCtor = async (rune = {}) => {
  if (!rune) return null
  const templateSource = String(rune.template || '')
  const cacheKey = `${rune.id || rune.name || 'default'}:${templateSource}`
  if (runeRendererCtorCache.has(cacheKey)) {
    return runeRendererCtorCache.get(cacheKey)
  }
  if (runeRendererCtorInflight.has(cacheKey)) {
    return runeRendererCtorInflight.get(cacheKey)
  }

  const rendererPromise = (async () => {
    const scopeId = `v-rune-${String(rune.id || 'default').replace(/[^a-zA-Z0-9_-]/g, '-')}`
    const { templateCode, script, style, hasTemplate } = await normalizeRuneSfc(templateSource, {
      filename: `rune-${rune.id || 'default'}.vue`,
      scopeId
    })
    if (!hasTemplate) return null

    const componentOptions = evalRuneScript(script)
    const compiled = evalRuneTemplate(templateCode)
    const baseData = typeof componentOptions.data === 'function' ? componentOptions.data : () => ({})
    const declaredPropNames = Array.isArray(componentOptions.props)
      ? componentOptions.props
        .map(propName => String(propName || '').trim())
        .filter(Boolean)
      : (componentOptions.props && typeof componentOptions.props === 'object'
        ? Object.keys(componentOptions.props)
        : [])

    ensureRuneStyle(`rune-style-${rune.id || 'default'}`, style)

    return Vue.extend({
      ...componentOptions,
      name: componentOptions.name || 'RunePreviewRenderer',
      props: {
        ...(Array.isArray(componentOptions.props)
          ? declaredPropNames.reduce((props, propName) => {
            props[propName] = null
            return props
          }, {})
          : (componentOptions.props && typeof componentOptions.props === 'object'
            ? componentOptions.props
            : {})),
        ...(declaredPropNames.includes('runeId') ? {} : {
          runeId: {
            type: String,
            default: ''
          }
        }),
        ...(declaredPropNames.includes('nodeId') ? {} : {
          nodeId: {
            type: String,
            default: ''
          }
        }),
        ...(declaredPropNames.includes('rune') ? {} : {
          rune: {
            type: Object,
            default: null
          }
        }),
        ...(declaredPropNames.includes('value') ? {} : {
          value: {
            type: String,
            default: ''
          }
        })
      },
      data () {
        return {
          ...baseData.call(this)
        }
      },
      render (h) {
        const vnode = compiled.render.call(this, h)
        if (vnode && typeof vnode === 'object') {
          const existingChildren = Array.isArray(vnode.children) ? vnode.children : []
          if (!existingChildren.length) {
            vnode.children = [String(this.value == null ? '' : this.value)]
          }
        }
        return vnode
      },
      staticRenderFns: compiled.staticRenderFns,
      _scopeId: scopeId
    })
  })()

  runeRendererCtorInflight.set(cacheKey, rendererPromise)
  try {
    const ctor = await rendererPromise
    runeRendererCtorCache.set(cacheKey, ctor)
    return ctor
  } catch (error) {
    runeRendererCtorCache.delete(cacheKey)
    throw error
  } finally {
    runeRendererCtorInflight.delete(cacheKey)
  }
}

export function clearCaches () {
  runeRendererCtorCache.clear()
  runeRendererCtorInflight.clear()
}

export default {
  createRuneRendererCtor,
  normalizeRuneSfc,
  clearCaches
}
