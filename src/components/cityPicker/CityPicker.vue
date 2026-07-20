/**
 * CityPicker - jQuery city-picker 原版 Vue Wrapper
 *
 * 直接封装原始 city-picker jQuery 插件（v1.2.0），保持 100% 兼容。
 * 使用 window.ChineseDistricts 数据源。
 *
 * 使用前提：
 * 1. 在 index.html 中引入 jQuery、ChineseDistricts.js、city-picker.js
 *    <script src="https://cdn.jsdelivr.net/npm/jquery@1/dist/jquery.min.js"></script>
 *    <script src="/js/ChineseDistricts.js"></script>
 *    <script src="/js/city-picker.js"></script>
 *
 * Props:
 *   value           v-model，选中值（省/市/区 路径）
 *   simple         是否简化显示
 *   level          级别: 'province' | 'city' | 'district'
 *   placeholder    占位文字
 *   disabled       是否禁用
 *   responsive     是否响应式宽度
 *
 * Events:
 *   input          v-model 触发
 *   change         选中变化时触发 (value)
 */
<template>
  <div class='city-picker-root'>
    <input
      ref='input'
      type='text'
      :value='internalValue'
      :placeholder='placeholder'
      :disabled='disabled'
      data-toggle='city-picker'
    />
  </div>
</template>

<script>
export default {
  name: 'CityPicker',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: String,
      default: ''
    },
    simple: {
      type: Boolean,
      default: false
    },
    level: {
      type: String,
      default: 'district',
      validator: v => ['province', 'city', 'district'].indexOf(v) !== -1
    },
    placeholder: {
      type: String,
      default: '请选择省/市/区'
    },
    disabled: {
      type: Boolean,
      default: false
    },
    responsive: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      internalValue: this.value || '',
      _jpInstance: null
    }
  },
  watch: {
    value (val) {
      if (val !== this.internalValue) {
        this.internalValue = val || ''
        this._syncToJQuery()
      }
    },
    disabled (val) {
      if (val) {
        this._closeDropdown()
      }
    }
  },
  mounted () {
    this.$nextTick(() => {
      this._initJQueryPlugin()
    })
  },
  beforeDestroy () {
    this._destroyJQueryPlugin()
  },
  methods: {
    _getJQuery () {
      return window.jQuery || window.$
    },
    _initJQueryPlugin () {
      const $ = this._getJQuery()
      if (!$) {
        console.error('[CityPicker] jQuery not found on window')
        return
      }
      if (typeof window.ChineseDistricts === 'undefined') {
        console.error('[CityPicker] ChineseDistricts not loaded')
        return
      }
      if (typeof $.fn.citypicker !== 'function') {
        console.error('[CityPicker] city-picker plugin not found')
        return
      }

      const $input = $(this.$refs.input)

      // 销毁已有实例
      if ($input.data('citypicker')) {
        try { $input.citypicker('destroy') } catch (e) { /* noop */ }
      }

      // 初始化
      $input.citypicker({
        simple: this.simple,
        level: this.level,
        responsive: this.responsive,
        placeholder: this.placeholder
      })

      this._jpInstance = $input.data('citypicker')

      // 监听插件的更新事件
      $input.on('cp:updated', () => {
        const newVal = $input.val() || ''
        if (newVal !== this.internalValue) {
          this.internalValue = newVal
          this.$emit('input', newVal)
          this.$emit('change', newVal)
        }
      })

      // 同步外部 value 到插件
      if (this.internalValue) {
        this._syncToJQuery()
      }
    },
    _syncToJQuery () {
      const $ = this._getJQuery()
      if (!$) return
      const $input = $(this.$refs.input)
      const currentVal = $input.val() || ''
      if (currentVal !== this.internalValue) {
        $input.val(this.internalValue)
        if (this._jpInstance) {
          try { this._jpInstance.refresh(true) } catch (e) { /* noop */ }
        }
      }
    },
    _closeDropdown () {
      if (this._jpInstance) {
        try { this._jpInstance.close() } catch (e) { /* noop */ }
      }
    },
    _destroyJQueryPlugin () {
      const $ = this._getJQuery()
      if (!$) return
      const $input = $(this.$refs.input)
      $input.off('cp:updated')
      try {
        $input.citypicker('destroy')
      } catch (e) { /* noop */ }
      this._jpInstance = null
    },
    // 公开 API
    getCode (type) {
      if (!this._jpInstance) return null
      try { return this._jpInstance.getCode(type) } catch (e) { return null }
    },
    reset () {
      if (this._jpInstance) {
        try { this._jpInstance.reset() } catch (e) { /* noop */ }
      }
    },
    refresh () {
      if (this._jpInstance) {
        try { this._jpInstance.refresh(true) } catch (e) { /* noop */ }
      }
    }
  }
}
</script>

<style lang='scss'>
/* 复刻 jQuery 原版样式，与原始 city-picker.css 保持一致 */
.city-picker-root {
  display: inline-block;
  width: 100%;
}

.city-picker-input {
  opacity: 0 !important;
  position: absolute;
  width: 1px;
  height: 1px;
  pointer-events: none;
}

.city-picker-span {
  position: relative;
  display: block;
  outline: 0;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
  border-bottom: 1px solid #ccc;
  background-color: #fff;
  color: #ccc;
  cursor: pointer;
  min-height: 32px;
  padding: 4px 0;
  box-sizing: border-box;
}

