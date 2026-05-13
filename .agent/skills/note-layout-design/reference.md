# 笔记布局详细设计参考

本文档是 [SKILL.md](SKILL.md) 的详细参考补充。

## 完整分割器实现

### 模板结构

```vue
<template>
  <div class="index-page">
    <q-splitter
      v-model="splitterWidthValue"
      :limits="splitterLimits"
      unit="px"
      :min="300"
    >
      <!-- 主分割器：左侧面板 vs 编辑器 -->
      <template v-slot:before>
        <div class="left-panel-wrapper">
          <q-splitter
            v-model="leftInnerSplitterValue"
            :limits="leftInnerSplitterLimits"
            unit="px"
            horizontal
            :disable="!categoryTreeVisible"
          >
            <!-- 内部分割器：分类树 vs 笔记列表 -->
            <template v-slot:before>
              <div v-show="categoryTreeVisible" class="category-panel">
                <CategoryTreePanel
                  v-if="sidebarTreeType === 'category' || sidebarTreeType === 'tag'"
                  :type="sidebarTreeType"
                />
                <CalendarPanel v-else-if="sidebarTreeType === 'calendar'" />
              </div>
            </template>
            <template v-slot:after>
              <NoteList />
            </template>
          </q-splitter>
        </div>
      </template>

      <!-- 编辑器区域 -->
      <template v-slot:after>
        <div class="editor-wrapper">
          <div class="editor-stage">
            <Muya v-show="!isSourceMode && dataLoaded" ref="muya" />
            <Monaco v-if="dataLoaded" v-show="isSourceMode" ref="monaco" />
          </div>
          <NoteOutlineDrawer />
          <div class="editor-action-bar">
            <!-- 操作按钮 -->
          </div>
        </div>
      </template>
    </q-splitter>
  </div>
</template>
```

### 状态定义

```javascript
data() {
  return {
    // 分割器状态
    splitterWidthValue: 580,          // 主分割器宽度 (px)
    splitterLimits: [300, Infinity],  // 主分割器限制
    leftInnerSplitterValue: 240,      // 内部分割器高度 (px)
    leftInnerSplitterLimits: [120, Infinity],
    
    // 面板可见性
    paneLayoutMode: 0,
    categoryTreeVisible: true,
    noteListVisible: true,
    sidebarTreeType: 'category',
    
    // 编辑器状态
    isSourceMode: false,
    dataLoaded: false,
  }
}
```

## Header 组件详解

### 组件结构

