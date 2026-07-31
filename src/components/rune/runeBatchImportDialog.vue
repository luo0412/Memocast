<!--
  RuneBatchImportDialog - rune 批量导入弹框
  从 SettingsRunePanel 触发，支持从 JSON 文件批量导入符文到当前分类。
  JSON 格式与远程导入格式保持一致。
  支持同名检测：全部覆盖/全部跳过/正常处理。
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
            所有符文将以此分类导入
          </div>
        </div>

        <!-- 预览区域 -->
        <div v-if='parsedData && parsedData.length > 0' class='rune-batch-import-preview'>
          <div class='rune-batch-import-preview-title'>
            预览（共 {{ parsedData.length }} 个符文）：
            <span v-if='conflictInfo && conflictInfo.hasConflict' class='text-warning'>
              （含 {{ conflictInfo.conflictNames.length }} 个同名）
            </span>
          </div>
          <div class='rune-batch-import-preview-list'>
            <div v-for='(item, index) in previewItems' :key='index' class='rune-batch-import-preview-item'>
              <span class='rune-batch-import-preview-icon' :style='{ color: item.color || "#7E57C2" }'>●</span>
              <span class='rune-batch-import-preview-name' :class='{ "text-warning": isConflictName(item.name) }'>
                {{ item.name || '未命名' }}
                <q-icon v-if='isConflictName(item.name)' name='warning' size='xs' color='warning' />
              </span>
              <span class='rune-batch-import-preview-category'>({{ item.category || 'general' }})</span>
            </div>
            <div v-if='parsedData.length > previewLimit' class='rune-batch-import-preview-more'>
              ... 还有 {{ parsedData.length - previewLimit }} 个
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
          label='导入'
          :loading='importing'
          :disable='!selectedFile || !parsedData || parsedData.length === 0'
          @click='doImport'
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="scss" scoped>
.rune-batch-import-card {
  min-width: 460px;
  max-width: 92vw;
  width: 520px;
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

.rune-batch-import-conflict {
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.4);
  border-radius: 8px;
  padding: 12px;
}

.rune-batch-import-conflict-title {
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  color: #f57c00;
  margin-bottom: 8px;
}

