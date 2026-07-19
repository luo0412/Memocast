<template>
  <div class='exclude-header' v-show='!isCurrentNoteLoading && dataLoaded'>
    <div ref='muya' id='muya' class='editor-component' v-close-popup>
    </div>
  </div>
</template>

<script>

import { createNamespacedHelpers } from 'vuex'
import helper from 'src/utils/helper'
import Vue from 'vue'
import * as VueTemplateCompiler from 'vue-template-compiler'
import Muya from 'src/libs/muya/lib'
import appBus from '../../bus'
import _ from 'lodash'
import { v4 as uuidv4 } from 'uuid'
import appEvents from 'src/constants/events'
import 'src/libs/muya/themes/default.css'
import TablePicker from 'src/libs/muya/lib/ui/tablePicker'
import QuickInsert from 'src/libs/muya/lib/ui/quickInsert'
import CodePicker from 'src/libs/muya/lib/ui/codePicker'
import EmojiPicker from 'src/libs/muya/lib/ui/emojiPicker'
import ImagePathPicker from 'src/libs/muya/lib/ui/imagePicker'
import ImageSelector from 'src/libs/muya/lib/ui/imageSelector'
import FormatPicker from 'src/libs/muya/lib/ui/formatPicker'
import FrontMenu from 'src/libs/muya/lib/ui/frontMenu'
import ImageToolbar from 'src/libs/muya/lib/ui/imageToolbar'
import LinkTools from 'src/libs/muya/lib/ui/linkTools'
import TableBarTools from 'src/libs/muya/lib/ui/tableTools'
import Transformer from 'src/libs/muya/lib/ui/transformer'
import debugLogger from 'src/utils/debugLogger'
import { attachThemeColor } from 'src/utils/theme'
import { showContextMenu as showEditorContextMenu } from 'src/contextMenu/muya'
import EchoRegistry from './echo/EchoRegistry'
import EchoRuntime from './echo/EchoRuntime'
import { decodeEchoPayload, encodeEchoPayload, createEchoPlaceholderPayload, parseEchoAttrs, extractPrevEchoTokenValue, echoInheritFromPrevious } from './echo/EchoRuntime'
import AiProofreadService from 'src/services/AiProofreadService'

const {
  mapGetters: mapServerGetters,
  mapState: mapServerState,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')

const {
  mapState: mapClientState,
  mapActions: mapClientActions
} = createNamespacedHelpers('client')

const EMPTY_RUNE_TEMPLATE = '<div></div>'
// 匹配 <div ...>...</div>，用于按 nodeId 精准定位符文占位符并替换 value/innerText
// group 1 = 整段属性（不含 <div），group 2 = 占位符内的 innerText
const RUNE_PLACEHOLDER_FULL_TAG_RE = /<div(\s+[^>]*?)>([\s\S]*?)<\/div>/gi
// 把字符串里的不安全字符转成可在 HTML 属性 / 文本中安全出现的形式（与 quickInsert 侧的 escapeHtmlAttribute 对齐）
const escapeRuneAttrValue = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const escapeRuneInnerText = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

// 从 <div data-rune-name="X" ...> 整段属性里抽取指定 data-* 属性（顺序无关）
const readRuneDataAttr = (attrsSource = '', attrName = '') => {
  const needle = String(attrName || '').trim()
  if (!needle) return ''
  const re = new RegExp(`${needle}\\s*=\\s*"([^"]*)"`, 'i')
  const match = re.exec(String(attrsSource || ''))
  return match ? match[1] : ''
}

// 按 nodeId 找到对应的 <div ...>...</div> 并返回新的 markdown
// 如果传入 value，则同步更新 data-rune-value 与 innerText（保持与 quickInsert 插入时一致）
const rewriteRunePlaceholderByNodeId = (markdown = '', nodeId = '', nextValue = null) => {
  const source = String(markdown || '')
  const targetNodeId = String(nodeId || '').trim()
  if (!source || !targetNodeId) return source

  let rewritten = false
  let nextMarkdown = source
  RUNE_PLACEHOLDER_FULL_TAG_RE.lastIndex = 0
  nextMarkdown = source.replace(RUNE_PLACEHOLDER_FULL_TAG_RE, (match, attrsSource = '', _innerText = '') => {
    if (rewritten) return match
    if (readRuneDataAttr(attrsSource, 'data-rune-node-id') !== targetNodeId) return match
    const runeName = readRuneDataAttr(attrsSource, 'data-rune-name') || 'Rune'
    const runeId = readRuneDataAttr(attrsSource, 'data-rune-id') || ''
    const normalizedValue = nextValue == null ? '' : String(nextValue).trim()
    const escapedName = escapeRuneAttrValue(runeName)
    const escapedId = escapeRuneAttrValue(runeId)
    const escapedValue = escapeRuneAttrValue(normalizedValue)
    const escapedInner = escapeRuneInnerText(normalizedValue || runeName)
    rewritten = true
    return `<div data-rune-name="${escapedName}" data-rune-id="${escapedId}" data-rune-node-id="${escapeRuneAttrValue(targetNodeId)}" data-rune-value="${escapedValue}">${escapedInner}</div>`
  })

  return rewritten ? nextMarkdown : source
}
const vueSfcCompiler = VueTemplateCompiler && typeof VueTemplateCompiler.parseComponent === 'function'
  ? VueTemplateCompiler
  : VueTemplateCompiler?.default && typeof VueTemplateCompiler.default.parseComponent === 'function'
    ? VueTemplateCompiler.default
    : null
const compileTemplateToFunctions = vueSfcCompiler && typeof vueSfcCompiler.compileToFunctions === 'function'
  ? vueSfcCompiler.compileToFunctions.bind(vueSfcCompiler)
  : vueSfcCompiler?.default && typeof vueSfcCompiler.default.compileToFunctions === 'function'
    ? vueSfcCompiler.default.compileToFunctions.bind(vueSfcCompiler.default)
    : null
const LEGACY_RUNE_PLACEHOLDER_RE = /<div\s+[^>]*?(?:data-rune="([^"]+)"|data-rune-name="([^"]+)")[^>]*>([\s\S]*?)<\/div>/gi
const CURRENT_RUNE_PLACEHOLDER_RE = /<div\s+[^>]*data-rune-name="([^"]+)"[^>]*>([\s\S]*?)<\/div>/gi
const RUNE_TEXT_SLOT = 'default'

const injectScopedAttribute = (template = '', scopeId = '') => {
  if (!scopeId || !template) return template
  return template.replace(/<([a-zA-Z][^\s/>]*)(\s[^<>]*?)?(\/?\s*)>/g, (match, tagName, attrs = '', tail = '') => {
    if (/^(template|slot)$/i.test(tagName) || attrs.includes(scopeId)) {
      return match
    }
    return `<${tagName}${attrs} ${scopeId}${tail}>`
  })
}

