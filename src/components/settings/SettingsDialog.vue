<template>
  <q-dialog transition-show='fade' transition-hide='fade' ref='dialog'>
    <q-card class='settings-dialog-card'>
      <q-toolbar class='settings-dialog-toolbar'>
        <q-toolbar-title class='text-body1 text-weight-medium'>
          {{ $t('settings') }}
        </q-toolbar-title>
        <q-btn flat round dense icon='close' size='sm' v-close-popup />
      </q-toolbar>

      <q-card-section class='scroll settings-dialog-body'>
        <div class='settings-dialog-layout'>
          <SettingsNav v-model='tab' />
          <q-separator vertical class='settings-dialog-sep' />
          <div class='settings-dialog-panels'>
            <q-tab-panels v-model='tab' animated swipeable vertical transition-prev='jump-up' transition-next='jump-up'>

              <!-- 通用 -->
              <q-tab-panel name='general' class='q-pa-none'>
                <SettingsGeneralPanel
                  :language='language'
                  :theme='theme'
                  :themes='themes'
                  :version='version'
                  :cdn-deps='cdnDeps'
                  @update-language='updateLanguage'
                  @update-theme='updateTheme'
                  @update-dark-mode='updateDarkMode'
                  @update-themes='updateThemes'
                  @open-log-files='openLogFiles'
                  @open-sqlite-file='openSqliteFile'
                  @reset-sqlite='resetSqlite'
                  @reset-runes='resetRunes'
                  @reset-echoes='resetEchoes'
                  @check-update='checkUpdate'
                />
              </q-tab-panel>

              <!-- 编辑器 -->
              <q-tab-panel name='editor' class='q-pa-none'>
                <SettingsEditorPanel
                  :markdown-only='markdownOnly'
                  :note-list-dense-mode='noteListDenseMode'
                  :note-order-type='noteOrderType'
                  :quick-insert-columns='quickInsertColumns'
                  :note-templates='noteTemplates'
                  :echo-require-parens='echoRequireParens'
                  :rune-require-template-div='runeRequireTemplateDiv'
                  @toggle-change='handleToggleChange'
                  @update-state='handleEditorUpdateState'
                  @add-template='openAddTemplate'
                  @edit-template='openEditTemplate'
                  @delete-template='confirmDeleteTemplate'
                  @batch-delete-templates='confirmBatchDeleteTemplates'
                />
              </q-tab-panel>

              <!-- AI -->
              <q-tab-panel name='ai' class='q-pa-none'>
                <SettingsAiPanel
                  :ai-assistant-provider='aiAssistantProvider'
                  :ai-model-configs='aiModelConfigs'
                  :ai-skills-loading='aiSkillsLoading'
                  :ai-skill-configs='aiSkillConfigs'
                  :ai-models-loading='aiModelsLoading'
                  @update-ai-assistant-provider='updateAiAssistantProvider'
                  @open-ai-model-dialog='openAiModelDialog'
                  @open-ai-skill-dialog='openAiSkillDialog'
                  @reload-ai-model-configs='loadAiModelConfigs'
                  @reload-ai-skill-configs='loadAiSkillConfigs'
                />
              </q-tab-panel>

              <!-- 云服务 -->
              <q-tab-panel name='server' class='q-pa-none'>
                <SettingsServerPanel
                  :cloud-sync-provider='cloudSyncProvider'
                  :sync-status='syncStatus'
                  :image-upload-service='imageUploadService'
                  @update-cloud-sync-provider='updateCloudSyncProvider'
                  @update-image-upload-service='updateImageUploadService'
                  @open-login-dialog='openLoginDialog'
                  @confirm-logout='confirmLogout'
                  @do-push-only='doPushOnly'
                  @do-pull-only='doPullOnly'
                />
              </q-tab-panel>

              <!-- 回响 -->
              <q-tab-panel name='echo' class='q-pa-none'>
                <SettingsEchoPanel
                  ref='echoPanel'
                  :echo-cards='localEchoCards'
                  @update-echo-cards='updateEchoCards'
                  @add-echo='openAddEcho'
                  @edit-echo='openEditEcho'
                  @delete-echo='confirmDeleteEcho'
                  @batch-delete='confirmBatchDeleteEcho'
                />
              </q-tab-panel>

              <!-- 云函数 -->
              <q-tab-panel name='cloudFn' class='q-pa-none'>
                <SettingsCloudFnPanel
                  @open-navigation-dialog='openNavigationDialog'
                />
              </q-tab-panel>

              <!-- 符文 -->
              <q-tab-panel name='rune' class='q-pa-none'>
                <SettingsRunePanel
                  ref='runePanel'
                  :rune-cards='localRuneCards'
                  @update-rune-cards='updateRuneCards'
                  @add-rune='openAddRune'
                  @edit-rune='openEditRune'
                  @delete-rune='confirmDeleteRune'
                  @batch-delete='confirmBatchDeleteRune'
                  @export-current-category='openExportCurrentCategory'
                  @batch-import='openBatchImport'
                />
              </q-tab-panel>

            </q-tab-panels>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- 子弹框 -->
    <ImageUploadServiceDialog ref='imageUploadServiceDialog' />
    <UpdateDialog ref='updateDialog' />
    <NavigationDialog
      v-model='navigationDialogVisible'
      @go-config='onNavigationGoConfig'
    />
    <runeFormDialog
      v-if='runeFormVisible'
      :key='runeFormKey'
      v-model='runeFormVisible'
      :rune='editingRune'
      :default-category='runeCategory'
      :rune-require-template-div='runeRequireTemplateDiv'
      @input='onRuneFormVisibleChange'
      @submit='onRuneSubmit'
    />
    <runeExportDialog
      v-model='runeExportDialogVisible'
      :selected-runes='runeExportSelectedRunes'
    />
    <runeBatchImportDialog
      v-if='runeBatchImportDialogVisible'
      ref='runeBatchImportDialog'
      v-model='runeBatchImportDialogVisible'
      :default-category='runeImportCategory'
      :existing-runes='localRuneCards'
      :builtin-names='builtinRuneNameList'
      @import='onRuneBatchImport'
      @imported='onRuneBatchImported'
      @import-failed='onRuneBatchImportFailed'
    />
    <echoFormDialog
      v-if='echoFormVisible'
      :key='echoFormKey'
      v-model='echoFormVisible'
      :echo='editingEcho'
      :default-category='echoCategory'
      :echo-require-parens='echoRequireParens'
      @input='onEchoFormVisibleChange'
      @submit='onEchoSubmit'
    />
    <NoteTemplateFormDialog
      v-if='noteTemplateFormVisible'
      :key='noteTemplateFormKey'
      v-model='noteTemplateFormVisible'
      :template='editingTemplate'
      :read-only='noteTemplateReadOnly'
      @input='onNoteTemplateFormVisibleChange'
      @submit='onNoteTemplateSubmit'
    />
    <SettingsAiModelDialog ref='aiModelDialog' @saved='loadAiModelConfigs' />
    <SettingsAiSkillDialog ref='aiSkillDialog' @saved='loadAiSkillConfigs' />
  </q-dialog>
