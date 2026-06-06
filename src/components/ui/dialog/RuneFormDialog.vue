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

      <q-card-section class='scroll rune-form-body'>
        <div class='rune-form-field'>
          <div class='rune-form-label'>{{ $t('runeCardName') }}</div>
          <q-input
            v-model='form.name'
            dense
            outlined
            :placeholder="$t('runeCardName')"
            class='rune-form-input'
          />
        </div>

        <div class='rune-form-field'>
          <div class='rune-form-label'>{{ $t('runeCardDesc') }}</div>
          <q-input
            v-model='form.desc'
            dense
            outlined
            type='textarea'
            :placeholder="$t('runeCardDesc')"
            class='rune-form-input'
          />
        </div>

        <div class='row q-col-gutter-x-sm'>
          <div class='col-6'>
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
          <div class='col-6'>
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
              class='rune-form-input'
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
        </div>

        <div class='rune-form-field'>
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

        <div class='rune-form-field'>
          <div class='rune-form-label'>模板内容</div>
          <div
            ref='editorContainer'
            class='rune-monaco-editor'
          />
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
  min-height: 78vh;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}

.rune-form-toolbar {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex: 0 0 auto;
}

.rune-form-body {
  padding: 16px;
  flex: 1 1 auto;
  min-height: 0;
}

.rune-form-field {
  margin-bottom: 12px;
}

.rune-form-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 4px;
  font-weight: 500;
}

.rune-form-input {
  width: 100%;
}

.rune-form-slider {
  margin-top: 8px;
}

.color-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.color-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.15s, border-color 0.15s;
}

.color-dot:hover {
  transform: scale(1.15);
}

.color-dot.selected {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
}

.rune-monaco-editor {
  height: 420px;
  min-height: 420px;
  border: 1px solid #434343;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 4px;
}

.rune-form-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 16px;
  margin-top: auto;
  flex: 0 0 auto;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(6px);
}
</style>

<script>
import * as monaco from 'monaco-editor'

const DEFAULT_TEMPLATE = `<template>
  <div class="rune-card">
    <h2>{{ title }}</h2>
  </div>
</template>

<script>
export default {
  name: 'RuneCard',
  data () {
    return {
      title: 'Hello Rune'
    }
  }
}
<\/script>

<style lang="scss" scoped>
.rune-card {
  padding: 16px;
  h2 {
    color: #7E57C2;
    font-size: 18px;
  }
}
</style>`

const ICON_NAME_MAP = {
  whatshot: 'whatshot',
  ac_unit: 'ac_unit',
  flash_on: 'flash_on',
  favorite: 'favorite',
  nights_stay: 'nights_stay',
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
      form: {
        id: '',
        name: '',
        desc: '',
        power: 50,
        color: '#7E57C2',
        icon: 'whatshot',
        template: DEFAULT_TEMPLATE
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
        this.$nextTick(() => {
          this.initMonaco()
        })
      } else {
        if (this.monacoEditor) {
          this.monacoEditor.layout()
        }
      }
    },
    rune: {
      immediate: true,
      handler (val) {
        if (val) {
          this.form = { ...val }
        } else {
          this.form = {
            id: 'rune-' + Date.now(),
            name: '',
            desc: '',
            power: 50,
            color: '#7E57C2',
            icon: 'whatshot',
            template: DEFAULT_TEMPLATE
          }
        }
      }
    }
  },
  mounted () {
    this.dialog = this.$refs.dialog
  },
  methods: {
    getIconName (value) {
      return ICON_NAME_MAP[value] || value
    },
    initMonaco () {
      if (!this.$refs.editorContainer) return
      const template = this.form.template || DEFAULT_TEMPLATE
      if (!this.monacoEditor) {
        this.monacoEditor = monaco.editor.create(this.$refs.editorContainer, {
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
          fontFamily: 'JetBrains Mono, Fira Code, Monaco, PingFang SC, Hiragino Sans GB, 微软雅黑, Arial, sans-serif'
        })
        this.monacoEditor.onDidChangeModelContent(() => {
          this.form.template = this.monacoEditor.getValue()
        })
      } else {
        const currentValue = this.monacoEditor.getValue()
        if (currentValue !== template) {
          this.monacoEditor.setValue(template)
        }
        this.monacoEditor.layout()
      }
    },
    submit () {
      if (!this.form.name.trim()) return
      if (this.monacoEditor) {
        this.form.template = this.monacoEditor.getValue()
      }
      this.$emit('submit', { ...this.form })
      this.dialog && this.dialog.hide()
    }
  }
}
</script>
