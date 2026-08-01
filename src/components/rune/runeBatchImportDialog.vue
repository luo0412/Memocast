<!--
  RuneBatchImportDialog - rune 批量导入弹框
  从 SettingsRunePanel 触发，支持从 JSON 文件批量导入符文到当前分类。
  JSON 格式与远程导入格式一致。

  v2026-08-01 改造：
    1. 解析文件后立刻在弹框内展示「未重名（默认勾选）/ 重名（默认不勾选）」两栏可复选方块；
    2. 符文选项悬浮显示 desc；
    3. 与内置符文名冲突的项目直接过滤，不进入预览；
    4. 提交时按所选项调用 batchImport：未重名走 normal，重名走 replace。
-->
<template>
  <q-dialog
    :value='value'
    @input='v => $emit("input", v)'
    transition-show='fade'
    transition-hide='fade'
  >
    <q-card class='rune-batch-import-card'>
      <q-toolbar class='rune-batch-import-toolbar'>
        <q-icon name='file_upload' color='primary' size='1.4em' class='q-mr-xs' />
        <q-toolbar-title>
          <span class='text-weight-bold non-selectable'>批量导入符文</span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='rune-batch-import-body'>
        <div class='rune-batch-import-field'>
          <div class='rune-batch-import-label'>选择 JSON 文件</div>
          <div class='rune-batch-import-file-area' @click='triggerFileInput'>
            <input
              ref='fileInput'
              type='file'
              accept='.json'
              style='display: none'
              @change='onFileSelected'
            />
            <div v-if='!selectedFile' class='rune-batch-import-file-placeholder'>
              <q-icon name='upload_file' size='2.5em' color='grey-5' />
              <div class='q-mt-sm text-grey-6'>点击选择 JSON 文件</div>
            </div>
            <div v-else class='rune-batch-import-file-selected'>
              <q-icon name='description' size='1.5em' color='purple-7' />
              <span class='q-ml-sm'>{{ selectedFile.name }}</span>
              <q-btn flat round dense icon='close' size='xs' @click.stop='clearFile' />
            </div>
          </div>
        </div>

        <div class='rune-batch-import-field'>
          <div class='rune-batch-import-label'>导入分类</div>
          <q-select
            v-model='localCategory'
            dense
            outlined
            :options='categoryOptions'
            option-label='label'
            option-value='value'
            emit-value
            map-options
            class='rune-batch-import-select'
          >
            <template v-slot:selected-item='scope'>
              <span>{{ scope.opt ? scope.opt.label : '' }}</span>
            </template>
            <template v-slot:option='scope'>
              <q-item v-bind='scope.itemProps' v-on='scope.itemEvents'>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <div class='rune-batch-import-hint'>
            未重名符文将以该分类新增；重名符文覆盖原分类保留不变。
          </div>
        </div>

        <div v-if='parsedData && parsedData.length > 0' class='rune-batch-import-preview'>
          <div class='rune-batch-import-preview-title'>
            共 {{ parsedData.length }} 个符文
            <span v-if='builtinFilteredCount > 0' class='text-grey-6 q-ml-xs'>
              （已过滤 {{ builtinFilteredCount }} 个内置）
            </span>
            <span v-if='totalInvalidCount > 0' class='text-warning q-ml-xs'>
              （无效 {{ totalInvalidCount }} 个）
            </span>
          </div>

          <div class='rune-batch-import-sides'>
            <div class='rune-batch-import-side'>
              <div class='rune-batch-import-side-title'>
                <q-icon name='fiber_new' size='1em' color='positive' class='q-mr-xs' />
                未重名（{{ newItems.length }}，默认勾选）
              </div>
              <div class='rune-batch-import-side-actions'>
                <q-btn
                  flat
                  dense
                  size='xs'
                  no-caps
                  label='全选'
                  :disable='newItems.length === 0'
                  @click='selectAll(true, false)'
                />
                <q-btn
                  flat
                  dense
                  size='xs'
                  no-caps
                  label='全不选'
                  :disable='newItems.length === 0'
                  @click='selectAll(false, false)'
                />
              </div>
              <div v-if='newItems.length === 0' class='rune-batch-import-side-empty'>
                没有未重名的符文
              </div>
              <div v-else class='rune-batch-import-grid'>
                <el-tooltip
                  v-for='item in newItems'
                  :key='item.key'
                  placement='top-start'
                  :open-delay='250'
                  :disabled='!item.desc'
                  popper-class='rune-batch-import-tooltip'
                >
                  <label
                    class='rune-batch-import-tile'
                    :class='{ "is-selected": item.selected }'
                  >
                    <el-checkbox
                      v-model='item.selected'
                      class='rune-batch-import-tile-checkbox'
                    >
                      <span class='rune-batch-import-tile-name'>{{ item.name }}</span>
                    </el-checkbox>
                  </label>
                  <template #content>
                    <div class='rune-batch-import-tooltip-content'>{{ item.desc }}</div>
                  </template>
                </el-tooltip>
              </div>
            </div>

            <div class='rune-batch-import-side'>
              <div class='rune-batch-import-side-title'>
                <q-icon name='warning' size='1em' color='warning' class='q-mr-xs' />
                重名（{{ conflictItems.length }}，默认不勾选）
              </div>
              <div class='rune-batch-import-side-actions'>
                <q-btn
                  flat
                  dense
                  size='xs'
                  no-caps
                  label='全选'
                  :disable='conflictItems.length === 0'
                  @click='selectAll(true, true)'
                />
                <q-btn
                  flat
                  dense
                  size='xs'
                  no-caps
                  label='全不选'
                  :disable='conflictItems.length === 0'
                  @click='selectAll(false, true)'
                />
              </div>
              <div v-if='conflictItems.length === 0' class='rune-batch-import-side-empty'>
                没有与现有符文重名的项
              </div>
              <div v-else class='rune-batch-import-grid'>
                <el-tooltip
                  v-for='item in conflictItems'
                  :key='item.key'
                  placement='top-start'
                  :open-delay='250'
                  :disabled='!item.desc'
                  popper-class='rune-batch-import-tooltip'
                >
                  <label
                    class='rune-batch-import-tile rune-batch-import-tile--conflict'
                    :class='{ "is-selected": item.selected }'
                  >
                    <el-checkbox
                      v-model='item.selected'
                      class='rune-batch-import-tile-checkbox'
                    >
                      <span class='rune-batch-import-tile-name'>{{ item.name }}</span>
                    </el-checkbox>
                  </label>
                  <template #content>
                    <div class='rune-batch-import-tooltip-content'>{{ item.desc }}</div>
                  </template>
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>

        <div v-if='errorMessage' class='rune-batch-import-error'>
          <q-icon name='error_outline' size='1.1em' class='q-mr-xs' />
          {{ errorMessage }}
        </div>

        <div v-if='importResult' class='rune-batch-import-result'>
          <div v-if='importResult.success' class='rune-batch-import-result-success'>
            <q-icon name='check_circle' size='1.1em' class='q-mr-xs' />
            成功导入 {{ importResult.count }} 个符文
          </div>
          <div v-else class='rune-batch-import-result-error'>
            <q-icon name='error_outline' size='1.1em' class='q-mr-xs' />
            {{ importResult.message || '导入失败' }}
          </div>
        </div>
      </q-card-section>

      <q-card-actions align='right' class='rune-batch-import-footer'>
        <q-btn flat dense no-caps label='取消' v-close-popup />
        <q-btn
          flat
          dense
          no-caps
          color='primary'
          icon='file_upload'
          label='导入所选'
          :loading='importing'
          :disable='!hasSelectedItem'
          @click='doImport'
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="scss" scoped>
.rune-batch-import-card {
  min-width: 640px;
  max-width: 92vw;
  width: 760px;
}

