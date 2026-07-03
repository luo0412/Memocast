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
  height: 380px;
  min-height: 380px;
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

export const createDefaultRuneTemplate = () => {
  return `<template>
  <div class="rune-echo-demo">
    <div class="rune-echo-demo__label">符文 · 回声演示</div>
    <div class="rune-echo-demo__display">{{ text || '点击下方输入框试试，value 会回填到 Markdown' }}</div>
    <input
      class="rune-echo-demo__input"
      :value="text"
      placeholder="输入内容，触发 input 事件把 value 写回 MD"
      @input="handleInput"
    />
    <div class="rune-echo-demo__meta">
      <span>nodeId: <code>{{ nodeId || '-' }}</code></span>
      <span>runeId: <code>{{ runeId || '-' }}</code></span>
    </div>
  </div>
<\/template>

<script>
export default {
  props: {
    value: {
      type: [String, Number],
      default: null
    },
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
    }
  },
  data() {
    return {
      text: this.value == null ? '' : String(this.value)
    }
  },
  watch: {
    value (next) {
      const normalized = next == null ? '' : String(next)
      if (normalized !== this.text) {
        this.text = normalized
      }
    }
  },
  methods: {
    handleInput (event) {
      const next = event && event.target ? String(event.target.value || '') : ''
      this.text = next
      // 与 TODO 中 RuneValue { runeId, nodeId, value } 的字段对齐；
      // 外层 RunePreviewRenderer 会捕获 input 事件并通过 onValueChange 回写到 MD。
      this.$emit('input', next)
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-echo-demo {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(126, 87, 194, 0.08);
  border: 1px dashed rgba(126, 87, 194, 0.42);
  font-family: inherit;
  color: inherit;
}
.rune-echo-demo__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: rgba(126, 87, 194, 0.85);
}
.rune-echo-demo__display {
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  min-height: 20px;
  color: rgba(0, 0, 0, 0.78);
}
.rune-echo-demo__input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid rgba(126, 87, 194, 0.4);
  background: rgba(255, 255, 255, 0.9);
  font: inherit;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.rune-echo-demo__input:focus {
  border-color: #7E57C2;
  box-shadow: 0 0 0 2px rgba(126, 87, 194, 0.2);
}
.rune-echo-demo__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
}
.rune-echo-demo__meta code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(126, 87, 194, 0.12);
  padding: 1px 5px;
  border-radius: 4px;
}
</style>`
}

