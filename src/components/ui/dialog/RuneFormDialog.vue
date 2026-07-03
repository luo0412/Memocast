<template>
  <q-dialog
    ref='dialog'
    transition-show='fade'
    transition-hide='fade'
    :value='value'
    @input='v => $emit("input", v)'
    :persistent='false'
  >
    <q-card class='rune-form-card'>
      <q-toolbar class='rune-form-toolbar'>
        <q-icon name='star' color='primary' size='1.5em' />
        <q-toolbar-title>
          <span class='text-weight-bold non-selectable'>
            {{ isEditing ? resolvedEditTitle : resolvedAddTitle }}
          </span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='rune-form-body'>
        <div class='rune-form-content'>
          <div class='rune-form-fields'>
            <div class='rune-form-field'>
              <div class='rune-form-label'>{{ resolvedNameLabel }}</div>
              <q-input
                v-model='form.name'
                dense
                outlined
                :placeholder="resolvedNameLabel"
                class='rune-form-input rune-form-input--compact'
              />
            </div>

            <div class='rune-form-field rune-form-field--desc'>
              <div class='rune-form-label'>{{ resolvedDescLabel }}</div>
              <q-input
                v-model='form.desc'
                dense
                outlined
                type='textarea'
                autogrow
                :placeholder="resolvedDescLabel"
                class='rune-form-input rune-form-input--compact'
              />
            </div>

            <div class='rune-form-field rune-form-field--tight'>
              <div class='rune-form-label'>{{ resolvedPowerLabel }}</div>
              <q-slider
                v-model='form.power'
                :min='1'
                :max='100'
                label
                label-always
                color='primary'
                class='rune-form-slider'
              />
            </div>

            <div class='rune-form-field rune-form-field--tight'>
              <div class='rune-form-label'>分类</div>
              <q-select
                v-model='form.category'
                dense
                outlined
                :options='runeCategoryOptions'
                option-label='label'
                option-value='value'
                emit-value
                map-options
                class='rune-form-input rune-form-input--compact'
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

            <div class='rune-form-field rune-form-field--tight'>
              <div class='rune-form-label'>图标</div>
              <q-select
                v-model='form.icon'
                dense
                outlined
                :options='iconOptions'
                option-label='label'
                option-value='value'
                emit-value
                map-options
                class='rune-form-input rune-form-input--compact'
              >
                <template v-slot:selected-item='scope'>
                  <div class='row items-center'>
                    <q-icon :name='getIconName(scope.opt.value)' size='1em' class='q-mr-xs' />
                    <span>{{ scope.opt.label }}</span>
                  </div>
                </template>
                <template v-slot:option='scope'>
                  <q-item v-bind='scope.itemProps' v-on='scope.itemEvents'>
                    <q-item-section avatar>
                      <q-icon :name='getIconName(scope.opt.value)' />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>

            <div class='rune-form-field rune-form-field--tight'>
              <div class='rune-form-label'>颜色</div>
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
          </div>

          <div class='rune-form-editor-wrap'>
            <div class='row items-center justify-between q-mb-xs'>
              <div class='rune-form-label q-mb-none'>模板内容</div>
              <div class='row items-center no-wrap q-gutter-xs'>
                <q-select
                  v-model='selectedPreset'
                  dense
                  outlined
                  :options='presetTemplateOptions'
                  option-label='label'
                  option-value='value'
                  emit-value
                  map-options
                  display-value=''
                  hide-selected
                  fill-input
                  use-input
                  clearable
                  placeholder='预设模板'
                  class='preset-template-select'
                  @input='onPresetSelected'
                >
                  <template v-slot:selected-item='scope'>
                    <span class='preset-template-label'>{{ scope.opt ? scope.opt.label : '' }}</span>
                  </template>
                  <template v-slot:option='scope'>
                    <q-item v-bind='scope.itemProps' v-on='scope.itemEvents'>
                      <q-item-section avatar>
                        <q-icon :name='scope.opt.icon' :color='scope.opt.color' size='1.2em' />
                      </q-item-section>
                      <q-item-section>
                        <q-item-label>{{ scope.opt.label }}</q-item-label>
                        <q-item-label caption lines='1'>{{ scope.opt.desc }}</q-item-label>
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
                <q-btn flat dense no-caps size='sm' color='primary' icon='refresh' label='重置' @click='resetTemplate' />
              </div>
            </div>
            <div
              ref='editorContainer'
              class='rune-monaco-editor'
            />
          </div>
        </div>
      </q-card-section>

      <q-card-actions align='right' class='rune-form-footer'>
        <q-btn flat dense no-caps :label="$t('cancel')" @click='dialog && dialog.hide()' />
        <q-btn flat dense no-caps color='primary' :label="$t('ok')" @click='submit' />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="scss" scoped>
