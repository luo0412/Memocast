/**
 * CascaderPanelPicker - 多级联动下钻选择面板
 *
 * 复刻 city-picker jQuery 插件的交互模式，支持任意层级的动态数据。
 * 数据源由外部传入，支持省市区、符文分类等任意三级以内联动场景。
 *
 * Props:
 *   value           v-model，选中值（路径字符串，如 "广东省/广州市/天河区"）
 *   data           树形数据源（数组格式）
 *   level          最大层级深度: 1 | 2 | 3
 *   placeholder    占位文字
 *   disabled       是否禁用
 *   popoverWidth   下拉面板宽度
 *   separator      路径分隔符，默认 '/'
 *   showChildCount 是否显示子节点数量
 *
 * Events:
 *   input          v-model 触发
 *   change         选中变化时触发 (value, selectedObj)
 *
 * 数据格式示例：
 *   [
 *     { code: "11", name: "北京市", children: [
 *       { code: "1101", name: "市辖区", children: [
 *         { code: "110101", name: "东城区" }
 *       ]}
 *     ]}
 *   ]
 */
<template>
  <div class='cascader-panel-wrapper' :class='{ "is-disabled": disabled }'>
    <!-- 触发器 -->
    <div
      ref='trigger'
      class='cascader-panel-trigger'
      :class='{ "is-empty": !displayValue, "is-open": popoverVisible }'
      @click='onTriggerClick'
    >
      <span v-if='displayValue' class='cascader-panel-trigger-text'>{{ displayValue }}</span>
      <span v-else class='cascader-panel-trigger-placeholder'>{{ placeholder }}</span>
      <i class='cascader-panel-trigger-arrow el-icon-arrow-down' />
    </div>

    <!-- 下拉面板 -->
    <el-popover
      ref='popover'
      v-model='popoverVisible'
      placement='bottom-start'
      :width='popoverWidth'
      trigger='click'
      popper-class='cascader-panel-popover'
      :disabled='disabled'
      :append-to-body='true'
      @hide='onPopoverHide'
    >
      <div class='cascader-panel'>
        <!-- Tabs 切换 -->
        <div class='cascader-panel-tabs'>
          <a
            v-for='(tab, idx) in visibleTabs'
            :key='tab.code || "root"'
            class='cascader-panel-tab'
            :class='{ "is-active": activeTabIndex === idx }'
            @click='switchTab(idx)'
          >
            <span v-if='idx > 0' class='cascader-panel-tab-sep'>{{ separator }}</span>
            <span class='cascader-panel-tab-title'>{{ tab.title }}</span>
          </a>
          <!-- 返回按钮 -->
          <a
            v-if='activeTabIndex > 0'
            class='cascader-panel-tab-back el-icon-arrow-left'
            @click='goBack'
          />
        </div>

        <!-- 选择列表 -->
        <div class='cascader-panel-content'>
          <div class='cascader-panel-list'>
            <div class='cascader-panel-list-inner'>
              <a
                v-for='item in currentList'
                :key='item.code'
                class='cascader-panel-item'
                :class='{
                  "is-active": isItemSelected(item),
                  "is-parent": hasChildren(item)
                }'
                :title='item.name'
                @click='onItemClick(item, $event)'
              >
                <span class='cascader-panel-item-text'>{{ item.name }}</span>
                <span v-if='showChildCount && hasChildren(item)' class='cascader-panel-item-count'>
                  {{ getChildCount(item) }}
                </span>
                <i v-if='hasChildren(item)' class='cascader-panel-item-arrow el-icon-arrow-right' />
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- 触发器 slot -->
      <div slot='reference' style='display:none;' />
    </el-popover>
  </div>
</template>

