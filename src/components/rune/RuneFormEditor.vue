<template>
  <div class='rune-form-editor-wrap'>
    <!-- 工具栏 -->
    <div class='row items-center justify-between q-mb-xs'>
      <div class='rune-form-label q-mb-none'>模板内容</div>
      <div class='row items-center no-wrap q-gutter-xs'>
        <category-picker
          v-model='selectedPresetKey'
          :option='categoryPickerOption'
          type='object'
          :show-all-levels='true'
          :show-child-count='true'
          placeholder='选择分类 / 模板'
          class='preset-template-picker'
          @change='onPresetPicked'
        />
        <div ref='cityPickerMount' class='rune-city-picker-mount'>
          <input
            id='rune-city-picker-input'
            readonly
            type='text'
            :placeholder='cityPickerPlaceholder'
          />
        </div>
        <q-btn
          flat
          dense
          no-caps
          size='sm'
          color='primary'
          icon='cloud_download'
          label='远端导入'
          @click='$emit("open-remote-import")'
        />
        <q-btn
          flat
          dense
          no-caps
          size='sm'
          color='primary'
          icon='refresh'
          label='重置'
          @click='resetTemplate'
        />
      </div>
    </div>

    <!-- Monaco 编辑器 -->
    <div
      ref='editorContainer'
      class='rune-monaco-editor'
      :style='monacoEditorStyle'
    />
  </div>
</template>

<script>
import * as monaco from 'monaco-editor'
import CategoryPicker from 'components/category/CategoryPickerV2'
import { RUNE_CATEGORIES } from 'src/utils/const/runeEchoCategoriesConst'
import { setupMonacoClipboard } from 'src/utils/monacoClipboardBridge'
import { createBlankTemplate, createInheritDemoTemplate } from './rune-templates.js'
import runeTemplateService from 'src/services/RuneTemplateService'

