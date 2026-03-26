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
      <!-- 文件夹图标 -->
      <div
        class="header-icon-btn q-electron-drag--exception"
        :class="{ 'is-active': sidebarTreeType === 'category' }"
        :title="$t('noteCategory')"
        @click="toggleCategoryDrawer"
      >
        <q-icon name="folder" class="icon-custom" />
      </div>

      <!-- 标签图标 -->
      <div
        class="header-icon-btn q-electron-drag--exception"
        :class="{ 'is-active': sidebarTreeType === 'tag' }"
        :title="$t('tag')"
        @click="toggleTagDrawer"
      >
        <q-icon name="label" class="icon-custom" />
      </div>

      <!-- 搜索图标 -->
      <div
        class="header-icon-btn q-electron-drag--exception"
        :class="{ 'is-highlight': searchHighlight }"
        :title="$t('search')"
        @click="handleSearchClick"
      >
        <q-icon name="search" class="icon-custom" />
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
      <!-- 视图切换按钮 -->
      <div
        class="header-icon-btn q-electron-drag--exception"
        :class="{ 'is-active': paneLayoutMode !== 0 }"
        :title="$t('switchView')"
        @click="switchViewHandler"
      >
        <q-icon name="table_chart" class="icon-custom" />
      </div>

      <!-- 设置按钮 -->
      <div
        class="header-icon-btn q-electron-drag--exception"
        :class="{ 'is-highlight': settingsHighlight }"
        :title="$t('settings')"
        @click="handleSettingsClick"
      >
        <q-icon name="settings" class="icon-custom" />
      </div>

      <!-- 头像下拉菜单 (Ant Design Vue) -->
      <div class="header-avatar-wrapper q-electron-drag--exception">
        <el-dropdown trigger="click" @command="handleAvatarCommand">
          <div class="header-avatar" :class="{ 'has-photo': !!avatarUrl }">
            <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" />
            <a-avatar v-else :size="20" :style="{ backgroundColor: 'transparent' }">
              <q-icon name="person" style="font-size: 11px; color: #fff;" />
            </a-avatar>
          </div>
          <el-dropdown-menu slot="dropdown">
            <el-dropdown-item command="login" v-if="!isLogin">
              <q-icon name="person" style="margin-right: 8px;" />
              {{ $t('login') }}
            </el-dropdown-item>
            <el-dropdown-item command="logout" v-else>
              <q-icon name="logout" style="margin-right: 8px;" />
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
import { ipcRenderer } from 'electron'

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
    ...mapServerState(['user', 'isLogin', 'currentNote', 'noteState']),
    ...mapServerGetters(['avatarUrl', 'tagsOfCurrentNote']),
    ...mapClientState([
      'shrinkInTray',
      'autoLogin',
      'noteListVisible',
      'paneLayoutMode',
      'enablePreviewEditor',
      'sidebarTreeType'
    ]),
    darkMode: function () {
      return this.$q.dark.isActive
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
    }
  },
  components: { SearchDialog, TagDialog, SettingsDialog, LoginDialog },
  data () {
    return {
      isMaximized: false,
      searchHighlight: false,
      settingsHighlight: false
    }
  },
  methods: {
    handleHighlight (type) {
      this[type] = true
      setTimeout(() => {
        this[type] = false
      }, 1200)
    },

    handleSearchClick () {
      this.handleHighlight('searchHighlight')
      this.$refs.searchDialog.toggle()
    },

    handleSettingsClick () {
      this.handleHighlight('settingsHighlight')
      this.$refs.settingsDialog.toggle()
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
    },

    toggleTagDrawer () {
      if (!this.isLogin) return
      this.toggleChanged({ key: 'sidebarTreeType', value: 'tag' })
      if (!this.noteListVisible || this.paneLayoutMode !== 0) {
        this.expandFullPaneLayout()
      }
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

    ...mapServerActions(['logout', 'getCategoryNotes']),
    ...mapClientActions(['toggleChanged', 'cyclePaneLayout', 'expandFullPaneLayout'])
  },
  mounted () {
    this.updateMaximizeIcon()
    ipcRenderer.on('window-maximized', (_, val) => { this.isMaximized = val })
    if (!this.autoLogin && !this.isLogin) {
      this.$refs.loginDialog.toggle()
    }
    bus.$on(events.VIEW_SHORTCUT_CALL.switchView, this.switchViewHandler)
    bus.$on(events.NOTE_SHORTCUT_CALL.searchNote, () => this.$refs.searchDialog.toggle())
  },
  watch: {
    isLogin: function (currentData) {
      if (!currentData) {
        this.$refs.loginDialog.show()
      }
    }
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
}

.close-button:hover {
  background-color: rgba(255, 0, 0, .6);
}

.header-left-icons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-right-icons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-icon-btn {
  width: 36px;
  height: 36px;
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
  color: var(--iconColor);
  transition: color 0.2s ease;
}

.header-icon-btn:hover .icon-custom {
  color: var(--themeColor);
}

.header-icon-btn.is-active .icon-custom {
  color: var(--themeColor);
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
</style>