```vue
<q-header class="app-header">
  <!-- Windows 窗口控制按钮 -->
  <div v-if="!$q.platform.is.mac" class="header-window-controls">
    <q-btn dense flat icon="minimize" @click="minimize" />
    <q-btn dense flat icon="crop_square" @click="maximize" />
    <q-btn dense flat icon="close" @click="closeApp" />
  </div>

  <!-- 左侧功能区 -->
  <div class="header-left-area">
    <el-dropdown @command="handleMethodCommand">
      <span class="header-method-text">
        笔记方法 <i class="el-icon-arrow-down" />
      </span>
      <el-dropdown-menu slot="dropdown">
        <el-dropdown-item command="newNote">新建笔记</el-dropdown-item>
        <el-dropdown-item command="newCategory">新建分类</el-dropdown-item>
        <!-- 更多... -->
      </el-dropdown-menu>
    </el-dropdown>

    <!-- 视图切换按钮组 -->
    <q-btn dense flat icon="folder" @click="toggleSidebar('category')" />
    <q-btn dense flat icon="local_offer" @click="toggleSidebar('tag')" />
    <q-btn dense flat icon="calendar_today" @click="toggleSidebar('calendar')" />
    <q-btn dense flat icon="search" @click="showSearch" />
  </div>

  <!-- 中间标题区 -->
  <div class="header-center-area">
    <span class="header-title">{{ pageTitle }}</span>
  </div>

  <!-- 右侧功能区 -->
  <div class="header-right-area">
    <!-- 同步按钮 -->
    <q-btn dense flat :icon="syncIcon" @click="triggerSync">
      <q-tooltip>同步</q-tooltip>
    </q-btn>

    <!-- 视图切换 -->
    <q-btn-group flat>
      <q-btn dense flat icon="view_agenda" @click="setPaneLayoutMode(0)" />
      <q-btn dense flat icon="view_day" @click="setPaneLayoutMode(1)" />
      <q-btn dense flat icon="view_column" @click="setPaneLayoutMode(2)" />
    </q-btn-group>

    <!-- 换肤 -->
    <el-dropdown @command="handleSkinCommand">
      <q-btn dense flat icon="palette" />
      <el-dropdown-menu slot="dropdown">
        <el-dropdown-item command="nezha">哪吒</el-dropdown-item>
        <el-dropdown-item command="wukong">悟空</el-dropdown-item>
        <el-dropdown-item command="baiyang">白羊</el-dropdown-item>
        <el-dropdown-item command="infp">INFP</el-dropdown-item>
      </el-dropdown-menu>
    </el-dropdown>

    <!-- IM 聊天 -->
    <q-btn dense flat icon="chat" @click="toggleIM" />

    <!-- 设置 -->
    <q-btn dense flat icon="settings" @click="showSettings" />

    <!-- 用户头像 -->
    <q-avatar>
      <img :src="userAvatar" />
    </q-avatar>
  </div>
</q-header>
```

## CSS 样式系统详解

### 全局 CSS 变量

```css
/* src/css/style.css */

:root {
  /* 亮色主题 */
  --backgroundColor: #ffffff;
  --secondaryBackgroundColor: #fafafa;
  --editorBgColor: #ffffff;
  --editorColor: #333333;
  --themeColor: #21b56f;
  --themeColor10: rgba(33, 181, 111, 0.1);
  --themeColor20: rgba(33, 181, 111, 0.2);
  --themeColor30: rgba(33, 181, 111, 0.3);
  --themeColor50: rgba(33, 181, 111, 0.5);
  
  /* 边框和分隔 */
  --floatBorderColor: #e0e0e0;
  --borderColor: #dfe3ea;
  --customSplitterBorderColor: #dfe3ea;
  
  /* 交互状态 */
  --floatHoverColor: #f5f5f5;
  --activeItemBgColor: #e8f5e9;
  --hoverItemBgColor: #f5f5f5;
  
  /* 文字颜色 */
  --iconColor: #666666;
  --iconHoverColor: #333333;
  --placeholderColor: #999999;
  
  /* 滚动条 */
  --scrollBarBgColor: #f0f0f0;
  --scrollBarThumbColor: #d0d0d0;
  --scrollBarHoverColor: #b0b0b0;
  
  /* 阴影 */
  --boxShadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  --boxShadowHover: 0 2px 8px rgba(0, 0, 0, 0.12);
}

body {
  background: var(--backgroundColor);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}
```

### 暗色主题覆盖

```css
.body--dark {
  --backgroundColor: #1e1e1e;
  --secondaryBackgroundColor: #252526;
  --editorBgColor: #1e1e1e;
  --editorColor: #d4d4d4;
  --floatBorderColor: #3c3c3c;
  --borderColor: #3c3c3c;
  --customSplitterBorderColor: #3c3c3c;
  --floatHoverColor: #2d2d2d;
  --activeItemBgColor: #264f36;
  --hoverItemBgColor: #2d2d2d;
  --iconColor: #969696;
  --iconHoverColor: #cccccc;
  --scrollBarBgColor: #2d2d2d;
  --scrollBarThumbColor: #424242;
  --scrollBarHoverColor: #5e5e5e;
  --boxShadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
```

## 大纲抽屉组件

