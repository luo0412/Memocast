<template>
  <q-dialog
    ref='dialog'
    transition-show='fade'
    transition-hide='fade'
    :value='value'
    @input='v => $emit("input", v)'
    :persistent='false'
  >
    <q-card class='echo-form-card'>
      <q-toolbar class='echo-form-toolbar'>
        <q-icon name='graphic_eq' color='teal-5' size='1.5em' />
        <q-toolbar-title>
          <span class='text-weight-bold non-selectable'>
            {{ isEditing ? $t('echoCardEdit') : $t('echoCardAdd') }}
          </span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='echo-form-body'>
        <div class='echo-form-content'>
          <div class='echo-form-fields'>
            <div class='echo-form-field'>
              <div class='echo-form-label'>{{ $t('echoCardName') }}</div>
              <q-input
                v-model='form.name'
                dense
                outlined
                :placeholder="$t('echoCardName')"
                class='echo-form-input echo-form-input--compact'
              />
            </div>

            <div class='echo-form-field echo-form-field--desc'>
              <div class='echo-form-label'>{{ $t('echoCardDesc') }}</div>
              <q-input
                v-model='form.desc'
                dense
                outlined
                type='textarea'
                autogrow
                :placeholder="$t('echoCardDesc')"
                class='echo-form-input echo-form-input--compact'
              />
            </div>

            <div class='echo-form-field echo-form-field--tight'>
              <div class='echo-form-label'>分类</div>
              <q-select
                v-model='form.category'
                dense
                outlined
                :options='echoCategoryOptions'
                option-label='label'
                option-value='value'
                emit-value
                map-options
                :disable='isBuiltin'
                class='echo-form-input echo-form-input--compact'
              >
                <template v-slot:selected-item='scope'>
                  <span>{{ scope.opt.label }}</span>
                </template>
                <template v-slot:option='scope'>
                  <q-item v-bind='scope.itemProps' v-on='scope.itemEvents'>
                    <q-item-section>
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>

            <div class='echo-form-field echo-form-field--tight'>
              <div class='echo-form-label'>图标</div>
              <q-select
                v-model='form.icon'
                dense
                outlined
                :options='iconOptions'
                option-label='label'
                option-value='value'
                emit-value
                map-options
                class='echo-form-input echo-form-input--compact'
              >
                <template v-slot:selected-item='scope'>
                  <div class='row items-center'>
                    <q-icon :name='scope.opt.value' size='1em' class='q-mr-xs' />
                    <span>{{ scope.opt.label }}</span>
                  </div>
                </template>
                <template v-slot:option='scope'>
                  <q-item v-bind='scope.itemProps' v-on='scope.itemEvents'>
                    <q-item-section avatar>
                      <q-icon :name='scope.opt.value' />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>

            <div class='echo-form-field echo-form-field--tight'>
              <div class='echo-form-label'>颜色</div>
              <div class='color-row'>
                <div
                  v-for='c in colorOptions'
                  :key='c.value'
                  class='color-dot'
                  :class="{ selected: form.color === c.value }"
                  :style='{ background: c.value }'
                  @click='form.color = c.value'
                />
              </div>
            </div>

            <div class='echo-form-field echo-form-field--help'>
              <div class='echo-form-label'>注解语法</div>
              <div class='echo-form-help'>
                <div><code>@{{ form.name || '回响名' }}{}()</code></div>
                <div class='echo-form-help__desc'>
                  attrs 会作为 <code>attrs</code> 注入，圆括号里的内容会作为 <code>prompt</code> 注入。
                </div>
              </div>
            </div>
          </div>

          <div class='echo-form-editor-wrap'>
            <div class='row items-center justify-between q-mb-xs'>
              <div class='echo-form-label q-mb-none'>Anno 源码</div>
              <q-btn flat dense no-caps size='sm' color='teal-5' icon='refresh' label='重置模板' @click='resetTemplate' />
            </div>
            <div ref='editorContainer' class='echo-monaco-editor' />
            <div class='echo-form-tip q-mt-sm'>
              导出默认对象，支持 <code>render(node, ancestors)</code> 和 <code>afterRender(node, domElement, ancestors)</code>。可通过 <code>node.attributes</code> 访问属性，通过 <code>domElement.nextElementSibling</code> 修改相邻元素。
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align='right' class='echo-form-footer'>
        <q-btn flat dense no-caps :label="$t('cancel')" @click='dialog && dialog.hide()' />
        <q-btn flat dense no-caps color='primary' :label="$t('ok')" @click='submit' />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="scss" scoped>