.rune-batch-import-toolbar {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.rune-batch-import-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rune-batch-import-field {
  display: flex;
  flex-direction: column;
}

.rune-batch-import-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
  font-weight: 500;
  margin-bottom: 6px;
}

.rune-batch-import-file-area {
  border: 2px dashed rgba(126, 87, 194, 0.35);
  border-radius: 8px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;

  &:hover {
    border-color: #7E57C2;
    background: rgba(126, 87, 194, 0.04);
  }
}

.rune-batch-import-file-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.rune-batch-import-file-selected {
  display: flex;
  align-items: center;
  justify-content: center;
}

.rune-batch-import-select {
  width: 100%;
}

.rune-batch-import-hint {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
}

.rune-batch-import-preview {
  background: rgba(126, 87, 194, 0.06);
  border-radius: 6px;
  padding: 12px;
}

.rune-batch-import-preview-title {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  margin-bottom: 8px;
}

.rune-batch-import-sides {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 2px;
}

.rune-batch-import-side {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(126, 87, 194, 0.18);
  border-radius: 6px;
  padding: 10px;
}

.rune-batch-import-side-title {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.75);
}

.rune-batch-import-side-actions {
  display: flex;
  gap: 4px;
  margin: 4px 0 8px 0;
}

.rune-batch-import-side-empty {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.4);
  padding: 6px 2px;
}

