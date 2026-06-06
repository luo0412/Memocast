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
            {{ isEditing ? $t('runeCardEdit') : $t('runeCardAdd') }}
          </span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='rune-form-body'>
        <div class='rune-form-content'>
          <div class='rune-form-fields'>
            <div class='rune-form-field'>
              <div class='rune-form-label'>{{ $t('runeCardName') }}</div>
              <q-input
                v-model='form.name'
                dense
                outlined
                :placeholder="$t('runeCardName')"
                class='rune-form-input rune-form-input--compact'
              />
            </div>

            <div class='rune-form-field rune-form-field--desc'>
              <div class='rune-form-label'>{{ $t('runeCardDesc') }}</div>
              <q-input
                v-model='form.desc'
                dense
                outlined
                type='textarea'
                autogrow
                :placeholder="$t('runeCardDesc')"
                class='rune-form-input rune-form-input--compact'
              />
            </div>

            <div class='rune-form-field rune-form-field--tight'>
              <div class='rune-form-label'>{{ $t('runeCardPower') }}</div>
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
            <div class='rune-form-label'>模板内容</div>
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
  height: 100%;
  overflow-y: auto;
  display: flex;
  gap: 14px;
}

.rune-form-fields {
  flex: 0 0 220px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.rune-form-editor-wrap {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
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
  color: rgba(255, 255, 255, 0.55);
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
  height: 380px;
  min-height: 380px;
  border: 1px solid #434343;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 4px;
}

.rune-form-footer {
  flex: 0 0 auto;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.04);
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

const createDefaultRuneTemplate = () => {
  return `<template>
  <span class="rune-text">{{ text }}</span>
</temp` + `late>

<script>
export default {
  props: {
    value: {
      type: [String, Number],
      default: null
    }
  },
  data() {
    return {
      text: this.value
    }
  }
}
</sc` + `ript>

<style lang="less" scoped>
.rune-text { color: purple; }
</style>`
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
  water_drop: 'water_drop'
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
        template: createDefaultRuneTemplate()
      },
      monacoEditor: null,
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
        { label: '水', value: 'water_drop' }
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
          const template = val.template || createDefaultRuneTemplate()
          this.form = { ...val }
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
            template: createDefaultRuneTemplate()
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
    disposeMonaco () {
      this.monacoReady = false
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
            this._createMonacoEditor(this.form.template || createDefaultRuneTemplate())
          }
        })
      })
      this._monacoRo.observe(container)
      this._monacoRo.checkingTimeout && clearTimeout(this._monacoRo.checkingTimeout)
      this._monacoRo.checkingTimeout = setTimeout(() => {
        if (this._monacoRo) {
          this._monacoRo.disconnect()
          this._monacoRo = null
          this.$nextTick(() => this._createMonacoEditor(this.form.template || createDefaultRuneTemplate()))
        }
      }, 1200)
    },
    initMonaco () {
      this._initMonacoViaObserver()
    },
    _createMonacoEditor (template) {
      if (!this.$refs.editorContainer) return
      this.disposeMonaco()

      monaco.editor.defineTheme('Memocast-Dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#34383e',
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
        automaticLayout: false,
        wordWrap: 'on',
        readOnly: false,
        domReadOnly: false,
        fontFamily: 'JetBrains Mono, Fira Code, Monaco, PingFang SC, Hiragino Sans GB, 微软雅黑, Arial, sans-serif'
      })
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
        if (!this.monacoEditor || !container) return
        this.monacoEditor.layout({ width: container.clientWidth, height: 380 })
        this.monacoEditor.focus()
      })
    },
    submit () {
      if (!this.form.name.trim()) return
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
      this.$emit('submit', { ...this.form })
      this.dialog && this.dialog.hide()
    }
  }
}
</script>
