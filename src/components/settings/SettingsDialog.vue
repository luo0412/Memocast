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
                  @toggle-change='handleToggleChange'
                  @update-state='handleUpdateState'
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
                  :cdn-deps='cdnDeps'
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
                  :rune-cards='localRuneCards'
                  @update-rune-cards='updateRuneCards'
                  @add-rune='openAddRune'
                  @edit-rune='openEditRune'
                  @delete-rune='confirmDeleteRune'
                  @batch-delete='confirmBatchDeleteRune'
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
    <RuneFormDialog
      v-if='runeFormVisible'
      :key='runeFormKey'
      v-model='runeFormVisible'
      :rune='editingRune'
      :default-category='runeCategory'
      @input='onRuneFormVisibleChange'
      @submit='onRuneSubmit'
    />
    <EchoFormDialog
      v-if='echoFormVisible'
      :key='echoFormKey'
      v-model='echoFormVisible'
      :echo='editingEcho'
      :default-category='echoCategory'
      @input='onEchoFormVisibleChange'
      @submit='onEchoSubmit'
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
import RuneCard from 'components/rune/RuneCard'
import RuneFormDialog from 'components/rune/RuneFormDialog'
import EchoFormDialog from 'components/echo/EchoFormDialog'
import NavigationDialog from 'components/navigation/NavigationDialog'

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
    RuneCard,
    RuneFormDialog,
    EchoFormDialog,
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
      echoFormVisible: false,
      echoFormKey: 0,
      editingEcho: null,
      echoCategory: DEFAULT_ECHO_CATEGORY,
      navigationDialogVisible: false,
      checkingNotify: null,
      // AI 配置
      aiModelsLoading: false,
      aiModelConfigs: [],
      aiSkillsLoading: false,
      aiSkillConfigs: [],
      // CDN 依赖
      cdnDeps: [],
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
    localEchoCards: {
      get () {
        return this.echoCards
      },
      set (val) {
        this.updateStateAndStore({ echoCards: val })
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
      this.loadAiModelConfigs()
      this.loadAiSkillConfigs()
      await this.initCdnDeps()
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
          const result = await DatabaseClient.runeTemplates.clearAll()
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
          // 把 store 里当前内置回响（含最新 anno_source，可能是用户编辑过的）推给 main，
          // 让 DB 用这一份最新数据覆写，规避 main / renderer 双源漂移。
          const builtins = (this.localEchoCards || []).filter(echo => echo && echo.isBuiltin)
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
        const savedEcho = builtinMatch ? { ...builtinMatch, ...payload } : { ...payload }
        savedEcho.category = builtinMatch ? builtinMatch.category : (payload.category || 'builtin')
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
      'saveRune',
      'saveEcho',
      'deleteRune',
      'deleteEcho',
      'saveRunes',
      'saveEchoes'
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
        { id: newId(), name: 'city-picker data', url: 'https://tshi0912.github.io/city-picker/js/city-picker.data.js', enabled: true, applyToBlog: false, isBuiltIn: true },
        { id: newId(), name: 'city-picker JS', url: 'https://tshi0912.github.io/city-picker/js/city-picker.js', enabled: true, applyToBlog: false, isBuiltIn: true },
        { id: newId(), name: 'city-picker CSS', url: 'https://tshi0912.github.io/city-picker/css/city-picker.css', enabled: true, applyToBlog: false, isBuiltIn: true }
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