.rune-batch-import-conflict-names {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.rune-batch-import-conflict-toggle {
  width: 100%;
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

.rune-batch-import-preview-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.rune-batch-import-preview-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.rune-batch-import-preview-icon {
  font-size: 10px;
}

.rune-batch-import-preview-name {
  color: rgba(0, 0, 0, 0.8);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.rune-batch-import-preview-category {
  color: rgba(0, 0, 0, 0.45);
  font-size: 11px;
}

.rune-batch-import-preview-more {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  font-style: italic;
  margin-top: 4px;
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

.body--dark .rune-batch-import-conflict {
  background: rgba(255, 193, 7, 0.12);
  border-color: rgba(255, 193, 7, 0.35);
}

.body--dark .rune-batch-import-conflict-title {
  color: #ffb74d;
}

.body--dark .rune-batch-import-preview {
  background: rgba(126, 87, 194, 0.12);
}

.body--dark .rune-batch-import-preview-name {
  color: rgba(255, 255, 255, 0.85);
}

.body--dark .rune-batch-import-preview-category {
  color: rgba(255, 255, 255, 0.45);
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
</style>

<script>
import { RuneCategoryEnum } from 'src/utils/enum'

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
    }
  },
  data () {
    return {
      selectedFile: null,
      parsedData: null,
      localCategory: '',
      importing: false,
      errorMessage: '',
      importResult: null,
      previewLimit: 10,
      conflictInfo: null
    }
  },
  computed: {
    categoryOptions () {
      return RuneCategoryEnum.items.map(c => ({
        value: c.value,
        label: c.label
      }))
    },
    previewItems () {
      if (!this.parsedData || !Array.isArray(this.parsedData)) return []
      return this.parsedData.slice(0, this.previewLimit)
    },
    resolvedCategoryLabel () {
      const opt = this.categoryOptions.find(c => c.value === this.localCategory)
      return opt ? opt.label : this.localCategory
    }
  },
  watch: {
    value (v) {
      if (v) {
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
      this.errorMessage = ''
      this.importResult = null
      this.conflictInfo = null
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = ''
      }
    },
    clearState () {
      this.selectedFile = null
      this.parsedData = null
      this.localCategory = this.defaultCategory || RuneCategoryEnum.General
      this.importing = false
      this.errorMessage = ''
      this.importResult = null
      this.conflictInfo = null
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = ''
      }
    },
    isConflictName (name) {
      if (!name || !this.conflictInfo || !this.conflictInfo.hasConflict) return false
      return this.conflictInfo.conflictNames.includes(name)
    },
    checkConflicts (items) {
      const existingNames = new Set(
        (this.existingRunes || [])
          .filter(r => r && r.name)
          .map(r => String(r.name || '').trim().toLowerCase())
      )
      const conflictNames = []
      for (const item of items) {
        const name = String(item && item.name || '').trim().toLowerCase()
        if (name && existingNames.has(name)) {
          conflictNames.push(item.name)
        }
      }
      return {
        hasConflict: conflictNames.length > 0,
        conflictNames
      }
    },
    async onFileSelected (event) {
      const file = event.target.files && event.target.files[0]
      if (!file) return
      this.selectedFile = file
      this.errorMessage = ''
      this.importResult = null
      this.conflictInfo = null
      try {
        const text = await this.readFileAsText(file)
        const parsed = JSON.parse(text)
        if (!Array.isArray(parsed)) {
          this.errorMessage = 'JSON 格式错误：根元素必须是数组'
          this.parsedData = null
          return
        }
        // 验证每个元素的基本结构
        for (let i = 0; i < parsed.length; i++) {
          const item = parsed[i]
          if (!item || typeof item !== 'object') {
            this.errorMessage = `第 ${i + 1} 个元素格式错误`
            this.parsedData = null
            return
          }
        }
        this.parsedData = parsed
        // 检查同名冲突
        this.conflictInfo = this.checkConflicts(parsed)
      } catch (e) {
        this.errorMessage = 'JSON 解析失败: ' + (e && e.message ? e.message : String(e))
        this.parsedData = null
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
    doImport () {
      if (!this.parsedData || !Array.isArray(this.parsedData) || this.parsedData.length === 0) {
        this.errorMessage = '没有可导入的数据'
        return
      }
      this.importing = true
      this.errorMessage = ''
      this.importResult = null
      try {
        const conflictInfo = this.checkConflicts(this.parsedData)

        // 检测到同名符文，弹出对话框让用户选择处理方式
        if (conflictInfo.hasConflict) {
          this.showConflictDialog(conflictInfo)
          this.importing = false
          return
        }

        // 无冲突，直接导入
        this.executeImport(this.parsedData, 'normal', [])
      } catch (e) {
        this.errorMessage = '导入失败: ' + (e && e.message ? e.message : String(e))
      } finally {
        this.importing = false
      }
    },
    showConflictDialog (conflictInfo) {
      const conflictNames = conflictInfo.conflictNames
      const count = conflictNames.length
      this.$q.dialog({
        title: '检测到同名符文',
        message: `有 ${count} 个符文名称已存在：\n${conflictNames.slice(0, 5).join('、')}${count > 5 ? '...' : ''}\n\n请选择处理方式：`,
        options: {
          type: 'radio',
          model: 'skip',
          items: [
            { label: '跳过同名（保留现有）', value: 'skip' },
            { label: '覆盖同名（用导入的替换）', value: 'replace' },
            { label: '同时保留（创建重复）', value: 'normal' }
          ]
        },
        cancel: true,
        persistent: true,
        ok: {
          label: '确认'
        }
      }).onOk((selectedMode) => {
        // 根据选择处理同名符文
        let itemsToImport = this.parsedData
        if (selectedMode === 'skip') {
          const conflictNameSet = new Set(
            conflictNames.map(n => String(n || '').trim().toLowerCase())
          )
          itemsToImport = this.parsedData.filter(item => {
            const name = String(item && item.name || '').trim().toLowerCase()
            return !conflictNameSet.has(name)
          })
        }
        this.executeImport(itemsToImport, selectedMode, conflictNames)
      })
    },
    async executeImport (itemsToImport, conflictMode, conflictNames) {
      this.importing = true
      try {
        this.$emit('import', {
          items: itemsToImport,
          category: this.localCategory || RuneCategoryEnum.General,
          conflictMode,
          conflictNames
        })
      } catch (e) {
        this.errorMessage = '导入失败: ' + (e && e.message ? e.message : String(e))
      } finally {
        this.importing = false
      }
    },
    // 由父组件调用，导入成功后更新结果
    onImportSuccess (count) {
      this.importResult = { success: true, count }
      this.$nextTick(() => {
        setTimeout(() => {
          this.$emit('input', false)
        }, 1500)
      })
    },
    // 由父组件调用，导入失败后显示错误
    onImportError (message) {
      this.importResult = { success: false, message }
    }
  }
}
</script>