// ===== 圣光庇护：演示 this.$hel.preFetchLib 远程加载 lodash =====
export const createHolyShieldTemplate = () => {
  return `<template>
  <div class="rune-holy-shield">
    <div class="rune-holy-shield__banner">
      <div class="rune-holy-shield__icon">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
        </svg>
      </div>
      <div class="rune-holy-shield__title">圣光庇护</div>
    </div>

    <div class="rune-holy-shield__desc">
      演示 hel-micro 远程加载 lodash
    </div>

    <div class="rune-holy-shield__input-row">
      <input
        class="rune-holy-shield__input"
        v-model="rawInput"
        placeholder="输入数字，每 300ms 防抖后显示结果"
        @input="onInput"
      />
    </div>

    <div class="rune-holy-shield__result" v-if="result !== null">
      <span class="rune-holy-shield__result-label">lodash debounce 结果：</span>
      <code class="rune-holy-shield__result-value">{{ result }}</code>
    </div>

    <div class="rune-holy-shield__meta">
      <span>nodeId: <code>{{ nodeId || '-' }}</code></span>
      <span>runeId: <code>{{ runeId || '-' }}</code></span>
    </div>
  </div>
<\/template>

<script>
// 圣光庇护符文：通过 this.$hel.preFetchLib 远程加载 lodash
// hel-micro 会先从 CDN 拉取模块，缓存在内存中供后续调用复用。
// this.$hel 在 src/boot/hel-micro-renderer.js 中挂载。
export default {
  props: {
    value: { type: [String, Number], default: null },
    runeId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    rune: { type: Object, default: null }
  },
  data() {
    return {
      rawInput: '',
      result: null,
      _debounceTimer: null
    }
  },
  watch: {
    value(next) {
      const s = next == null ? '' : String(next)
      if (s !== this.rawInput) this.rawInput = s
    }
  },
  methods: {
    async onInput() {
      clearTimeout(this._debounceTimer)
      this._debounceTimer = setTimeout(async () => {
        try {
          // hel-micro 会按 appName='lodash' 从 CDN 拉取并缓存
          const lodash = await this.$hel.preFetchLib('lodash')
          const n = parseFloat(this.rawInput)
          this.result = lodash.isNumber(n) ? lodash.debounce(x => x, 300)(n) : 'NaN'
          this.$emit('input', String(this.result))
        } catch (e) {
          console.error('[HolyShield] lodash load failed:', e)
          this.result = 'load failed'
        }
      }, 300)
    }
  },
  beforeDestroy() {
    clearTimeout(this._debounceTimer)
  }
}
<\/script>

<style lang="less" scoped>
.rune-holy-shield {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 202, 40, 0.07);
  border: 1px solid rgba(255, 193, 7, 0.4);
  font-family: inherit;
  color: inherit;
}
.rune-holy-shield__banner {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rune-holy-shield__icon {
  color: #FFC107;
  display: flex;
  align-items: center;
}
.rune-holy-shield__title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: rgba(255, 160, 0, 0.9);
}
.rune-holy-shield__desc {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  margin-top: -4px;
}
.rune-holy-shield__input-row {
  display: flex;
}
.rune-holy-shield__input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 193, 7, 0.5);
  background: rgba(255, 255, 255, 0.92);
  font: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.rune-holy-shield__input:focus {
  border-color: #FFB300;
  box-shadow: 0 0 0 2px rgba(255, 193, 7, 0.18);
}
.rune-holy-shield__result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.7);
  background: rgba(255, 193, 7, 0.1);
  border-radius: 6px;
  padding: 6px 10px;
}
.rune-holy-shield__result-label {
  font-weight: 500;
}
.rune-holy-shield__result-value {
  font-family: Consolas, Monaco, monospace;
  background: rgba(255, 160, 0, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
  color: #E65100;
  font-weight: 600;
}
.rune-holy-shield__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
}
.rune-holy-shield__meta code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(255, 193, 7, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
}
</style>`
}

