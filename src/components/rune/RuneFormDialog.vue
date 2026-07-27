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
            <!-- 左侧表单区域 -->
            <rune-form-fields
              :form='form'
              :mode='mode'
              @update:form='val => form = val'
              @update-inherit='val => form.inherit_from_previous = val'
            />

            <!-- 右侧编辑器区域 -->
            <rune-form-editor
              ref='runeFormEditor'
              :form-data='form'
              :template='form.template'
              :visible='value'
              @update-template='val => form.template = val'
              @update-field='fields => Object.assign(form, fields)'
              @open-remote-import='openRemoteImportDialog'
            />
          </div>
        </q-card-section>

        <q-card-actions align='right' class='rune-form-footer'>
          <q-btn flat dense no-caps :label="$t('cancel')" @click='dialog && dialog.hide()' />
          <q-btn flat dense no-caps color='primary' :label="$t('ok')" @click='submit' />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- 远端导入弹框 -->
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

<script>
import { RuneCategoryEnum } from 'src/utils/enum'
import { createBlankTemplate, createInheritDemoTemplate } from './rune-templates.js'
import runeTemplateService from 'src/services/RuneTemplateService'

import RuneFormFields from './RuneFormFields.vue'
import RuneFormEditor from './RuneFormEditor.vue'
import RemoteRuneImportDialog from './RemoteRuneImportDialog.vue'

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

const createRuneForm = (rune = {}, defaultCategory = RuneCategoryEnum.General) => ({
  id: rune.id || createUuid(),
  name: rune.name || '',
  desc: rune.desc || '',
  color: rune.color || '#7E57C2',
  icon: rune.icon || 'whatshot',
  template: rune.template || createInheritDemoTemplate(),
  category: rune.category || defaultCategory,
  inherit_from_previous: rune.inherit_from_previous == null ? 1 : rune.inherit_from_previous
})

export default {
  name: 'RuneFormDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  components: {
    RuneFormFields,
    RuneFormEditor,
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
      form: createRuneForm(),
      remoteImportDialogVisible: false,
      remoteImportUrl: '',
      remoteImportCategory: '',
      remoteImporting: false,
      remoteImportError: ''
    }
  },
  computed: {
    isEditing () {
      return !!this.rune
    },
    isEchoMode () {
      return this.mode === 'echo'
    },
    runeCategoryOptions () {
      return RuneCategoryEnum.items.map(c => ({ value: c.value, label: this.$t(c.label) }))
    },
    resolvedAddTitle () {
      return this.isEchoMode ? this.$t('echoCardAdd') : this.$t('runeCardAdd')
    },
    resolvedEditTitle () {
      return this.isEchoMode ? this.$t('echoCardEdit') : this.$t('runeCardEdit')
    }
  },
  watch: {
    value: {
      immediate: true,
      handler (val) {
        if (val) {
          this.dialog = this.$refs.dialog
        }
      }
    },
    rune: {
      immediate: true,
      handler (val) {
        if (val) {
          const form = createRuneForm(val, val.category)
          if (!val.template) form.template = createBlankTemplate()
          this.form = form
          console.log('\n[RuneFormDialog.rune watcher] Loaded editing rune:', {
            id: this.form.id,
            name: this.form.name,
            templateLen: (this.form.template || '').length
          })
        } else {
          this.form = createRuneForm({}, this.defaultCategory || RuneCategoryEnum.General)
          console.log('\n[RuneFormDialog.rune watcher] Initialized new rune form:', {
            id: this.form.id
          })
        }
      }
    }
  },
  mounted () {
    this.dialog = this.$refs.dialog
  },
  methods: {
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
          categoryKey: category || this.form.category || RuneCategoryEnum.General
        })
        if (!res || !res.success) {
          this.remoteImportError = (res && (res.message || res.code)) || '导入失败'
          return
        }
        const newRow = res.data
        if (newRow) {
          this.form.template = newRow.template || createBlankTemplate()
          if (newRow.name && !this.form.name) this.form.name = newRow.name
          if (newRow.desc && !this.form.desc) this.form.desc = newRow.desc
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
      const editorRef = this.$refs.runeFormEditor
      if (editorRef && editorRef.isMonacoReady && !editorRef.isMonacoReady()) {
        return
      }
      if (editorRef && editorRef.getTemplate) {
        this.form.template = editorRef.getTemplate()
      }
      console.log('\n[RuneFormDialog.submit] Emitting rune payload:', {
        id: this.form.id,
        name: this.form.name,
        desc: this.form.desc,
        templateLen: (this.form.template || '').length
      })
      this.$emit('submit', { ...this.form })
    }
  }
}
</script>

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
  align-items: stretch;
  height: 100%;
  overflow: hidden;
}

.rune-form-footer {
  flex: 0 0 auto;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.03);
}

/* Dark mode overrides */
.body--dark .rune-form-footer {
  border-top-color: rgba(255, 255, 255, 0.1);
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
}
</style>
