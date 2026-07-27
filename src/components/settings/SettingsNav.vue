<template>
  <div class='settings-nav'>
    <q-tabs v-model='tab' vertical dense no-border class='settings-dialog-tabs'>
      <q-tab
        v-for='item in topTabs'
        :key='item.value'
        :name='item.value'
        :icon='item.icon'
        :label='$t(item.label)'
        :ripple='false'
        :class='["settings-nav-tab", `settings-nav-tab--${item.accentTheme}`]'
      />
    </q-tabs>
  </div>
</template>

<script>
import { SettingsTabEnum } from 'src/utils/enum'

export default {
  name: 'SettingsNav',
  props: {
    value: {
      type: String,
      required: true
    }
  },
  computed: {
    tab: {
      get () {
        return this.value
      },
      set (val) {
        this.$emit('input', val)
      }
    },
    topTabs () {
      return SettingsTabEnum.items.map((item) => ({
        value: item.value,
        label: item.label,
        icon: item.icon,
        accent: item.accent,
        accentTheme: item.accentTheme
      }))
    }
  }
}
</script>

<style scoped>
.settings-nav {
  flex: 0 0 auto;
  width: 4.75rem;
  min-width: 4.75rem;
  max-width: 4.75rem;
  padding: 2px 0 4px;
}

.settings-dialog-tabs {
  width: 100%;
}

.settings-dialog-tabs ::v-deep(.q-tabs__content) {
  padding: 0;
}

.settings-dialog-tabs ::v-deep(.q-tab) {
  min-height: 32px;
  padding: 2px 4px;
  border-radius: 6px;
  margin: 2px 4px;
  transition: all 0.2s ease;
}

.settings-dialog-tabs ::v-deep(.q-tab__icon) {
  font-size: 1.15rem;
}

.settings-dialog-tabs ::v-deep(.q-tab__label) {
  font-size: 0.7rem;
  line-height: 1.1;
  margin-top: 1px;
}

/* ---------- 通用 - 红色 ---------- */
.settings-dialog-tabs ::v-deep(.settings-nav-tab--red) {
  color: #ef9a9a;
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--red:hover:not(.q-tab--active)) {
  color: #e53935;
  background: rgba(229, 57, 53, 0.08);
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--red.q-tab--active) {
  color: #ffffff;
  background: linear-gradient(135deg, #e53935 0%, #c62828 100%);
  box-shadow: 0 4px 12px rgba(229, 57, 53, 0.35);
}

/* ---------- 编辑器 - 橙色 ---------- */
.settings-dialog-tabs ::v-deep(.settings-nav-tab--orange) {
  color: #ffab91;
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--orange:hover:not(.q-tab--active)) {
  color: #ef6c00;
  background: rgba(239, 108, 0, 0.08);
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--orange.q-tab--active) {
  color: #ffffff;
  background: linear-gradient(135deg, #ef6c00 0%, #e65100 100%);
  box-shadow: 0 4px 12px rgba(239, 108, 0, 0.35);
}

/* ---------- AI - 黄色 ---------- */
.settings-dialog-tabs ::v-deep(.settings-nav-tab--yellow) {
  color: #ffe082;
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--yellow:hover:not(.q-tab--active)) {
  color: #f9a825;
  background: rgba(249, 168, 37, 0.08);
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--yellow.q-tab--active) {
  color: #ffffff;
  background: linear-gradient(135deg, #f9a825 0%, #f57f17 100%);
  box-shadow: 0 4px 12px rgba(249, 168, 37, 0.35);
}

/* ---------- 云服务 - 绿色 ---------- */
.settings-dialog-tabs ::v-deep(.settings-nav-tab--green) {
  color: #a5d6a7;
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--green:hover:not(.q-tab--active)) {
  color: #43a047;
  background: rgba(67, 160, 71, 0.08);
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--green.q-tab--active) {
  color: #ffffff;
  background: linear-gradient(135deg, #43a047 0%, #2e7d32 100%);
  box-shadow: 0 4px 12px rgba(67, 160, 71, 0.35);
}

/* ---------- 回响 - 青色 ---------- */
.settings-dialog-tabs ::v-deep(.settings-nav-tab--cyan) {
  color: #80deea;
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--cyan:hover:not(.q-tab--active)) {
  color: #00acc1;
  background: rgba(0, 172, 193, 0.08);
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--cyan.q-tab--active) {
  color: #ffffff;
  background: linear-gradient(135deg, #00acc1 0%, #00838f 100%);
  box-shadow: 0 4px 12px rgba(0, 172, 193, 0.35);
}

/* ---------- 云函数 - 蓝色 ---------- */
.settings-dialog-tabs ::v-deep(.settings-nav-tab--blue) {
  color: #90caf9;
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--blue:hover:not(.q-tab--active)) {
  color: #0288d1;
  background: rgba(2, 136, 209, 0.08);
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--blue.q-tab--active) {
  color: #ffffff;
  background: linear-gradient(135deg, #0288d1 0%, #0277bd 100%);
  box-shadow: 0 4px 12px rgba(2, 136, 209, 0.35);
}

/* ---------- 符文 - 紫色 ---------- */
.settings-dialog-tabs ::v-deep(.settings-nav-tab--purple) {
  color: #ce93d8;
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--purple:hover:not(.q-tab--active)) {
  color: #9c27b0;
  background: rgba(156, 39, 176, 0.08);
}
.settings-dialog-tabs ::v-deep(.settings-nav-tab--purple.q-tab--active) {
  color: #ffffff;
  background: linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%);
  box-shadow: 0 4px 12px rgba(156, 39, 176, 0.35);
}

/* ---------- 暗色模式：未选中文字更亮、active 渐变更亮 ---------- */
.body--dark .settings-dialog-tabs ::v-deep(.settings-nav-tab--red)   { color: #ef9a9a; }
.body--dark .settings-dialog-tabs ::v-deep(.settings-nav-tab--orange){ color: #ffab91; }
.body--dark .settings-dialog-tabs ::v-deep(.settings-nav-tab--yellow){ color: #ffe082; }
.body--dark .settings-dialog-tabs ::v-deep(.settings-nav-tab--green) { color: #a5d6a7; }
.body--dark .settings-dialog-tabs ::v-deep(.settings-nav-tab--cyan)  { color: #80deea; }
.body--dark .settings-dialog-tabs ::v-deep(.settings-nav-tab--blue)  { color: #90caf9; }
.body--dark .settings-dialog-tabs ::v-deep(.settings-nav-tab--purple){ color: #ce93d8; }
</style>
