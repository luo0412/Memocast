<template>
  <div>
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

            <div class='rune-form-field rune-form-field--tight'>
              <div class='rune-form-label'>继承行为</div>
              <q-toggle
                v-model='inheritFromPrevious'
                :label='$t("runeInheritFromPreviousLabel")'
                color='primary'
                dense
              />
              <div class='rune-form-hint'>
                {{ $t('runeInheritFromPreviousHint') }}
              </div>
            </div>
          </div>

          <div class='rune-form-editor-wrap'>
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
                  <!-- city-picker 会在 value=true 且 city-picker JS / data 加载完毕后初始化到这个容器里 -->
                  <input id='rune-city-picker-input' readonly type='text' :placeholder='cityPickerPlaceholder' />
                </div>
                <q-btn
                  flat
                  dense
                  no-caps
                  size='sm'
                  color='primary'
                  icon='cloud_download'
                  label='远端导入'
                  @click='openRemoteImportDialog'
                />
                <q-btn flat dense no-caps size='sm' color='primary' icon='refresh' label='重置' @click='resetTemplate' />
              </div>
            </div>
            <div
              ref='editorContainer'
              class='rune-monaco-editor'
              :style='monacoEditorStyle'
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

  <remote-rune-import-dialog
    v-model='remoteImportDialogVisible'
    :url='remoteImportUrl'
    :category='remoteImportCategory'
    :category-options='runeCategoryOptions'
    :submitting='remoteImporting'
    :error-message='remoteImportError'
    @submit='onRemoteImportSubmit'
  />
  </div>
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

.rune-form-hint {
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.65;
  margin-top: 4px;
  word-break: break-word;
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
  align-items: stretch;
  height: 100%;
  overflow: hidden;
}

