<template>
  <div class='city-picker-field' :style='containerStyle'>
    <input
      ref='inputEl'
      :id='inputId'
      readonly
      type='text'
      :placeholder='placeholder'
      class='city-picker-input'
    />
  </div>
</template>

<script>
let uniqueCounter = 0

export default {
  name: 'CityPickerField',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Object,
      default: () => ({ province: '', city: '', district: '' })
    },
    placeholder: {
      type: String,
      default: '点击选择省/市/区'
    },
    width: {
      type: [String, Number],
      default: 260
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  data () {
    uniqueCounter += 1
    return {
      inputId: `city-picker-input-${Date.now().toString(36)}-${uniqueCounter}`,
      ready: false,
      pollTimer: null,
      internalValue: this._normalize(this.value)
    }
  },
  computed: {
    containerStyle () {
      const w = typeof this.width === 'number' ? `${this.width}px` : this.width
      return { width: w }
    }
  },
  watch: {
    value: {
      deep: true,
      handler (val) {
        const normalized = this._normalize(val)
        const prev = this.internalValue
        if (prev.province === normalized.province
          && prev.city === normalized.city
          && prev.district === normalized.district) {
          return
        }
        this.internalValue = normalized
        if (this.ready) this._applyToPicker(normalized)
      }
    },
    disabled (val) {
      if (!this.ready) return
      const inputEl = this._input()
      const $ = window.$ || window.jQuery
      if (!inputEl || !$ || !$.fn || !$.fn.citypicker) return
      try {
        if (val) $(inputEl).citypicker('destroy')
      } catch (_) { /* noop */ }
    }
  },
  mounted () {
    this.$nextTick(() => this._scheduleInit())
  },
  beforeDestroy () {
    this._destroy()
  },
  methods: {
    _normalize (val) {
      const base = val && typeof val === 'object' ? val : {}
      return {
        province: base.province || '',
        city: base.city || '',
        district: base.district || ''
      }
    },
    _input () {
      return this.$refs.inputEl || document.getElementById(this.inputId)
    },
    _scheduleInit () {
      this._teardownPoll()
      let attempt = 0
      const maxAttempts = 80
      const tryInit = () => {
        const inputEl = this._input()
        const $ = (typeof window !== 'undefined' && (window.$ || window.jQuery))
        const hasCitypicker = !!($ && $.fn && $.fn.citypicker)
        if (inputEl && $ && hasCitypicker) {
          this.pollTimer = null
          this._attach(inputEl, $)
          return
        }
        attempt += 1
        if (attempt >= maxAttempts) {
          console.warn('[CityPickerField] jQuery citypicker not ready, give up')
          this.pollTimer = null
          return
        }
        this.pollTimer = setTimeout(tryInit, 100)
      }
      this.pollTimer = setTimeout(tryInit, 0)
    },
    _attach (inputEl, $) {
      try {
        if ($.fn && $.fn.citypicker && $(inputEl).data && $(inputEl).data('citypicker')) {
          $(inputEl).citypicker('destroy')
        }
      } catch (_) { /* noop */ }
      if (this.disabled) {
        this.ready = true
        return
      }
      try {
        $(inputEl).citypicker({
          province: this.internalValue.province || '',
          city: this.internalValue.city || '',
          district: this.internalValue.district || ''
        })
      } catch (err) {
        console.warn('[CityPickerField] citypicker init error:', err && err.message)
        this.ready = true
        return
      }
      $(inputEl).off('cp:updated.cpf')
      $(inputEl).on('cp:updated.cpf', () => this._onPickerUpdated(inputEl, $))
      this.ready = true
    },
    _onPickerUpdated (inputEl, $) {
      let next
      try {
        next = $(inputEl).citypicker('getValue')
      } catch (_) {
        return
      }
      const normalized = this._normalize(next)
      const prev = this.internalValue
      if (prev.province === normalized.province
        && prev.city === normalized.city
        && prev.district === normalized.district) {
        return
      }
      this.internalValue = normalized
      this.$emit('input', { ...normalized })
      this.$emit('change', { ...normalized })
    },
    _applyToPicker (val) {
      const inputEl = this._input()
      const $ = window.$ || window.jQuery
      if (!inputEl || !$ || !$.fn || !$.fn.citypicker) return
      if (!$(inputEl).data || !$(inputEl).data('citypicker')) return
      try {
        $(inputEl).citypicker('reset')
        if (val.province) {
          $(inputEl).citypicker('setValue', val.province, val.city || '', val.district || '')
        }
      } catch (_) { /* noop */ }
    },
    _destroy () {
      this._teardownPoll()
      const inputEl = this._input()
      const $ = window.$ || window.jQuery
      if (inputEl && $ && $.fn && $.fn.citypicker && $(inputEl).data && $(inputEl).data('citypicker')) {
        try {
          $(inputEl).citypicker('destroy')
        } catch (_) { /* noop */ }
      }
      $(inputEl).off && $(inputEl).off('cp:updated.cpf')
      this.ready = false
    },
    _teardownPoll () {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer)
        this.pollTimer = null
      }
    }
  }
}
</script>

<style lang='scss' scoped>
.city-picker-field {
  flex: 0 0 auto;
  position: relative;
  min-width: 240px;
}

.city-picker-input {
  width: 100%;
  height: 32px;
  font-size: 13px;
  padding: 0 10px;
  border-radius: 4px;
  border: 1px solid #c0c0c0;
  background: #fff;
  color: rgba(0, 0, 0, 0.85);
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.city-picker-input:hover,
.city-picker-input:focus {
  border-color: #43a047;
  box-shadow: 0 0 0 2px rgba(67, 160, 71, 0.2);
}

.body--dark .city-picker-input {
  background: #34383e;
  border-color: #4a4a4a;
  color: rgba(255, 255, 255, 0.85);
}
</style>