.rune-batch-import-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 6px;
}

.rune-batch-import-tile {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  color: rgba(0, 0, 0, 0.85);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    border-color: rgba(126, 87, 194, 0.4);
    background: rgba(126, 87, 194, 0.06);
  }

  &.is-selected {
    border-color: #7E57C2;
    background: rgba(126, 87, 194, 0.12);
  }
}

.rune-batch-import-tile--conflict {
  border-color: rgba(255, 193, 7, 0.45);

  &.is-selected {
    border-color: #f57c00;
    background: rgba(255, 193, 7, 0.14);
  }
}

.rune-batch-import-tile-checkbox {
  margin-right: 0;

  ::v-deep .el-checkbox__label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }
}

.rune-batch-import-tile-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.rune-batch-import-error {
  display: flex;
  align-items: center;
  background: rgba(244, 67, 54, 0.08);
  color: #c62828;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.rune-batch-import-result {
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 12px;
}

.rune-batch-import-result-success {
  display: flex;
  align-items: center;
  background: rgba(76, 175, 80, 0.1);
  color: #2e7d32;
  border-radius: 4px;
  padding: 8px 10px;
}

.rune-batch-import-result-error {
  display: flex;
  align-items: center;
  background: rgba(244, 67, 54, 0.08);
  color: #c62828;
}

.rune-batch-import-footer {
  padding: 10px 18px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
}

.body--dark .rune-batch-import-toolbar {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.body--dark .rune-batch-import-label {
  color: rgba(255, 255, 255, 0.55);
}

.body--dark .rune-batch-import-file-area {
  border-color: rgba(126, 87, 194, 0.45);

  &:hover {
    border-color: #7E57C2;
    background: rgba(126, 87, 194, 0.08);
  }
}

.body--dark .rune-batch-import-hint {
  color: rgba(255, 255, 255, 0.45);
}

.body--dark .rune-batch-import-preview {
  background: rgba(126, 87, 194, 0.12);
}

.body--dark .rune-batch-import-side {
  background: rgba(40, 40, 40, 0.45);
  border-color: rgba(126, 87, 194, 0.3);
}

.body--dark .rune-batch-import-side-title {
  color: rgba(255, 255, 255, 0.85);
}

.body--dark .rune-batch-import-tile {
  background: rgba(0, 0, 0, 0.25);
  border-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);

  &:hover {
    border-color: rgba(126, 87, 194, 0.6);
    background: rgba(126, 87, 194, 0.15);
  }

  &.is-selected {
    border-color: #B39DDB;
    background: rgba(126, 87, 194, 0.25);
  }
}

.body--dark .rune-batch-import-tile--conflict {
  border-color: rgba(255, 193, 7, 0.55);

  &.is-selected {
    border-color: #ffb74d;
    background: rgba(255, 193, 7, 0.18);
  }
}

.body--dark .rune-batch-import-side-empty {
  color: rgba(255, 255, 255, 0.4);
}

.body--dark .rune-batch-import-error {
  background: rgba(244, 67, 54, 0.16);
  color: #ef9a9a;
}

.body--dark .rune-batch-import-result-success {
  background: rgba(76, 175, 80, 0.16);
  color: #81c784;
}

.body--dark .rune-batch-import-result-error {
  background: rgba(244, 67, 54, 0.16);
  color: #ef9a9a;
}