const normalizeRuneSfc = (template = '') => {
  const source = String(template || '').trim()
  console.log('[Muya.normalizeRuneSfc] received template source', {
    sourceLen: source.length,
    sourcePreview: source.substring(0, 160)
  })
  if (!source) {
    return {
      template: EMPTY_RUNE_TEMPLATE,
      script: 'export default {}',
      styles: [],
      hasTemplate: false
    }
  }

  if (!vueSfcCompiler) {
    console.warn('[Muya.normalizeRuneSfc] vue-template-compiler unavailable, fallback to raw template')
    return {
      template: source,
      script: 'export default {}',
      styles: [],
      hasTemplate: true
    }
  }

  const parsed = vueSfcCompiler.parseComponent(source)
  const templateContent = (parsed.template && parsed.template.content && parsed.template.content.trim()) || ''
  console.log('[Muya.normalizeRuneSfc] parsed template result', {
    hasTemplateBlock: !!parsed.template,
    templateContentLen: templateContent.length,
    templateContentPreview: templateContent.substring(0, 160),
    scriptLen: ((parsed.script && parsed.script.content) || '').length,
    stylesCount: Array.isArray(parsed.styles) ? parsed.styles.length : 0
  })

  return {
    template: templateContent || EMPTY_RUNE_TEMPLATE,
    script: (parsed.script && parsed.script.content) || 'export default {}',
    styles: parsed.styles || [],
    hasTemplate: !!templateContent
  }
}

const createRuneMigrationMap = (runeCards = []) => {
  return (Array.isArray(runeCards) ? runeCards : []).reduce((acc, rune) => {
    const runeName = String((rune?.name || '').trim())
    if (runeName) {
      acc.set(runeName, rune)
    }
    return acc
  }, new Map())
}

const createRuneInstanceId = () => uuidv4()
const createRuneNodeId = () => `rune-${uuidv4()}`
const LEGACY_ECHO_INSERT_RE = /@([^\s{}()@]+)\{\}\(\)/g
// Support both named (@name{...}(...)) and anonymous (@{...}(...)) echo annotations
const CURRENT_ECHO_PLACEHOLDER_RE = /@([^\s{}()@]*)\{([\s\S]*?)\}\(([^)]*)\)/g
const escapeHtmlAttribute = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const escapeEchoAttrValue = (value = '') => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\r/g, '\\r')
  .replace(/\n/g, '\\n')
  .replace(/\t/g, '\\t')

const buildEchoAttrSource = ({ value = '', echoId = '', definitionId = '' } = {}) => {
  const parts = []
  if (echoId) {
    parts.push(`id: '${escapeEchoAttrValue(echoId)}'`)
  }
  if (definitionId) {
    parts.push(`definitionId: '${escapeEchoAttrValue(definitionId)}'`)
  }
  parts.push(`value: '${escapeEchoAttrValue(value)}'`)
  return parts.join(', ')
}

const buildEchoAnnotationText = (echoName = '回响', payload = '', options = {}) => {
  const decoded = decodeEchoPayload(payload)
  const value = decoded.prompt || decoded?.attrs?.value || ''
  const echoId = String(options.echoId || decoded?.attrs?.id || '').trim() || createEchoInstanceId()
  const definitionId = String(options.definitionId || decoded?.attrs?.definitionId || '').trim()
  return `@${echoName}{${buildEchoAttrSource({ value, echoId, definitionId })}}()`
}

const createEchoInstanceId = () => uuidv4()
const createEchoNodeId = () => `echo-${uuidv4()}`

const migrateLegacyRunePlaceholders = (markdown = '', runeCards = []) => {
  const source = String(markdown || '')
  if (!source || (source.indexOf('data-rune="') === -1 && source.indexOf('data-rune-name="') === -1)) {
    return source
  }

  const runeMap = createRuneMigrationMap(runeCards)
  if (!runeMap.size) return source

  return source.replace(LEGACY_RUNE_PLACEHOLDER_RE, (match, legacyRuneValue = '', legacyRuneNameAttr = '', innerHtml = '') => {
    const hasModernRuneAttributes = /data-rune-name\s*=/.test(match) && /data-rune-id\s*=/.test(match) && /data-rune-node-id\s*=/.test(match)
    if (hasModernRuneAttributes) {
      return match
    }

    const runeName = String(legacyRuneNameAttr || legacyRuneValue || '').trim()
    const rune = runeMap.get(runeName)
    if (!rune?.name) return match

    const plainText = String(innerHtml || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const text = plainText && plainText !== 'Rune' ? plainText : rune.name

    return `<div data-rune-name="${rune.name}" data-rune-id="${createRuneInstanceId()}" data-rune-node-id="${createRuneNodeId()}">${text}</div>`
  })
}

const createEchoPlaceholderMarkup = (echo = {}, options = {}) => {
  const echoName = String(echo?.name || '回响').trim() || '回响'
  // 「上一节点 value 继承」：默认不开启；当 echo 名片层（或调用方 options）声明 inheritFromPrevious: true 时，
  // 从 markdown 中 currentIndex 之前最近的 echo token 提取 value 注入 placeholder。
  const inheritEnabled = echoInheritFromPrevious(echo) || options.inheritFromPrevious === true
  const prevValue = inheritEnabled
    ? extractPrevEchoTokenValue(options.markdown || '', options.currentIndex, { echoName })
    : ''
  const payload = createEchoPlaceholderPayload(echo, {
    inheritFromPrevious: inheritEnabled,
    inheritedValue: prevValue
  })
  return buildEchoAnnotationText(echoName, payload, {
    echoId: createEchoInstanceId(),
    definitionId: String(echo?.id || '').trim()
  })
}

const migrateLegacyEchoPlaceholders = (markdown = '', echoCards = []) => {
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
    // 「上一节点 value 继承」：从当前 match 之前的 markdown 切片找上一个 echo token value
    return createEchoPlaceholderMarkup(echo, {
      markdown: source,
      currentIndex: source.indexOf(match)
    })
  }).replace(CURRENT_ECHO_PLACEHOLDER_RE, (match, rawEchoName = '', attrsRaw = '', promptRaw = '') => {
    const echoName = String(rawEchoName || '').trim()
    const attrs = parseEchoAttrs(attrsRaw)
    if (attrs.id) return match
    const generatedEchoId = createEchoInstanceId()
    const matchedEcho = echoMap.get(echoName)
    const generatedDefinitionId = String(attrs.definitionId || matchedEcho?.id || '').trim()
    // 已存在的 attrs.value 优先；当 echo 名片层声明了 inheritFromPrevious: true 且原 value 为空，
    // 从 match 之前的 markdown 切片提取上一节点 value 注入。
    const existingValue = String(attrs.value || promptRaw || '')
    let resolvedValue = existingValue
    if (!resolvedValue && matchedEcho && echoInheritFromPrevious(matchedEcho)) {
      const prevValue = extractPrevEchoTokenValue(source, source.indexOf(match), { echoName })
      if (prevValue) resolvedValue = prevValue
    }
    const upgradedPayload = encodeEchoPayload({
      prompt: resolvedValue,
      attrs: {
        ...attrs,
        id: generatedEchoId,
        definitionId: generatedDefinitionId,
        value: resolvedValue,
        inheritFromPrevious: echoInheritFromPrevious(matchedEcho) || echoInheritFromPrevious(attrs)
      }
    })
    return buildEchoAnnotationText(echoName || '回响', upgradedPayload, {
      echoId: generatedEchoId,
      definitionId: generatedDefinitionId
    })
  })
}