// ===== 星河绘图：演示 this.$jxg 绑定 JSXGraph 绘制数学图形 =====
export const createJxgDemoTemplate = () => {
  return `<template>
  <div class="rune-jxg-demo">
    <div class="rune-jxg-demo__header">
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" class="rune-jxg-demo__icon">
        <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
      </svg>
      <span class="rune-jxg-demo__title">星河绘图</span>
    </div>
    <div class="rune-jxg-demo__desc">通过 this.$jxg 绘制数学坐标系与函数图像</div>

    <div id="jxgBox" ref="jxgBox" class="rune-jxg-demo__board"/>

    <div class="rune-jxg-demo__controls">
      <span class="rune-jxg-demo__hint">点击坐标轴上的点查看坐标值</span>
    </div>

    <div class="rune-jxg-demo__meta">
      <span>nodeId: <code>{{ nodeId || '-' }}</code></span>
      <span>runeId: <code>{{ runeId || '-' }}</code></span>
    </div>
  </div>
<\/template>

<script>
// 星河绘图符文：通过 this.$jxg 调用 JSXGraph 绘制坐标系和函数图像
// this.$jxg 在 src/boot/jxgraph.js 中挂载。
export default {
  props: {
    value: { type: [String, Number], default: null },
    runeId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    rune: { type: Object, default: null }
  },
  data() {
    return {
      board: null
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.initJxg()
    })
  },
  beforeDestroy() {
    if (this.board) {
      this.board.destroy && this.board.destroy()
      this.board = null
    }
  },
  methods: {
    initJxg() {
      const container = this.$refs.jxgBox
      if (!container || !this.$jxg) return
      if (this.board) {
        this.board.destroy && this.board.destroy()
      }
      this.board = this.$jxg.JSXGraph.initBoard('jxgBox', {
        boundingbox: [-6, 6, 6, -6],
        axis: true,
        grid: true,
        showNavigation: false
      })
      const p1 = this.board.create('point', [-1, 2], { name: 'A', color: '#2196F3', size: 4 })
      const p2 = this.board.create('point', [3, -2], { name: 'B', color: '#4CAF50', size: 4 })
      this.board.create('line', [p1, p2], { strokeColor: '#9C27B0', strokeWidth: 2 })
      this.board.create('functiongraph', [
        (x) => Math.sin(x) * 2,
        -5, 5
      ], { strokeColor: '#F44336', strokeWidth: 3, curveType: 'plot' })
      this.board.create('text', [4, 4, 'y = 2sin(x)'], { fontSize: 14, color: '#F44336' })
      this.board.on('down', (e) => {
        const pos = this.board.getUsrCoordsOfMouse(e)
        this.$emit('input', JSON.stringify({ x: pos[0].toFixed(2), y: pos[1].toFixed(2) }))
      })
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-jxg-demo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(33, 150, 243, 0.05);
  border: 1px solid rgba(33, 150, 243, 0.35);
  font-family: inherit;
  color: inherit;
}
.rune-jxg-demo__header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rune-jxg-demo__icon {
  color: #2196F3;
  flex-shrink: 0;
}
.rune-jxg-demo__title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: rgba(33, 150, 243, 0.9);
}
.rune-jxg-demo__desc {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  margin-top: -4px;
}
.rune-jxg-demo__board {
  width: 100%;
  height: 280px;
  border: 1px solid rgba(33, 150, 243, 0.25);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.rune-jxg-demo__controls {
  display: flex;
  align-items: center;
}
.rune-jxg-demo__hint {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.5);
  font-style: italic;
}
.rune-jxg-demo__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
}
.rune-jxg-demo__meta code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(33, 150, 243, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
}
.body--dark .rune-jxg-demo__board {
  background: #2a2a2a;
}
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
        template: createDefaultRuneTemplate(),
        category: DEFAULT_RUNE_CATEGORY
      },
      selectedPreset: null,
      presetTemplateOptions: [
        {
          label: '圣光庇护',
          desc: 'hel-micro 远程加载 lodash，演示 preFetchLib 用法',
          icon: 'security',
          color: 'amber',
          templateFn: 'createHolyShieldTemplate'
        },
        {
          label: '星河绘图',
          desc: '通过 this.$jxg 绘制坐标系、点和函数图像',
          icon: 'show_chart',
          color: 'blue',
          templateFn: 'createJxgDemoTemplate'
        },
        {
          label: '空白模板',
          desc: '基础演示，接收 input 事件回写到 Markdown',
          icon: 'description',
          color: 'purple',
          templateFn: 'createDefaultRuneTemplate'
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
          const template = val.template || createDefaultRuneTemplate()
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
            template: createDefaultRuneTemplate(),
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
    resetTemplate () {
      const nextTemplate = createDefaultRuneTemplate()
      this.form.template = nextTemplate
      this.selectedPreset = null
      if (this.monacoEditor && this.monacoReady) {
        this.monacoEditor.setValue(nextTemplate)
      }
    },
    onPresetSelected (preset) {
      if (!preset) return
      const fnName = preset.templateFn
      let nextTemplate = createDefaultRuneTemplate()
      if (fnName === 'createHolyShieldTemplate') {
        nextTemplate = createHolyShieldTemplate()
      } else if (fnName === 'createJxgDemoTemplate') {
        nextTemplate = createJxgDemoTemplate()
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