export default {
  name: 'RuneFormEditor',
  components: { CategoryPicker },
  props: {
    template: {
      type: String,
      default: ''
    },
    formData: {
      type: Object,
      required: true
    },
    visible: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      monacoInitTimer: null,
      monacoReady: false,
      monacoInitAttempt: 0,
      _monacoRo: null,
      _windowResizeHandler: null,
      monacoEditorHeight: 250,
      monacoEditor: null,
      _monacoClipboardDisposable: null,
      selectedPresetKey: null,
      categoryPickerTree: [],
      runeCategoryOptions: RUNE_CATEGORIES.map(c => ({ value: c.value, label: this.$t(c.i18nKey) })),
      // city-picker 状态
      cityPickerPlaceholder: '点击选择省/市/区',
      cityPickerReady: false,
      _cityPickerPollTimer: null
    }
  },
  computed: {
    monacoEditorStyle () {
      return { height: `${this.monacoEditorHeight}px` }
    },
    categoryPickerOption () {
      const groups = new Map()
      const i18nMap = {}
      for (const opt of (this.runeCategoryOptions || [])) {
        i18nMap[opt.value] = opt.label
      }
      for (const row of (this.categoryPickerTree || [])) {
        const key = (row && row.category_key) || 'general'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(row)
      }
      const tree = []
      for (const [key, items] of groups.entries()) {
        const children = items.map(item => ({
          key: 'tpl::' + item.id,
          title: item.name || item.id,
          desc: item.desc || '',
          _isCategory: false,
          _templateRow: item,
          children: []
        }))
        tree.push({
          key: 'cat::' + key,
          title: i18nMap[key] || key,
          _isCategory: true,
          _templateRow: null,
          children
        })
      }
      tree.sort((a, b) => String(a.title).localeCompare(String(b.title)))
      return {
        datas: tree,
        fieldNames: { key: 'key', title: 'title', children: 'children' },
        selectable: (node) => !!(node && node.value && node.value._isCategory === false)
      }
    }
  },
  watch: {
    visible (val) {
      if (val) {
        this.scheduleMonacoInit()
        this.loadTemplatePicker(true)
        this._scheduleDialogHeightInstall()
        this._scheduleCityPickerInit()
      } else {
        this.clearMonacoInitTimer()
        this.uninstallDialogHeightListener()
        this._destroyCityPicker()
      }
    },
    template (val) {
      if (this.monacoEditor && this.monacoReady && val !== this.monacoEditor.getValue()) {
        this.monacoEditor.setValue(val)
      }
    }
  },
  mounted () {
    this.scheduleMonacoInit()
    this._scheduleCityPickerInit()
    this.$nextTick(() => {
      this.$nextTick(() => {
        this.installDialogHeightListener()
      })
    })
  },
  beforeDestroy () {
    this.clearMonacoInitTimer()
    this.uninstallDialogHeightListener()
    if (this._monacoRo) {
      this._monacoRo.disconnect()
      this._monacoRo = null
    }
    if (this._dialogHeightPollTimer) {
      clearTimeout(this._dialogHeightPollTimer)
      this._dialogHeightPollTimer = null
    }
    this._destroyCityPicker()
    this.disposeMonaco()
  },
  methods: {
    // ==================== 模板相关 ====================
    resetTemplate () {
      const nextTemplate = createInheritDemoTemplate()
      this.$emit('update-template', nextTemplate)
      this.selectedPresetKey = null
      if (this.monacoEditor && this.monacoReady) {
        this.monacoEditor.setValue(nextTemplate)
      }
    },

    onPresetPicked (picked) {
      if (!picked) {
        this.selectedPresetKey = null
        return
      }
      this.selectedPresetKey = picked
      const raw = (picked && picked.value) || picked
      const row = raw && raw._templateRow
      if (!row) {
        return
      }
      const nextTemplate = row.template || createBlankTemplate()
      this.$emit('update-template', nextTemplate)
      if (row.name && !this.formData.name) {
        this.$emit('update-field', { name: row.name })
      }
      if (row.desc && !this.formData.desc) {
        this.$emit('update-field', { desc: row.desc })
      }
      if (row.category_key) {
        this.$emit('update-field', { category: row.category_key })
      }
      if (this.monacoEditor && this.monacoReady) {
        this.monacoEditor.setValue(nextTemplate)
        this.$nextTick(() => {
          if (this.monacoEditor) this.monacoEditor.focus()
        })
      }
    },

    async loadTemplatePicker (force = false) {
      try {
        const resolver = (key) => {
          const opt = (this.runeCategoryOptions || []).find(o => o.value === key)
          return opt ? opt.label : key
        }
        const grouped = await runeTemplateService.listGroupedByCategory(resolver, force)
        const flat = []
        for (const g of (grouped || [])) {
          for (const it of (g.items || [])) flat.push(it)
        }
        this.categoryPickerTree = flat
      } catch (e) {
        console.warn('[RuneFormEditor] loadTemplatePicker failed:', e && e.message)
        this.categoryPickerTree = []
      }
    },

    // ==================== Monaco 编辑器 ====================
    installDialogHeightListener () {
      this.uninstallDialogHeightListener()
      const dialogEl = this._resolveDialogElement()
      if (!dialogEl) return
      this.recomputeMonacoHeight()
      this._dialogRo = new ResizeObserver(() => {
        this.recomputeMonacoHeight()
      })
      this._dialogRo.observe(dialogEl)
      this._windowResizeHandler = () => {
        this.recomputeMonacoHeight()
      }
      window.addEventListener('resize', this._windowResizeHandler)
    },

    uninstallDialogHeightListener () {
      if (this._dialogRo) {
        this._dialogRo.disconnect()
        this._dialogRo = null
      }
      if (this._windowResizeHandler) {
        window.removeEventListener('resize', this._windowResizeHandler)
        this._windowResizeHandler = null
      }
    },

    _resolveDialogElement () {
      const ref = this.$parent && this.$parent.$refs && this.$parent.$refs.dialog
      if (!ref) return null
      const candidate = ref.$el || (ref.$refs && ref.$refs.content) || ref
      if (candidate && candidate.nodeType === 1) return candidate
      let node = candidate
      while (node && node.nodeType !== 1) node = node.parentNode
      return node || null
    },

    _scheduleDialogHeightInstall () {
      if (this._dialogHeightPollTimer) {
        clearTimeout(this._dialogHeightPollTimer)
        this._dialogHeightPollTimer = null
      }
      let attempt = 0
      const maxAttempts = 20
      const tryInstall = () => {
        attempt += 1
        if (!this.visible) return
        const el = this._resolveDialogElement()
        if (el && el.clientHeight > 0) {
          this.installDialogHeightListener()
          return
        }
        if (attempt >= maxAttempts) {
          this.installDialogHeightListener()
          return
        }
        this._dialogHeightPollTimer = setTimeout(tryInstall, 50)
      }
      this._dialogHeightPollTimer = setTimeout(tryInstall, 0)
    },

    recomputeMonacoHeight () {
      const dialogEl = this._resolveDialogElement()
      if (!dialogEl || !dialogEl.clientHeight) return
      const next = Math.max(120, dialogEl.clientHeight - 300)
      if (next !== this.monacoEditorHeight) {
        this.monacoEditorHeight = next
      }
    },

    clearMonacoInitTimer () {
      if (this.monacoInitTimer) {
        clearTimeout(this.monacoInitTimer)
        this.monacoInitTimer = null
      }
    },

    scheduleMonacoInit () {
      this.clearMonacoInitTimer()
      this.monacoInitTimer = setTimeout(() => {
        this.monacoInitTimer = null
        this._initMonacoViaObserver()
      }, 120)
    },

    _initMonacoViaObserver () {
      if (!this.visible) return
      const container = this.$refs.editorContainer
      if (!container) return
      this._monacoRo && this._monacoRo.disconnect()
      this._monacoRo = new ResizeObserver(() => {
        this.$nextTick(() => {
          const c = this.$refs.editorContainer
          if (c && c.clientWidth > 40 && c.clientHeight > 120) {
            this._monacoRo.disconnect()
            this._monacoRo = null
            this._createMonacoEditor(this.template || createInheritDemoTemplate())
          }
        })
      })
      this._monacoRo.observe(container)
      if (this._monacoRo.checkingTimeout) {
        clearTimeout(this._monacoRo.checkingTimeout)
      }
      this._monacoRo.checkingTimeout = setTimeout(() => {
        if (this._monacoRo) {
          this._monacoRo.disconnect()
          this._monacoRo = null
          this.$nextTick(() => this._createMonacoEditor(this.template || createInheritDemoTemplate()))
        }
      }, 1200)
    },

    _createMonacoEditor (template) {
      if (!this.$refs.editorContainer) return
      this.disposeMonaco()

      const isDark = document.body.classList.contains('body--dark')
      const editorBg = isDark ? '#34383e' : '#ffffff'

      monaco.editor.defineTheme('Memocast-Dark', {
        base: isDark ? 'vs-dark' : 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': editorBg,
          'editorCursor.foreground': '#FFCC00'
        }
      })

      const container = this.$refs.editorContainer
      this.monacoEditor = monaco.editor.create(container, {
        value: template,
        language: 'html',
        theme: 'Memocast-Dark',
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        renderLineHighlight: 'line',
        automaticLayout: true,
        wordWrap: 'on',
        readOnly: false,
        domReadOnly: false,
        fontFamily: 'JetBrains Mono, Fira Code, Monaco, PingFang SC, Hiragino Sans GB, 微软雅黑, Arial, sans-serif'
      })

      this._monacoClipboardDisposable = setupMonacoClipboard(this.monacoEditor, monaco)

      this.monacoEditor.onDidChangeModelContent(() => {
        if (!this.monacoEditor) return
        this.$emit('update-template', this.monacoEditor.getValue())
      })

      this.monacoReady = true
      this.monacoEditor.updateOptions({ readOnly: false, domReadOnly: false })
      this.$nextTick(() => {
        if (!this.monacoEditor) return
        this.monacoEditor.focus()
      })
    },

    disposeMonaco () {
      this.monacoReady = false
      if (this._monacoClipboardDisposable && typeof this._monacoClipboardDisposable.dispose === 'function') {
        try { this._monacoClipboardDisposable.dispose() } catch (_) { /* noop */ }
      }
      this._monacoClipboardDisposable = null
      if (this.monacoEditor) {
        this.monacoEditor.dispose()
        this.monacoEditor = null
      }
    },

    // ==================== City Picker ====================
    _scheduleCityPickerInit () {
      if (this.cityPickerReady) {
        this._refreshCityPickerValue()
        return
      }
      if (this._cityPickerPollTimer) {
        clearTimeout(this._cityPickerPollTimer)
        this._cityPickerPollTimer = null
      }
      let attempt = 0
      let selfHealAttempted = false
      const tryInit = () => {
        attempt += 1
        if (!this.visible) {
          this._cityPickerPollTimer = null
          return
        }
        const inputEl = this._findCityPickerInput()
        const $ = (typeof window !== 'undefined' && window.$) || (typeof window !== 'undefined' && window.jQuery)
        const hasCitypicker = !!(($ && $.fn && $.fn.citypicker) || (typeof window !== 'undefined' && window.citypicker))
        if (inputEl && $ && hasCitypicker) {
          this._cityPickerPollTimer = null
          this._initCityPicker(inputEl, $)
          return
        }
        if (!selfHealAttempted && window.ChineseDistricts && this._hasCityPickerJsScriptTag()) {
          selfHealAttempted = true
          this._selfHealCityPickerScript()
        }
        this._cityPickerPollTimer = setTimeout(tryInit, 80)
      }
      this._cityPickerPollTimer = setTimeout(tryInit, 0)
    },

    _hasCityPickerJsScriptTag () {
      const scripts = document.querySelectorAll('head script[data-cdn-name]')
      for (const el of scripts) {
        const name = el.getAttribute('data-cdn-name') || ''
        const src = el.src || ''
        if (/city-picker\.js/i.test(src) || /city[\s_-]?picker/i.test(name)) {
          if (/data/i.test(name) || /city-picker\.data/i.test(src)) continue
          return el
        }
      }
      return null
    },

    _selfHealCityPickerScript () {
      const badScript = this._hasCityPickerJsScriptTag()
      if (!badScript) return
      const url = badScript.src
      try {
        badScript.parentNode && badScript.parentNode.removeChild(badScript)
      } catch (e) { /* noop */ }
      const fresh = document.createElement('script')
      fresh.src = url
      fresh.setAttribute('data-cdn-name', 'city-picker JS')
      fresh.setAttribute('data-self-heal', 'rune-form-editor')
      fresh.onload = () => console.log('[RuneFormEditor] 自愈后的 city-picker.js 已加载')
      fresh.onerror = (e) => console.warn('[RuneFormEditor] 自愈后的 city-picker.js 加载失败')
      document.head.appendChild(fresh)
    },

    _findCityPickerInput () {
      if (this.$refs.cityPickerMount) {
        const inner = this.$refs.cityPickerMount.querySelector('input')
        if (inner) return inner
      }
      const fallback = document.getElementById('rune-city-picker-input')
      return fallback || null
    },

    _initCityPicker (inputEl, $) {
      const container = inputEl.parentElement
      if (container && getComputedStyle(container).position === 'static') {
        container.style.position = 'relative'
      }
      try {
        if ($ && $.fn && $.fn.citypicker && $(inputEl).data && $(inputEl).data('citypicker')) {
          $(inputEl).citypicker('destroy')
        }
      } catch (_) { /* noop */ }
      $(inputEl).citypicker({
        province: '江苏省',
        city: '常州市',
        district: '溧阳市'
      })
      this.cityPickerReady = true
    },

    _refreshCityPickerValue () {
      const inputEl = this._findCityPickerInput()
      const $ = window.$ || window.jQuery
      if (!inputEl || !$ || !$.fn || !$.fn.citypicker) return
      try {
        const v = $(inputEl).data('citypicker') ? $(inputEl).citypicker('getValue') : null
        if (!v || !v.province) {
          $(inputEl).citypicker('reset')
        }
      } catch (_) { /* noop */ }
    },

    _destroyCityPicker () {
      if (this._cityPickerPollTimer) {
        clearTimeout(this._cityPickerPollTimer)
        this._cityPickerPollTimer = null
      }
      const inputEl = this._findCityPickerInput()
      const $ = window.$ || window.jQuery
      if (inputEl && $ && $.fn && $.fn.citypicker) {
        try {
          $(inputEl).citypicker('destroy')
        } catch (_) { /* noop */ }
      }
      this.cityPickerReady = false
    },

    // ==================== 公开方法 ====================
    isMonacoReady () {
      return this.monacoReady
    },

    getTemplate () {
      if (this.monacoEditor) {
        return this.monacoEditor.getValue()
      }
      return this.template
    }
  }
}
</script>

