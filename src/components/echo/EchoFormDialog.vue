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
            {{ isReadonly ? ($t('echoCardView') || '查看回响') : (isEditing ? $t('echoCardEdit') : $t('echoCardAdd')) }}
          </span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='echo-form-body'>
        <div class='echo-form-content'>
          <!-- 左侧表单区域 -->
          <echo-form-fields
            :form='form'
            :is-readonly='isReadonly'
            :is-builtin='isBuiltin'
            @update:form='val => form = val'
          />

          <!-- 右侧编辑器区域 -->
          <echo-form-editor
            ref='echoFormEditor'
            :source='form.anno_source'
            :echo-name='form.name'
            :is-readonly='isReadonly'
            :is-builtin='isBuiltin'
            :visible='value'
            @update-source='val => form.anno_source = val'
          />
        </div>
      </q-card-section>

      <q-card-actions align='right' class='echo-form-footer'>
        <q-btn flat dense no-caps :label="$t('cancel')" @click='dialog && dialog.hide()' />
        <q-btn
          flat
          dense
          no-caps
          :color='isReadonly ? "primary" : "primary"'
          :icon='isReadonly ? "check" : undefined'
          :label='isReadonly ? ($t("close") || "关闭") : $t("ok")'
          @click='onPrimaryClick'
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { v4 as uuidv4 } from 'uuid'
import { createDefaultEchoAnnoSource } from 'components/echo/EchoRuntime'
import { DEFAULT_ECHO_COLOR, DEFAULT_ECHO_ICON } from 'components/echo/builtin-echo-shared'
import { DEFAULT_ECHO_CATEGORY, getEchoCategoryValue } from 'src/utils/const/runeEchoCategoriesConst'

import EchoFormFields from './EchoFormFields.vue'
import EchoFormEditor from './EchoFormEditor.vue'

const DEFAULT_RENDER_TYPE = 'anno'

const createUuid = () => uuidv4()

export default {
  name: 'EchoFormDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  components: {
    EchoFormFields,
    EchoFormEditor
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
      form: {
        id: '',
        name: '',
        desc: '',
        color: DEFAULT_ECHO_COLOR,
        icon: DEFAULT_ECHO_ICON,
        anno_source: createDefaultEchoAnnoSource(),
        render_type: DEFAULT_RENDER_TYPE,
        category: DEFAULT_ECHO_CATEGORY,
        isBuiltin: false
      }
    }
  },
  computed: {
    isEditing () {
      return !!this.echo
    },
    isBuiltin () {
      return Boolean(this.echo && this.echo.isBuiltin)
    },
    isProd () {
      return process.env.PROD === true
    },
    isReadonly () {
      return this.isBuiltin && this.isProd
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
    echo: {
      immediate: true,
      handler (val) {
        if (val) {
          const annoSource = val.anno_source || val.template || createDefaultEchoAnnoSource(val.name)
          const category = val.isBuiltin ? (val.category || 'builtin') : getEchoCategoryValue(val.category)
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
        }
      }
    }
  },
  mounted () {
    this.dialog = this.$refs.dialog
  },
  methods: {
    onPrimaryClick () {
      if (this.isReadonly) {
        if (this.dialog) this.dialog.hide()
        return
      }
      this.submit()
    },

    submit () {
      if (this.isReadonly) {
        if (this.dialog) this.dialog.hide()
        return
      }
      const name = String(this.form.name || '').trim()
      if (!name) {
        this.$q.notify({ message: this.$t('echoNameRequired'), type: 'warning', position: 'top' })
        return
      }
      const editorRef = this.$refs.echoFormEditor
      const annoSource = editorRef && editorRef.getSource
        ? editorRef.getSource()
        : (this.form.anno_source || '')
      if (!annoSource.trim()) return
      const category = this.form.isBuiltin
        ? (this.form.category || 'builtin')
        : getEchoCategoryValue(this.form.category)
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
  align-items: stretch;
  height: 100%;
  overflow: hidden;
}

.echo-form-footer {
  flex: 0 0 auto;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.03);
}

/* Dark mode overrides */
.body--dark .echo-form-footer {
  border-top-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
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
}
</style>