</template>

<script>
import { createNamespacedHelpers } from 'vuex'
import { Loading } from 'quasar'
import ImageUploadServiceDialog from '../image/ImageUploadServiceDialog.vue'
import UpdateDialog from 'components/update/UpdateDialog'
import runeCard from 'components/rune/runeCard'
import runeFormDialog from 'components/rune/runeFormDialog'
import runeExportDialog from 'components/rune/runeExportDialog'
import runeBatchImportDialog from 'components/rune/runeBatchImportDialog'
import runeTemplateService from 'src/services/RuneTemplateService'
import echoFormDialog from 'components/echo/echoFormDialog'
import NoteTemplateFormDialog from 'components/noteTemplate/NoteTemplateFormDialog'
import NavigationDialog from 'components/navigation/NavigationDialog'
import { BUILTIN_ECHO_CARDS } from 'components/echo/echoCore'

import SettingsNav from './SettingsNav'
import SettingsGeneralPanel from './SettingsGeneralPanel'
import SettingsEditorPanel from './SettingsEditorPanel'
import SettingsAiPanel from './SettingsAiPanel'
import SettingsServerPanel from './SettingsServerPanel'
import SettingsCloudFnPanel from './SettingsCloudFnPanel'
import SettingsRunePanel from './SettingsRunePanel'
import SettingsEchoPanel from './SettingsEchoPanel'
import SettingsAiModelDialog from './SettingsAiModelDialog'
import SettingsAiSkillDialog from './SettingsAiSkillDialog'

import { checkUpdate, needUpdate, openLogFiles, openSqliteFile } from 'src/ApiInvoker'
import DatabaseClient from 'src/utils/DatabaseClient'
import CloudSyncService from 'src/services/CloudSyncService'
import SessionStorageService from 'src/services/SessionStorageService'
import bus from 'components/common/bus'
import { EVENTS as events } from 'src/utils/const/eventsConst'
import { version } from '../../../package.json'
import { DEFAULT_RUNE_CATEGORY, DEFAULT_ECHO_CATEGORY } from 'src/utils/enum'
import helper from 'src/utils/helper'

const {
  mapState: mapClientState,
  mapActions: mapClientActions,
  mapMutations: mapClientMutations
} = createNamespacedHelpers('client')