<style lang="scss" scoped>
.rune-form-editor-wrap {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.rune-form-editor-wrap > .row.items-center.justify-between {
  flex: 0 0 auto;
}

.rune-form-label {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
  font-weight: 500;
}

.rune-monaco-editor {
  flex: 0 0 auto;
  width: 100%;
  height: calc(100% - 350px);
  min-height: 0;
  border: 1px solid #c0c0c0;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 4px;
  position: relative;
}

.preset-template-picker {
  min-width: 180px;
  max-width: 240px;
}

.rune-city-picker-mount {
  flex: 0 0 auto;
  position: relative;
}

.rune-city-picker-mount input {
  width: 170px;
  height: 28px;
  font-size: 12px;
  padding: 0 8px;
  border-radius: 4px;
  border: 1px solid #c0c0c0;
  background: #fff;
  color: rgba(0, 0, 0, 0.85);
  outline: none;
  cursor: pointer;
}

.rune-city-picker-mount input:hover {
  border-color: #7E57C2;
}

.rune-city-picker-mount input:focus {
  border-color: #7E57C2;
  box-shadow: 0 0 0 2px rgba(126, 87, 194, 0.2);
}

.body--dark .rune-city-picker-mount input {
  background: #34383e;
  border-color: #4a4a4a;
  color: rgba(255, 255, 255, 0.85);
}

.body--dark .rune-monaco-editor {
  border-color: #434343;
}

/* Dark mode */
.body--dark .rune-form-label {
  color: rgba(255, 255, 255, 0.55);
}
</style>
