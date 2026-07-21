<template>
  <div class="header-left-icons">
    <!-- 笔记方法下拉框 -->
    <el-dropdown trigger="click" @command="handleNoteMethodChange" popper-class="note-method-popper">
      <span
        class="header-icon-btn q-electron-drag--exception note-method-btn"
        :class="{ 'is-active': noteMethod }"
        :title="currentNoteMethodDescription"
      >
        <i class="el-icon-notebook-2 icon-custom" />
        {{ currentNoteMethodLabel }}
      </span>
      <el-dropdown-menu slot="dropdown">
        <el-dropdown-item
          v-for="opt in noteMethodOptions"
          :key="opt.value"
          :command="opt.value"
        >
          {{ opt.label }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </el-dropdown>

    <!-- 文件夹图标 -->
    <div
      v-if="isLogin"
      class="header-icon-btn q-electron-drag--exception"
      :class="{ 'is-active': sidebarTreeType === 'category' }"
      :title="$t('noteMethodTooltip')"
      style="max-width: 150px;width: unset;padding-left: 3px;padding-right: 5px;"
      @click="toggleCategoryDrawer"
    >
      <i class="el-icon-folder icon-custom" />
      <span v-if="currentCategoryName" class="header-category-name">{{ currentCategoryName }}</span>
    </div>

    <!-- 标签图标 -->
    <div
      v-if="isLogin"
      class="header-icon-btn q-electron-drag--exception"
      :class="{ 'is-active': sidebarTreeType === 'tag' }"
      :title="$t('tagTooltip')"
      @click="toggleTagDrawer"
    >
      <i class="el-icon-price-tag icon-custom" />
    </div>

    <!-- 日历 -->
    <div
      v-if="isLogin"
      class="header-icon-btn q-electron-drag--exception"
      :class="{ 'is-active': sidebarTreeType === 'calendar' }"
      :title="$t('calendarTooltip')"
      @click="toggleCalendarDrawer"
    >
      <i class="el-icon-date icon-custom" />
    </div>

    <!-- 搜索图标 -->
    <div
      v-if="isLogin"
      class="header-icon-btn q-electron-drag--exception"
      :class="{ 'is-highlight': searchHighlight }"
      :title="$t('search')"
      @click="handleSearchClick"
    >
      <i class="el-icon-search icon-custom" />
    </div>
  </div>
</template>

<script>
import { createNamespacedHelpers } from 'vuex'

const {
  mapState: mapServerState,
  mapGetters: mapServerGetters,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')

const {
  mapState: mapClientState,
  mapActions: mapClientActions
} = createNamespacedHelpers('client')

export default {
  name: 'HeaderLeftGroup',
  props: {
    noteListVisible: Boolean,
    paneLayoutMode: Number
  },
  computed: {
    ...mapServerState(['isLogin', 'currentCategory']),
    ...mapServerGetters(['categories']),
    ...mapClientState([
      'noteMethod',
      'sidebarTreeType'
    ]),
    noteMethodOptions () {
      return [
        { label: '六道笔记论', value: 'notesSixDaoLun', description: '强目的性归类笔记' },
        { label: '三层漏斗法', value: 'threeLayerFunnel', description: '收集游离态笔记碎片成体系' }
      ]
    },
    currentNoteMethodLabel () {
      const opt = this.noteMethodOptions.find(o => o.value === this.noteMethod)
      return opt ? opt.label : ''
    },
    currentNoteMethodDescription () {
      const opt = this.noteMethodOptions.find(o => o.value === this.noteMethod)
      return opt ? opt.description : ''
    },
    currentCategoryName () {
      if (!this.currentCategory) return ''
      const category = this.findCategoryByKey(this.categories, this.currentCategory)
      return category ? category.label : ''
    }
  },
  props: {
    searchHighlight: Boolean
  },
  methods: {
    ...mapServerActions(['getCategoryNotes', 'refreshTagNotesCount']),
    ...mapClientActions(['toggleChanged', 'expandFullPaneLayout']),
    findCategoryByKey (categories, key) {
      for (const cat of categories) {
        if (cat.key === key) return cat
        if (cat.children && cat.children.length > 0) {
          const found = this.findCategoryByKey(cat.children, key)
          if (found) return found
        }
      }
      return null
    },
    handleNoteMethodChange (value) {
      this.toggleChanged({ key: 'noteMethod', value })
    },
    handleSearchClick () {
      this.$emit('search-click')
    },
    toggleCategoryDrawer () {
      if (!this.isLogin) return
      this.toggleChanged({ key: 'sidebarTreeType', value: 'category' })
      if (!this.noteListVisible || this.paneLayoutMode !== 0) {
        this.expandFullPaneLayout()
      }
      this.getCategoryNotes()
    },
    toggleTagDrawer () {
      if (!this.isLogin) return
      this.toggleChanged({ key: 'sidebarTreeType', value: 'tag' })
      if (!this.noteListVisible || this.paneLayoutMode !== 0) {
        this.expandFullPaneLayout()
      }
      this.getCategoryNotes()
      this.refreshTagNotesCount()
    },
    toggleCalendarDrawer () {
      if (!this.isLogin) return
      const n = new Date()
      const ymd = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
      this.toggleChanged({ key: 'calendarSelectedDate', value: ymd })
      this.toggleChanged({ key: 'sidebarTreeType', value: 'calendar' })
      if (!this.noteListVisible || this.paneLayoutMode !== 0) {
        this.expandFullPaneLayout()
      }
      this.getCategoryNotes()
    }
  }
}
</script>

<style scoped>
.header-left-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 基础按钮样式 - 与 HeaderRightGroup 保持一致 */
.header-icon-btn {
  height: 36px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.header-icon-btn:hover {
  background-color: var(--floatHoverColor);
}

.header-icon-btn .icon-custom {
  font-size: 18px;
  color: var(--iconColor, #6b7280);
  transition: all 0.2s ease;
}

.header-icon-btn:hover .icon-custom {
  color: var(--themeColor);
}

.header-icon-btn.is-active .icon-custom {
  color: var(--themeColor);
  filter: drop-shadow(0 1px 2px var(--themeColor40));
}

.header-icon-btn.is-active::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 16px;
  height: 2px;
  background-color: var(--themeColor);
  border-radius: 1px;
}

.header-icon-btn.is-highlight {
  background-color: var(--themeColor10);
  animation: highlight-pulse 5s ease-out forwards;
}

.header-icon-btn.is-highlight::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 16px;
  height: 2px;
  background-color: var(--themeColor);
  border-radius: 1px;
  animation: highlight-pulse 5s ease-out forwards;
}

@keyframes highlight-pulse {
  0% { opacity: 1; }
  90% { opacity: 1; }
  100% { opacity: 0; }
}

.note-method-btn {
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 12px;
  white-space: nowrap;
  color: var(--themeColor);
  flex-shrink: 0;
}

.note-method-btn .icon-custom {
  margin-right: 4px;
}

.note-method-btn:hover {
  background-color: var(--floatHoverColor);
}

.note-method-btn.is-active {
  background-color: var(--themeColor10);
  border: 1px solid var(--themeColor30);
  box-shadow: 0 2px 8px var(--themeColor20);
}

.note-method-popper {
  z-index: 9999 !important;
}

.note-method-popper .el-dropdown-menu {
  width: auto;
  min-width: 100%;
}

.header-category-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--themeColor);
  font-weight: 500;
  margin-left: 2px;
}
</style>
