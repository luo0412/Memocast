<template>
  <q-bar
    class="q-electron-drag header text-grey"
    :class="['header--skin-' + skin]"
    :data-header-skin="skin"
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
        class="header-sync-group q-electron-drag--exception"
      >
        <div
          class="header-icon-btn sync-btn sync-btn--push"
          :class="{ 'has-pending': pendingCount > 0, 'is-syncing': isPushSyncing }"
          @click="handlePushSyncClick"
        >
          <i v-if="isPushSyncing" class="el-icon-loading icon-custom sync-icon" />
          <i v-else class="el-icon-top icon-custom sync-icon" />
          <span v-if="pendingCount > 0" class="sync-badge">{{ pendingCount > 99 ? '99+' : pendingCount }}</span>
          <q-tooltip
            transition-show="fade"
            transition-hide="fade"
            anchor="bottom middle"
            self="top middle"
            :offset="[0, 8]"
          >
            {{ syncPushTooltip }}
          </q-tooltip>
        </div>
        <div
          class="header-icon-btn sync-btn sync-btn--pull"
          :class="{ 'is-syncing': isPullSyncing }"
          @click="handlePullSyncClick"
        >
          <i v-if="isPullSyncing" class="el-icon-loading icon-custom sync-icon" />
          <i v-else class="el-icon-bottom icon-custom sync-icon" />
          <q-tooltip
            transition-show="fade"
            transition-hide="fade"
            anchor="bottom middle"
            self="top middle"
            :offset="[0, 8]"
          >
            {{ syncPullTooltip }}
          </q-tooltip>
        </div>
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
          <el-dropdown-item command="nezha">{{ $t('skin_nezha') }}</el-dropdown-item>
          <el-dropdown-item command="baiyang">{{ $t('skin_baiyang') }}</el-dropdown-item>
          <el-dropdown-item command="infp">{{ $t('skin_infp') }}</el-dropdown-item>
        </el-dropdown-menu>
      </el-dropdown>

      <!-- AI 助手按钮（按 aiAssistantProvider 自动选择入口：内置 / 豆包） -->
      <div
        class="header-icon-btn q-electron-drag--exception ai-entry-btn"
        :class="{ 'is-highlight': aiEntryHighlight, 'is-doubao': aiAssistantProvider === 'doubao' }"
        @click="handleAiAssistantClick"
        :title="$t('aiAssistant')"
      >
        <q-icon :name="aiAssistantIconName" class="icon-custom" />
        <span v-if="aiAssistantProvider === 'doubao'" class="ai-entry-badge">{{ $t('aiAssistantProviderDoubao') }}</span>
        <q-tooltip
          transition-show="fade"
          transition-hide="fade"
          anchor="bottom middle"
          self="top middle"
          :offset="[0, 8]"
        >
          {{ aiAssistantTooltip }}
        </q-tooltip>
      </div>

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

      <!-- 窗口控制按钮 (Windows) -->
      <div v-if="!$q.platform.is.mac" class="header-window-controls">
        <q-btn dense flat icon="minimize" @click="minimize" />
        <q-btn dense flat :icon="isMaximized ? 'open_in_full' : 'crop_square'" @click="maximize" />
        <q-btn dense flat icon="close" class="close-button" @click="closeApp" />
      </div>
    </div>

    <LoginDialog ref="loginDialog" />
    <SettingsDialog ref="settingsDialog" />
    <EchoInstanceDialog
      v-if='echoInstanceDialogVisible'
      v-model='echoInstanceDialogVisible'
      :instance='activeEchoInstance'
      :echo='activeEchoDefinition'
      @submit='handleEchoInstanceSubmit'
      @open-definition='handleEchoDefinitionOpenFromInstance'
    />
    <SearchDialog ref='searchDialog' />
    <TagDialog ref="tagDialog" />
    <ImDrawer ref="imDrawer" />
    <DoubaoChatDrawer ref="doubaoChatDrawer" />
    <AiDemoDrawer ref="aiDemoDrawer" @request-ai-provider-config="handleAiProviderConfigRequest" />
  </q-bar>
</template>