const evalRuneScript = (scriptContent = '') => {
  const sanitized = scriptContent.replace(/export\s+default/, 'return ')
  const factory = new Function(sanitized)
  const result = factory()
  return result && typeof result === 'object' ? result : {}
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

const createRuneRendererCtor = (rune = {}) => {
  console.log('[Muya.createRuneRendererCtor] building renderer', {
    runeId: rune?.id || '',
    runeName: rune?.name || '',
    rawTemplateLen: String(rune?.template || '').length,
    rawTemplatePreview: String(rune?.template || '').substring(0, 160)
  })
  const { template, script, styles, hasTemplate } = normalizeRuneSfc(rune.template)
  console.log('[Muya.createRuneRendererCtor] normalized rune sfc', {
    runeId: rune?.id || '',
    runeName: rune?.name || '',
    hasTemplate,
    normalizedTemplateLen: String(template || '').length,
    normalizedTemplatePreview: String(template || '').substring(0, 160),
    scriptLen: String(script || '').length,
    stylesCount: Array.isArray(styles) ? styles.length : 0
  })
  if (!hasTemplate) return null

  const scopeId = `data-rune-scope-${rune.id || 'default'}`
  const styleText = styles.map(style => style.content || '').join('\n')
  const componentOptions = evalRuneScript(script)
  const baseData = typeof componentOptions.data === 'function' ? componentOptions.data : () => ({})
  const declaredPropNames = Array.isArray(componentOptions.props)
    ? componentOptions.props
      .map(propName => String(propName || '').trim())
      .filter(Boolean)
    : (componentOptions.props && typeof componentOptions.props === 'object'
      ? Object.keys(componentOptions.props)
      : [])
  if (!compileTemplateToFunctions) {
    console.warn('[Muya.createRuneRendererCtor] compileToFunctions unavailable, skip renderer', {
      runeId: rune?.id || '',
      runeName: rune?.name || ''
    })
    return null
  }
  const compiled = compileTemplateToFunctions(injectScopedAttribute(template, scopeId))

  ensureRuneStyle(`rune-style-${rune.id || 'default'}`, styleText)

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
        ...baseData.call(this),
        runeMeta: this.rune || rune
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
}

const RunePreviewRenderer = Vue.extend({
  name: 'RunePreviewRenderer',
  props: {
    runeId: {
      type: String,
      default: ''
    },
    nodeId: {
      type: String,
      default: ''
    },
    rune: {
      type: Object,
      default: null
    },
    value: {
      type: String,
      default: ''
    },
    onValueChange: {
      type: Function,
      default: null
    }
  },
  computed: {
    rendererCtor () {
      const rune = this.rune || {}
      return createRuneRendererCtor(rune)
    }
  },
  render (h) {
    if (!this.rendererCtor) {
      return h('div')
    }

    // 把内层 SFC 的 input 事件转发到 onValueChange，
    // 让 RuneValue { runeId, nodeId, value } 回流到 Markdown 源。
    const self = this
    return h(this.rendererCtor, {
      props: {
        runeId: this.runeId,
        nodeId: this.nodeId,
        rune: this.rune,
        value: this.value
      },
      on: {
        input: function (...args) {
          if (typeof self.onValueChange !== 'function') return
          const raw = args[0]
          let nextValue
          if (raw && typeof raw === 'object' && 'target' in raw && raw.target) {
            nextValue = raw.target.value
          } else {
            nextValue = raw
          }
          self.onValueChange({
            runeId: self.runeId,
            nodeId: self.nodeId,
            value: nextValue == null ? '' : String(nextValue)
          })
        }
      }
    })
  }
})

const EchoPreviewRenderer = Vue.extend({
  name: 'EchoPreviewRenderer',
  props: {
    echoId: {
      type: String,
      default: ''
    },
    nodeId: {
      type: String,
      default: ''
    },
    echo: {
      type: Object,
      default: null
    },
    value: {
      type: String,
      default: ''
    },
    onCommit: {
      type: Function,
      default: null
    }
  },
  computed: {
    displayTitle () {
      return this.echo?.name || '回响'
    },
    displaySummary () {
      const raw = this.value || this.echo?.desc || ''
      return String(raw || '').replace(/\s+/g, ' ').trim()
    },
    accentColor () {
      return this.echo?.color || '#26A69A'
    }
  },
  methods: {
    handleClick (event) {
      event.preventDefault()
      event.stopPropagation()
      if (typeof this.onCommit === 'function') {
        this.onCommit({
          echoId: this.echoId,
          nodeId: this.nodeId,
          echoName: this.echo?.name || '',
          value: this.value,
          payload: encodeEchoPayload({
            prompt: this.value,
            attrs: {
              id: this.echoId || '',
              definitionId: this.echo?.id || '',
              value: this.value
            }
          }),
          mode: 'open-instance'
        })
      }
    }
  },
  render (h) {
    const title = this.displaySummary
      ? `${this.displayTitle}: ${this.displaySummary}`
      : this.displayTitle

    return h('span', {
      staticClass: 'ag-echo-anno-token ag-echo-inline-preview',
      style: {
        '--echo-accent': this.accentColor
      },
      attrs: {
        contenteditable: 'false'
      },
      on: {
        click: this.handleClick
      }
    }, [
      h('span', {
        staticClass: 'ag-echo-placeholder-marker',
        attrs: {
          title,
          contenteditable: 'false'
        }
      }, [
        h('i', {
          staticClass: 'ag-echo-anno-icon material-icons',
          attrs: {
            contenteditable: 'false'
          }
        }, ['play_arrow']),
        h('span', {
          staticClass: 'ag-echo-anno-name',
          attrs: {
            contenteditable: 'false'
          }
        }, [this.displayTitle])
      ])
    ])
  }
})

const clearEditorHistory = (editor) => {
  if (!editor) return
  if (typeof editor.clearHistory === 'function') {
    editor.clearHistory()
    return
  }
  if (editor.contentState?.history && typeof editor.contentState.history.clearHistory === 'function') {
    editor.contentState.history.clearHistory()
  }
}

const EchoPlaceholderHost = EchoPreviewRenderer

export default {
  name: 'Muya',
  props: {
    data: {
      type: Object,
      default: () => ({
        markdown: '',
        cursor: {
          lineNumber: 0,
          column: 0
        }
      })
    },
    active: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      contentEditor: {},
      firstTimeLoad: false,
      previousNoteInfo: null,
      previousResources: [],
      pendingSaveData: null, // 编辑变化时预捕获的数据（备用）
      echoRegistry: new EchoRegistry([])
    }
  },
  computed: {
    dataLoaded: function () {
      return !helper.isNullOrEmpty(this.currentNote)
    },
    ...mapServerState(['isCurrentNoteLoading', 'contentsList', 'noteState']),
    ...mapServerGetters(['currentNote', 'uploadImageUrl', 'currentNoteResources', 'currentNoteResourceUrl']),
    ...mapClientState(['darkMode', 'enablePreviewEditor', 'theme', 'runeCards', 'echoCards'])
  },
  methods: {
    migrateCurrentNoteRunePlaceholders () {
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function' || typeof this.contentEditor.setMarkdown !== 'function') {
        return false
      }

      const markdown = this.contentEditor.getMarkdown()
      const migrated = migrateLegacyRunePlaceholders(markdown, this.runeCards)
      if (migrated === markdown) {
        return false
      }

      const cursor = typeof this.contentEditor.getCursor === 'function' ? this.contentEditor.getCursor() : null
      this.contentEditor.setMarkdown(migrated, cursor)
      this.updateContentsList(this.contentEditor.getTOC())
      this.updateNoteState('changed')
      return true
    },
    migrateCurrentNoteEchoPlaceholders () {
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function' || typeof this.contentEditor.setMarkdown !== 'function') {
        return false
      }

      const markdown = this.contentEditor.getMarkdown()
      const migrated = migrateLegacyEchoPlaceholders(markdown, this.echoCards)
      if (migrated === markdown) {
        return false
      }

      const cursor = typeof this.contentEditor.getCursor === 'function' ? this.contentEditor.getCursor() : null
      this.contentEditor.setMarkdown(migrated, cursor)
      this.updateContentsList(this.contentEditor.getTOC())
      this.updateNoteState('changed')
      return true
    },
    updateEchoPlaceholderPayload ({ echoId = '', nodeId = '', echoName = '', payload = '', mode = '', value = '' } = {}) {
      if (mode === 'open-instance') {
        appBus.$emit(appEvents.ECHO_EVENTS.openInstanceEditor, {
          echoId: String(echoId || '').trim() || String(decodeEchoPayload(payload)?.attrs?.id || '').trim(),
          nodeId: String(nodeId || '').trim(),
          echoName: String(echoName || '').trim(),
          payload: payload || ''
        })
        return true
      }
      if (mode === 'open-definition') {
        appBus.$emit(appEvents.ECHO_EVENTS.openManager, {
          echoId: String(echoId || '').trim() || String(decodeEchoPayload(payload)?.attrs?.id || '').trim(),
          nodeId: String(nodeId || '').trim(),
          echoName: String(echoName || '').trim(),
          payload: payload || ''
        })
        return true
      }
      if (!this.contentEditor) return false
      const markdown = this.contentEditor.getMarkdown()
      if (!markdown) return false

      const resolvedValue = typeof value === 'string' ? value : (decodeEchoPayload(payload)?.prompt || decodeEchoPayload(payload)?.attrs?.value || '')
      const normalizedEchoId = String(echoId || '').trim()
      const decoded = decodeEchoPayload(payload)
      const attrsFromPayload = decoded?.attrs || {}
      const normalizedDefinitionId = String(attrsFromPayload?.definitionId || this.echoCards?.find(e => e.name === echoName)?.id || '').trim()

      const nextPayload = encodeEchoPayload({
        prompt: resolvedValue,
        attrs: {
          ...attrsFromPayload,
          id: normalizedEchoId || String(attrsFromPayload?.id || '').trim() || createEchoInstanceId(),
          definitionId: normalizedDefinitionId,
          value: resolvedValue
        }
      })

      let updated = false
      const nextMarkdown = markdown.replace(CURRENT_ECHO_PLACEHOLDER_RE, (match, matchedName = '', matchedAttrs = '', matchedPrompt = '') => {
        const currentName = String(matchedName || echoName || '').trim()
        const attrs = parseEchoAttrs(matchedAttrs)
        const matchedId = String(attrs.id || '').trim()
        if (updated) return match
        // For anonymous echo (@{}), match by echoId only
        const isAnonymous = !matchedName
        if (normalizedEchoId && matchedId && matchedId !== normalizedEchoId) return match
        if (!isAnonymous && !normalizedEchoId && echoName && currentName !== echoName) return match
        updated = true
        const resolvedEchoId = normalizedEchoId || matchedId || String(attrsFromPayload?.id || '').trim() || createEchoInstanceId()
        return buildEchoAnnotationText(currentName || '回响', nextPayload, {
          echoId: resolvedEchoId,
          definitionId: String(attrs.definitionId || normalizedDefinitionId || '').trim()
        })
      })

      if (!updated || nextMarkdown === markdown) return false
      const cursor = typeof this.contentEditor.getCursor === 'function' ? this.contentEditor.getCursor() : null
      this.contentEditor.setMarkdown(nextMarkdown, cursor, false)
      this.updateContentsList(this.contentEditor.getTOC())
      this.updateNoteState('changed')
      return true
    },
    // lucky 全局回调：@强运() 点击后真正调 AI 校对。
    // 入参由 EchoRuntime 在 handler 内传 {chantNode, meta, scopeContainer}
    async handleLuckyChantTrigger ({ chantNode, meta = {}, scopeContainer } = {}) {
      try {
        if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') return
        const markdown = this.contentEditor.getMarkdown() || ''
        if (!markdown.trim()) {
          this.$q && this.$q.notify && this.$q.notify({ message: this.$t('aiLuckyEmpty'), type: 'warning', position: 'top' })
          return
        }
        const loadingClass = 'ag-rune-lucky-loading'
        if (chantNode && chantNode.classList) chantNode.classList.add(loadingClass)
        try {
          const result = await AiProofreadService.proofread(markdown, { model: meta?.attrs?.model || undefined })
          if (!result || !result.corrected) {
            this.$q && this.$q.notify && this.$q.notify({ message: this.$t('aiLuckyNoChange'), type: 'info', position: 'top' })
            return
          }
          if (result.corrected === markdown) {
            this.$q && this.$q.notify && this.$q.notify({ message: this.$t('aiLuckyNoChange'), type: 'info', position: 'top' })
            return
          }
          // 替换当前笔记内容
          const cursor = typeof this.contentEditor.getCursor === 'function' ? this.contentEditor.getCursor() : null
          this.contentEditor.setMarkdown(result.corrected, cursor, false)
          this.updateContentsList(this.contentEditor.getTOC())
          this.updateNoteState('changed')
          this.$q && this.$q.notify && this.$q.notify({
            message: this.$t('aiLuckyDone') + `（model=${result.model}）`,
            type: 'positive',
            position: 'top'
          })
        } finally {
          if (chantNode && chantNode.classList) chantNode.classList.remove(loadingClass)
        }
      } catch (error) {
        console.error('[lucky] handler failed:', error)
        const code = error && error.code
        let message = this.$t('aiLuckyFailed')
        if (code === 'AI_PROOFREAD_NO_DEFAULT_CONFIG') {
          message = this.$t('aiLuckyNoConfig')
        } else if (code === 'AI_PROOFREAD_CONFIG_INCOMPLETE') {
          const fields = Array.isArray(error.missingFields) ? error.missingFields.join(', ') : ''
          message = this.$t('aiLuckyConfigIncomplete') + (fields ? ` (${fields})` : '')
        } else if (error && error.message) {
          message += `: ${error.message}`
        }
        this.$q && this.$q.notify && this.$q.notify({ message, type: 'negative', position: 'top' })
      }
    },
    refreshEchoDefinitions () {
      this.echoRegistry.refresh(this.echoCards || [])
      // 让 runtime 实例保持与 registry 一致；新增/删除 echo 后让旧的 compiled definition 缓存失效
      if (!this._echoRuntime) {
        this._echoRuntime = new EchoRuntime({ registry: this.echoRegistry })
      }
      this._echoRuntime.invalidate()
      if (this.contentEditor && this.contentEditor.options) {
        this.contentEditor.options.echoRegistry = this.echoRegistry
        this.contentEditor.options.echoCards = this.echoCards || []
        this.contentEditor.options.echoRuntime = this._echoRuntime
        const quickInsert = this.contentEditor.ui && this.contentEditor.ui.quickInsert
        if (quickInsert) {
          quickInsert.renderObj = quickInsert.getRenderObj()
          if (quickInsert.oldVnode) {
            quickInsert.render()
          }
        }
        if (this.contentEditor?.contentState?.stateRender?.renderRunes) {
          this.contentEditor.contentState.stateRender.renderRunes()
        } else if (this.contentEditor?.contentState) {
          this.contentEditor.contentState.render(false, true)
        }
      }
    },
    /**
     * 把符文占位符里的 value 写回 Markdown 源（同步 data-rune-value 与 innerText）。
     * 取自 TODO「多符文渲染引擎机制」中 RuneValue { runeId, nodeId, value }，
     * 通过 nodeId 精准定位，只动当前实例的占位符，不影响其他符文或外部段落。
     */
    updateRunePlaceholderValue ({ runeId = '', nodeId = '', value = '' } = {}) {
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') return false
      const markdown = this.contentEditor.getMarkdown()
      if (!markdown) return false
      const targetNodeId = String(nodeId || '').trim() || this.findRunePlaceholderNodeIdByRuneInstance(markdown, runeId)
      if (!targetNodeId) return false
      const nextMarkdown = rewriteRunePlaceholderByNodeId(markdown, targetNodeId, value)
      if (nextMarkdown === markdown) return false
      const cursor = typeof this.contentEditor.getCursor === 'function' ? this.contentEditor.getCursor() : null
      this.contentEditor.setMarkdown(nextMarkdown, cursor, false)
      this.updateContentsList(this.contentEditor.getTOC())
      this.updateNoteState('changed')
      // 显式触发 input 事件以让 noteState watcher / 词数统计等下游感知到
      this.contentEditor.dispatchEvent && this.contentEditor.dispatchEvent('change')
      if (typeof this.contentEditor.dispatchChange === 'function') {
        this.contentEditor.dispatchChange()
      }
      return true
    },
    /**
     * 仅供 updateRunePlaceholderValue 兜底用：根据 runeId 找一个未指定 nodeId 的占位符。
     * 一般调用方都会带 nodeId，这里仅作防御。
     */
    findRunePlaceholderNodeIdByRuneInstance (markdown = '', runeId = '') {
      const targetRuneId = String(runeId || '').trim()
      if (!targetRuneId) return ''
      const re = new RegExp('<div(\\s+[^>]*?)>([\\s\\S]*?)</div>', 'gi')
      let found = ''
      re.lastIndex = 0
      String(markdown || '').replace(re, (_match, attrsSource = '') => {
        if (found) return _match
        if (readRuneDataAttr(attrsSource, 'data-rune-id') === targetRuneId) {
          found = readRuneDataAttr(attrsSource, 'data-rune-node-id')
        }
        return _match
      })
      return found
    },
    getValue: function () {
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') {
        return null
      }
      return this.contentEditor.getMarkdown()
    },
    // ✅ 新增：主动捕获当前编辑器内容（供外部调用，如切换笔记前）
    captureCurrentContent: function () {
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') return null

      const markdown = this.contentEditor.getMarkdown()
      const currentNote = this.$store.state.server.currentNote

      if (!currentNote?.info || typeof markdown !== 'string') return null

      const captureData = {
        markdown,
        docGuid: currentNote.info.docGuid,
        title: currentNote.info.title,
        resources: currentNote.resources || [],
        timestamp: Date.now(),
        noteState: this.noteState
      }

      // 更新待保存数据（供 watcher 使用）
      this.pendingSaveData = captureData

      console.log(`[Muya.captureCurrentContent] Captured: docGuid=${captureData.docGuid}, len=${markdown.length}, state=${this.noteState}`)

      return captureData
    },
    paragraphHandler: function (type) {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.updateParagraph(type)
        this.updateContentsList(this.contentEditor.getTOC())
      }
    },
    insertParagraphHandler: function (location) {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.insertParagraph(location)
      }
    },
    formatDocumentByPanguHandler: function () {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        const before = this.contentEditor.getMarkdown()
        helper.formatDocumentByRemarkPangu(before).then(after => {
          if (before !== after) {
            this.contentEditor.setMarkdown(after)
            this.updateContentsList(this.contentEditor.getTOC())
            this.updateNoteState('changed')
          }
        })
      }
    },
    formatHandler: function (type) {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.format(type)
      }
    },
    editParagraphHandler: function (type) {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        switch (type) {
          case 'duplicate': {
            return this.contentEditor.duplicate()
          }
          case 'createParagraph': {
            return this.contentEditor.insertParagraph('after', '', true)
          }
          case 'deleteParagraph': {
            return this.contentEditor.deleteParagraph()
          }
          default:
            console.error(`Cannot recognize paragraph edit type: ${type}`)
        }
      }
    },
    editCopyPasteHandler: function (type) {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor[type]()
      }
    },
    saveHandler: function () {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        const markdown = this.pendingSaveData?.markdown || this.contentEditor.getMarkdown()
        this.updateNote(markdown)
      }
    },

    selectAllHandler: function () {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.selectAll()
      }
    },
    undoHandler: function () {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.undo()
      }
    },
    redoHandler: function () {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.redo()
      }
    },
    scrollToHeaderHandler: function (slug) {
      this.scrollToElementHandler(`#${slug}`)
    },
    scrollToElementHandler: function (selector) {
      const { container } = this.contentEditor
      const anchor = document.querySelector(selector)
      if (anchor) {
        const STANDARD_Y = window.innerHeight * 0.065
        const { y } = anchor.getBoundingClientRect()
        const DURATION = this.$q.platform.is.mac ? 300 : 0
        helper.animatedScrollTo(container, container.scrollTop + y - STANDARD_Y, DURATION)
      }
    },
    getCursorPosition: function () {
      const {
        line: lineNumber,
        ch: column
      } = this.contentEditor?.getCursor().focus
      return {
        lineNumber,
        column
      }
    },
    setCursorPosition: function (position) {
      const {
        lineNumber,
        column
      } = position
      if (this.contentEditor) {
        this.contentEditor.setCursor({
          anchor: {
            line: lineNumber,
            ch: column
          },
          focus: {
            line: lineNumber,
            ch: column
          }
        })
      }
    },
    ...mapServerActions(['updateNote', 'updateNoteWithInfo', 'updateNoteState', 'updateContentsList', 'uploadImage']),
    ...mapClientActions(['importImageFromLocal'])
  },
  created () {
    this.$nextTick(() => {
      Muya.use(TablePicker)
      Muya.use(QuickInsert)
      Muya.use(CodePicker)
      Muya.use(EmojiPicker)
      Muya.use(ImagePathPicker)
      Muya.use(ImageToolbar)
      Muya.use(ImageSelector)
      Muya.use(FormatPicker)
      Muya.use(FrontMenu)
      Muya.use(LinkTools, {
        jumpClick: (linkInfo) => {
          window.open(linkInfo.href)
        }
      })
      Muya.use(Transformer)
      Muya.use(TableBarTools)

      this.echoRegistry.refresh(this.echoCards || [])
      this._echoRuntime = new EchoRuntime({ registry: this.echoRegistry })

      // 注册全局 lucky 回调：@强运 点击后真正调 AI 校对。
      if (typeof window !== 'undefined') {
        window.__memocastEchoChantHandlers = Object.assign(window.__memocastEchoChantHandlers || {}, {
          lucky: this.handleLuckyChantTrigger.bind(this)
        })
      }

      // 把 Vue 实例注入 Muya options，让 Muya 内部的 StateRender 能回调到我们的回写方法
      const muyaSelf = this
      const { container } = this.contentEditor = new Muya(this.$refs.muya, {
        memoMuya: muyaSelf,
        echoRuntime: this._echoRuntime,
        quickInsertProvider: () => {
          const runeItems = (this.runeCards || [])
            .filter(rune => rune && (rune.name || rune.text || rune.label))
            .map(rune => {
              const inheritFromPrevious = rune.inherit_from_previous === true || rune.inherit_from_previous === 1 || rune.inherit_from_previous === '1'
              return {
                title: () => rune.name || rune.text || rune.label || 'Rune',
                subTitle: () => rune.desc || rune.template || '',
                label: `rune:${rune.id}`,
                shortCut: '',
                icon: rune.icon,
                color: rune.color,
                searchText: [rune.name, rune.text, rune.label, rune.desc, rune.template].filter(Boolean).join(' '),
                meta: {
                  type: 'rune',
                  runeTemplateId: rune.id,
                  runeName: (rune.name || rune.text || rune.label || '').trim(),
                  color: rune.color,
                  insertContent: rune.template || '',
                  inheritFromPrevious
                }
              }
            })
          const echoItems = (this.echoCards || [])
            .filter(echo => echo && echo.name)
            .map(echo => ({
              title: () => echo.name || 'Echo',
              subTitle: () => echo.desc || '',
              label: `echo:${echo.id || echo.name}`,
              shortCut: '',
              icon: `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${echo.color || '#26A69A'}"/><text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="28" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,PingFang SC,Microsoft YaHei,sans-serif" font-weight="700" fill="#fff">${Array.from(String(echo.name || '回').trim())[0] || '回'}</text></svg>`)))}`,
              color: echo.color || '#26A69A',
              searchText: [echo.name, echo.desc, echo.anno_source].filter(Boolean).join(' '),
              insertContent: `@${echo.name || '回响'}{}()`,
              meta: {
                type: 'echo',
                echoName: (echo.name || '回响').trim(),
                color: echo.color || '#26A69A'
              }
            }))
          const runeSectionTitle = this.$t('runeSectionTitle')
          const echoSectionTitle = this.$t('echoSectionTitle') || this.$t('echo') || 'Echo'
          return {
            sectionName: runeSectionTitle,
            items: {
              [runeSectionTitle]: runeItems,
              [echoSectionTitle]: echoItems
            },
            echoSectionName: echoSectionTitle
          }
        },
        runeCards: this.runeCards,
        echoSectionName: this.$t('echo') || 'Echo',
        echoRegistry: this.echoRegistry,
        echoCards: this.echoCards,
        runeRendererCtor: RunePreviewRenderer,
        echoRendererCtor: EchoPlaceholderHost,
        enableRuneVueRenderer: true,
        enableEchoVueRenderer: false, // Echo 默认不使用 Vue 渲染模式
        onEchoPlaceholderCommit: this.updateEchoPlaceholderPayload,
        imagePathPicker: () => {
          return new Promise((resolve, reject) => {
            this.importImageFromLocal().then(paths => {
              debugLogger.Info(paths)
              resolve(paths ? paths[0] : '')
            }).catch(err => {
              debugLogger.Error(err)
              reject(err)
            })
          })
        },
        imageAction: this.uploadImage
      })

      attachThemeColor(this.theme)

      this.contentEditor.on('muya-click', _.debounce((event) => {
        const echoTarget = event?.target?.closest?.('.ag-echo-anno-token')
        if (echoTarget) {
          const dataset = echoTarget.dataset || {}
          const echoId = String(dataset.echoId || '').trim()
          const echoName = String(dataset.echoName || '').trim()
          const definitionId = String(dataset.echoDefinitionId || '').trim()
          const value = String(dataset.echoValue || '')
          this.updateEchoPlaceholderPayload({
            echoId,
            echoName,
            value,
            payload: encodeEchoPayload({
              prompt: value,
              attrs: {
                id: echoId,
                definitionId,
                value
              }
            })
          })
          return
        }
        if (event.target.type === 'checkbox') {
          const curData = this.contentEditor.getMarkdown()

          // ✅ 兼容新格式：提取 currentNote 的真实内容
          let currentNoteContent = ''
          if (typeof this.currentNote === 'string') {
            currentNoteContent = this.currentNote || ''
          } else if (this.currentNote && typeof this.currentNote === 'object') {
            currentNoteContent = this.currentNote.__markdown || ''
          }

          // eslint-disable-next-line eqeqeq
          if (curData != currentNoteContent) {
            this.updateNoteState('changed')
            this.updateContentsList(this.contentEditor.getTOC())
          } else {
            this.updateNoteState('default')
          }
        }
      }, 800))

      this.contentEditor.on('change', () => this.updateContentsList(this.contentEditor.getTOC()))

      this.contentEditor.on('change', () => appBus.$emit(appEvents.UPDATE_WORD_COUNT, this.contentEditor.getWordCount(this.contentEditor.getMarkdown())))

      this.contentEditor.on('contextmenu', (event, selection) => {
        showEditorContextMenu(event, selection)
      })

      this.contentEditor.on('selectionChange', changes => {
        const { y } = changes.cursorCoords

        if (container.clientHeight - y < 100) {
          const editableHeight = container.clientHeight - 100
          if (this.$q.platform.is.mac) {
            helper.animatedScrollTo(container, container.scrollTop + (y - editableHeight), 100)
          } else {
            container.scrollTop = container.scrollTop + (y - editableHeight)
          }
        }
      })

      this.contentEditor.on('change', _.debounce(({ markdown: curData }) => {
        // ✅ 兼容新格式：currentNote 可能是字符串或对象
        let currentNoteContent = ''

        if (typeof this.currentNote === 'string') {
          // 旧格式：直接是字符串
          currentNoteContent = this.currentNote || ''
        } else if (this.currentNote && typeof this.currentNote === 'object') {
          // 新格式：提取 __markdown 字段
          currentNoteContent = this.currentNote.__markdown || ''
        }

        // ✅ 使用提取后的内容进行比较
        if (curData.replace(/\s/g, '') === currentNoteContent.replace(/\s/g, '') || this.noteState === 'none' || this.firstTimeLoad) {
          this.updateNoteState('default')
          this.firstTimeLoad = false
        } else {
          this.updateNoteState('changed')
          this.updateContentsList(this.contentEditor.getTOC())

          // ✅ 关键改进：在内容变化时立即预捕获数据
          // 这样当后续切换笔记时，已经有可靠的数据可以保存
          const currentNote = this.$store.state.server.currentNote
          if (currentNote?.info) {
            this.pendingSaveData = {
              markdown: curData,
              docGuid: currentNote.info.docGuid,
              resources: currentNote.resources || [],
              timestamp: Date.now()
            }
            // console.log('[Muya] Pre-captured save data:', { docGuid: currentNote.info.docGuid, len: curData.length })
          }
        }
        this.updateContentsList(this.contentEditor.getTOC())
      }, 300, { leading: true }))

      appBus.$on(appEvents.SCROLL_TO_HEADER, this.scrollToHeaderHandler)
      appBus.$on(appEvents.PARAGRAPH_SHORTCUT_CALL, this.paragraphHandler)
      appBus.$on(appEvents.FORMAT_SHORTCUT_CALL, this.formatHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.undo, this.editCopyPasteHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.redo, this.editCopyPasteHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.copyAsMarkdown, this.editCopyPasteHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.copyAsHtml, this.editCopyPasteHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.pasteAsPlainText, this.editCopyPasteHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.duplicate, this.editParagraphHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.selectAll, this.selectAllHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.createParagraph, this.editParagraphHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.deleteParagraph, this.editParagraphHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.insertParagraph, this.insertParagraphHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.formatDocumentByPangu, this.formatDocumentByPanguHandler)
      appBus.$on(appEvents.NOTE_SHORTCUT_CALL.save, this.saveHandler)
      appBus.$on(appEvents.ECHO_EVENTS.commitInstance, this.updateEchoPlaceholderPayload)
      appBus.$on(appEvents.ECHO_EVENTS.openInstanceEditor, this.updateEchoPlaceholderPayload)
    })
  },
  beforeDestroy () {
    if (this.contentEditor && typeof this.contentEditor.destroy === 'function') {
      this.contentEditor.destroy()
    }
    if (typeof window !== 'undefined' && window.__memocastEchoChantHandlers) {
      delete window.__memocastEchoChantHandlers.lucky
    }
    appBus.$off(appEvents.PARAGRAPH_SHORTCUT_CALL)
    appBus.$off(appEvents.FORMAT_SHORTCUT_CALL)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.undo)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.redo)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.save)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.copyAsMarkdown)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.copyAsHtml)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.pasteAsPlainText)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.duplicate)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.selectAll)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.createParagraph)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.deleteParagraph)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.insertParagraph)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.formatDocumentByPangu)
    appBus.$off(appEvents.ECHO_EVENTS.commitInstance)
    appBus.$off(appEvents.ECHO_EVENTS.openInstanceEditor)
  },
  watch: {
    currentNote: function (currentData) {
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') {
        console.warn('[Muya watcher] ⚠️ contentEditor not ready, skipping')
        return
      }

      console.log(`\n[Muya watcher] ⚡ FIRED! type: ${typeof currentData}`)
      console.log(`[Muya watcher] Previous note: ${this.previousNoteInfo?.docGuid}, New note expected from store`)

      // ✅ 解析新格式：支持字符串和对象两种格式
      let markdownContent = ''
      let docGuid = null

      if (typeof currentData === 'string') {
        // 旧格式：直接是 markdown 字符串
        markdownContent = currentData || ''
        console.log(`[Muya watcher] 📄 String format, len=${markdownContent.length}`)
      } else if (currentData && typeof currentData === 'object') {
        // 新格式：包含 __markdown 和元数据的对象
        markdownContent = currentData.__markdown || ''
        docGuid = currentData.__docGuid || null

        console.log(`[Muya watcher] 📦 Object format:`)
        console.log(`[Muya watcher]   - markdown len=${markdownContent.length}`)
        console.log(`[Muya watcher]   - timestamp=${currentData.__timestamp}`)
        console.log(`[Muya watcher]   - docGuid=${docGuid}`)
        console.log(`[Muya watcher]   - isEmpty=${currentData.isEmpty}`)

        if (currentData.isEmpty) {
          console.log(`[Muya watcher] ℹ️ Content is empty, will show blank editor`)
        }
      } else {
        // 异常情况：既不是字符串也不是对象
        console.warn('[Muya watcher] ⚠️ Unexpected data type, clearing editor')
        markdownContent = ''
      }

      console.log(`[Muya watcher] Preview: ${JSON.stringify((markdownContent || '').substring(0, 120))}`)

      // ✅ 核心逻辑：加载内容到编辑器（即使是空字符串也要更新！）
      clearEditorHistory(this.contentEditor)
      try {
        this.contentEditor.focus()
        console.log(`[Muya watcher] 📝 Loading into editor: len=${markdownContent.length}`)
        const runeMigratedMarkdown = migrateLegacyRunePlaceholders(markdownContent, this.runeCards)
        const migratedMarkdown = migrateLegacyEchoPlaceholders(runeMigratedMarkdown, this.echoCards)

        // ✅ 强制设置内容（空字符串也是有效内容，会清空编辑器）
        this.contentEditor.setMarkdown(migratedMarkdown)
        if (migratedMarkdown !== markdownContent) {
          this.pendingSaveData = {
            markdown: migratedMarkdown,
            docGuid: docGuid || currentData?.info?.docGuid || this.$store.state.server.currentNote?.info?.docGuid,
            title: currentData?.info?.title || this.$store.state.server.currentNote?.info?.title,
            resources: currentData?.resources || this.$store.state.server.currentNote?.resources || [],
            timestamp: Date.now()
          }
          this.updateNoteState('changed')
        }

        this.firstTimeLoad = true
        this.updateContentsList(this.contentEditor.getTOC())

        // 清除旧的待保存数据（新笔记开始编辑）
        this.pendingSaveData = null

        console.log(`[Muya watcher] ✅ Done! Editor now has content (len=${markdownContent.length})\n`)

      } catch (e) {
        if (e.message.indexOf('Md2V') !== -1) return
        debugLogger.Error(e, e.message)
        console.error('[Muya watcher] ❌ Error loading content:', e)
      }

      // 在下一个 tick 更新 previousNoteInfo
      this.$nextTick(() => {
        const currentNote = this.$store.state.server.currentNote
        this.previousNoteInfo = currentNote?.info || null
        this.previousResources = currentNote?.resources || []
        console.log(`[Muya watcher] 📌 Updated previousNoteInfo to: ${currentNote?.info?.docGuid}`)
      })
    },
    theme: function (t) {
      attachThemeColor(t)
    },
    enablePreviewEditor: function (val) {
      document.querySelector('.ag-show-quick-insert-hint').setAttribute('contenteditable', val)
    },
    data: function ({ markdown }) {
      clearEditorHistory(this.contentEditor)
      this.contentEditor.setMarkdown(markdown)
      this.updateContentsList(this.contentEditor.getTOC())
    },
    runeCards: function (cards) {
      if (this.contentEditor && typeof this.contentEditor.refreshRuneCards === 'function') {
        this.contentEditor.refreshRuneCards(cards || [])
        this.$nextTick(() => {
          this.migrateCurrentNoteRunePlaceholders()
          if (this.contentEditor?.contentState?.stateRender?.renderRunes) {
            this.contentEditor.contentState.stateRender.renderRunes()
          }
        })
      }
    },
    echoCards: function () {
      this.$nextTick(() => {
        this.refreshEchoDefinitions()
        this.migrateCurrentNoteEchoPlaceholders()
        if (this.contentEditor?.contentState?.stateRender?.renderRunes) {
          this.contentEditor.contentState.stateRender.renderRunes()
        }
      })
    }
  }
}
</script>

<style scoped>
.editor-component {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  margin-right: 5px;
}
</style>

<style>
.ag-rune-placeholder-host {
  display: block;
  margin: 6px 0;
}

.ag-echo-placeholder-host,
.ag-echo-inline-host {
  display: inline;
  vertical-align: baseline;
  margin: 0 2px;
}

.ag-echo-anno-token {
  display: inline;
  vertical-align: baseline;
  cursor: pointer;
  user-select: none;
}

.ag-echo-inline-preview {
  display: inline;
  vertical-align: baseline;
}

.ag-rune-placeholder-card,
.ag-rune-vue-card,
.ag-echo-placeholder-card,
.ag-echo-vue-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 12px 14px;
  border-radius: 12px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}

.ag-rune-placeholder-card,
.ag-rune-vue-card {
  border: 1px solid rgba(126, 87, 194, 0.18);
  background: linear-gradient(180deg, rgba(126, 87, 194, 0.12), rgba(126, 87, 194, 0.06));
}

.ag-echo-placeholder-card,
.ag-echo-vue-card {
  flex-direction: column;
  align-items: stretch;
  border: 1px solid rgba(38, 166, 154, 0.2);
  background: linear-gradient(180deg, rgba(38, 166, 154, 0.12), rgba(38, 166, 154, 0.05));
}

.ag-echo-inline-preview.ag-echo-vue-card {
  display: inline;
  vertical-align: baseline;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
}


.ag-rune-placeholder-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  color: var(--rune-accent, #7E57C2);
  background: rgba(255, 255, 255, 0.72);
  border-radius: 10px;
}

.ag-rune-placeholder-icon-image {
  display: inline-block;
  width: 24px;
  height: 24px;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

.ag-rune-placeholder-icon-font {
  font-size: 22px;
  line-height: 1;
}

.ag-rune-placeholder-body {
  min-width: 0;
  flex: 1;
}

.ag-echo-placeholder-main {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.ag-echo-placeholder-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  color: var(--echo-accent, #26A69A);
  background: rgba(255, 255, 255, 0.72);
  border-radius: 10px;
}

.ag-echo-placeholder-body {
  min-width: 0;
  flex: 1;
}

.ag-echo-placeholder-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.ag-echo-placeholder-desc {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.78;
  word-break: break-word;
}

.ag-echo-placeholder-value-marker {
  display: inline-block;
  min-width: 4px;
  min-height: 14px;
  outline: none;
  caret-color: rgba(38, 166, 154, 0.9);
}

.ag-echo-placeholder-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.ag-echo-placeholder-textarea {
  width: 100%;
  min-height: 88px;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid rgba(38, 166, 154, 0.24);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.86);
  font: inherit;
  color: inherit;
  box-sizing: border-box;
}

.ag-echo-placeholder-actions {
  display: flex;
  justify-content: flex-end;
}

.ag-echo-placeholder-save {
  padding: 6px 12px;
  border: 0;
  border-radius: 8px;
  background: var(--echo-accent, #26A69A);
  color: #fff;
  cursor: pointer;
}

.ag-rune-placeholder-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: inherit;
}

.ag-rune-placeholder-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.72;
  word-break: break-word;
}

/* Echo block highlight styles - propagate highlight from echo tokens to parent blocks */
.ag-echo-highlight {
  background-color: rgba(38, 166, 154, 0.12);
  border-left: 3px solid rgba(38, 166, 154, 0.5);
  padding-left: 8px;
  margin-left: -8px;
  border-radius: 0 4px 4px 0;
  transition: background-color 0.2s ease;
}

.ag-echo-highlight.ag-paragraph,
.ag-echo-highlight.ag-li,
.ag-echo-highlight.ag-p,
.ag-echo-highlight.ag-span {
  background-color: rgba(38, 166, 154, 0.1);
}

.ag-echo-highlight.ag-h1,
.ag-echo-highlight.ag-h2,
.ag-echo-highlight.ag-h3,
.ag-echo-highlight.ag-h4,
.ag-echo-highlight.ag-h5,
.ag-echo-highlight.ag-h6 {
  background-color: rgba(38, 166, 154, 0.08);
}

/* Also highlight the echo token itself within highlighted blocks */
.ag-echo-highlight .ag-echo-anno-token,
.ag-echo-highlight.ag-echo-anno-token {
  background-color: rgba(38, 166, 154, 0.2);
  border-radius: 4px;
}
</style>