<script>
export default {
  name: 'CascaderPanelPicker',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: String,
      default: ''
    },
    data: {
      type: Array,
      default: () => []
    },
    level: {
      type: Number,
      default: 3,
      validator: v => v >= 1 && v <= 3
    },
    placeholder: {
      type: String,
      default: '请选择'
    },
    disabled: {
      type: Boolean,
      default: false
    },
    popoverWidth: {
      type: [Number, String],
      default: 330
    },
    separator: {
      type: String,
      default: '/'
    },
    showChildCount: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      popoverVisible: false,
      activeTabIndex: 0,
      selectedPath: [], // [{ code, name, children }]
      tabs: [] // [{ title, list }]
    }
  },
  computed: {
    displayValue () {
      return this.selectedPath.map(p => p.name).join(' ' + this.separator + ' ')
    },
    visibleTabs () {
      return this.tabs
    },
    currentList () {
      if (this.activeTabIndex >= this.tabs.length) return []
      return this.tabs[this.activeTabIndex].list
    }
  },
  watch: {
    value: {
      immediate: true,
      handler (val) {
        this.parseValue(val)
      }
    },
    data: {
      immediate: true,
      handler () {
        this.initTabs()
        this.parseValue(this.value)
      }
    },
    disabled (val) {
      if (val) this.popoverVisible = false
    }
  },
  mounted () {
    this.initTabs()
  },
  methods: {
    initTabs () {
      this.tabs = [{ title: '全部', list: this.data || [] }]
      this.activeTabIndex = 0
    },
    parseValue (val) {
      if (!val || !this.data || this.data.length === 0) {
        this.selectedPath = []
        return
      }
      const parts = val.split(this.separator).map(p => p.trim()).filter(Boolean)
      this.selectedPath = []
      this.initTabs()

      let currentList = this.data
      for (let i = 0; i < parts.length && i < this.level; i++) {
        const found = currentList.find(item => item.name === parts[i])
        if (!found) break
        this.selectedPath.push({ code: found.code, name: found.name, children: found.children })
        if (found.children && found.children.length > 0 && i < this.level - 1) {
          this.tabs.push({ title: found.name, list: found.children })
          currentList = found.children
        }
      }
      this.activeTabIndex = Math.min(this.selectedPath.length, this.tabs.length - 1)
    },
    hasChildren (item) {
      return !!(item && item.children && item.children.length > 0)
    },
    getChildCount (item) {
      return item && item.children ? item.children.length : 0
    },
    isItemSelected (item) {
      const current = this.selectedPath[this.activeTabIndex]
      return !!(current && current.code === item.code)
    },
    onItemClick (item, evt) {
      evt.stopPropagation()
      evt.preventDefault()

      // 更新当前层级选中
      if (this.activeTabIndex >= this.selectedPath.length) {
        this.selectedPath.push({ code: item.code, name: item.name, children: item.children })
      } else {
        this.selectedPath = this.selectedPath.slice(0, this.activeTabIndex)
        this.selectedPath.push({ code: item.code, name: item.name, children: item.children })
      }

      if (this.hasChildren(item) && this.activeTabIndex < this.level - 1) {
        // 有子节点，下钻
        this.tabs = this.tabs.slice(0, this.activeTabIndex + 1)
        this.tabs.push({ title: item.name, list: item.children })
        this.activeTabIndex++
      } else {
        // 叶子节点，选中并关闭
        this.popoverVisible = false
        this.emitChange()
      }
    },
    switchTab (idx) {
      this.activeTabIndex = idx
      // 裁剪 selectedPath
      if (idx < this.selectedPath.length) {
        this.selectedPath = this.selectedPath.slice(0, idx)
      }
    },
    goBack () {
      if (this.activeTabIndex > 0) {
        this.switchTab(this.activeTabIndex - 1)
      }
    },
    emitChange () {
      const val = this.getValue()
      this.$emit('input', val)
      this.$emit('change', val, this.getSelectedObj())
    },
    getValue () {
      return this.selectedPath.map(p => p.name).join(this.separator)
    },
    getSelectedObj () {
      return this.selectedPath.map(p => ({ code: p.code, name: p.name }))
    },
    onTriggerClick () {
      if (this.disabled) return
      this.popoverVisible = !this.popoverVisible
    },
    onPopoverHide () {
      this.popoverVisible = false
    },
    reset () {
      this.selectedPath = []
      this.initTabs()
      this.emitChange()
    }
  }
}
</script>

<style lang='scss'>
.cascader-panel-wrapper {
  display: inline-block;
  width: 100%;
  position: relative;
}

.cascader-panel-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.85);
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;

  &:hover {
    border-color: #7E57C2;
  }

  &.is-open {
    border-color: #7E57C2;
    box-shadow: 0 0 0 2px rgba(126, 87, 194, 0.2);
  }

  &.is-empty .cascader-panel-trigger-placeholder {
    color: #c0c4cc;
  }

  &.is-disabled {
    pointer-events: none;
    opacity: 0.6;
  }
}