<script>
import LoginDialog from './LoginDialog'
import SettingsDialog from './SettingsDialog'
import { decodeEchoPayload } from 'components/EchoRuntime'
import { createNamespacedHelpers } from 'vuex'
import helper from 'src/utils/helper'
import debounce from 'lodash/debounce'
import TagDialog from 'components/TagDialog'
import bus from 'components/bus'
import events from 'src/constants/events'
import SearchDialog from 'components/SearchDialog'
import ImDrawer from 'components/ImDrawer'
import DoubaoChatDrawer from 'components/DoubaoChatDrawer'
import AiDemoDrawer from 'components/AiDemoDrawer'
import EchoInstanceDialog from 'components/EchoInstanceDialog.vue'
import { ipcRenderer } from 'electron'
import DatabaseClient from 'src/utils/DatabaseClient'
import CloudSyncService from 'src/services/CloudSyncService'

const SYNC_REASON_MESSAGES = {
  not_logged_in: 'offlineMode',
  already_syncing: 'cloudSyncSyncing'
}

const {
  mapState: mapServerState,
  mapGetters: mapServerGetters,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')

const {
  mapState: mapClientState,
  mapActions: mapClientActions,
  mapMutations: mapClientMutations
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
      'syncStatus',
      'noteMethod',
      'aiAssistantProvider',
      'skin'
    ]),

    pendingCount() {
      return this.syncStatus?.pending || 0
    },
    isSyncing() {
      return this.isPushSyncing || this.isPullSyncing
    },
    syncPushTooltip() {
      if (this.isPushSyncing) {
        return this.$t('cloudSyncSyncing')
      }
      if (this.pendingCount > 0) {
        return `${this.$t('cloudSyncSyncPushOnly')} (${this.pendingCount})`
      }
      return this.$t('cloudSyncSyncPushOnly')
    },
    syncPullTooltip() {
      if (this.isPullSyncing) {
        return this.$t('cloudSyncSyncing')
      }
      return this.$t('cloudSyncSyncPullOnly')
    },
    darkMode: function () {
      return this.$q.dark.isActive
    },
    currentNoteMethodLabel () {
      const opt = this.noteMethodOptions.find(o => o.value === this.noteMethod)
      return opt ? opt.label : ''
    },
    currentNoteMethodDescription () {
      const opt = this.noteMethodOptions.find(o => o.value === this.noteMethod)
      return opt ? opt.description : ''
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
    },
    activeEchoDefinition () {
      const definitionId = String(this.activeEchoInstance?.definitionId || '').trim()
      const echoName = String(this.activeEchoInstance?.echoName || '').trim()
      return (this.$store.state.client.echoCards || []).find(item => {
        if (!item) return false
        if (definitionId && String(item.id || '').trim() === definitionId) return true
        if (echoName && item.name === echoName) return true
        return false
      }) || null
    },
    aiAssistantIconName () {
      return this.aiAssistantProvider === 'doubao' ? 'mic' : 'auto_awesome'
    },
    aiAssistantTooltip () {
      return this.aiAssistantProvider === 'doubao'
        ? this.$t('aiAssistantEntryDoubaoTooltip')
        : this.$t('aiAssistant')
    }
  },
  components: { SearchDialog, TagDialog, SettingsDialog, LoginDialog, ImDrawer, DoubaoChatDrawer, AiDemoDrawer, EchoInstanceDialog },
  data () {
    return {
      isMaximized: false,
      searchHighlight: false,
      settingsHighlight: false,
      isPushSyncing: false,
      isPullSyncing: false,
      noteMethodOptions: [
        {
          label: '六道笔记论',
          value: 'notesSixDaoLun',
          description: '强目的性归类笔记'
        },
        {
          label: '三层漏斗法',
          value: 'threeLayerFunnel',
          description: '收集游离态笔记碎片成体系'
        }
      ],
      aiEntryHighlight: false,
      echoInstanceDialogVisible: false,
      activeEchoInstance: null
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
      this.toggleChanged({ key: 'noteMethod', value })
    },

    handleSearchClick () {
      this.handleHighlight('searchHighlight')
      this.$refs.searchDialog.toggle()
    },

    handleSkinCommand (command) {
      const supportedSkins = ['baiyang', 'nezha', 'infp']
      const nextSkin = supportedSkins.includes(command) ? command : 'baiyang'
      if (nextSkin === this.skin) {
        this.$q.notify({
          message: this.$t('skinSwitched', { name: this.$t(`skin_${nextSkin}`) }),
          type: 'info',
          position: 'top'
        })
        return
      }
      this.toggleChanged({ key: 'skin', value: nextSkin })
      this.applySkinThemeColor(nextSkin)
      this.$q.notify({
        message: this.$t('skinSwitched', { name: this.$t(`skin_${nextSkin}`) }),
        type: 'positive',
        position: 'top',
        icon: 'check'
      })
    },

    applySkinThemeColor (skin) {
      const skinColors = {
        baiyang: null,
        nezha: { main: '#b5817d', rgb: '181, 129, 125' },
        infp: { main: '#21b56f', rgb: '33, 181, 111' }
      }
      const colors = skinColors[skin]
      const root = document.documentElement
      if (colors === null) {
        root.style.removeProperty('--themeColor')
        root.style.removeProperty('--themeColor90')
        root.style.removeProperty('--themeColor80')
        root.style.removeProperty('--themeColor70')
        root.style.removeProperty('--themeColor60')
        root.style.removeProperty('--themeColor50')
        root.style.removeProperty('--themeColor40')
        root.style.removeProperty('--themeColor30')
        root.style.removeProperty('--themeColor20')
        root.style.removeProperty('--themeColor10')
      } else {
        root.style.setProperty('--themeColor', `rgba(${colors.rgb}, 1)`)
        root.style.setProperty('--themeColor90', `rgba(${colors.rgb}, .9)`)
        root.style.setProperty('--themeColor80', `rgba(${colors.rgb}, .8)`)
        root.style.setProperty('--themeColor70', `rgba(${colors.rgb}, .7)`)
        root.style.setProperty('--themeColor60', `rgba(${colors.rgb}, .6)`)
        root.style.setProperty('--themeColor50', `rgba(${colors.rgb}, .5)`)
        root.style.setProperty('--themeColor40', `rgba(${colors.rgb}, .4)`)
        root.style.setProperty('--themeColor30', `rgba(${colors.rgb}, .3)`)
        root.style.setProperty('--themeColor20', `rgba(${colors.rgb}, .2)`)
        root.style.setProperty('--themeColor10', `rgba(${colors.rgb}, .1)`)
      }
    },

    handleSettingsClick (options = {}) {
      this.handleHighlight('settingsHighlight')
      const dialog = this.$refs.settingsDialog
      if (!dialog) return

      const shouldOpenAiAdd = Boolean(options.openAiAdd)
      const shouldOpenEchoEditor = Boolean(options.openEchoEdit)
      const toggleMode = options.toggle !== false

      if (!toggleMode) {
        dialog.show(options)
      } else {
        dialog.toggle()
      }

      if (shouldOpenAiAdd) {
        this.$nextTick(() => {
          dialog.tab = 'server'
          dialog.openAiModelDialog(null, { markAsDefault: true })
        })
      }

      if (shouldOpenEchoEditor && typeof dialog.applyOpenOptions === 'function') {
        this.$nextTick(() => {
          dialog.applyOpenOptions(options)
        })
      }
    },

    handleAiAssistantClick () {
      this.handleHighlight('aiEntryHighlight')
      if (this.aiAssistantProvider === 'doubao') {
        this.$refs.doubaoChatDrawer.toggle()
      } else {
        this.$refs.aiDemoDrawer.toggle()
      }
    },

    handleAiProviderConfigRequest () {
      this.handleSettingsClick({ toggle: false, openAiAdd: true })
    },

    handleOpenEchoManager (payload = {}) {
      this.activeEchoInstance = {
        echoId: String(payload?.echoId || '').trim(),
        nodeId: String(payload?.nodeId || '').trim(),
        echoName: String(payload?.echoName || '').trim(),
        definitionId: String(payload?.definitionId || decodeEchoPayload(String(payload?.payload || ''))?.attrs?.definitionId || '').trim(),
        payload: String(payload?.payload || '')
      }
      this.echoInstanceDialogVisible = true
    },

    handleEchoInstanceSubmit (payload = {}) {
      bus.$emit(events.ECHO_EVENTS.commitInstance, payload)
      this.echoInstanceDialogVisible = false
    },

    handleEchoDefinitionOpenFromInstance (payload = {}) {
      this.echoInstanceDialogVisible = false
      this.handleSettingsClick({
        toggle: false,
        tab: 'echo',
        echoId: String(payload?.echoId || '').trim(),
        echoName: String(payload?.echoName || '').trim(),
        openEchoEdit: true
      })
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
    ...mapClientActions(['toggleChanged', 'cyclePaneLayout', 'expandFullPaneLayout']),
    ...mapClientMutations({ UPDATE_SYNC_STATUS: 'update_sync_status' }),

    async refreshSyncStatusFromDb (lastSyncTime = null) {
      const stats = await DatabaseClient.sync.getStats()
      this.UPDATE_SYNC_STATUS({
        isSyncing: false,
        ...(lastSyncTime ? { lastSyncTime } : {}),
        ...stats
      })
      return stats
    },

    formatSyncFailureMessage (result) {
      if (!result) {
        return this.$t('cloudSyncFailed')
      }

      if (result.error) {
        return result.error
      }

      const messageKey = SYNC_REASON_MESSAGES[result.reason]
      if (messageKey) {
        return this.$t(messageKey)
      }

      return this.$t('cloudSyncFailed')
    },

    async runSyncAction ({ key, action, successMessage, icon, getCount }) {
      if (this.isSyncing) {
        return
      }

      if (!this.isLogin) {
        this.$q.notify({
          message: this.$t('offlineMode'),
          type: 'info',
          position: 'top'
        })
        return
      }

      this[key] = true

      try {
        const result = await action()
        await this.refreshSyncStatusFromDb(Date.now())
        if (result.success) {
          const count = getCount(result)
          this.$q.notify({
            message: count ? `${successMessage} ${count}` : successMessage,
            type: 'positive',
            position: 'top',
            icon
          })
        } else {
          this.$q.notify({
            message: this.formatSyncFailureMessage(result),
            type: 'negative',
            position: 'top'
          })
        }
        return result
      } catch (error) {
        console.error('Sync action failed:', error)
        try {
          await this.refreshSyncStatusFromDb()
        } catch (statsError) {
          console.error('Refresh sync status failed:', statsError)
        }
        this.$q.notify({
          message: error?.message || this.$t('cloudSyncFailed'),
          type: 'negative',
          position: 'top'
        })
        return null
      } finally {
        this[key] = false
      }
    },

    async handlePushSyncAction () {
      await this.runSyncAction({
        key: 'isPushSyncing',
        action: () => CloudSyncService.pushOnly(),
        successMessage: this.$t('cloudBackupComplete'),
        icon: 'cloud_upload',
        getCount: result => (result.count > 0 ? `↑${result.count}` : '')
      })
    },

    async handlePullSyncAction () {
      this.$q.dialog({
        title: this.$t('syncPullConfirmTitle'),
        message: this.$t('syncPullConfirmMessage'),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('syncPullConfirmOk'), color: 'primary' },
        persistent: true
      }).onOk(async () => {
        await this.runSyncAction({
          key: 'isPullSyncing',
          action: () => CloudSyncService.pullOnly(),
          successMessage: this.$t('cloudRestoreComplete'),
          icon: 'cloud_download',
          getCount: result => (result.pulled > 0 ? `↓${result.pulled}` : '')
        })
      })
    },

    handlePushSyncClick: debounce(function () {
      this.handlePushSyncAction()
    }, 500, { leading: true, trailing: false }),

    handlePullSyncClick: debounce(function () {
      this.handlePullSyncAction()
    }, 500, { leading: true, trailing: false }),
  },

  mounted () {
    this.updateMaximizeIcon()
    this.applySkinThemeColor(this.skin)
    ipcRenderer.on('window-maximized', (_, val) => { this.isMaximized = val })
    if (!this.autoLogin && !this.isLogin) {
      this.$refs.loginDialog.toggle()
    }
    bus.$on(events.VIEW_SHORTCUT_CALL.switchView, this.switchViewHandler)
    bus.$on(events.NOTE_SHORTCUT_CALL.searchNote, () => this.$refs.searchDialog.toggle())
    bus.$on(events.ECHO_EVENTS.openManager, this.handleOpenEchoManager)
    bus.$on(events.ECHO_EVENTS.openInstanceEditor, this.handleOpenEchoManager)
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
    this.handlePushSyncClick.cancel()
    this.handlePullSyncClick.cancel()
    bus.$off(events.VIEW_SHORTCUT_CALL.switchView, this.switchViewHandler)
    bus.$off(events.ECHO_EVENTS.openManager, this.handleOpenEchoManager)
    bus.$off(events.ECHO_EVENTS.openInstanceEditor, this.handleOpenEchoManager)
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

.ai-entry-btn.is-doubao .icon-custom {
  color: var(--themeColor);
}

.ai-entry-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  padding: 0 4px;
  height: 14px;
  line-height: 14px;
  font-size: 9px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #1e6fff 0%, #4f8bff 100%);
  border-radius: 7px;
  letter-spacing: 0.5px;
  box-shadow: 0 1px 2px rgba(30, 111, 255, 0.35);
}

