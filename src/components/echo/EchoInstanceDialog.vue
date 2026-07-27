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

        <!-- 有 schema：form-create 动态渲染（Element-UI 控件） -->
        <div v-if='formCreateRule.length' class='echo-instance-field'>
          <div class='echo-instance-label'>实例参数</div>
          <form-create
            :rule='formCreateRule'
            v-model='fApi'
            :option='formCreateOption'
            @submit='onFormCreateSubmit'
          />
        </div>

        <!-- 没有 schema：降级为旧版 textarea（仅编辑 value） -->
        <div v-else class='echo-instance-field'>
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

        <!-- 未声明字段（schema 没覆盖、attrs 里又有值的字段）按值类型推断渲染 -->
        <div v-if='inferredRule.length' class='echo-instance-field'>
          <div class='echo-instance-label echo-instance-label--minor'>未声明字段</div>
          <form-create
            :rule='inferredRule'
            v-model='fApiInferred'
            :option='formCreateOption'
          />
          <div class='echo-instance-help'>
            这些字段不在 echo schema 里，按值类型自动推断：boolean → switch / number → inputNumber / 其他 → input。
          </div>
        </div>

        <div class='echo-instance-help'>
          这里只会更新当前笔记中这个回响实例的 <code>attrs</code>（含 <code>value</code> 与所有声明字段），不会修改回响定义源码。
        </div>
      </q-card-section>

      <q-card-actions align='right' class='echo-instance-footer'>
        <q-btn flat dense no-caps label='编辑定义' @click='openDefinitionEditor' />
        <q-space />
        <q-btn flat dense no-caps :label="$t('cancel')" @click='dialog && dialog.hide()' />
        <q-btn flat dense no-caps color='primary' :label='$t("ok")' @click='submit' />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { decodeEchoPayload, encodeEchoPayload } from 'components/echo/EchoRuntime'
import { buildFormCreateRule, resolveAttrsSchema } from 'components/echo/builtinEchoAttrsSchema'

// 基础设施字段：EchoRuntime / 弹框自动管理，不应让用户编辑，也不参与 schema
const RESERVED_ATTRS_FIELDS = new Set(['id', 'definitionId', 'value', 'inheritFromPrevious', 'kind'])

// 按值类型推断未声明字段的 form-create rule
const inferRuleFromValue = (key, value) => {
  if (typeof value === 'boolean') {
    return {
      type: 'switch',
      field: key,
      title: key,
      value,
      props: { activeValue: true, inactiveValue: false }
    }
  }
  if (typeof value === 'number') {
    return {
      type: 'input-number',
      field: key,
      title: key,
      value
    }
  }
  return {
    type: 'input',
    field: key,
    title: key,
    value: value === undefined || value === null ? '' : String(value)
  }
}

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
      fApi: {},
      fApiInferred: {},
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
    },
    // 当前实例的 attrs（合并基础设施字段 + 用户声明字段 + 推断字段的运行时值）
    currentAttrs () {
      const payload = String(this.form.payload || '')
      const decoded = decodeEchoPayload(payload)
      const fromPayload = (decoded && decoded.attrs && typeof decoded.attrs === 'object') ? decoded.attrs : {}
      // 把 form.value 也回填到 attrs.value（保持单一来源）
      return {
        ...fromPayload,
        id: this.form.echoId || fromPayload.id || '',
        definitionId: this.form.definitionId || fromPayload.definitionId || '',
        value: this.form.value || ''
      }
    },
    // 用户在 form-create 里编辑的字段集合（合并所有 rule 的 field）
    formCreateRule () {
      return buildFormCreateRule(this.echoMeta, this.currentAttrs)
    },
    // 未声明字段：attrs 里出现、但 schema 没列、又不是基础设施的字段
    inferredRule () {
      const schema = resolveAttrsSchema(this.echoMeta)
      const declaredFields = new Set(schema.map(item => String(item?.field || '').trim()).filter(Boolean))
      const attrs = this.currentAttrs
      return Object.keys(attrs)
        .filter(key => !RESERVED_ATTRS_FIELDS.has(key) && !declaredFields.has(key))
        .map(key => inferRuleFromValue(key, attrs[key]))
    },
    formCreateOption () {
      return {
        submitBtn: false,
        resetBtn: false,
        form: { labelWidth: '100px' }
      }
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
        this.$nextTick(() => this.reSyncFormCreate())
      }
    }
  },
  mounted () {
    this.dialog = this.$refs.dialog
  },
  methods: {
    // 把 form-create 控件里的当前值拉回到 this.form（用 fApi.formData()）
    collectFormCreateValues () {
      const merged = { ...this.currentAttrs }
      const pull = (fApi) => {
        if (!fApi || typeof fApi.formData !== 'function') return
        const data = fApi.formData() || {}
        Object.keys(data).forEach((key) => {
          merged[key] = data[key]
        })
      }
      pull(this.fApi)
      pull(this.fApiInferred)
      // form.value 是基础设施字段，从 this.form 同步过来
      merged.value = this.form.value || ''
      merged.id = this.form.echoId || ''
      merged.definitionId = this.form.definitionId || ''
      merged.inheritFromPrevious = false
      return merged
    },
    // 弹框打开 / instance 变化时，把当前 attrs 值刷到 form-create 控件
    reSyncFormCreate () {
      const push = (fApi, rule, attrs) => {
        if (!fApi || typeof fApi.setValue !== 'function' || !rule.length) return
        const payload = {}
        rule.forEach(item => {
          const key = String(item.field || '').trim()
          if (!key) return
          payload[key] = attrs[key] !== undefined ? attrs[key] : (item.value !== undefined ? item.value : '')
        })
        try { fApi.setValue(payload) } catch (e) { /* ignore */ }
      }
      push(this.fApi, this.formCreateRule, this.currentAttrs)
      push(this.fApiInferred, this.inferredRule, this.currentAttrs)
    },
    buildPayload () {
      const mergedAttrs = this.collectFormCreateValues()
      // 保留原 prompt 文本，避免 schema 里没显式管的字段（如长文本 prompt）被覆盖
      const originalDecoded = decodeEchoPayload(this.form.payload || '')
      const originalPrompt = String(originalDecoded?.prompt || '')
      return encodeEchoPayload({
        prompt: originalPrompt,
        attrs: mergedAttrs
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
    },
    onFormCreateSubmit (formData) {
      // form-create 自带提交按钮被禁用了，这里只是兜底
      // 直接复用 submit()
      this.submit()
    }
  }
}
</script>

<style scoped>
.echo-instance-card {
  min-width: 560px;
  max-width: 88vw;
  width: 680px;
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
  overflow-y: auto;
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

.echo-instance-label--minor {
  color: rgba(0, 0, 0, 0.45);
  font-style: italic;
}

.echo-instance-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.echo-instance-input {
  /* 兼容旧版 q-input 样式 */
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

.body--dark .echo-instance-label--minor {
  color: rgba(255, 255, 255, 0.5);
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