.rune-form-fields {
  flex: 0 0 220px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-right: 2px;
}

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
import { RUNE_CATEGORIES, DEFAULT_RUNE_CATEGORY, getRuneCategoryValue } from 'src/utils/runeEchoCategoriesConst'
import { setupMonacoClipboard } from 'src/utils/monacoClipboardBridge'
import { createBlankTemplate, createInheritDemoTemplate } from './rune-templates.js'
import RemoteRuneImportDialog from './RemoteRuneImportDialog.vue'
import CategoryPicker from 'components/category/CategoryPickerV2'
import runeTemplateService from 'src/services/RuneTemplateService'

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
  components: {
    CategoryPicker,
    RemoteRuneImportDialog
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
      _dialogRo: null,
      _windowResizeHandler: null,
      monacoEditorHeight: 250,
      // city-picker 状态：依赖 boot/cdn-deps.js 注入 window.jQuery / window.citypicker，
      // 输入框则在 dialog 真正挂载（q-dialog 走 QPortal，懒渲染）后才出现在 DOM 里。
      cityPickerPlaceholder: '点击选择省/市/区',
      cityPickerReady: false,
      _cityPickerPollTimer: null,
      _cityPickerRo: null,
      _cityPickerInitChecked: false,
      form: {
        id: '',
        name: '',
        desc: '',
        power: 50,
        color: '#7E57C2',
        icon: 'whatshot',
        template: createInheritDemoTemplate(),
        category: DEFAULT_RUNE_CATEGORY,
        // 默认开启 inheritFromPrevious，让新建符文立刻展示「上一行继承」演示。
        inherit_from_previous: 1
      },
      selectedPresetKey: null,
      categoryPickerTree: [],
      remoteImportDialogVisible: false,
      remoteImportUrl: '',
      remoteImportCategory: '',
      remoteImporting: false,
      remoteImportError: '',
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
    monacoEditorStyle () {
      return { height: `${this.monacoEditorHeight}px` }
    },
    resolvedPowerLabel () {
      return this.isEchoMode ? this.$t('echoCardPower') : this.$t('runeCardPower')
    },
    inheritFromPrevious: {
      get () {
        const value = this.form && this.form.inherit_from_previous
        return value === true || value === 1 || value === '1'
      },
      set (next) {
        if (!this.form) return
        this.form.inherit_from_previous = next ? 1 : 0
      }
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
    value: {
      immediate: true,
      handler (val) {
        console.log('[RuneFormDialog] value changed =>', val, 'this.dialog=', !!this.$refs.dialog)
        if (val) {
          this.scheduleMonacoInit()
          this.loadTemplatePicker(true)
          this._scheduleDialogHeightInstall()
          // city-picker 输入框在 q-dialog 内（QPortal 懒渲染），
          // 仅当 value=true 时才出现在 DOM 里。同时 city-picker.js / city-picker.data.js
          // 是 CDN 异步加载，需要轮询等待窗口就绪。
          this._scheduleCityPickerInit()
        } else {
          this.clearMonacoInitTimer()
          this.uninstallDialogHeightListener()
          if (this._dialogHeightPollTimer) {
            clearTimeout(this._dialogHeightPollTimer)
            this._dialogHeightPollTimer = null
          }
          // 关闭时销毁 jQuery 插件挂在 DOM 上的事件监听器，避免残留
          this._destroyCityPicker()
        }
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
            template: createInheritDemoTemplate(),
            category: this.defaultCategory || DEFAULT_RUNE_CATEGORY,
            inherit_from_previous: 1
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
    console.log('[RuneFormDialog] mounted, value=', this.value, '$refs.dialog=', !!this.$refs.dialog, 'clientHeight=', this.$refs.dialog && this.$refs.dialog.clientHeight)
    this.dialog = this.$refs.dialog
    this.scheduleMonacoInit()
    // city-picker 同样走"mounted + watch 双保险"：如果一开始就 value=true，
    // mounted 这边比 watch.immediate 稍早一步能去抢 DOM
    this._scheduleCityPickerInit()
    // mounted 是组件挂载完毕的最早时机（DOM 已就绪），立即安装 dialog 高度监听，
    // 这样在 watch.immediate 之前能抢先拿到正确的 clientHeight。
    this.$nextTick(() => {
      this.$nextTick(() => {
        console.log('[RuneFormDialog] mounted -> installDialogHeightListener, dialog clientHeight=', this.$refs.dialog && this.$refs.dialog.clientHeight)
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
    installDialogHeightListener () {
      console.log('[RuneFormDialog] installDialogHeightListener enter')
      this.uninstallDialogHeightListener()
      const dialogEl = this._resolveDialogElement()
      if (!dialogEl) {
        console.warn('[RuneFormDialog] installDialogHeightListener: dialog DOM missing, skip')
        return
      }
      this.recomputeMonacoHeight()
      this._dialogRo = new ResizeObserver(() => {
        console.log('[RuneFormDialog] dialog ResizeObserver fired')
        this.recomputeMonacoHeight()
      })
      this._dialogRo.observe(dialogEl)
      this._windowResizeHandler = () => {
        console.log('[RuneFormDialog] window resize fired')
        this.recomputeMonacoHeight()
      }
      window.addEventListener('resize', this._windowResizeHandler)
      console.log('[RuneFormDialog] installDialogHeightListener done, monacoEditorHeight=', this.monacoEditorHeight)
    },
    /**
     * 解析 q-dialog 对应的真实 DOM 元素（q-dialog 是 Vue 组件，$refs.dialog 拿到的是实例，
     * 必须 .$el 或 .$refs.content 才能给 ResizeObserver / clientHeight 使用）。
     */
    _resolveDialogElement () {
      const ref = this.$refs && this.$refs.dialog
      if (!ref) return null
      const candidate = ref.$el || (ref.$refs && ref.$refs.content) || ref
      if (candidate && candidate.nodeType === 1) return candidate
      // 兜底：沿父链查找最近含 clientHeight 的 DOM
      let node = candidate
      while (node && node.nodeType !== 1) node = node.parentNode
      return node || null
    },
    /**
     * 等待 q-dialog 真正挂载完毕（其内部使用 QPortal，初始 render 时 $el 可能还不存在），
     * 再去安装 ResizeObserver。最多等 ~1s，避免无限轮询。
     */
    _scheduleDialogHeightInstall () {
      if (this._dialogHeightPollTimer) {
        clearTimeout(this._dialogHeightPollTimer)
        this._dialogHeightPollTimer = null
      }
      let attempt = 0
      const maxAttempts = 20 // 20 * 50ms = 1s
      const tryInstall = () => {
        attempt += 1
        if (!this.value) return
        const el = this._resolveDialogElement()
        if (el && el.clientHeight > 0) {
          this.installDialogHeightListener()
          return
        }
        if (attempt >= maxAttempts) {
          // 兜底：即使 clientHeight=0 也安装，依赖 ResizeObserver 后续回调补一次
          console.warn('[RuneFormDialog] _scheduleDialogHeightInstall: dialog 1s 内未挂载 clientHeight>0，尝试兜底安装')
          this.installDialogHeightListener()
          return
        }
        this._dialogHeightPollTimer = setTimeout(tryInstall, 50)
      }
      this._dialogHeightPollTimer = setTimeout(tryInstall, 0)
    },
    uninstallDialogHeightListener () {
      console.log('[RuneFormDialog] uninstallDialogHeightListener')
      if (this._dialogRo) {
        this._dialogRo.disconnect()
        this._dialogRo = null
      }
      if (this._windowResizeHandler) {
        window.removeEventListener('resize', this._windowResizeHandler)
        this._windowResizeHandler = null
      }
    },
    /**
     * city-picker 初始化调度：
     *   - city-picker.js / city-picker.data.js 由 src/boot/cdn-deps.js 通过 <script> 标签注入，
     *     属于异步资源，load 完毕前 window.citypicker / window.jQuery 可能不存在。
     *   - 输入框节点 #rune-city-picker-input 在 q-dialog（QPortal）真正打开后才出现在 DOM。
     *   - 因此采用 "轮询 + 短超时兜底" 策略：每 80ms 检查一次，最多等 ~5s。成功一次即退出，失败也不抛错。
     */
    _scheduleCityPickerInit () {
      if (this.cityPickerReady) {
        // 已初始化过就跳过；避免 dialog 反复开关导致多次绑定事件
        this._refreshCityPickerValue()
        return
      }
      if (this._cityPickerPollTimer) {
        clearTimeout(this._cityPickerPollTimer)
        this._cityPickerPollTimer = null
      }
      let attempt = 0
      const maxAttempts = 64 // 64 * 80ms ≈ 5.1s，覆盖慢网络
      const tryInit = () => {
        attempt += 1
        if (!this.value) {
          // 期间用户已关掉 dialog，直接退出
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
        if (attempt >= maxAttempts) {
          console.warn('[RuneFormDialog] city-picker 初始化超时未就绪：input=',
            !!inputEl, 'jQuery=', !!$, 'citypicker=', hasCitypicker)
          this._cityPickerPollTimer = null
          return
        }
        this._cityPickerPollTimer = setTimeout(tryInit, 80)
      }
      this._cityPickerPollTimer = setTimeout(tryInit, 0)
    },
    _findCityPickerInput () {
      // input 是原生节点，不随响应式变更，先用 ref 拿 DOM 拿不到就回退到 querySelector
      if (this.$refs.cityPickerMount) {
        const inner = this.$refs.cityPickerMount.querySelector('input')
        if (inner) return inner
      }
      // 兜底：从 document 里找（同名 input 在 q-dialog 里可能存在多个，但也只会一个匹配）
      const fallback = document.getElementById('rune-city-picker-input')
      return fallback || null
    },
    _initCityPicker (inputEl, $) {
      // city-picker 插件本身要求容器为 relative 定位的元素；我们的 div.rune-city-picker-mount
      // 已经是 relative，这里再保险一层。
      const container = inputEl.parentElement
      if (container && getComputedStyle(container).position === 'static') {
        container.style.position = 'relative'
      }
      // 防止外部多次触发导致重复绑定：先尝试 destroy
      try {
        if ($ && $.fn && $.fn.citypicker && $(inputEl).data && $(inputEl).data('citypicker')) {
          $(inputEl).citypicker('destroy')
        }
      } catch (_) { /* noop */ }

      // 完全等同用户给的 demo：
      //   $("#city-picker2").citypicker({
      //     province: "江苏省",
      //     city: "常州市",
      //     district: "溧阳市"
      //   });
      $(inputEl).citypicker({
        province: '江苏省',
        city: '常州市',
        district: '溧阳市'
      })
      this.cityPickerReady = true
      console.log('[RuneFormDialog] city-picker initialized on', inputEl)
    },
    _refreshCityPickerValue () {
      // 第二次打开 dialog 时，把 picker 重新同步到初始值
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
          // destroy 会移除插件注入的 .city-picker-dropdown 等节点和事件监听器
          $(inputEl).citypicker('destroy')
        } catch (_) { /* noop */ }
      }
      this.cityPickerReady = false
    },
    recomputeMonacoHeight () {
      const dialogEl = this._resolveDialogElement()
      const trace = (new Error()).stack.split('\n').slice(1, 4).join(' | ')
      if (!dialogEl) {
        console.warn('[RuneFormDialog] recomputeMonacoHeight: dialogEl missing. trace=', trace)
        return
      }
      const dialogHeight = dialogEl.clientHeight
      if (!dialogHeight) {
        console.warn('[RuneFormDialog] recomputeMonacoHeight: dialogHeight=0. trace=', trace)
        return
      }
      const next = Math.max(120, dialogHeight - 300)
      console.log('[RuneFormDialog] recomputeMonacoHeight: dialogHeight=', dialogHeight, 'next=', next, 'current=', this.monacoEditorHeight, 'changed=', next !== this.monacoEditorHeight)
      if (next !== this.monacoEditorHeight) {
        this.monacoEditorHeight = next
      }
    },
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
            this._createMonacoEditor(this.form.template || createInheritDemoTemplate())
          }
        })
      })
      this._monacoRo.observe(container)
      this._monacoRo.checkingTimeout && clearTimeout(this._monacoRo.checkingTimeout)
      this._monacoRo.checkingTimeout = setTimeout(() => {
        if (this._monacoRo) {
          this._monacoRo.disconnect()
          this._monacoRo = null
          this.$nextTick(() => this._createMonacoEditor(this.form.template || createInheritDemoTemplate()))
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
      const nextTemplate = createInheritDemoTemplate()
      this.form.template = nextTemplate
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
      // 兼容新旧形态：
      //  - 旧 CategoryPicker：picked 本身就是叶子数据对象（带 _templateRow / _isCategory）
      //  - 新 CategoryPicker（heyui 复刻）：picked 是规范化节点，原始数据挂在 picked.value
      const raw = (picked && picked.value) || picked
      const row = raw && raw._templateRow
      if (!row) {
        // 点中分类节点本身，只下钻，不替换编辑器内容
        return
      }
      if (row.name && !this.form.name) this.form.name = row.name
      if (row.desc && !this.form.desc) this.form.desc = row.desc
      if (row.category_key) this.form.category = row.category_key
      const nextTemplate = row.template || createBlankTemplate()
      this.form.template = nextTemplate
      if (this.monacoEditor && this.monacoReady) {
        this.monacoEditor.setValue(nextTemplate)
        // Monaco reset 后 setValue 会丢光标位置：nextTick 再 focus
        this.$nextTick(() => {
          if (this.monacoEditor) this.monacoEditor.focus()
        })
      }
    },
    onPresetSelected (preset) {
      // 兼容层：保留这个旧入口名，避免外部可能还在引用。
      // 内部统一走 CategoryPicker 的 @change 形态。
      return this.onPresetPicked(preset)
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
        console.warn('[RuneFormDialog] loadTemplatePicker failed:', e && e.message)
        this.categoryPickerTree = []
      }
    },
    openRemoteImportDialog () {
      this.remoteImportError = ''
      this.remoteImportUrl = ''
      this.remoteImportCategory = this.form.category || ''
      this.remoteImportDialogVisible = true
    },
    async onRemoteImportSubmit ({ url, category } = {}) {
      this.remoteImporting = true
      this.remoteImportError = ''
      try {
        const res = await runeTemplateService.fetchFromGithub({
          sourceUrl: url || '',
          categoryKey: category || this.form.category || DEFAULT_RUNE_CATEGORY
        })
        if (!res || !res.success) {
          this.remoteImportError = (res && (res.message || res.code)) || '导入失败'
          return
        }
        await this.loadTemplatePicker(true)
        const newRow = res.data
        if (newRow) {
          this.selectedPresetKey = {
            key: 'tpl::' + newRow.id,
            title: newRow.name,
            _isCategory: false,
            _templateRow: newRow,
            children: []
          }
          this.onPresetPicked(this.selectedPresetKey)
        }
        this.remoteImportDialogVisible = false
      } catch (e) {
        this.remoteImportError = (e && e.message) || String(e)
      } finally {
        this.remoteImporting = false
      }
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
