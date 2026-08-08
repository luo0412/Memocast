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
import * as VueTemplateCompiler from 'vue-template-compiler'

// 注：符文 SFC 编译在渲染进程内同步执行（不绕 IPC）。微应用（genericMicroAppIpcBridge.js）
// 仍然走主进程的 `parseVueSfc` IPC 通道，那条链路不要动，作用域不重叠。
//
// 历史背景：Muya.vue 在 v2026-07 之前用 `vue-template-compiler.parseComponent`
//   + `compileToFunctions` 编译 rune SFC；v2026-08-05 commit 3636c01 改成了
//   `@vue/compiler-sfc` 经 IPC 调用，结果需要补一堆可选模板引擎依赖（pug/haml/
//   stylus 等），dev 编译挂掉。这里恢复老编译器，是直接复用 Vue 主版本（2.7.16）
//   配对的 vue-template-compiler，行为与原 Muya 完全一致。

const runeRendererCtorCache = new Map()
const runeRendererCtorInflight = new Map()

export const normalizeRuneSfc = (template = '', options = {}) => {
  const source = String(template || '').trim()
  if (!source) {
    return {
      templateCode: '',
      script: 'export default {}',
      style: '',
      hasTemplate: false
    }
  }

  // 与 vue-template-compiler 一起，2.7.16 是同步 API；保持函数同步（不返回 Promise）
  // 是为了让上层 createRuneRendererCtor 同步完成 RunePreviewRenderer 的 ctor 计算，
  // 避免出现「先渲染 loading 占位，async resolve 后再切回真实模板」的闪烁。
  const vueSfcCompiler = (VueTemplateCompiler && typeof VueTemplateCompiler.parseComponent === 'function')
    ? VueTemplateCompiler
    : (VueTemplateCompiler && VueTemplateCompiler.default && typeof VueTemplateCompiler.default.parseComponent === 'function')
      ? VueTemplateCompiler.default
      : null

  if (!vueSfcCompiler) {
    // 兜底：编译入口不可用就退化成"原样作为模板"，至少不会让页面渲染炸掉。
    return {
      templateCode: source,
      script: 'export default {}',
      style: '',
      hasTemplate: true
    }
  }

  const parsed = vueSfcCompiler.parseComponent(source)
  const templateContent = (parsed.template && parsed.template.content && parsed.template.content.trim()) || ''
  const scriptContent = (parsed.script && parsed.script.content) || 'export default {}'
  const styleText = (Array.isArray(parsed.styles) ? parsed.styles : [])
    .map(style => style && style.content ? style.content : '')
    .join('\n')

  return {
    templateCode: templateContent,
    script: scriptContent,
    style: styleText,
    hasTemplate: !!templateContent
  }
}

const evalRuneScript = (scriptContent = '') => {
  const sanitized = String(scriptContent || '').replace(/export\s+default/, 'return ')
  const factory = new Function(sanitized)
  const result = factory()
  return result && typeof result === 'object' ? result : {}
}

// 与老 Muya 逻辑一致：把模板源码（已剥离 <template> 标签外层）通过
// `compileToFunctions` 编译为 render / staticRenderFns 函数对。
// 注意：vue-template-compiler 在 rune SFC <template> 里只放 markup（不含 <template> 标签），
// 所以这里不需要再 strip 一次，直接交给编译器。
const compileRuneTemplate = (templateCode = '', scopeId = '') => {
  const compiler = (VueTemplateCompiler && typeof VueTemplateCompiler.compileToFunctions === 'function')
    ? VueTemplateCompiler
    : (VueTemplateCompiler && VueTemplateCompiler.default && typeof VueTemplateCompiler.default.compileToFunctions === 'function')
      ? VueTemplateCompiler.default
      : null
  if (!compiler) return null
  const sourceWithScope = scopeId ? injectScopedAttribute(templateCode, scopeId) : templateCode
  const compiled = compiler.compileToFunctions(sourceWithScope)
  return {
    render: compiled && typeof compiled.render === 'function' ? compiled.render : null,
    staticRenderFns: compiled && Array.isArray(compiled.staticRenderFns) ? compiled.staticRenderFns : []
  }
}

// 把 scopeId（data-v-xxx）写到模板里每个非 template/slot 标签上，与 Muya 老实现完全一致，
// 否则多个 rune SFC 的样式会互相串。
const injectScopedAttribute = (template = '', scopeId = '') => {
  if (!scopeId || !template) return template
  return String(template).replace(/<([a-zA-Z][^\s/>]*)(\s[^<>]*?)?(\/?\s*)>/g, (match, tagName, attrs = '', tail = '') => {
    if (/^(template|slot)$/i.test(tagName) || attrs.includes(scopeId)) {
      return match
    }
    return `<${tagName}${attrs} ${scopeId}${tail}>`
  })
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
    const { templateCode, script, style, hasTemplate } = normalizeRuneSfc(templateSource, {
      filename: `rune-${rune.id || 'default'}.vue`,
      scopeId
    })
    if (!hasTemplate) return null

    const componentOptions = evalRuneScript(script)
    const compiled = compileRuneTemplate(templateCode, scopeId)
    if (!compiled || typeof compiled.render !== 'function') {
      // 编译失败/不可用时直接返回 null，让上层走「默认占位符 + loadError」兜底，
      // 而不是抛错让整张笔记编辑器挂掉。
      return null
    }
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