.cascader-panel-trigger-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cascader-panel-trigger-placeholder {
  flex: 1;
  color: #c0c4cc;
}

.cascader-panel-trigger-arrow {
  margin-left: 6px;
  font-size: 12px;
  color: #c0c4cc;
  transition: transform 0.2s;

  .is-open & {
    transform: rotate(180deg);
    color: #7E57C2;
  }
}
</style>

<style lang='scss'>
/* el-popover 内容区，不能 scoped */
.cascader-panel-popover {
  padding: 0 !important;
  z-index: 9999 !important;
}

.cascader-panel {
  width: 100%;
  min-width: 280px;
  max-height: 380px;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.cascader-panel-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid #e8e8e8;
  background: #fafafa;
  font-size: 12px;
}

.cascader-panel-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #7E57C2;
  font-weight: 500;
  cursor: pointer;
  padding: 2px 0;
  user-select: none;
  transition: color 0.15s;

  &:hover {
    color: #6A1B9A;
  }

  &.is-active {
    color: #6A1B9A;
    font-weight: 600;
  }
}

.cascader-panel-tab-sep {
  color: rgba(0, 0, 0, 0.25);
  font-size: 11px;
}

.cascader-panel-tab-title {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cascader-panel-tab-back {
  margin-left: 4px;
  padding: 2px 6px;
  color: #999;
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
  transition: background-color 0.15s, color 0.15s;

  &:hover {
    background: rgba(126, 87, 194, 0.1);
    color: #7E57C2;
  }
}

.cascader-panel-content {
  flex: 1;
  overflow: hidden;
}

.cascader-panel-list {
  height: 100%;
  max-height: 300px;
  overflow-y: auto;
  padding: 8px 0;
}

.cascader-panel-list-inner {
  padding: 0 12px;
}

.cascader-panel-item {
  display: flex;
  align-items: center;
  padding: 7px 10px;
  margin: 2px 0;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.85);
  text-decoration: none;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.12s, color 0.12s;

  &:hover {
    background: rgba(126, 87, 194, 0.08);
    color: #6A1B9A;
  }

  &.is-active {
    background: rgba(126, 87, 194, 0.12);
    color: #6A1B9A;
    font-weight: 600;
  }

  &.is-parent {
    color: rgba(0, 0, 0, 0.65);
    font-weight: 500;
  }
}

.cascader-panel-item-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cascader-panel-item-count {
  margin-left: 8px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  padding: 0 6px;
  min-width: 18px;
  text-align: center;
}

.cascader-panel-item-arrow {
  margin-left: 6px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.35);
}

/* Dark mode */
.body--dark {
  .cascader-panel-trigger {
    background: #2a2a2a;
    border-color: #434343;
    color: rgba(255, 255, 255, 0.85);

    &:hover {
      border-color: #7E57C2;
    }

    &.is-empty .cascader-panel-trigger-placeholder {
      color: rgba(255, 255, 255, 0.35);
    }
  }

  .cascader-panel-popover {
    background: #2a2a2a;
  }

  .cascader-panel {
    background: #2a2a2a;
  }

  .cascader-panel-tabs {
    background: #252525;
    border-bottom-color: #333;
  }

  .cascader-panel-tab {
    color: #B39DDB;

    &:hover {
      color: #D1C4E9;
    }

    &.is-active {
      color: #D1C4E9;
    }
  }

  .cascader-panel-tab-sep {
    color: rgba(255, 255, 255, 0.25);
  }

  .cascader-panel-tab-back {
    color: #666;

    &:hover {
      background: rgba(179, 157, 219, 0.15);
      color: #B39DDB;
    }
  }

  .cascader-panel-item {
    color: rgba(255, 255, 255, 0.85);

    &:hover {
      background: rgba(179, 157, 219, 0.12);
      color: #D1C4E9;
    }

    &.is-active {
      background: rgba(126, 87, 194, 0.22);
      color: #D1C4E9;
    }

    &.is-parent {
      color: rgba(255, 255, 255, 0.55);
    }
  }

  .cascader-panel-item-count {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.45);
  }

  .cascader-panel-item-arrow {
    color: rgba(255, 255, 255, 0.35);
  }
}
</style>