.rune-form-card {
  min-width: 600px;
  max-width: 82vw;
  width: 760px;
  height: 78vh;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rune-form-toolbar {
  flex: 0 0 auto;
}

.rune-form-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 16px;
}

.rune-form-content {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  gap: 14px;
}

.rune-form-fields {
  flex: 0 0 220px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-right: 2px;
}

.rune-form-editor-wrap {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rune-form-field {
  margin-bottom: 12px;
}

.rune-form-field:last-child {
  margin-bottom: 0;
}

.rune-form-field--desc :deep(textarea) {
  min-height: 72px !important;
}

.rune-form-field--tight {
  margin-bottom: 10px;
}

.rune-form-field--tight:last-child {
  margin-bottom: 0;
}

.rune-form-label {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
  margin-bottom: 4px;
  font-weight: 500;
  line-height: 1.2;
}

.rune-form-input {
  width: 100%;
}

.rune-form-input--compact :deep(.q-field__control) {
  min-height: 36px;
}

.rune-form-input--compact :deep(.q-field__native),
.rune-form-input--compact :deep(.q-field__input) {
  font-size: 13px;
}

.rune-form-slider {
  margin-top: 6px;
  margin-bottom: 2px;
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

.rune-monaco-editor {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  border: 1px solid #c0c0c0;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 4px;
}

.preset-template-select {
  min-width: 120px;
  max-width: 180px;
}

.preset-template-select :deep(.q-field__control) {
  min-height: 32px;
}

.preset-template-label {
  font-size: 12px;
  color: #7E57C2;
  font-weight: 500;
}

.body--dark .rune-monaco-editor {
  border-color: #434343;
}

.rune-form-footer {
  flex: 0 0 auto;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.03);
}

/* Dark mode overrides */
.body--dark .rune-form-label {
  color: rgba(255, 255, 255, 0.55);
}

.body--dark .rune-form-footer {
  border-top-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
}

.body--dark .color-dot.selected {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
}

@media (max-width: 680px) {
  .rune-form-card {
    width: 96vw;
    max-width: 96vw;
  }

  .rune-form-body {
    flex-direction: column;
  }

  .rune-form-fields {
    flex: 0 0 auto;
  }

  .rune-monaco-editor {
    min-height: 360px;
  }
}
</style>

<script>
import * as monaco from 'monaco-editor'
import { RUNE_CATEGORIES, DEFAULT_RUNE_CATEGORY, getRuneCategoryValue } from 'src/constants/runeEchoCategories'
import { setupMonacoClipboard } from 'src/utils/monacoClipboardBridge'
import {
  createBlankTemplate,
  createInputTemplate,
  createHolyShieldTemplate,
  createJsxGraphTemplate,
  createFireflyTemplate,
  createElInputTemplate,
  createElSelectTemplate
} from './rune-templates'

const createUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : ((r & 0x3) | 0x8)
    return v.toString(16)
  })
}

const ICON_NAME_MAP = {
  whatshot: 'local_fire_department',
  ac_unit: 'ac_unit',
  flash_on: 'flash_on',
  favorite: 'favorite',
  nights_stay: 'dark_mode',
  wb_sunny: 'wb_sunny',
  star: 'star',
  ring: 'filter_frames',
  security: 'security',
  flight: 'flight',
  skull: 'skull',
  gradient: 'gradient',
  eco: 'eco',
  water_drop: 'water_drop',
  show_chart: 'show_chart'
}

