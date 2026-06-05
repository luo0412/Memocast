<template>
  <q-bar
    class="q-electron-drag header text-grey"
    @dblclick="macDoubleClickHandler"
  >
    <!-- Mac: 左侧标题 -->
    <div
      v-if="$q.platform.is.mac"
      class="header-note-title animated fadeIn q-electron-drag--exception"
      style="cursor: pointer"
      @click="toggleTagDialog"
    >
      <span class='save-dot' :class="{ 'show': this.noteState !== 'default' }"></span>
      <q-tooltip
        v-if="tags.length > 0"
        :offset="[20, 10]"
        content-class="shadow-4 text-h7 tag-tooltip"
      >
        <q-chip v-for="(tag, index) in tags" :key="index" icon="bookmark">{{
          tag
        }}</q-chip>
      </q-tooltip>
      <span key="title" slot="reference">{{ title }}</span>
    </div>

    <!-- 左侧图标 -->
    <div class="header-left-icons">
      <!-- 笔记方法下拉框 -->
      <el-dropdown trigger="click" @command="handleNoteMethodChange" popper-class="note-method-popper">
        <span class="header-icon-btn q-electron-drag--exception note-method-btn" :class="{ 'is-active': noteMethod }">
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
        class="header-icon-btn q-electron-drag--exception"
        :class="{ 'is-active': sidebarTreeType === 'category' }"
        :title="$t('noteCategory')"
        style="max-width: 150px;width: unset;padding-left: 3px;padding-right: 5px;"
        @click="toggleCategoryDrawer"
      >
        <i class="el-icon-folder icon-custom" />

        <!-- 选中文件夹名称 -->
        <span
          v-if="currentCategoryName"
          class="header-category-name"
        >{{ currentCategoryName }}</span>
      </div>


      <!-- 标签图标 -->
      <div
        v-if="isLogin"
        class="header-icon-btn q-electron-drag--exception"
        :class="{ 'is-active': sidebarTreeType === 'tag' }"
        :title="$t('tag')"
        @click="toggleTagDrawer"
      >
        <i class="el-icon-price-tag icon-custom" />
      </div>

      <!-- 日历 -->
      <div
        v-if="isLogin"
        class="header-icon-btn q-electron-drag--exception"
        :class="{ 'is-active': sidebarTreeType === 'calendar' }"
        :title="$t('calendarView')"
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

    <!-- 右侧区域 -->
    <q-space />

    <!-- Windows: 标题（可拖拽） -->
    <div
      v-if="!$q.platform.is.mac"
      class="header-note-title animated fadeIn q-electron-drag--exception"
      :class="{ 'mac': $q.platform.is.mac }"
      style="cursor: pointer;"
      @click="toggleTagDialog"
    >
      <span class="save-dot" :class="{'show': noteState !== 'default'}"></span>
      <q-tooltip
        v-if="tags.length > 0"
        :offset="[20, 10]"
        content-class="shadow-4 text-h7 tag-tooltip"
      >
        <q-chip v-for="(tag, index) in tags" :key="index" icon="bookmark">{{
          tag
        }}</q-chip>
      </q-tooltip>
      <span key="title">{{ title }}</span>
    </div>

    <q-space />

    <!-- 右侧图标组 -->
    <div class="header-right-icons">
      <!-- 全局同步按钮 -->
      <div
        v-if="isLogin"
        class="header-icon-btn q-electron-drag--exception sync-btn"
        :class="{ 'is-syncing': isSyncing, 'has-pending': pendingCount > 0 }"
        :title="syncTooltip"
        @click="handleSyncClick"
      >
        <i v-if="isSyncing" class="el-icon-loading icon-custom sync-icon" />
        <i v-else class="el-icon-refresh icon-custom sync-icon" />
        <span v-if="pendingCount > 0" class="sync-badge">{{ pendingCount > 99 ? '99+' : pendingCount }}</span>
      </div>

      <!-- 视图切换按钮 -->
      <div
        class="header-icon-btn q-electron-drag--exception"
        :class="{ 'is-active': paneLayoutMode !== 0 }"
        :title="$t('switchView')"
        @click="switchViewHandler"
      >
        <a-icon type="layout" class="icon-custom layout-mirror" />
      </div>

      <!-- 换肤按钮 (Element UI Dropdown) -->
      <el-dropdown trigger="click" @command="handleSkinCommand">
        <div
          class="header-icon-btn q-electron-drag--exception"
          :title="$t('skin')"
        >
          <a-icon type="skin" class="icon-custom" />
        </div>
          <el-dropdown-menu slot="dropdown">
          <el-dropdown-item command="nezha">哪吒</el-dropdown-item>
          <el-dropdown-item command="baiyang">白羊</el-dropdown-item>
          <el-dropdown-item command="infp">INFP</el-dropdown-item>
        </el-dropdown-menu>
      </el-dropdown>

      <!-- 聊天图标 -->
      <div
        class="header-icon-btn q-electron-drag--exception"
        :title="$t('imChat')"
        @click="handleImChatClick"
      >
        <i class="el-icon-chat-dot-round icon-custom" />
      </div>

      <!-- 设置按钮 -->
      <div
        class="header-icon-btn q-electron-drag--exception"
        :class="{ 'is-highlight': settingsHighlight }"
        :title="$t('settings')"
        @click="handleSettingsClick"
      >
        <i class="el-icon-setting icon-custom" />
      </div>

      <!-- 头像下拉菜单 (Ant Design Vue) -->
      <div class="header-avatar-wrapper q-electron-drag--exception">
        <el-dropdown trigger="click" @command="handleAvatarCommand">
          <div class="header-avatar" :class="{ 'has-photo': !!avatarUrl }">
            <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" />
            <a-avatar v-else :size="20" :style="{ backgroundColor: 'transparent' }">
              <i class="el-icon-user header-avatar-placeholder" style="font-size: 11px; color: #fff;" />
            </a-avatar>
          </div>
          <el-dropdown-menu slot="dropdown">
            <el-dropdown-item command="login" v-if="!isLogin">
              <i class="el-icon-user" />
              {{ $t('login') }}
            </el-dropdown-item>
            <el-dropdown-item command="logout" v-else>
              <i class="el-icon-switch-button" />
              {{ $t('logout') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
      </div>

      <!-- 窗口控制按钮 (Windows) -->
      <div v-if="!$q.platform.is.mac" class="header-window-controls">
        <q-btn dense flat icon="minimize" @click="minimize" />
        <q-btn dense flat :icon="isMaximized ? 'open_in_full' : 'crop_square'" @click="maximize" />
        <q-btn dense flat icon="close" class="close-button" @click="closeApp" />
      </div>
    </div>

    <LoginDialog ref="loginDialog" />
    <SettingsDialog ref="settingsDialog" />
    <SearchDialog ref='searchDialog' />
    <TagDialog ref="tagDialog" />
    <ImDrawer ref="imDrawer" />
  </q-bar>
</template>

<script>
import LoginDialog from './ui/dialog/LoginDialog'
import SettingsDialog from './ui/dialog/SettingsDialog'
import { createNamespacedHelpers } from 'vuex'
import helper from 'src/utils/helper'
import TagDialog from 'components/ui/dialog/TagDialog'
import bus from 'components/bus'
import events from 'src/constants/events'
import SearchDialog from 'components/ui/dialog/SearchDialog'
import ImDrawer from 'components/ui/ImDrawer'
import { ipcRenderer } from 'electron'
import DatabaseClient from 'src/utils/DatabaseClient'
import types from 'src/store/client/types'

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
  name: 'Header',
  computed: {
    ...mapServerState(['user', 'isLogin', 'currentNote', 'noteState', 'currentCategory']),
    ...mapServerGetters(['avatarUrl', 'tagsOfCurrentNote', 'categories']),
    ...mapClientState([
      'shrinkInTray',
      'autoLogin',
      'noteListVisible',
      'paneLayoutMode',
      'enablePreviewEditor',
      'sidebarTreeType',
      'syncStatus'
    ]),

    // 同步状态
    isSyncing() {
      return this.syncStatus?.isSyncing || false
    },
    pendingCount() {
      return this.syncStatus?.pending || 0
    },
    syncTooltip() {
      if (this.isSyncing) {
        return this.$t('syncing')
      }
      if (this.pendingCount > 0) {
        return this.$t('pendingSync', { count: this.pendingCount })
      }
      return this.$t('clickToSync')
    },
    darkMode: function () {
      return this.$q.dark.isActive
    },
    currentNoteMethodLabel () {
      const opt = this.noteMethodOptions.find(o => o.value === this.noteMethod)
      return opt ? opt.label : ''
    },
    title: function () {
      if (this.currentNote.info) {
        let { title } = this.currentNote.info
        if (title.length > 30) {
          title = `${title.substr(0, 9)}...${title.substring(
            title.length - 12
          )}`
        }
        return title
      }
      return ''
    },
    dataLoaded: function () {
      return this.currentNote && !helper.isNullOrEmpty(this.currentNote.html)
    },
    tags: function () {
      return this.tagsOfCurrentNote.map(t => t.name)
    },
    currentCategoryName: function () {
      if (!this.currentCategory) return ''
      const category = this.findCategoryByKey(this.categories, this.currentCategory)
      return category ? category.label : ''
    }
  },
  components: { SearchDialog, TagDialog, SettingsDialog, LoginDialog, ImDrawer },
  data () {
    return {
      isMaximized: false,
      searchHighlight: false,
      settingsHighlight: false,
      noteMethod: 'notesSixDaoLun',
      noteMethodOptions: [
        { label: '笔记六道论', value: 'notesSixDaoLun' },
        { label: '漏斗式阅读', value: 'funnelReading' },
        { label: '三层笔记法', value: 'threeLayerNotes' },
        { label: '子弹笔记法', value: 'bulletJournal' }
      ]
    }
  },
  methods: {
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
    handleHighlight (type) {
      this[type] = true
      setTimeout(() => {
        this[type] = false
      }, 1200)
    },

    handleNoteMethodChange (value) {
      this.noteMethod = value
    },

    handleSearchClick () {
      this.handleHighlight('searchHighlight')
      this.$refs.searchDialog.toggle()
    },

    handleSkinCommand (command) {
      this.$q.notify({
        message: `已切换皮肤：${command}`,
        type: 'info',
        position: 'top'
      })
    },

    handleSettingsClick () {
      this.handleHighlight('settingsHighlight')
      this.$refs.settingsDialog.toggle()
    },

    handleImChatClick () {
      this.$refs.imDrawer.toggle()
    },

    minimize () {
      ipcRenderer.send('window-minimize')
    },

    maximize () {
      ipcRenderer.send('window-maximize')
    },

    async updateMaximizeIcon () {
      this.isMaximized = await ipcRenderer.invoke('window-is-maximized')
    },

    closeApp () {
      ipcRenderer.send('window-close')
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
    },

    handleAvatarCommand (command) {
      if (command === 'login') {
        this.$refs.loginDialog.toggle()
      } else if (command === 'logout') {
        this.$q.dialog({
          title: this.$t('logout'),
          message: this.$t('logoutHint'),
          cancel: { label: this.$t('cancel') },
          ok: { label: this.$t('logout') }
        }).onOk(() => {
          this.logout()
        })
      }
    },

    switchViewHandler: function () {
      this.cyclePaneLayout()
    },

    macDoubleClickHandler: function () {
      if (this.$q.platform.is.mac) {
        this.maximize()
      }
    },

    toggleTagDialog: function () {
      this.$refs.tagDialog.toggle()
    },

    ...mapServerActions(['logout', 'getCategoryNotes', 'refreshTagNotesCount']),
    ...mapClientActions(['toggleChanged', 'cyclePaneLayout', 'expandFullPaneLayout', 'sync']),

    // 同步按钮点击处理
    async handleSyncClick() {
      if (this.isSyncing) {
        return // 正在同步中，不重复触发
      }

      if (!this.isLogin) {
        this.$q.notify({
          message: this.$t('offlineMode'),
          type: 'info',
          position: 'top'
        })
        return
      }

      try {
        const result = await this.sync()
        const stats = await DatabaseClient.sync.getStats()
        this.$store.commit(`client/${types.UPDATE_SYNC_STATUS}`, {
          isSyncing: false,
          lastSyncTime: Date.now(),
          ...stats
        })
        if (result.success) {
          if ((stats.pending || 0) > 0) {
            this.$q.notify({
              message: this.$t('syncFailed'),
              type: 'warning',
              position: 'top',
              caption: `仍有 ${stats.pending} 条未同步`
            })
          } else {
            this.$q.notify({
              message: this.$t('syncComplete'),
              type: 'positive',
              position: 'top',
              caption: `↑${result.stats?.pushed || 0} ↓${result.stats?.pulled || 0}`
            })
          }
        } else {
          this.$q.notify({
            message: this.$t('syncFailed'),
            type: 'negative',
            position: 'top'
          })
        }
      } catch (error) {
        console.error('Sync failed:', error)
        try {
          const stats = await DatabaseClient.sync.getStats()
          this.$store.commit(`client/${types.UPDATE_SYNC_STATUS}`, {
            isSyncing: false,
            ...stats
          })
        } catch (statsError) {
          console.error('Refresh sync status failed:', statsError)
        }
        this.$q.notify({
          message: this.$t('syncFailed'),
          type: 'negative',
          position: 'top'
        })
      }
    }
  },

  mounted () {
    this.updateMaximizeIcon()
    ipcRenderer.on('window-maximized', (_, val) => { this.isMaximized = val })
    if (!this.autoLogin && !this.isLogin) {
      this.$refs.loginDialog.toggle()
    }
    bus.$on(events.VIEW_SHORTCUT_CALL.switchView, this.switchViewHandler)
    bus.$on(events.NOTE_SHORTCUT_CALL.searchNote, () => this.$refs.searchDialog.toggle())
    // 云同步面板点击"去登录" → 打开登录对话框
    bus.$on('showLoginDialog', () => this.$refs.loginDialog.toggle())
  },
  watch: {
    isLogin: function (currentData) {
      if (!currentData) {
        this.$refs.loginDialog.show()
      }
    }
  },
  beforeDestroy () {
    bus.$off(events.VIEW_SHORTCUT_CALL.switchView, this.switchViewHandler)
    bus.$off('showLoginDialog')
  }
}
</script>

<style scoped>
.header-note-title {
  display: flex;
  align-items: center;
  margin-left: 0;
}
.header-note-title.mac {
  margin-left: 15%;
}
.header-note-title > span {
  margin-left: 7px;
  letter-spacing: 0.3px;
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-button:hover {
  background-color: rgba(255, 0, 0, .6);
}

.header-left-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
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

.el-dropdown-menu .el-dropdown-menu-item.is-active {
  background-color: var(--themeColor10);
  color: var(--themeColor);
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

.header-right-icons {
  display: flex;
  align-items: center;
  gap: 4px;
}

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

.header-icon-btn.is-active {
  background-color: var(--themeColor10);
  border: 1px solid var(--themeColor30);
  box-shadow: 0 2px 8px var(--themeColor20);
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

.layout-mirror {
  transform: scaleX(-1);
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

.header-avatar-wrapper {
  margin-left: 4px;
  display: flex;
  align-items: center;
}

.header-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, var(--themeColor30, rgba(33, 181, 111, 0.35)), var(--themeColor, #21b56f));
  box-sizing: border-box;
}

.header-avatar.has-photo {
  background: var(--editorBgColor, #fff);
}

.header-avatar:hover {
  box-shadow: 0 0 0 1px var(--themeColor40, rgba(33, 181, 111, 0.4));
}

.header-avatar-placeholder {
  font-size: 11px;
  color: #fff;
}

.header-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.header-window-controls {
  margin-left: 8px;
  display: flex;
  align-items: center;
}

.el-dropdown-menu {
  background-color: var(--editorBgColor);
  border: 1px solid var(--floatBorderColor);
}

.el-dropdown-menu__item {
  color: var(--editorColor);
}

.el-dropdown-menu__item:hover {
  background-color: var(--themeColor10);
  color: var(--themeColor);
}

.el-dropdown-menu__item i {
  margin-right: 8px;
}

/* 同步按钮样式 */
.sync-btn {
  position: relative;
}

.sync-btn.has-pending .sync-icon {
  color: var(--themeColor);
}

.sync-btn.is-syncing .sync-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.sync-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  color: #fff;
  background-color: #f56c6c;
  border-radius: 8px;
  transform: translate(25%, -25%);
}
</style>