export default {
  name: 'SettingsDialog',
  components: {
    ImageUploadServiceDialog,
    UpdateDialog,
    runeCard,
    runeFormDialog,
    runeExportDialog,
    runeBatchImportDialog,
    echoFormDialog,
    NoteTemplateFormDialog,
    NavigationDialog,
    SettingsNav,
    SettingsGeneralPanel,
    SettingsEditorPanel,
    SettingsAiPanel,
    SettingsServerPanel,
    SettingsCloudFnPanel,
    SettingsRunePanel,
    SettingsEchoPanel,
    SettingsAiModelDialog,
    SettingsAiSkillDialog
  },
  data () {
    return {
      tab: 'general',
      runeFormVisible: false,
      runeFormKey: 0,
      editingRune: null,
      runeCategory: DEFAULT_RUNE_CATEGORY,
      runeImportCategory: DEFAULT_RUNE_CATEGORY,
      runeExportDialogVisible: false,
      runeExportSelectedRunes: [],
      runeBatchImportDialogVisible: false,
      echoFormVisible: false,
      echoFormKey: 0,
      editingEcho: null,
      echoCategory: DEFAULT_ECHO_CATEGORY,
      noteTemplateFormVisible: false,
      noteTemplateFormKey: 0,
      editingTemplate: null,
      noteTemplateReadOnly: false,
      navigationDialogVisible: false,
      checkingNotify: null,
      // AI 配置
      aiModelsLoading: false,
      aiModelConfigs: [],
      aiSkillsLoading: false,
      aiSkillConfigs: [],
      // CDN 依赖
      cdnDeps: [],
      // 语法解析开关（持久化在 SQLite app_state 表，键 setting/parsing/*）
      echoRequireParens: true,
      runeRequireTemplateDiv: false,
      // 懒加载标志
      _dataLoaded: false
    }
  },
  computed: {
    localRuneCards: {
      get () {
        return this.runeCards
      },
      set (val) {
        this.updateStateAndStore({ runeCards: val })
      }
    },
    builtinRuneNameList () {
      const list = this.localRuneCards || []
      return list
        .filter(r => r && (r.is_builtin === 1 || r.is_builtin === '1'))
        .map(r => r.name)
        .filter(Boolean)
    },
    localEchoCards: {
      get () {
        return this.echoCards
      },
      set (val) {
        this.updateStateAndStore({ echoCards: val })
      }
    },
    localNoteTemplates: {
      get () {
        return this.noteTemplates
      },
      set (val) {
        this.updateStateAndStore({ noteTemplates: val })
      }
    },
    version () {
      return version
    },
    ...mapClientState([
      'language',
      'darkMode',
      'noteListDenseMode',
      'markdownOnly',
      'imageUploadService',
      'noteOrderType',
      'quickInsertColumns',
      'theme',
      'themes',
      'runeCards',
      'noteTemplates',
      'echoCards',
      'aiAssistantProvider',
      'cloudSyncProvider',
      'syncStatus'
    ])
  },
  methods: {
    // ==================== Dialog 基础方法 ====================
    toggle: function () {
      this.refreshCloudSyncLoginState()
      if (!this._dataLoaded) {
        this.loadLazyData()
      }
      return this.$refs.dialog.toggle()
    },
    show: function (options = {}) {
      this.refreshCloudSyncLoginStatus()
      if (options && typeof options === 'object') {
        this.applyOpenOptions(options)
      }
      if (!this._dataLoaded) {
        this.loadLazyData()
      }
      return this.$refs.dialog.show()
    },
    loadLazyData: async function () {
      if (this._dataLoaded) return
      this._dataLoaded = true
      this.loadRunes()
      this.loadEchoes()
      this.loadNoteTemplates()
      this.loadAiModelConfigs()
      this.loadAiSkillConfigs()
      await this.loadParsingSettings()
      await this.loadParsingSettingsToVuex()
      await this.initCdnDeps()
    },
    async loadParsingSettingsToVuex () {
      // v2026-07-31 起：从 SQLite 真源读取「语法解析」开关并同步到 vuex。
      // 这样 Muya.vue 的 echoRequireParens mapState 在首次 created() 时就能拿到正确值。
      // SettingsDialog 已有的 loadParsingSettings 仅写入组件 data (this.echoRequireParens)；
      // 这里额外 dispatch action 让 vuex state 也立刻一致，避免双源不一致。
      try {
        await this.loadParsingSettings()
      } catch (err) {
        console.warn('[SettingsDialog] loadParsingSettingsToVuex failed:', err)
      }
    },
    async loadParsingSettings () {
      try {
        // 从 SQLite app_state 读取两个语法解析开关（详见 rules/sqlite-settings-storage.mdc）
        // 默认值：echo () 必填 = true；rune template 下 div 必填 = false。
        const echoVal = await DatabaseClient.appState.get('setting/parsing/echoRequireParens')
        if (echoVal !== null && echoVal !== undefined) {
          this.echoRequireParens = echoVal === true || echoVal === 'true'
        } else {
          this.echoRequireParens = true
        }
        const runeVal = await DatabaseClient.appState.get('setting/parsing/runeRequireTemplateDiv')
        if (runeVal !== null && runeVal !== undefined) {
          this.runeRequireTemplateDiv = runeVal === true || runeVal === 'true'
        } else {
          this.runeRequireTemplateDiv = false
        }
      } catch (err) {
        console.warn('[SettingsDialog] loadParsingSettings failed:', err)
      }
    },
    async saveParsingSetting (key, value) {
      try {
        await DatabaseClient.appState.set(key, JSON.stringify(Boolean(value)))
      } catch (err) {
        console.warn('[SettingsDialog] saveParsingSetting failed:', err)
      }
    },
    async handleEditorUpdateState (state) {
      // 分流：解析类开关走 SQLite app_state；同时把新值同步到 vuex state 让 Muya.vue
      // 能立即 watch 变化并实时切换 inlineRules.echo_anno（详见 Muya.vue echoRequireParens watcher）。
      // 注意：vuex 同步不写 electron-store，因为 SQLite 才是真源（vuex 仅为响应式 cache）。
      if (Object.prototype.hasOwnProperty.call(state, 'echoRequireParens')) {
        this.echoRequireParens = Boolean(state.echoRequireParens)
        await this.saveParsingSetting('setting/parsing/echoRequireParens', this.echoRequireParens)
        try {
          this.updateParsingStates({ echoRequireParens: this.echoRequireParens })
        } catch (error) {
          console.warn('[SettingsDialog] vuex sync echoRequireParens failed:', error)
        }
        return
      }
      if (Object.prototype.hasOwnProperty.call(state, 'runeRequireTemplateDiv')) {
        this.runeRequireTemplateDiv = Boolean(state.runeRequireTemplateDiv)
        await this.saveParsingSetting('setting/parsing/runeRequireTemplateDiv', this.runeRequireTemplateDiv)
        try {
          this.updateParsingStates({ runeRequireTemplateDiv: this.runeRequireTemplateDiv })
        } catch (error) {
          console.warn('[SettingsDialog] vuex sync runeRequireTemplateDiv failed:', error)
        }
        return
      }
      this.updateStateAndStore(state)
    },
    async applyOpenOptions (options = {}) {
      const { tab = '', echoId = '', echoName = '', openEchoEdit = false, openAiAdd = false } = options
      try {
        if (tab) {
          this.tab = tab
        } else if (openAiAdd) {
          this.tab = 'ai'
        }
        if (tab === 'echo' || openEchoEdit) {
          const matchedEcho = (this.localEchoCards || []).find(item => {
            if (!item) return false
            if (echoId && item.id === echoId) return true
            if (echoName && item.name === echoName) return true
            return false
          }) || null
          if (openEchoEdit && matchedEcho) {
            this.editingEcho = { ...matchedEcho }
            this.openEchoFormDialog()
          } else if (openEchoEdit && !matchedEcho) {
            // 用户从笔记点"编辑定义"——如果本地列表里没找到（极端情况），退化成只打开 echo 标签页
            this.editingEcho = null
          }
        }
        if (openAiAdd) {
          // 懒加载里包含 aiModelConfigs；先确保加载完，再打开新增弹框
          await this.loadLazyData()
          this.openAiModelDialog()
        }
      } catch (err) {
        console.warn('[SettingsDialog] applyOpenOptions failed:', err)
      }
    },

    // ==================== General 面板事件 ====================
    openLogFiles () {
      openLogFiles()
    },
    openSqliteFile () {
      openSqliteFile()
    },
    updateLanguage (lan) {
      this.updateStateAndStore({ language: lan })
    },
    updateTheme (themeName) {
      this.updateStateAndStore({ theme: themeName })
    },
    updateDarkMode (dark) {
      this.toggleChanged({ key: 'darkMode', value: dark })
    },
    updateThemes (themes) {
      this.toggleChanged({ key: 'themes', value: themes })
    },
    checkUpdate () {
      checkUpdate().then(() => {
        this.checkingNotify = this.$q.notify({
          message: this.$t('checking'),
          timeout: 0,
          spinner: true,
          color: 'primary',
          actions: [{
            icon: 'clear',
            color: 'white',
            handler: () => {}
          }]
        })
      })
    },
    resetSqlite () {
      this.$q.dialog({
        title: this.$t('resetSqlite'),
        message: this.$t('resetSqliteConfirm'),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('confirm'), color: 'negative' }
      }).onOk(async () => {
        const success = await DatabaseClient.sync.resetDatabase()
        if (success) {
          this.UPDATE_SYNC_STATUS({ isSyncing: false, lastSyncTime: null, total: 0, synced: 0, pending: 0 })
          this.$q.notify({ message: this.$t('resetSqliteSuccess'), type: 'positive', position: 'top' })
        } else {
          this.$q.notify({ message: this.$t('resetSqliteFailed'), type: 'negative', position: 'top' })
        }
      })
    },
    async resetRunes () {
      this.$q.dialog({
        title: this.$t('resetRunes'),
        message: this.$t('resetRunesConfirm'),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('confirm'), color: 'purple-7' }
      }).onOk(async () => {
        try {
          console.log('[RUNE-TPL] resetRunes -> clearAll')
          // 用 renderer 端 runeTemplates.js 的 BUILTIN_RUNE_TEMPLATE_META 拼装内置行，
          // 由 main 端 db:clearRuneTemplates 全量替换 DB 内置行。main 端不再维护镜像。
          const builtins = await runeTemplateService.buildBuiltinRows()
          if (!Array.isArray(builtins) || builtins.length === 0) {
            this.$q.notify({ message: this.$t('resetRunesFailed'), type: 'negative', position: 'top' })
            return
          }
          const result = await DatabaseClient.runeTemplates.clearAll({ builtins })
          console.log(`[RUNE-TPL] resetRunes clearAll result=${JSON.stringify(result)}`)
          if (result && result.success) {
            this.$q.notify({ message: this.$t('resetRunesSuccess', { count: result.count || 0, custom: result.customKept || 0 }), type: 'positive', position: 'top' })
            this.loadRunes()
          } else {
            this.$q.notify({ message: this.$t('resetRunesFailed'), type: 'negative', position: 'top' })
          }
        } catch (err) {
          console.error('[Settings] resetRunes error:', err)
          this.$q.notify({ message: this.$t('resetRunesFailed'), type: 'negative', position: 'top' })
        }
      })
    },
    async resetEchoes () {
      this.$q.dialog({
        title: this.$t('resetEchoes'),
        message: this.$t('resetEchoesConfirm'),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('confirm'), color: 'cyan-7' }
      }).onOk(async () => {
        try {
          // 用 renderer 端内置 echo 默认镜像列表覆盖 DB —— 真正把"被编辑过的内置回响"还原回默认值。
          // 之前这里传的是 store / localEchoCards 里当前的快照（含用户编辑），重置后内容不会变，等于失效。
          const builtins = Array.isArray(BUILTIN_ECHO_CARDS) ? BUILTIN_ECHO_CARDS : []
          const result = await DatabaseClient.echoes.clearAll({ builtins })
          if (result && result.success) {
            this.$q.notify({ message: this.$t('resetEchoesSuccess', { count: result.count || 0, custom: result.customKept || 0 }), type: 'positive', position: 'top' })
            this.loadEchoes()
          } else {
            this.$q.notify({ message: this.$t('resetEchoesFailed'), type: 'negative', position: 'top' })
          }
        } catch (err) {
          console.error('[Settings] resetEchoes error:', err)
          this.$q.notify({ message: this.$t('resetEchoesFailed'), type: 'negative', position: 'top' })
        }
      })
    },

    // ==================== Editor 面板事件 ====================
    handleToggleChange ({ key, value }) {
      this.toggleChanged({ key, value })
    },
    handleUpdateState (state) {
      this.updateStateAndStore(state)
    },

    // ==================== AI 面板事件 ====================
    updateAiAssistantProvider (value) {
      this.updateStateAndStore({ aiAssistantProvider: value })
    },
    openAiModelDialog (modelId) {
      this.$refs.aiModelDialog.open(modelId)
    },
    openAiSkillDialog (skillId) {
      this.$refs.aiSkillDialog.open(skillId)
    },
    async loadAiModelConfigs () {
      this.aiModelsLoading = true
      try {
        this.aiModelConfigs = await DatabaseClient.aiModels.getAll()
      } finally {
        this.aiModelsLoading = false
      }
    },
    async loadAiSkillConfigs () {
      this.aiSkillsLoading = true
      try {
        this.aiSkillConfigs = await DatabaseClient.aiSkills.getAll()
      } finally {
        this.aiSkillsLoading = false
      }
    },

    // ==================== Server 面板事件 ====================
    updateCloudSyncProvider (value) {
      this.updateStateAndStore({ cloudSyncProvider: value })
    },
    updateImageUploadService (service) {
      this.updateStateAndStore({ imageUploadService: service })
    },
    openLoginDialog () {
      this.$refs.dialog.hide()
      this.$nextTick(() => {
        bus.$emit('showLoginDialog')
      })
    },
    confirmLogout () {
      this.$q.dialog({
        title: this.$t('cloudSyncLogout'),
        message: this.$t('cloudSyncLogoutConfirm'),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('cloudSyncLogout'), color: 'negative' }
      }).onOk(async () => {
        await this.$store.dispatch('server/logout')
        this.refreshCloudSyncLoginStatus()
        this.$q.notify({ message: this.$t('cloudSyncOfflineMode'), type: 'info', icon: 'cloud_off' })
      })
    },
    async doPushOnly () {
      Loading.show({ message: this.$t('cloudBackupLoading') })
      try {
        const result = await CloudSyncService.pushOnly()
        if (result.success) {
          this.$q.notify({ message: `${this.$t('cloudBackupComplete')} ↑${result.count || 0}`, type: 'positive', icon: 'cloud_upload' })
        } else {
          this.$q.notify({ message: this.$t('cloudSyncFailed'), type: 'negative', position: 'top' })
        }
      } finally {
        Loading.hide()
        this.refreshCloudSyncLoginStatus()
      }
    },
    async doPullOnly () {
      Loading.show({ message: this.$t('cloudRestoreLoading') })
      try {
        const result = await CloudSyncService.pullOnly()
        if (result.success) {
          this.$q.notify({ message: `${this.$t('cloudRestoreComplete')} ↓${result.pulled || 0}`, type: 'positive', icon: 'cloud_download' })
        } else {
          this.$q.notify({ message: this.$t('cloudSyncFailed'), type: 'negative', position: 'top' })
        }
      } finally {
        Loading.hide()
        this.refreshCloudSyncLoginStatus()
      }
    },
    refreshCloudSyncLoginState () {
      this.refreshCloudSyncLoginStatus()
    },
    refreshCloudSyncLoginStatus () {
      CloudSyncService.init()
    },

    // ==================== Echo 面板事件 ====================
    updateEchoCards (cards) {
      this.updateStateAndStore({ echoCards: cards })
      this.saveEchoes(cards).then(result => {
        if (result && result.success === false) {
          this.$q.notify({ message: this.$t('echoSaveFailed'), type: 'warning', position: 'top' })
          this.loadEchoes()
        }
      })
      this.$nextTick(() => {
        bus.$emit(events.RENDER_EVENTS.codeStyleUpdate)
      })
    },
    openAddEcho () {
      this.editingEcho = null
      this.openEchoFormDialog()
    },
    openEditEcho (echo) {
      this.editingEcho = { ...echo }
      this.openEchoFormDialog()
    },
    openEchoFormDialog () {
      this.echoFormKey += 1
      this.echoFormVisible = true
    },
    onEchoFormVisibleChange (visible) {
      this.echoFormVisible = visible
      if (!visible) {
        this.$nextTick(() => {
          this.editingEcho = null
        })
      }
    },
    confirmDeleteEcho (echo) {
      if (echo && echo.isBuiltin) {
        this.$q.notify({ message: this.$t('echoBuiltinCannotDelete') || '内置回响无法删除', type: 'warning', position: 'top' })
        return
      }
      this.$q.dialog({
        title: this.$t('echoCardDelete'),
        message: this.$t('echoCardDeleteConfirm'),
        cancel: { label: this.$t('cancel') },
        persistent: true
      }).onOk(async () => {
        await this.deleteEcho(echo.id)
        const filtered = this.localEchoCards.filter(item => item.id !== echo.id)
        this.updateStateAndStore({ echoCards: filtered })
        this.$nextTick(() => {
          bus.$emit(events.RENDER_EVENTS.codeStyleUpdate)
        })
      })
    },
    confirmBatchDeleteEcho (selectedIds) {
      if (selectedIds.length === 0) return
      const builtinIds = (this.localEchoCards || []).filter(e => e.isBuiltin).map(e => e.id)
      const deletableIds = selectedIds.filter(id => !builtinIds.includes(id))
      const builtinCount = selectedIds.length - deletableIds.length
      if (deletableIds.length === 0) {
        this.$q.notify({ message: this.$t('echoBuiltinCannotDelete') || '内置回响无法删除', type: 'warning', position: 'top' })
        return
      }
      this.$q.dialog({
        title: this.$t('echoBatchDelete'),
        message: builtinCount > 0
          ? this.$t('echoBatchDeleteConfirmWithBuiltin', { count: deletableIds.length, builtin: builtinCount })
          : this.$t('echoBatchDeleteConfirm', { count: deletableIds.length }),
        cancel: { label: this.$t('cancel') },
        persistent: true
      }).onOk(async () => {
        for (const id of deletableIds) {
          await this.deleteEcho(id)
        }
        const filtered = this.localEchoCards.filter(e => !deletableIds.includes(e.id))
        this.updateStateAndStore({ echoCards: filtered })
        if (this.$refs.echoPanel && typeof this.$refs.echoPanel.exitSelectionMode === 'function') {
          this.$refs.echoPanel.exitSelectionMode()
        }
        this.$nextTick(() => {
          bus.$emit(events.RENDER_EVENTS.codeStyleUpdate)
        })
      })
    },
    async onEchoSubmit (data) {
      const builtinMatch = this.localEchoCards.find(echo => echo.isBuiltin && echo.id === data.id)
      const isBuiltin = Boolean(builtinMatch || data.isBuiltin)
      const payload = {
        ...data,
        anno_source: data.anno_source || data.template || '',
        render_type: data.render_type || 'anno',
        isBuiltin
      }
      const cards = [...this.localEchoCards]
      const idx = cards.findIndex(item => item.id === data.id)
      let saved = null
      if (isBuiltin) {
        // === 内置回响保存策略（v2026-07 调整后） ===
        // - 本地 dev 模式 (!isProd)：调用 saveEcho 持久化到 SQLite，覆盖代码版默认模板
        // - 生产模式 (isProd)：只在内存里改，不入库；保证云端 / 内置回响默认模板不被污染
        // 注：Quasar DefinePlugin 把 process.env.PROD 注入为 dev='true'(字符串) / prod=false，
        // 所以用 Boolean(process.env.PROD) 而非 === true，与项目其它 isProd 风格一致。
        const devMode = !Boolean(process.env.PROD)
        const savedEcho = builtinMatch ? { ...builtinMatch, ...payload } : { ...payload }
        savedEcho.category = builtinMatch ? builtinMatch.category : (payload.category || 'builtin')
        if (devMode) {
          const result = await this.saveEcho(savedEcho)
          if (result && result.success && result.data) {
            Object.assign(savedEcho, result.data)
          } else {
            const code = result && result.code
            let message = this.$t('echoSaveFailed')
            if (code === 'ECHO_DUPLICATE_NAME') message = this.$t('echoNameExists')
            else if (code === 'ECHO_NAME_REQUIRED') message = this.$t('echoNameRequired')
            else if (result && result.message) message = `${message}: ${result.message}`
            this.$q.notify({ message, type: 'warning', position: 'top' })
            return
          }
        }
        saved = savedEcho
      } else {
        const dupNameKey = String(payload.name || '').trim().toLowerCase()
        if (dupNameKey) {
          const storeConflict = (this.localEchoCards || []).find(item => {
            if (!item || item.id === payload.id) return false
            return String(item.name || '').trim().toLowerCase() === dupNameKey
          })
          if (storeConflict) {
            this.$q.notify({ message: this.$t('echoNameExists'), type: 'warning', position: 'top' })
            return
          }
        }
        const result = await this.saveEcho(payload)
        if (result && result.success && result.data) {
          saved = result.data
        } else {
          const code = result && result.code
          let message = this.$t('echoSaveFailed')
          if (code === 'ECHO_DUPLICATE_NAME') message = this.$t('echoNameExists')
          else if (code === 'ECHO_NAME_REQUIRED') message = this.$t('echoNameRequired')
          else if (result && result.message) message = `${message}: ${result.message}`
          this.$q.notify({ message, type: 'warning', position: 'top' })
          return
        }
      }
      if (saved) {
        if (idx >= 0) cards.splice(idx, 1, saved)
        else cards.push(saved)
        this.updateStateAndStore({ echoCards: cards })
        this.$nextTick(() => {
          bus.$emit(events.RENDER_EVENTS.codeStyleUpdate)
        })
      }
      this.destroyEchoFormDialog()
    },
    destroyEchoFormDialog () {
      this.echoFormVisible = false
      this.$nextTick(() => {
        this.editingEcho = null
      })
    },

    // ==================== CloudFn 面板事件 ====================
    openNavigationDialog () {
      this.navigationDialogVisible = true
    },
    onNavigationGoConfig () {
      this.navigationDialogVisible = false
      this.tab = 'cloudFn'
    },

    // ==================== Rune 面板事件 ====================
    updateRuneCards (cards) {
      this.updateStateAndStore({ runeCards: cards })
      this.saveRunes(cards).then(result => {
        if (result && result.success === false) {
          this.$q.notify({ message: this.$t('runeSaveFailed'), type: 'warning', position: 'top' })
          this.loadRunes()
        }
      })
      this.$nextTick(() => {
        bus.$emit(events.RENDER_EVENTS.codeStyleUpdate)
      })
    },
    openAddRune () {
      this.editingRune = null
      console.log('[RUNE-TPL] openAddRune -> openRuneFormDialog')
      this.openRuneFormDialog()
    },
    openEditRune (rune) {
      this.editingRune = { ...rune }
      console.log(`[RUNE-TPL] openEditRune id=${rune && rune.id} -> openRuneFormDialog`)
      this.openRuneFormDialog()
    },
    openRuneFormDialog () {
      this.runeFormKey += 1
      this.runeFormVisible = true
      console.log(`[RUNE-TPL] RuneFormDialog opened key=${this.runeFormKey} editingRune=${this.editingRune ? this.editingRune.id : 'null'}`)
    },
    onRuneFormVisibleChange (visible) {
      this.runeFormVisible = visible
      if (!visible) {
        this.$nextTick(() => {
          this.editingRune = null
        })
      }
    },
    confirmDeleteRune (rune) {
      this.$q.dialog({
        title: this.$t('runeCardDelete'),
        message: this.$t('runeCardDeleteConfirm'),
        cancel: { label: this.$t('cancel') },
        persistent: true
      }).onOk(async () => {
        await this.deleteRune(rune.id)
        const filtered = this.localRuneCards.filter(r => r.id !== rune.id)
        this.updateStateAndStore({ runeCards: filtered })
      })
    },
    confirmBatchDeleteRune (selectedIds) {
      if (selectedIds.length === 0) return
      this.$q.dialog({
        title: this.$t('runeBatchDelete'),
        message: this.$t('runeBatchDeleteConfirm', { count: selectedIds.length }),
        cancel: { label: this.$t('cancel') },
        persistent: true
      }).onOk(async () => {
        const idsToDelete = [...selectedIds]
        for (const id of idsToDelete) {
          await this.deleteRune(id)
        }
        const filtered = this.localRuneCards.filter(r => !idsToDelete.includes(r.id))
        this.updateStateAndStore({ runeCards: filtered })
        if (this.$refs.runePanel && typeof this.$refs.runePanel.exitSelectionMode === 'function') {
          this.$refs.runePanel.exitSelectionMode()
        }
      })
    },
    async onRuneSubmit (data) {
      const name = String(data && data.name || '').trim()
      const dupNameKey = name.toLowerCase()
      const storeConflict = (this.localRuneCards || []).find(item => {
        if (!item || !item.name || item.id === data.id) return false
        return String(item.name).trim().toLowerCase() === dupNameKey
      })
      if (storeConflict) {
        this.$q.notify({ message: this.$t('runeNameExists'), type: 'warning', position: 'top' })
        return
      }
      const result = await this.saveRune(data)
      if (result && result.success && result.data) {
        const cards = [...this.localRuneCards]
        const idx = cards.findIndex(r => r.id === data.id)
        if (idx >= 0) cards.splice(idx, 1, result.data)
        else cards.push(result.data)
        this.updateStateAndStore({ runeCards: cards })
        this.$nextTick(() => {
          bus.$emit(events.RENDER_EVENTS.codeStyleUpdate)
        })
        this.destroyRuneFormDialog()
        return
      }
      const code = result && result.code
      let message = this.$t('runeSaveFailed')
      if (code === 'RUNE_DUPLICATE_NAME') message = this.$t('runeNameExists')
      else if (code === 'RUNE_NAME_REQUIRED') message = this.$t('runeNameRequired')
      else if (result && result.message) message = `${message}: ${result.message}`
      this.$q.notify({ message, type: 'warning', position: 'top' })
    },
    destroyRuneFormDialog () {
      this.runeFormVisible = false
      this.$nextTick(() => {
        this.editingRune = null
      })
    },

    // ==================== Rune 导出/批量导入 ====================
    openExportCurrentCategory (runesInCategory) {
      this.runeExportSelectedRunes = runesInCategory || []
      this.runeExportDialogVisible = true
    },
    openBatchImport (category) {
      this.runeImportCategory = category || DEFAULT_RUNE_CATEGORY
      this.runeBatchImportDialogVisible = true
    },
    async onRuneBatchImport ({ items, category, conflictMode }) {
      try {
        const result = await runeTemplateService.batchImport(items, category, {
          conflictMode,
          existingRunes: this.localRuneCards
        })
        console.log('[Settings] onRuneBatchImport result:', result)
        console.log('[Settings] localRuneCards count before refresh:', this.localRuneCards.length)
        if (result && result.success) {
          // 从 rune_templates 表重新加载并刷新 store
          const freshRunes = await runeTemplateService.listFlat(true)
          console.log('[Settings] freshRunes from DB count:', freshRunes.length)
          console.log('[Settings] freshRunes sample (first 3):', freshRunes.slice(0, 3).map(r => ({ id: r.id, name: r.name, category: r.category_key })))
          this.updateStateAndStore({ runeCards: freshRunes })
          console.log('[Settings] localRuneCards count after refresh:', this.localRuneCards.length)
          this.$q.notify({
            message: this.$t('runeBatchImportSuccess', { count: result.count || items.length }),
            type: 'positive',
            position: 'top'
          })
          this.$emit('imported', result.count || items.length)
        } else {
          this.$emit('import-failed', (result && result.message) || '')
        }
      } catch (err) {
        console.error('[Settings] onRuneBatchImport error:', err)
        this.$emit('import-failed', (err && err.message) || '')
      }
    },
    onRuneBatchImported (count) {
      const ref = this.$refs.runeBatchImportDialog
      if (ref && typeof ref.onImportSuccess === 'function') {
        ref.onImportSuccess(count)
      } else {
        this.runeBatchImportDialogVisible = false
      }
    },
    onRuneBatchImportFailed (message) {
      const ref = this.$refs.runeBatchImportDialog
      if (ref && typeof ref.onImportError === 'function') {
        ref.onImportError(message)
      }
    },

    // ==================== Note Template 面板事件 ====================
    openAddTemplate () {
      this.editingTemplate = null
      this.noteTemplateReadOnly = false
      this.openNoteTemplateFormDialog()
    },
    openEditTemplate (tpl) {
      this.editingTemplate = tpl ? { ...tpl } : null
      // 内置模板在打包环境下仅可查看
      this.noteTemplateReadOnly = Boolean(tpl && tpl.is_builtin && process.env.PROD === true)
      this.openNoteTemplateFormDialog()
    },
    openNoteTemplateFormDialog () {
      this.noteTemplateFormKey += 1
      this.noteTemplateFormVisible = true
    },
    onNoteTemplateFormVisibleChange (visible) {
      this.noteTemplateFormVisible = visible
      if (!visible) {
        this.$nextTick(() => {
          this.editingTemplate = null
          this.noteTemplateReadOnly = false
        })
      }
    },
    isTemplateReadOnly (tpl) {
      return Boolean(tpl && tpl.is_builtin && process.env.PROD === true)
    },
    async onNoteTemplateSubmit (data) {
      // 防御：内置模板在打包环境下禁止保存
      if (data && data.id && this.isTemplateReadOnly(this.localNoteTemplates.find(t => t && t.id === data.id))) {
        this.$q.notify({ message: this.$t('noteTemplateReadOnly'), type: 'warning', position: 'top' })
        return
      }
      const name = String(data && data.name || '').trim()
      if (!name) {
        this.$q.notify({ message: this.$t('noteTemplateNameRequired'), type: 'warning', position: 'top' })
        return
      }
      // 同名检查
      const dupNameKey = name.toLowerCase()
      const storeConflict = (this.localNoteTemplates || []).find(item => {
        if (!item || !item.name || item.id === data.id) return false
        return String(item.name).trim().toLowerCase() === dupNameKey
      })
      if (storeConflict) {
        this.$q.notify({ message: this.$t('noteTemplateNameExists'), type: 'warning', position: 'top' })
        return
      }
      const result = await this.saveNoteTemplate({
        id: data.id,
        name,
        desc: String(data.desc || ''),
        content: String(data.content || ''),
        sort_order: Number(data.sort_order) || 0,
        // created_at / updated_at 由主进程 saveOne 用 now 生成；前端不要再传 null
        created_at: data.created_at || null,
        updated_at: data.updated_at || null,
        // 显式标记「非内置」，主进程会有自己默认值
        is_builtin: data.is_builtin ? 1 : 0
      })
      if (result && result.success && result.data) {
        const list = [...this.localNoteTemplates]
        const idx = list.findIndex(t => t.id === result.data.id)
        if (idx >= 0) list.splice(idx, 1, result.data)
        else list.push(result.data)
        this.updateStateAndStore({ noteTemplates: list })
      } else {
        const code = result && result.code
        let message = this.$t('noteTemplateSaveFailed')
        if (code === 'NAME_REQUIRED') message = this.$t('noteTemplateNameRequired')
        else if (result && result.message) message = `${message}: ${result.message}`
        this.$q.notify({ message, type: 'warning', position: 'top' })
      }
    },
    confirmDeleteTemplate (tpl) {
      if (!tpl) return
      if (this.isTemplateReadOnly(tpl)) {
        this.$q.notify({ message: this.$t('noteTemplateReadOnly'), type: 'warning', position: 'top' })
        return
      }
      this.$q.dialog({
        title: this.$t('noteTemplateDelete'),
        message: this.$t('noteTemplateDeleteConfirm', { name: tpl.name }),
        cancel: { label: this.$t('cancel') },
        persistent: true
      }).onOk(async () => {
        await this.deleteNoteTemplate(tpl.id)
        const list = (this.localNoteTemplates || []).filter(t => t.id !== tpl.id)
        this.updateStateAndStore({ noteTemplates: list })
      })
    },
    confirmBatchDeleteTemplates (selectedIds) {
      if (!Array.isArray(selectedIds) || selectedIds.length === 0) return
      // 防御：打包环境下过滤掉内置模板
      const deletableIds = selectedIds.filter(id => {
        const item = (this.localNoteTemplates || []).find(t => t && t.id === id)
        return item && !this.isTemplateReadOnly(item)
      })
      if (deletableIds.length === 0) {
        this.$q.notify({ message: this.$t('noteTemplateReadOnly'), type: 'warning', position: 'top' })
        return
      }
      this.$q.dialog({
        title: this.$t('noteTemplateBatchDelete'),
        message: this.$t('noteTemplateBatchDeleteConfirm', { count: deletableIds.length }),
        cancel: { label: this.$t('cancel') },
        persistent: true
      }).onOk(async () => {
        for (const id of deletableIds) {
          await this.deleteNoteTemplate(id)
        }
        const list = (this.localNoteTemplates || []).filter(t => !deletableIds.includes(t.id))
        this.updateStateAndStore({ noteTemplates: list })
      })
    },

    // ==================== 更新相关 ====================
    updateAvailableHandler (info) {
      if (this.checkingNotify && this.checkingNotify instanceof Function) {
        this.checkingNotify()
        this.checkingNotify = null
      }
      this.$q.notify({
        caption: this.$t('getNewerVersion', { version: info.version }),
        message: info.releaseNotes,
        html: true,
        color: 'positive',
        icon: 'system_update_alt',
        actions: [{
          label: this.$t('update'),
          color: 'white',
          handler: () => {
            if (this.$q.platform.is.mac) {
              window.open('https://github.com/TankNee/Memocast')
            } else {
              needUpdate(true)
              if (this.$refs.updateDialog) {
                this.$refs.updateDialog.toggle()
              }
            }
          }
        }]
      })
    },
    updateUnavailableHandler () {
      if (this.checkingNotify && this.checkingNotify instanceof Function) {
        this.checkingNotify()
        this.checkingNotify = null
      }
    },
    updateErrorHandler (err) {
      if (this.checkingNotify && this.checkingNotify instanceof Function) {
        this.checkingNotify()
        this.checkingNotify = null
      }
      if (err && !this.isNullOrEmpty(err)) {
        this.$q.notify({
          caption: this.$t('updateError'),
          color: 'red-10',
          icon: 'error',
          message: err
        })
      }
    },
    isNullOrEmpty (val) {
      return val === null || val === undefined || val === ''
    },
    ...mapClientActions([
      'toggleChanged',
      'updateStateAndStore',
      'loadRunes',
      'loadEchoes',
      'loadNoteTemplates',
      'saveRune',
      'saveEcho',
      'saveNoteTemplate',
      'deleteRune',
      'deleteEcho',
      'deleteNoteTemplate',
      'saveRunes',
      'saveEchoes',
      'saveNoteTemplates',
      // v2026-07-31：让「语法解析」开关仅更新 vuex cache（不写 electron-store），
      // 真源永远是 SQLite app_state('setting/parsing/*')。
      'loadParsingSettings',
      'updateParsingStates'
    ]),
    ...mapClientMutations({ UPDATE_SYNC_STATUS: 'update_sync_status' }),
    async initCdnDeps () {
      const savedDeps = await DatabaseClient.cdnDeps.getAll()
      const newId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
      const builtInDeps = [
        { id: newId(), name: 'jQuery', url: 'https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.min.js', enabled: true, applyToBlog: false, isBuiltIn: true },
        { id: newId(), name: 'jQuery Migrate', url: 'https://cdn.jsdelivr.net/npm/jquery-migrate@3/dist/jquery-migrate.min.js', enabled: true, applyToBlog: false, isBuiltIn: true },
        { id: newId(), name: 'layui CSS', url: '//unpkg.com/layui@2.13.8/dist/css/layui.css', enabled: true, applyToBlog: false, isBuiltIn: true },
        { id: newId(), name: 'layui JS', url: '//unpkg.com/layui@2.13.8/dist/layui.js', enabled: true, applyToBlog: false, isBuiltIn: true },
        // v2026-08-01：city-picker 默认域名统一从 tshi0912.github.io 改为 luo0412.github.io/cdn
        { id: newId(), name: 'city-picker data', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.data.js', enabled: true, applyToBlog: false, isBuiltIn: true },
        { id: newId(), name: 'city-picker JS', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.js', enabled: true, applyToBlog: false, isBuiltIn: true },
        { id: newId(), name: 'city-picker CSS', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.css', enabled: true, applyToBlog: false, isBuiltIn: true }
      ]
      if (Array.isArray(savedDeps) && savedDeps.length > 0) {
        const existingBuiltInNames = ['jQuery', 'jQuery Migrate', 'layui CSS', 'layui JS', 'city-picker data', 'city-picker JS', 'city-picker CSS']
        const customDeps = savedDeps.filter(d => !existingBuiltInNames.includes(d.name))
        const mergedBuiltIn = builtInDeps.map(bi => {
          const existing = savedDeps.find(d => d.name === bi.name)
          if (existing) return { ...existing, isBuiltIn: true }
          return bi
        })
        this.cdnDeps = [...mergedBuiltIn, ...customDeps]
      } else {
        this.cdnDeps = builtInDeps
      }
    }
  },
  async mounted () {
    bus.$on(events.UPDATE_EVENTS.updateAvailable, this.updateAvailableHandler)
    bus.$on(events.UPDATE_EVENTS.updateNotAvailable, this.updateUnavailableHandler)
    bus.$on(events.UPDATE_EVENTS.updateError, this.updateErrorHandler)
  },
  beforeDestroy () {
    bus.$off(events.UPDATE_EVENTS.updateAvailable)
    bus.$off(events.UPDATE_EVENTS.updateNotAvailable)
    bus.$off(events.UPDATE_EVENTS.updateError)
  }
}
</script>

<style scoped>
.settings-dialog-card {
  height: 70vh;
  min-width: 70vw;
  user-select: none;
}

.settings-dialog-toolbar {
  min-height: 40px;
  padding: 4px 8px;
}

.settings-dialog-body {
  padding-top: 4px;
  padding-bottom: 8px;
}

.settings-dialog-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-dialog-sep {
  flex-shrink: 0;
}

.settings-dialog-panels {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.45) transparent;
}

.settings-dialog-panels::-webkit-scrollbar,
.settings-dialog-body::-webkit-scrollbar {
  width: 8px;
}

.settings-dialog-panels::-webkit-scrollbar-thumb,
.settings-dialog-body::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.45);
  border-radius: 999px;
}

.settings-dialog-panels::-webkit-scrollbar-track,
.settings-dialog-body::-webkit-scrollbar-track {
  background: transparent;
}
</style>