.header-avatar-wrapper {
  margin-left: 4px;
  margin-right: 5px;
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

/* dropdown 菜单在各皮肤下的文字颜色（dropdown 是 teleport 的，scoped 选择器无效，需用变量） */
:root {
  --dropdown-text-color: var(--editorColor);
  --dropdown-text-hover-bg: var(--themeColor10);
  --dropdown-text-hover-color: var(--themeColor);
}

[data-header-skin="nezha"] {
  --dropdown-text-color: #b5817d;
  --dropdown-text-hover-bg: rgba(181, 129, 125, 0.12);
  --dropdown-text-hover-color: #b5817d;
}

[data-header-skin="infp"] {
  --dropdown-text-color: #5a7a5e;
  --dropdown-text-hover-bg: rgba(163, 181, 166, 0.12);
  --dropdown-text-hover-color: #5a7a5e;
}

.el-dropdown-menu__item {
  color: var(--dropdown-text-color);
}

.el-dropdown-menu__item:hover {
  background-color: var(--dropdown-text-hover-bg);
  color: var(--dropdown-text-hover-color);
}

.el-dropdown-menu__item i {
  margin-right: 8px;
}

/* 同步按钮样式 */
.header-sync-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

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

/* === 头部皮肤(基于莫兰迪色系,饱和度低、不刺眼) ===
 * baiyang: 默认白,沿用 quasar q-bar 默认色,不施加样式
 * nezha:   莫兰迪砖红,文字反色为浅米白
 * infp:    莫兰迪灰绿,文字反色为浅米白
 */
.header--skin-baiyang {
  /* 默认白: 保持 q-bar 原始配色,这里故意留空 */
}

.header--skin-nezha {
  background-color: #b5817d !important;  /* 莫兰迪砖红(muted dusty rose) */
  color: #2c2c2c !important;             /* 深色文字 */
}

.header--skin-nezha .header-icon-btn .icon-custom,
.header--skin-nezha .header-note-title > span,
.header--skin-nezha .header-category-name {
  color: #2c2c2c;
}

.header--skin-nezha .header-icon-btn:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.header--skin-nezha .note-method-btn {
  color: #2c2c2c;
}

.header--skin-nezha .header-icon-btn.is-active .icon-custom {
  color: #2c2c2c;
}

.header--skin-nezha .header-avatar-placeholder {
  background-color: rgba(0, 0, 0, 0.2);
}

.header--skin-infp {
  background-color: #a3b5a6 !important;  /* 莫兰迪灰绿(sage green) */
  color: #2c2c2c !important;             /* 深色文字 */
}

.header--skin-infp .header-icon-btn .icon-custom,
.header--skin-infp .header-note-title > span,
.header--skin-infp .header-category-name {
  color: #2c2c2c;
}

.header--skin-infp .header-icon-btn:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.header--skin-infp .note-method-btn {
  color: #2c2c2c;
}

.header--skin-infp .header-icon-btn.is-active .icon-custom {
  color: #2c2c2c;
}

.header--skin-infp .header-avatar-placeholder {
  background-color: rgba(0, 0, 0, 0.2);
}

/* 暗黑模式下:无论哪种皮肤,头部都要保持深色文字 */
.body--dark .header--skin-nezha,
.body--dark .header--skin-infp {
  color: #2c2c2c !important;
}
</style>
