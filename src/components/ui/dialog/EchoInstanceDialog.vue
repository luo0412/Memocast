<template>
  <q-dialog
    ref='dialog'
    transition-show='fade'
    transition-hide='fade'
    :value='value'
    @input='v => $emit("input", v)'
    :persistent='false'
  >
    <q-card class='echo-instance-card'>
      <q-toolbar class='echo-instance-toolbar'>
        <q-icon :name='echoMeta.icon || "graphic_eq"' :color='accentColorClass' size='1.5em' />
        <q-toolbar-title>
          <span class='text-weight-bold non-selectable'>
            {{ echoMeta.name || '回响实例' }}
          </span>
        </q-toolbar-title>
        <q-btn flat round dense icon='close' v-close-popup />
      </q-toolbar>

      <q-card-section class='echo-instance-body'>
        <div class='echo-instance-summary'>
          <div class='echo-instance-summary__title'>{{ echoMeta.name || '回响' }}</div>
          <div v-if='echoMeta.desc' class='echo-instance-summary__desc'>{{ echoMeta.desc }}</div>
          <div class='echo-instance-summary__meta'>
            <span>实例 ID: <code>{{ form.echoId || '-' }}</code></span>
          </div>
        </div>

        <div class='echo-instance-field'>
          <div class='echo-instance-label'>实例内容</div>
          <q-input
            v-model='form.value'
            type='textarea'
            autogrow
            outlined
            dense
            :placeholder='echoMeta.name ? `输入 ${echoMeta.name} 的实例内容` : "输入实例内容"'
            class='echo-instance-input'
          />
        </div>

        <div class='echo-instance-help'>
          这里只会更新当前笔记中这个回响实例的 <code>attrs.value</code> / <code>prompt</code>，不会修改回响定义源码。
        </div>
      </q-card-section>

      <q-card-actions align='right' class='echo-instance-footer'>
        <q-btn flat dense no-caps label='编辑定义' @click='openDefinitionEditor' />
        <q-space />
        <q-btn flat dense no-caps :label="$t('cancel')" @click='dialog && dialog.hide()' />
        <q-btn flat dense no-caps color='primary' :label="$t('ok')" @click='submit' />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { decodeEchoPayload, encodeEchoPayload } from 'components/ui/editor/EchoRuntime'

export default {
  name: 'EchoInstanceDialog',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Boolean,
      default: false
    },
    instance: {
      type: Object,
      default: null
    },
    echo: {
      type: Object,
      default: null
    }
  },
  data () {
    return {
      dialog: null,
      form: {
        echoId: '',
        nodeId: '',
        echoName: '',
        definitionId: '',
        value: '',
        payload: ''
      }
    }
  },
  computed: {
    echoMeta () {
      return this.echo || {}
    },
    accentColorClass () {
      return 'teal-5'
    }
  },
  watch: {
    instance: {
      immediate: true,
      handler (val) {
        const payload = String(val?.payload || '')
        const decoded = decodeEchoPayload(payload)
        this.form = {
          echoId: String(val?.echoId || decoded?.attrs?.id || '').trim(),
          nodeId: String(val?.nodeId || '').trim(),
          echoName: String(val?.echoName || '').trim(),
          definitionId: String(val?.definitionId || decoded?.attrs?.definitionId || '').trim(),
          value: typeof decoded?.attrs?.value === 'string' ? decoded.attrs.value : decoded.prompt || '',
          payload
        }
      }
    }
  },
  mounted () {
    this.dialog = this.$refs.dialog
  },
  methods: {
    buildPayload () {
      return encodeEchoPayload({
        prompt: this.form.value || '',
        attrs: {
          ...(decodeEchoPayload(this.form.payload || '').attrs || {}),
          id: this.form.echoId || '',
          definitionId: this.form.definitionId || '',
          value: this.form.value || ''
        }
      })
    },
    submit () {
      this.$emit('submit', {
        echoId: this.form.echoId,
        nodeId: this.form.nodeId,
        echoName: this.form.echoName,
        payload: this.buildPayload(),
        mode: 'update-instance'
      })
      if (this.dialog) {
        this.dialog.hide()
      }
    },
    openDefinitionEditor () {
      this.$emit('open-definition', {
        echoId: this.form.echoId,
        nodeId: this.form.nodeId,
        echoName: this.form.echoName,
        payload: this.buildPayload()
      })
      if (this.dialog) {
        this.dialog.hide()
      }
    }
  }
}
</script>

<style scoped>
.echo-instance-card {
  min-width: 520px;
  max-width: 88vw;
  width: 640px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.echo-instance-toolbar {
  flex: 0 0 auto;
}

.echo-instance-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.echo-instance-summary {
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(38, 166, 154, 0.1);
  border: 1px solid rgba(38, 166, 154, 0.25);
}

.echo-instance-summary__title {
  font-size: 15px;
  font-weight: 600;
}

.echo-instance-summary__desc {
  margin-top: 6px;
  color: rgba(0, 0, 0, 0.6);
  line-height: 1.5;
}

.echo-instance-summary__meta {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
}

.echo-instance-summary__meta code,
.echo-instance-help code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(0, 0, 0, 0.08);
  padding: 1px 4px;
  border-radius: 4px;
}

.echo-instance-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  margin-bottom: 6px;
}

.echo-instance-help {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
  line-height: 1.6;
}

.echo-instance-footer {
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding: 8px 16px;
}

.body--dark .echo-instance-summary__desc {
  color: rgba(255, 255, 255, 0.74);
}

.body--dark .echo-instance-summary__meta {
  color: rgba(255, 255, 255, 0.68);
}

.body--dark .echo-instance-summary__meta code,
.body--dark .echo-instance-help code {
  background: rgba(255, 255, 255, 0.08);
}

.body--dark .echo-instance-label {
  color: rgba(255, 255, 255, 0.62);
}

.body--dark .echo-instance-help {
  color: rgba(255, 255, 255, 0.7);
}

.body--dark .echo-instance-footer {
  border-top-color: rgba(255, 255, 255, 0.08);
}

@media (max-width: 760px) {
  .echo-instance-card {
    width: 96vw;
    min-width: auto;
  }
}
</style>