.echo-form-card {
  min-width: 680px;
  max-width: 88vw;
  width: 900px;
  height: 80vh;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.echo-form-toolbar {
  flex: 0 0 auto;
}

.echo-form-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 16px;
}

.echo-form-content {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  gap: 14px;
}

.echo-form-fields {
  flex: 0 0 240px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-right: 2px;
}

.echo-form-editor-wrap {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.echo-form-field {
  margin-bottom: 12px;
}

.echo-form-field:last-child {
  margin-bottom: 0;
}

.echo-form-field--desc :deep(textarea) {
  min-height: 72px !important;
}

.echo-form-field--tight {
  margin-bottom: 10px;
}

.echo-form-label {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
  margin-bottom: 4px;
  font-weight: 500;
  line-height: 1.2;
}

.echo-form-input {
  width: 100%;
}

.echo-form-input--compact :deep(.q-field__control) {
  min-height: 36px;
}

.echo-form-input--compact :deep(.q-field__native),
.echo-form-input--compact :deep(.q-field__input) {
  font-size: 13px;
}

.color-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.color-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.15s, border-color 0.15s;
}

.color-dot:hover {
  transform: scale(1.12);
}

.color-dot.selected {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
}

.echo-form-help {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(38, 166, 154, 0.12);
  border: 1px solid rgba(38, 166, 154, 0.28);
  color: rgba(0, 0, 0, 0.75);
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
}

.echo-form-help code,
.echo-form-tip code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(0, 0, 0, 0.08);
  padding: 1px 4px;
  border-radius: 4px;
}

.echo-form-help__desc {
  margin-top: 6px;
  color: rgba(0, 0, 0, 0.6);
}

.echo-monaco-editor {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  border: 1px solid #c0c0c0;
  border-radius: 4px;
  overflow: hidden;
}

.body--dark .echo-monaco-editor {
  border-color: #434343;
}

.echo-form-tip {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  line-height: 1.5;
}

.echo-form-footer {
  flex: 0 0 auto;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.03);
}

/* Dark mode overrides */
.body--dark .echo-form-label {
  color: rgba(255, 255, 255, 0.55);
}

.body--dark .echo-form-help {
  color: rgba(255, 255, 255, 0.88);
}

.body--dark .echo-form-help code,
.body--dark .echo-form-tip code {
  background: rgba(255, 255, 255, 0.08);
}

.body--dark .echo-form-help__desc {
  color: rgba(255, 255, 255, 0.72);
}

.body--dark .echo-form-tip {
  color: rgba(255, 255, 255, 0.62);
}

.body--dark .echo-form-footer {
  border-top-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
}

.body--dark .color-dot.selected {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
}

@media (max-width: 760px) {
  .echo-form-card {
    width: 96vw;
    min-width: auto;
    height: 88vh;
  }

  .echo-form-content {
    flex-direction: column;
  }

  .echo-form-fields {
    flex: 0 0 auto;
  }

  .echo-monaco-editor {
    min-height: 320px;
  }
}
</style>

<script>
import * as monaco from 'monaco-editor'
import { v4 as uuidv4 } from 'uuid'
import { createDefaultEchoAnnoSource } from 'components/ui/editor/echo/EchoRuntime'
import { ECHO_CATEGORIES, DEFAULT_ECHO_CATEGORY, getEchoCategoryValue } from 'src/constants/runeEchoCategories'
import { setupMonacoClipboard } from 'src/utils/monacoClipboardBridge'