export default {
  name: 'RuneFormDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    rune: {
      type: Object,
      default: null
    },
    mode: {
      type: String,
      default: 'rune'
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
      monacoInitAttempt: 0,
      _monacoRo: null,
      form: {
        id: '',
        name: '',
        desc: '',
        power: 50,
        color: '#7E57C2',
        icon: 'whatshot',
        template: createBlankTemplate(),
        category: DEFAULT_RUNE_CATEGORY
      },
      selectedPreset: null,
      presetTemplateOptions: [
        {
          label: '空白模板',
          desc: '标准 Vue SFC 格式（template + script + style + data + methods）',
          icon: 'description',
          color: 'purple',
          templateFn: 'createBlankTemplate'
        },
        {
          label: '输入框',
          desc: '@blur 时触发 $emit("input")，适合表单场景',
          icon: 'edit',
          color: 'green',
          templateFn: 'createInputTemplate'
        },
        {
          label: 'hel-micro',
          desc: '远程组件，演示 $hel.preFetchLib',
          icon: 'cloud_download',
          color: 'amber',
          templateFn: 'createHolyShieldTemplate'
        },
        {
          label: 'JsxGraph',
          desc: '通过 this.$jxg 初始化坐标系，点击上报坐标（JSXGraph）',
          icon: 'show_chart',
          color: 'blue',
          templateFn: 'createJsxGraphTemplate'
        },
        {
          label: '萤火虫',
          desc: 'CSS3 多点发光动画，点击萤火虫上报坐标（参考博客园）',
          icon: 'auto_awesome',
          color: 'amber',
          templateFn: 'createFireflyTemplate'
        },
        {
          label: 'el-input',
          desc: 'Element-UI 输入框，@blur 时触发 $emit("input")',
          icon: 'input',
          color: 'teal',
          templateFn: 'createElInputTemplate'
        },
        {
          label: 'el-select',
          desc: 'Element-UI 下拉选择，@change 时触发 $emit("input")',
          icon: 'arrow_drop_down_circle',
          color: 'indigo',
          templateFn: 'createElSelectTemplate'
        }
      ],
      monacoEditor: null,
      runeCategoryOptions: RUNE_CATEGORIES.map(c => ({ value: c.value, label: this.$t(c.i18nKey) })),
      iconOptions: [
        { label: '火焰', value: 'whatshot' },
        { label: '冰霜', value: 'ac_unit' },
        { label: '闪电', value: 'flash_on' },
        { label: '爱心', value: 'favorite' },
        { label: '月亮', value: 'nights_stay' },
        { label: '太阳', value: 'wb_sunny' },
        { label: '星星', value: 'star' },
        { label: '漩涡', value: 'ring' },
        { label: '护盾', value: 'security' },
        { label: '翅膀', value: 'flight' },
        { label: '骷髅', value: 'skull' },
        { label: '水晶', value: 'gradient' },
        { label: '叶子', value: 'eco' },
        { label: '水', value: 'water_drop' },
        { label: '图表', value: 'show_chart' }
      ],
      colorOptions: [
        { value: '#FF6B35' },
        { value: '#4FC3F7' },
        { value: '#AB47BC' },
        { value: '#66BB6A' },
        { value: '#7E57C2' },
        { value: '#FFD54F' },
        { value: '#EF5350' },
        { value: '#26A69A' },
        { value: '#FF7043' },
        { value: '#5C6BC0' },
        { value: '#EC407A' },
        { value: '#8D6E63' }
      ]
    }
  },
  computed: {
    isEditing () {
      return !!this.rune
    },
    isEchoMode () {
      return this.mode === 'echo'
    },
    resolvedAddTitle () {
      return this.isEchoMode ? this.$t('echoCardAdd') : this.$t('runeCardAdd')
    },
    resolvedEditTitle () {
      return this.isEchoMode ? this.$t('echoCardEdit') : this.$t('runeCardEdit')
    },
    resolvedNameLabel () {
      return this.isEchoMode ? this.$t('echoCardName') : this.$t('runeCardName')
    },
    resolvedDescLabel () {
      return this.isEchoMode ? this.$t('echoCardDesc') : this.$t('runeCardDesc')
    },
    resolvedPowerLabel () {
      return this.isEchoMode ? this.$t('echoCardPower') : this.$t('runeCardPower')
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
    rune: {
      immediate: true,
      handler (val) {
        if (val) {
          this._prevRuneId = val.id
          const template = val.template || createBlankTemplate()
          this.form = { ...val, category: getRuneCategoryValue(val.category) }
          console.log('\n[RuneFormDialog.rune watcher] Loaded editing rune:', {
            id: this.form.id,
            name: this.form.name,
            templateLen: (this.form.template || '').length,
            templatePreview: String(this.form.template || '').substring(0, 120)
          })
          if (this.monacoEditor && this.monacoReady) {
            const current = this.monacoEditor.getValue()
            if (current !== template) {
              this.monacoEditor.setValue(template)
            }
          }
        } else {
          this.form = {
            id: createUuid(),
            name: '',
            desc: '',
            power: 50,
            color: '#7E57C2',
            icon: 'whatshot',
            template: createBlankTemplate(),
            category: this.defaultCategory || DEFAULT_RUNE_CATEGORY
          }
          console.log('\n[RuneFormDialog.rune watcher] Initialized new rune form:', {
            id: this.form.id,
            templateLen: this.form.template.length,
            templatePreview: this.form.template.substring(0, 120)
          })
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
    getIconName (value) {
      return ICON_NAME_MAP[value] || value
    },
    clearMonacoInitTimer () {
      if (this.monacoInitTimer) {
        clearTimeout(this.monacoInitTimer)
        this.monacoInitTimer = null
      }
    },
    _setupMonacoClipboard () {
      this._monacoClipboardDisposable = setupMonacoClipboard(this.monacoEditor, monaco)
    },
    _disposeMonacoClipboard () {
      if (this._monacoClipboardDisposable && typeof this._monacoClipboardDisposable.dispose === 'function') {
        try { this._monacoClipboardDisposable.dispose() } catch (_) { /* noop */ }
      }
      this._monacoClipboardDisposable = null
    },
    disposeMonaco () {
      this.monacoReady = false
      this._disposeMonacoClipboard()
      if (this.monacoEditor) {
        this.monacoEditor.dispose()
        this.monacoEditor = null
      }
    },
    scheduleMonacoInit () {
      this.clearMonacoInitTimer()
      this.monacoInitTimer = setTimeout(() => {
        this.monacoInitTimer = null
        this.initMonacoWithGuards()
      }, 120)
    },
    initMonacoWithGuards () {
      this.clearMonacoInitTimer()
      this.monacoInitTimer = setTimeout(() => {
        this.monacoInitTimer = null
        this._initMonacoViaObserver()
      }, 150)
    },
    _initMonacoViaObserver () {
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
            this._createMonacoEditor(this.form.template || createBlankTemplate())
          }
        })
      })
      this._monacoRo.observe(container)
      this._monacoRo.checkingTimeout && clearTimeout(this._monacoRo.checkingTimeout)
      this._monacoRo.checkingTimeout = setTimeout(() => {
        if (this._monacoRo) {
          this._monacoRo.disconnect()
          this._monacoRo = null
          this.$nextTick(() => this._createMonacoEditor(this.form.template || createBlankTemplate()))
        }
      }, 1200)
    },
    initMonaco () {
      this._initMonacoViaObserver()
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
      this._setupMonacoClipboard()
      this.monacoEditor.onDidChangeModelContent(() => {
        if (!this.monacoEditor) return
        this.form.template = this.monacoEditor.getValue()
        console.log('[RuneFormDialog.monaco change] template synced:', {
          runeId: this.form.id,
          runeName: this.form.name,
          templateLen: this.form.template.length,
          templatePreview: this.form.template.substring(0, 120)
        })
      })
      this.monacoReady = true
      this.monacoEditor.updateOptions({ readOnly: false, domReadOnly: false })
      this.$nextTick(() => {
        if (!this.monacoEditor) return
        this.monacoEditor.focus()
      })
    },
    resetTemplate () {
      const nextTemplate = createBlankTemplate()
      this.form.template = nextTemplate
      this.selectedPreset = null
      if (this.monacoEditor && this.monacoReady) {
        this.monacoEditor.setValue(nextTemplate)
      }
    },
    onPresetSelected (preset) {
      if (!preset) return
      const fnName = preset.templateFn
      let nextTemplate = createBlankTemplate()
      if (fnName === 'createInputTemplate') {
        nextTemplate = createInputTemplate()
      } else if (fnName === 'createHolyShieldTemplate') {
        nextTemplate = createHolyShieldTemplate()
      } else if (fnName === 'createJsxGraphTemplate') {
        nextTemplate = createJsxGraphTemplate()
      } else if (fnName === 'createFireflyTemplate') {
        nextTemplate = createFireflyTemplate()
      } else if (fnName === 'createElInputTemplate') {
        nextTemplate = createElInputTemplate()
      } else if (fnName === 'createElSelectTemplate') {
        nextTemplate = createElSelectTemplate()
      }
      this.form.template = nextTemplate
      if (this.monacoEditor && this.monacoReady) {
        this.monacoEditor.setValue(nextTemplate)
      }
      this.$nextTick(() => {
        this.selectedPreset = null
      })
    },
    submit () {
      if (!String(this.form.name || '').trim()) {
        this.$q.notify({ message: this.$t('runeNameRequired'), type: 'warning', position: 'top' })
        return
      }
      if (!this.monacoReady) {
        this.initMonacoWithGuards()
        return
      }
      if (this.monacoEditor) {
        this.form.template = this.monacoEditor.getValue()
      }
      console.log('\n[RuneFormDialog.submit] Emitting rune payload:', {
        id: this.form.id,
        name: this.form.name,
        desc: this.form.desc,
        templateLen: (this.form.template || '').length,
        templatePreview: String(this.form.template || '').substring(0, 160)
      })
      // 关闭交给父组件 onRuneSubmit 根据保存结果决定（重名等错误需保留 dialog 让用户改名）
      this.$emit('submit', { ...this.form })
    }
  }
}
</script>
