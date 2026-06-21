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
import { decodeEchoPayload, encodeEchoPayload, createEchoPlaceholderPayload, parseEchoAttrs } from './echo/EchoRuntime'

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

const createEchoPlaceholderMarkup = (echo = {}) => {
  const echoName = String(echo?.name || '回响').trim() || '回响'
  const payload = createEchoPlaceholderPayload(echo)
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
    return createEchoPlaceholderMarkup(echo)
  }).replace(CURRENT_ECHO_PLACEHOLDER_RE, (match, rawEchoName = '', attrsRaw = '', promptRaw = '') => {
    const echoName = String(rawEchoName || '').trim()
    const attrs = parseEchoAttrs(attrsRaw)
    if (attrs.id) return match
    const generatedEchoId = createEchoInstanceId()
    const matchedEcho = echoMap.get(echoName)
    const generatedDefinitionId = String(attrs.definitionId || matchedEcho?.id || '').trim()
    const upgradedPayload = encodeEchoPayload({
      prompt: String(promptRaw || attrs.value || ''),
      attrs: {
        ...attrs,
        id: generatedEchoId,
        definitionId: generatedDefinitionId,
        value: String(attrs.value || promptRaw || '')
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
      }
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

    return h(this.rendererCtor, {
      props: {
        runeId: this.runeId,
        nodeId: this.nodeId,
        rune: this.rune,
        value: this.value
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
    },
    placeholder: {
      type: String,
      default: '点击编辑实例内容...'
    }
  },
  data () {
    return {
      editValue: ''
    }
  },
  mounted () {
    console.log('[EchoPreviewRenderer] mounted', {
      nodeId: this.nodeId,
      echoId: this.echoId,
      echoName: this.echo?.name || '',
      value: this.value,
      connected: !!this.$el?.isConnected,
      outerHtmlPreview: String(this.$el?.outerHTML || '').substring(0, 200)
    })
  },
  updated () {
    console.log('[EchoPreviewRenderer] updated', {
      nodeId: this.nodeId,
      echoId: this.echoId,
      echoName: this.echo?.name || '',
      value: this.value,
      editValue: this.editValue,
      connected: !!this.$el?.isConnected
    })
  },
  beforeDestroy () {
    console.log('[EchoPreviewRenderer] beforeDestroy', {
      nodeId: this.nodeId,
      echoId: this.echoId,
      echoName: this.echo?.name || '',
      connected: !!this.$el?.isConnected
    })
  },
  computed: {
    renderModel () {
      return this.$root?.echoRegistry?.render?.({
        echoName: this.echo?.name || '',
        definitionId: this.echo?.id || '',
        attrsParsed: {
          definitionId: this.echo?.id || '',
          value: this.value || ''
        },
        prompt: this.value || ''
      }, this.echo) || {
        title: this.echo?.name || '回响',
        description: this.echo?.desc || '',
        prompt: this.value || ''
      }
    },
    inlineStyle () {
      return {
        '--echo-accent': this.renderModel.color || this.echo?.color || '#26A69A'
      }
    },
    displaySummary () {
      const raw = this.renderModel.prompt || this.renderModel.description || this.value || ''
      return String(raw || '').replace(/\s+/g, ' ').trim()
    },
    resolvedValue () {
      return typeof this.value === 'string' ? this.value : ''
    },
    displayTitle () {
      return this.renderModel.title || this.echo?.name || '回响'
    }
  },
  watch: {
    value: {
      immediate: true,
      handler (nextValue) {
        this.editValue = typeof nextValue === 'string' ? nextValue : ''
      }
    }
  },
  methods: {
    commitEdit () {
      const nextValue = typeof this.editValue === 'string' ? this.editValue : ''
      if (nextValue === this.resolvedValue) return
      if (typeof this.onCommit === 'function') {
        this.onCommit({
          echoId: this.echoId,
          nodeId: this.nodeId,
          echoName: this.echo?.name || '',
          value: nextValue,
          payload: encodeEchoPayload({
            prompt: nextValue,
            attrs: {
              id: this.echoId || '',
              definitionId: this.echo?.id || '',
              value: nextValue
            }
          }),
          mode: 'update-instance'
        })
      }
    },
    handleEditKeydown (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        this.commitEdit()
      }
    },
    handleEditBlur () {
      this.commitEdit()
    },
    openDefinitionEditor (event) {
      event.preventDefault()
      event.stopPropagation()
      if (typeof this.onCommit === 'function') {
        this.onCommit({
          echoId: this.echoId,
          nodeId: this.nodeId,
          echoName: this.echo?.name || '',
          payload: encodeEchoPayload({
            prompt: this.editValue,
            attrs: {
              id: this.echoId || '',
              definitionId: this.echo?.id || '',
              value: this.editValue
            }
          }),
          mode: 'open-definition'
        })
      }
    }
  },
  render (h) {
    const model = this.renderModel || {}
    const iconText = model.icon || 'graphic_eq'
    const title = this.displayTitle

    return h('span', {
      staticClass: 'ag-echo-inline-preview ag-echo-vue-card ag-echo-inline-always',
      style: this.inlineStyle,
      attrs: {
        contenteditable: 'false',
        tabindex: '-1'
      }
    }, [
      h('span', {
        staticClass: 'ag-echo-inline-chip ag-echo-inline-chip--static',
        attrs: {
          title
        }
      }, [
        h('span', { staticClass: 'ag-echo-inline-chip__icon' }, [
          h('i', { staticClass: 'material-icons ag-echo-placeholder-icon-font' }, [iconText])
        ]),
        h('span', { staticClass: 'ag-echo-inline-chip__body' }, [
          h('span', { staticClass: 'ag-echo-inline-chip__title' }, [title]),
          h('el-input', {
            staticClass: 'ag-echo-inline-editor ag-echo-inline-editor--always',
            props: {
              type: 'textarea',
              rows: 2,
              autosize: { minRows: 2, maxRows: 6 },
              value: this.editValue,
              placeholder: this.placeholder,
              size: 'mini'
            },
            on: {
              input: value => {
                this.editValue = value
              },
              keydown: this.handleEditKeydown,
              blur: this.handleEditBlur
            },
            nativeOn: {
              keydown: this.handleEditKeydown,
              blur: this.handleEditBlur,
              mousedown: event => {
                event.stopPropagation()
              }
            },
            ref: 'echoInput'
          })
        ])
      ]),
      h('button', {
        staticClass: 'ag-echo-inline-chip ag-echo-inline-chip--ghost',
        attrs: {
          type: 'button',
          title: '编辑回响定义'
        },
        on: {
          click: this.openDefinitionEditor,
          mousedown: event => {
            event.preventDefault()
          }
        }
      }, [
        h('span', { staticClass: 'ag-echo-inline-chip__icon' }, [
          h('i', { staticClass: 'material-icons ag-echo-placeholder-icon-font' }, ['settings'])
        ])
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
    refreshEchoDefinitions () {
      this.echoRegistry.refresh(this.echoCards || [])
      if (this.contentEditor && this.contentEditor.options) {
        this.contentEditor.options.echoRegistry = this.echoRegistry
        this.contentEditor.options.echoCards = this.echoCards || []
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
    getValue: function () {
      return this.contentEditor?.getMarkdown()
    },
    // ✅ 新增：主动捕获当前编辑器内容（供外部调用，如切换笔记前）
    captureCurrentContent: function () {
      if (!this.contentEditor) return null
      
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
      const { container } = this.contentEditor = new Muya(this.$refs.muya, {
        quickInsertProvider: () => {
          const runeItems = (this.runeCards || [])
            .filter(rune => rune && (rune.name || rune.text || rune.label))
            .map(rune => ({
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
                insertContent: rune.template || ''
              }
            }))
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
  display: inline-flex;
  vertical-align: middle;
  margin: 0 4px;
  max-width: min(100%, 420px);
}

.ag-echo-anno-token {
  display: inline-flex;
  vertical-align: middle;
  margin: 0 4px;
  padding: 2px 8px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(38, 166, 154, 0.15), rgba(38, 166, 154, 0.08));
  border: 1px solid rgba(38, 166, 154, 0.25);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.ag-echo-anno-token:hover {
  background: linear-gradient(135deg, rgba(38, 166, 154, 0.25), rgba(38, 166, 154, 0.15));
  border-color: rgba(38, 166, 154, 0.45);
  box-shadow: 0 1px 4px rgba(38, 166, 154, 0.2);
}

.ag-echo-placeholder-marker {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ag-echo-anno-icon {
  font-size: 13px;
  opacity: 0.75;
}

.ag-echo-anno-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(38, 166, 154, 0.95);
  white-space: nowrap;
}

.ag-echo-anno-value {
  font-size: 12px;
  color: rgba(38, 166, 154, 0.7);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ag-echo-inline-preview {
  display: inline-flex;
  vertical-align: middle;
  max-width: min(100%, 420px);
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
  display: inline-flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  min-height: 0;
  max-width: min(100%, 420px);
  padding: 6px 8px;
  border-radius: 10px;
  line-height: 1.4;
}

.ag-echo-inline-preview .ag-echo-inline-chip--static {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.ag-echo-inline-preview .ag-echo-inline-chip__body {
  display: inline-flex;
  flex-direction: column;
  min-width: 0;
}

.ag-echo-inline-chip--ghost {
  opacity: 0.45;
  padding: 0 6px !important;
  min-width: unset !important;
  flex-shrink: 0;
  border: 1px solid rgba(38, 166, 154, 0.25);
  background: rgba(38, 166, 154, 0.08);
}

.ag-echo-inline-chip--ghost:hover {
  opacity: 1;
  background: rgba(38, 166, 154, 0.18);
}

.ag-echo-inline-chip--empty {
  border-style: dashed;
}

.ag-echo-inline-chip__desc--placeholder {
  opacity: 0.62;
  font-style: italic;
}

.ag-echo-inline-editor {
  width: 100%;
  min-height: 60px;
  resize: vertical;
  padding: 8px 10px;
  border: 1px solid rgba(38, 166, 154, 0.35);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  font: inherit;
  color: inherit;
  box-sizing: border-box;
  font-size: 13px;
  line-height: 1.5;
}

.ag-echo-inline-editor--always {
  display: inline-flex;
  width: min(280px, 100%);
  min-width: 160px;
  vertical-align: top;
}

.ag-echo-inline-preview .el-textarea,
.ag-echo-inline-preview .el-textarea__inner {
  width: 100%;
}

.ag-echo-inline-preview .el-textarea__inner {
  min-height: 56px !important;
  line-height: 1.5;
}

.ag-echo-inline-editing {
  padding: 10px 12px;
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

.ag-echo-placeholder-host .ag-echo-placeholder-card,
.ag-echo-placeholder-card {
  min-width: 50px;
  min-height: 20px;
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
</style>