```vue
<!-- src/components/ui/NoteOutlineDrawer.vue -->
<template>
  <q-drawer
    ref="drawer"
    :mini-width="200"
    :breakpoint="700"
    side="right"
    overlay
    elevated
  >
    <div class="outline-drawer-content">
      <div class="outline-header">
        <span>大纲</span>
        <q-btn flat dense icon="close" @click="closeDrawer" />
      </div>
      <q-scroll-area class="outline-scroll">
        <div class="outline-tree">
          <div
            v-for="(item, index) in outlineItems"
            :key="index"
            class="outline-item"
            :class="`level-${item.level}`"
            @click="scrollToHeading(item)"
          >
            {{ item.text }}
          </div>
        </div>
      </q-scroll-area>
    </div>
  </q-drawer>
</template>
```

## 窗口控制实现

```javascript
// src/components/Header.vue

methods: {
  minimize() {
    if (this.$q.platform.is.win32) {
      // Windows
      this.$electron.ipcRenderer.send('window-minimize')
    } else {
      // macOS
      this.$q.electron.minimize()
    }
  },

  maximize() {
    if (this.$q.platform.is.win32) {
      // Windows
      if (this.isMaximized) {
        this.$electron.ipcRenderer.send('window-unmaximize')
      } else {
        this.$electron.ipcRenderer.send('window-maximize')
      }
    } else {
      // macOS
      this.$q.electron.toggleMaximize()
    }
  },

  closeApp() {
    this.$electron.ipcRenderer.send('window-close')
  }
}
```

## 皮肤主题配置

```javascript
// src/utils/theme.js

export const skins = {
  nezha: {
    themeColor: '#ff6b6b',
    name: '哪吒'
  },
  wukong: {
    themeColor: '#feca57',
    name: '悟空'
  },
  baiyang: {
    themeColor: '#48dbfb',
    name: '白羊'
  },
  infp: {
    themeColor: '#a29bfe',
    name: 'INFP'
  }
}

export function applySkin(skinName) {
  const skin = skins[skinName]
  if (!skin) return
  
  document.documentElement.style.setProperty('--themeColor', skin.themeColor)
  // 生成透明度变体
  document.documentElement.style.setProperty('--themeColor10', hexToRgba(skin.themeColor, 0.1))
  document.documentElement.style.setProperty('--themeColor30', hexToRgba(skin.themeColor, 0.3))
  
  localStorage.setItem('selectedSkin', skinName)
}
```

## 布局状态持久化

```javascript
// 保存到 localStorage
function saveLayoutState() {
  const state = {
    splitterWidth: this.splitterWidthValue,
    leftInnerSplitterRatio: this.leftInnerSplitterValue,
    paneLayoutMode: this.paneLayoutMode,
    categoryTreeVisible: this.categoryTreeVisible,
    noteListVisible: this.noteListVisible,
    sidebarTreeType: this.sidebarTreeType,
    darkMode: this.$q.dark.isActive,
    theme: this.currentTheme
  }
  localStorage.setItem('memocast_layout_state', JSON.stringify(state))
}

// 从 localStorage 恢复
function loadLayoutState() {
  const saved = localStorage.getItem('memocast_layout_state')
  if (!saved) return
  
  try {
    const state = JSON.parse(saved)
    this.splitterWidthValue = state.splitterWidth || 580
    this.leftInnerSplitterValue = state.leftInnerSplitterRatio || 240
    this.paneLayoutMode = state.paneLayoutMode || 0
    this.categoryTreeVisible = state.categoryTreeVisible !== false
    this.noteListVisible = state.noteListVisible !== false
    this.sidebarTreeType = state.sidebarTreeType || 'category'
    if (state.darkMode !== undefined) {
      this.$q.dark.set(state.darkMode)
    }
  } catch (e) {
    console.error('Failed to load layout state:', e)
  }
}

// 监听窗口大小变化
window.addEventListener('resize', this.debounce(this.saveLayoutState, 500))
```