.city-picker-span > .placeholder {
  color: #aaa;
  padding: 4px 0;
  display: block;
}

.city-picker-span > .title {
  display: none;
}

.city-picker-span > .title > span {
  color: #333;
  padding: 5px;
  border-radius: 3px;
}

.city-picker-span > .title > span:hover {
  background-color: #f1f8ff;
}

.city-picker-span > .arrow {
  position: absolute;
  top: 50%;
  right: 8px;
  width: 10px;
  height: 5px;
  margin-top: -3px;
  background: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAlklEQVQYV2NkYGD4z4AHMP6PZgYGBgYGBgZ4NzA8BjAigjCgNgyoLkBMNxD9AqoL0A2AeQG0L0ANA9UFsL6g+wVMA6gugPZBQE0XwPoCtC9A+wKIPwg1gOgXUH0A1g9g/QDaD6D9AOIPQg0g+gVUH0D1A1g/gPYDaD8A5Q+i+gDqC9C+AO0H0H4A7Qeg/kF0F0D7AbQfQPsBtB+A9ANRXYDoA4h+ANEPIPoBRD9A9AsI/QKCH0D0A4h+ANEPIPoBRD+A6BcQ/QKiX0D0C4h+AdEvIPoFRL+A6BcQ/QKiX0D0C4h+AdEvIPoFRL+A6BcQ/QKiX0D0C4h+AdEvwPwHAAA0qJf3lJq8YwAAAABJRU5ErkJggg==') -10px -25px no-repeat;
}

.city-picker-span.focus,
.city-picker-span.open {
  border-bottom-color: #46A4FF;
}

.city-picker-span.open > .arrow {
  background-position: -10px -10px;
}

.city-picker-dropdown {
  position: absolute;
  width: 315px;
  left: -9999px;
  top: -9999px;
  outline: 0;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
  z-index: 999999;
  display: none;
  min-width: 330px;
  margin-bottom: 20px;
}

.city-select-wrap {
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.5);
  background: #fff;
}

.city-select-tab {
  border-bottom: 1px solid #ccc;
  background: #f0f0f0;
  font-size: 13px;
  display: flex;
}

.city-select-tab > a {
  display: inline-block;
  padding: 8px 22px;
  border-left: 1px solid #ccc;
  border-bottom: 1px solid transparent;
  color: #4D4D4D;
  text-align: center;
  outline: 0;
  text-decoration: none;
  cursor: pointer;
  font-size: 14px;
  margin-bottom: -1px;
  background: transparent;
  border-top: none;
  border-right: none;
}

.city-select-tab > a.active {
  background: #fff;
  border-bottom: 1px solid #fff;
  color: #46A4FF;
}

.city-select-tab > a:first-child {
  border-left: none;
}

.city-select-tab > a:last-child.active {
  border-right: 1px solid #ccc;
}

.city-select-content {
  width: 100%;
  min-height: 10px;
  background-color: #fff;
  padding: 10px 15px;
  box-sizing: border-box;
}

.city-select {
  font-size: 13px;
}

.city-select dl {
  line-height: 2;
  clear: both;
  padding: 3px 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
}

.city-select dt {
  width: 3em;
  font-weight: 500;
  text-align: right;
  padding-right: 8px;
  line-height: 2;
  flex-shrink: 0;
}

.city-select dd {
  margin-left: 0;
  line-height: 2;
  flex: 1;
}

.city-select.province dd {
  margin-left: 0;
}

.city-select a {
  display: inline-block;
  padding: 0 10px;
  outline: 0;
  text-decoration: none;
  white-space: nowrap;
  margin-right: 2px;
  color: #333;
  cursor: pointer;
  border-radius: 2px;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 100%;
}

.city-select a:hover,
.city-select a:focus {
  background-color: #f1f8ff;
  color: #46A4FF;
}

.city-select a.active {
  background-color: #46A4FF;
  color: #fff;
}

/* Select item in trigger */
.city-picker-span .select-item {
  display: inline-block;
  padding: 2px 6px;
  margin: 2px;
  cursor: pointer;
}

.city-picker-span .select-item:hover {
  background-color: #f1f8ff;
}

/* Dark mode */
.body--dark {
  .city-picker-span {
    background-color: #2a2a2a;
    border-bottom-color: #434343;
    color: rgba(255, 255, 255, 0.5);
  }

  .city-picker-span > .placeholder {
    color: rgba(255, 255, 255, 0.35);
  }

  .city-picker-span > .title > span {
    color: rgba(255, 255, 255, 0.85);
  }

  .city-picker-dropdown {
    background: #2a2a2a;
  }

  .city-select-wrap {
    background: #2a2a2a;
  }

  .city-select-tab {
    background: #333;
    border-bottom-color: #434343;
  }

  .city-select-tab > a {
    color: rgba(255, 255, 255, 0.7);
    border-left-color: #434343;
  }

  .city-select-tab > a.active {
    color: #46A4FF;
    background: #2a2a2a;
  }

  .city-select-content {
    background: #2a2a2a;
  }

  .city-select dt {
    color: rgba(255, 255, 255, 0.65);
  }

  .city-select a {
    color: rgba(255, 255, 255, 0.85);
  }

  .city-select a:hover,
  .city-select a:focus {
    background-color: rgba(70, 164, 255, 0.15);
    color: #46A4FF;
  }

  .city-select a.active {
    background-color: #46A4FF;
    color: #fff;
  }
}
</style>