const DEFAULT_ECHO_ICON = 'graphic_eq'
const DEFAULT_ECHO_COLOR = '#26A69A'
const DEFAULT_RENDER_TYPE = 'anno'

const createUuid = () => uuidv4()

export default {
  name: 'EchoFormDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    echo: {
      type: Object,
      default: null
    },
    defaultCategory: {
      type: String,
      default: ''
    }
  },
  data () {
    return {
      dialog: null,
      monacoInitTimer: null,
      monacoReady: false,
      _monacoRo: null,
      monacoEditor: null,
      form: {
        id: '',
        name: '',
        desc: '',
        color: DEFAULT_ECHO_COLOR,
        icon: DEFAULT_ECHO_ICON,
        anno_source: createDefaultEchoAnnoSource(),
        render_type: DEFAULT_RENDER_TYPE,
        category: DEFAULT_ECHO_CATEGORY
      },
      iconOptions: [
        { label: '回响', value: 'graphic_eq' },
        { label: '高亮', value: 'auto_fix_high' },
        { label: '提示', value: 'campaign' },
        { label: '灵感', value: 'lightbulb' },
        { label: '波纹', value: 'waves' },
        { label: '星光', value: 'stars' },
        { label: '书签', value: 'bookmark' },
        { label: '标注', value: 'edit_note' }
      ],
      echoCategoryOptions: ECHO_CATEGORIES.map(c => ({ value: c.value, label: this.$t(c.i18nKey) })),
      colorOptions: [
        { value: '#26A69A' },
        { value: '#5C6BC0' },
        { value: '#EC407A' },
        { value: '#FF7043' },
        { value: '#8E24AA' },
        { value: '#42A5F5' },
        { value: '#9CCC65' },
        { value: '#FFA726' }
      ]
    }
  },
  computed: {
    isEditing () {
      return !!this.echo
    },
    isBuiltin () {
      return Boolean(this.echo && this.echo.isBuiltin)
    }
  },
  watch: {
    value (val) {
      if (val) {
        this.scheduleMonacoInit()
      } else {
        this.clearMonacoInitTimer()
      }
    },
    'form.name': function (val, oldVal) {
      if (!this.monacoEditor || !this.monacoReady) return
      const current = this.monacoEditor.getValue()
      const oldLabel = String(oldVal || '').trim()
      const nextLabel = String(val || '').trim() || '回响'
      if (!oldLabel) return
      const quotedOld = `'${oldLabel.replace(/'/g, "\\'")}'`
      const quotedNext = `'${nextLabel.replace(/'/g, "\\'")}'`
      const nextValue = current
        .replace(`name: ${quotedOld}`, `name: ${quotedNext}`)
        .replace(`title = attrs.title || context.echo?.name || ${quotedOld}`, `title = attrs.title || context.echo?.name || ${quotedNext}`)
      if (nextValue !== current) {
        this.monacoEditor.setValue(nextValue)
      }
    },
    echo: {
      immediate: true,
      handler (val) {
        if (val) {
          const annoSource = val.anno_source || val.template || createDefaultEchoAnnoSource(val.name)
          // 内置回响永远归属 builtin 分类，不允许通过 UI 改
          const category = val.isBuiltin ? 'builtin' : getEchoCategoryValue(val.category)
          this.form = {
            id: val.id,
            name: val.name || '',
            desc: val.desc || '',
            color: val.color || DEFAULT_ECHO_COLOR,
            icon: val.icon || DEFAULT_ECHO_ICON,
            anno_source: annoSource,
            render_type: val.render_type || DEFAULT_RENDER_TYPE,
            category,
            isBuiltin: Boolean(val.isBuiltin),
            created_at: val.created_at,
            updated_at: val.updated_at
          }
          if (this.monacoEditor && this.monacoReady && this.monacoEditor.getValue() !== annoSource) {
            this.monacoEditor.setValue(annoSource)
          }
        } else {
          this.form = {
            id: createUuid(),
            name: '',
            desc: '',
            color: DEFAULT_ECHO_COLOR,
            icon: DEFAULT_ECHO_ICON,
            anno_source: createDefaultEchoAnnoSource(),
            render_type: DEFAULT_RENDER_TYPE,
            category: this.defaultCategory || DEFAULT_ECHO_CATEGORY,
            isBuiltin: false
          }
          if (this.monacoEditor && this.monacoReady) {
            this.monacoEditor.setValue(this.form.anno_source)
          }
        }
      }
    }
  },
  mounted () {
    this.dialog = this.$refs.dialog
    this.scheduleMonacoInit()
  },
  beforeDestroy () {
    this.clearMonacoInitTimer()
    if (this._monacoRo) {
      this._monacoRo.disconnect()
      this._monacoRo = null
    }
    this.disposeMonaco()
  },
  methods: {
    clearMonacoInitTimer () {
      if (this.monacoInitTimer) {
        clearTimeout(this.monacoInitTimer)
        this.monacoInitTimer = null
      }
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
    scheduleMonacoInit () {
      this.clearMonacoInitTimer()
      this.monacoInitTimer = setTimeout(() => {
        this.monacoInitTimer = null
        this.initMonaco()
      }, 120)
    },
    initMonaco () {
      if (!this.value) return
      const container = this.$refs.editorContainer
      if (!container) return
      this._monacoRo && this._monacoRo.disconnect()
      this._monacoRo = new ResizeObserver(() => {
        this.$nextTick(() => {
          const c = this.$refs.editorContainer
          if (c && c.clientWidth > 40 && c.clientHeight > 120) {
            this._monacoRo.disconnect()
            this._monacoRo = null
            this.createMonacoEditor(this.form.anno_source || createDefaultEchoAnnoSource(this.form.name))
          }
        })
      })
      this._monacoRo.observe(container)
      this._monacoRo.checkingTimeout && clearTimeout(this._monacoRo.checkingTimeout)
      this._monacoRo.checkingTimeout = setTimeout(() => {
        if (this._monacoRo) {
          this._monacoRo.disconnect()
          this._monacoRo = null
          this.$nextTick(() => this.createMonacoEditor(this.form.anno_source || createDefaultEchoAnnoSource(this.form.name)))
        }
      }, 1200)
    },
    createMonacoEditor (source) {
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
          'editorCursor.foreground': '#26A69A'
        }
      })

      this.monacoEditor = monaco.editor.create(this.$refs.editorContainer, {
        value: source,
        language: 'javascript',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineHeight: 20,
        tabSize: 2,
        theme: 'Memocast-Dark'
      })
      this._setupMonacoClipboard()
      this.monacoReady = true
      this.monacoEditor.onDidChangeModelContent(() => {
        this.form.anno_source = this.monacoEditor.getValue()
      })
    },
    _setupMonacoClipboard () {
      this._monacoClipboardDisposable = setupMonacoClipboard(this.monacoEditor, monaco)
    },
    resetTemplate () {
      const nextSource = createDefaultEchoAnnoSource(this.form.name || '回响')
      this.form.anno_source = nextSource
      if (this.monacoEditor && this.monacoReady) {
        this.monacoEditor.setValue(nextSource)
      }
    },
    submit () {
      const name = String(this.form.name || '').trim()
      if (!name) {
        this.$q.notify({ message: this.$t('echoNameRequired'), type: 'warning', position: 'top' })
        return
      }
      const annoSource = String(this.monacoEditor ? this.monacoEditor.getValue() : this.form.anno_source || '').trim()
      if (!annoSource) return
      const category = this.form.isBuiltin ? 'builtin' : getEchoCategoryValue(this.form.category)
      const payload = {
        ...this.form,
        name,
        desc: String(this.form.desc || '').trim(),
        anno_source: annoSource,
        render_type: DEFAULT_RENDER_TYPE,
        category
      }
      this.$emit('submit', payload)
    }
  }
}
</script>