.body--dark .rune-batch-import-footer {
  border-top-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

/* el-tooltip 内层：避免行高/字号被全局样式覆盖 */
.rune-batch-import-tooltip-content {
  font-size: 12px;
  line-height: 1.5;
  max-width: 320px;
  word-break: break-word;
  white-space: pre-wrap;
}

/* el-tooltip popper：与 q-tooltip 视觉对齐 */
.rune-batch-import-tooltip {
  background: rgba(40, 40, 40, 0.92) !important;
  color: #fff !important;
  padding: 6px 10px !important;
  max-width: 320px !important;

  &[x-placement^='top'] .popper__arrow {
    border-top-color: rgba(40, 40, 40, 0.92) !important;
  }
  &[x-placement^='bottom'] .popper__arrow {
    border-bottom-color: rgba(40, 40, 40, 0.92) !important;
  }
}
</style>

<script>
import { RuneCategoryEnum } from 'src/utils/enum'
import runeTemplateService from 'src/services/RuneTemplateService'

export default {
  name: 'runeBatchImportDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    defaultCategory: {
      type: String,
      default: ''
    },
    existingRunes: {
      type: Array,
      default: () => []
    },
    builtinNames: {
      type: Array,
      default: () => []
    }
  },
  data () {
    return {
      selectedFile: null,
      parsedData: null,
      newItems: [],
      conflictItems: [],
      builtinFilteredCount: 0,
      totalInvalidCount: 0,
      // v2026-08-01（修复）：data 初始化时立即用 defaultCategory，避免 v-if mount 后 + watch.value 异步触发的
      //   渲染抖动（用户看到下拉框空白 → 一帧后跳到目标分类）。父端 openBatchImport 已先更新
      //   runeImportCategory 再设 visible=true，prop default-category 在组件创建瞬间就是目标值。
      localCategory: this.defaultCategory || '',
      importing: false,
      errorMessage: '',
      importResult: null
    }
  },
  computed: {
    categoryOptions () {
      return RuneCategoryEnum.items.map(c => ({
        value: c.value,
        label: c.label
      }))
    },
    hasSelectedItem () {
      if (this.importing) return false
      return this.newItems.some(it => it.selected) || this.conflictItems.some(it => it.selected)
    }
  },
  watch: {
    // v2026-08-01（修复 defaultCategory 同步）：
    //   watch.defaultCategory 监听 prop 变化——父端如果改了 defaultCategory（罕见，但用户连续切换 tab 后点导入可能
    //   触发时序不一致），子组件 localCategory 立即跟随。
    //   watch.value 仅用于弹框打开瞬间触发 clearState()，localCategory 已经在 data() 初始化时绑好 prop。
    defaultCategory: {
      immediate: true,
      handler (v) {
        if (v && !this.localCategory) {
          this.localCategory = v
        }
      }
    },
    value (v) {
      if (v) {
        // 弹框打开时再校一次 localCategory，覆盖可能的 prop 变化路径
        this.localCategory = this.defaultCategory || RuneCategoryEnum.General
        this.clearState()
      }
    }
  },
  methods: {
    triggerFileInput () {
      this.$refs.fileInput.click()
    },
    clearFile () {
      this.selectedFile = null
      this.parsedData = null
      this.newItems = []
      this.conflictItems = []
      this.builtinFilteredCount = 0
      this.totalInvalidCount = 0
      this.errorMessage = ''
      this.importResult = null
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = ''
      }
    },
    clearState () {
      this.selectedFile = null
      this.parsedData = null
      this.newItems = []
      this.conflictItems = []
      this.builtinFilteredCount = 0
      this.totalInvalidCount = 0
      this.localCategory = this.defaultCategory || RuneCategoryEnum.General
      this.importing = false
      this.errorMessage = ''
      this.importResult = null
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = ''
      }
    },
    readFileAsText (file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target && e.target.result)
        reader.onerror = e => reject(e)
        reader.readAsText(file)
      })
    },
    async onFileSelected (event) {
      const file = event.target.files && event.target.files[0]
      if (!file) return
      this.selectedFile = file
      this.errorMessage = ''
      this.importResult = null
      try {
        const text = await this.readFileAsText(file)
        const parsed = JSON.parse(text)
        // 顶层是对象且带 Echo Pack format 头 —— 文件格式与符文不匹配
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.format === 'memocast.echo-pack') {
          this.errorMessage = 'JSON 格式不匹配：当前文件不是符文 JSON（疑似 Echo Pack 格式）'
          this.parsedData = null
          this.newItems = []
          this.conflictItems = []
          return
        }
        if (!Array.isArray(parsed)) {
          this.errorMessage = 'JSON 格式错误：根元素必须是数组'
          this.parsedData = null
          this.newItems = []
          this.conflictItems = []
          return
        }
        // 顶层是数组，但首个有效条目含 echo 必有字段 anno_source 且缺 rune 必有字段 template —— 疑似 Echo 导出被误传
        if (parsed.length > 0) {
          const firstValid = parsed.find(it => it && typeof it === 'object' && String(it.name || '').trim())
          if (firstValid && firstValid.anno_source && !firstValid.template) {
            this.errorMessage = 'JSON 格式不匹配：当前文件不是符文 JSON（疑似 Echo 导出）'
            this.parsedData = null
            this.newItems = []
            this.conflictItems = []
            return
          }
        }
        // v2026-08-01：split 真相源从 hint（existingRunes prop）改成 service.dryRunImport（= 主进程 DB）。
        // 弹框仍保留 splitParsedIntoGroups 方法作为 fallback，理论上不可达；
        // 这里 service 抛错时才走 fallback，避免渲染完全失败。
        const validItems = parsed.filter(it => it && typeof it === 'object' && String(it.name || '').trim())
        if (validItems.length === 0) {
          this.errorMessage = 'JSON 解析失败：未找到任何有效的符文条目'
          this.parsedData = null
          this.newItems = []
          this.conflictItems = []
          return
        }
        this.parsedData = parsed
        try {
          // service.dryRunImport 内部会拉 DB 现读、按 DB 同名项切两栏
          const result = await runeTemplateService.dryRunImport(
            parsed,
            this.localCategory || this.defaultCategory || RuneCategoryEnum.General,
            {
              builtinNames: this.builtinNames || []
            }
          )
          this.totalInvalidCount = result.totalInvalid
          this.builtinFilteredCount = result.builtinFiltered
          this.newItems = result.newItems
          this.conflictItems = result.conflictItems
        } catch (e) {
          // service 端异常（IPC 挂、DB 不可达等）才走本地 fallback；
          // 并明确提示用户真相源降级了，避免静默用陈旧 hint。
          console.warn('[rune-batch-import-dialog] dryRunImport failed, fallback to local split', e)
          const invalidCount = parsed.filter(it => !it || typeof it !== 'object').length
          this.totalInvalidCount = invalidCount
          this.splitParsedIntoGroups(parsed)
          this.errorMessage = '注意：与服务端同步异常，已用本地缓存切分，结果可能与实际数据不符'
        }
      } catch (e) {
        this.errorMessage = 'JSON 解析失败: ' + (e && e.message ? e.message : String(e))
        this.parsedData = null
        this.newItems = []
        this.conflictItems = []
      }
    },
    splitParsedIntoGroups (items) {
      const existingNameSet = new Set(
        (this.existingRunes || [])
          .filter(r => r && r.name)
          .map(r => String(r.name || '').trim().toLowerCase())
      )
      const builtinNameSet = new Set(
        (this.builtinNames || [])
          .filter(Boolean)
          .map(n => String(n || '').trim().toLowerCase())
      )
      let builtinFiltered = 0
      const newList = []
      const conflictList = []
      items.forEach((raw, index) => {
        if (!raw || typeof raw !== 'object') return
        const name = String(raw.name || '').trim()
        if (!name) return
        const nameKey = name.toLowerCase()
        if (builtinNameSet.has(nameKey)) {
          builtinFiltered += 1
          return
        }
        const entry = {
          key: `${index}-${nameKey}`,
          name,
          desc: String(raw.desc || ''),
          category: raw.category || this.defaultCategory || RuneCategoryEnum.General,
          color: raw.color || '#7E57C2',
          icon: raw.icon || 'star',
          template: raw.template || '',
          selected: false
        }
        if (existingNameSet.has(nameKey)) {
          conflictList.push(entry)
        } else {
          entry.selected = true
          newList.push(entry)
        }
      })
      this.builtinFilteredCount = builtinFiltered
      this.newItems = newList
      this.conflictItems = conflictList
    },
    selectAll (selected, isConflict) {
      const list = isConflict ? this.conflictItems : this.newItems
      list.forEach(it => { it.selected = selected })
    },
    doImport () {
      const newChosen = this.newItems.filter(it => it.selected)
      const conflictChosen = this.conflictItems.filter(it => it.selected)
      if (newChosen.length === 0 && conflictChosen.length === 0) {
        this.errorMessage = '请至少勾选一个符文'
        return
      }
      const merged = newChosen.concat(conflictChosen)
      const items = merged.map(it => ({
        name: it.name,
        desc: it.desc,
        category: it.category,
        color: it.color,
        icon: it.icon,
        template: it.template
      }))
      const conflictMode = conflictChosen.length > 0 ? 'replace' : 'normal'
      this.importing = true
      this.errorMessage = ''
      this.importResult = null
      this.$emit('import', {
        items,
        category: this.localCategory || RuneCategoryEnum.General,
        conflictMode
      })
    },
    onImportSuccess (count) {
      this.importing = false
      this.importResult = { success: true, count }
      this.$nextTick(() => {
        setTimeout(() => {
          this.$emit('input', false)
        }, 1500)
      })
    },
    onImportError (message) {
      this.importing = false
      this.importResult = { success: false, message }
    },
    finishImport () {
      this.importing = false
    }
  }
}
</script>