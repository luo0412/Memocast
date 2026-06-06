<template>
  <q-dialog transition-show='fade' transition-hide='fade' ref='dialog'>
    <q-card class='settings-dialog-card'>
      <q-toolbar class='settings-dialog-toolbar'>
        <q-toolbar-title class='text-body1 text-weight-medium'>
          {{ $t('settings') }}
        </q-toolbar-title>
        <q-btn flat round dense icon='close' size='sm' v-close-popup />
      </q-toolbar>

      <q-card-section class='scroll hide-scrollbar settings-dialog-body'>
        <div class='settings-dialog-layout'>
          <div class='settings-dialog-nav'>
            <q-tabs v-model='tab' vertical dense class='text-teal no-border settings-dialog-tabs'>
              <q-tab
                name='general'
                icon='tune'
                :label="$t('general')"
                class='text-primary'
              />
              <q-tab
                name='editor'
                icon='edit_attributes'
                :label="$t('editor')"
                class='text-amber-10'
              />
              <q-tab
                name='server'
                icon='storage'
                :label="$t('server')"
                class='text-red-7'
              />
              <q-tab
                name='rune'
                icon='star'
                :label="$t('rune')"
                class='text-purple-5'
              />
            </q-tabs>
          </div>
          <q-separator vertical class='settings-dialog-sep' />
          <div class='settings-dialog-panels hide-scrollbar'>
            <q-tab-panels
              v-model='tab'
              animated
              swipeable
              vertical
              transition-prev='jump-up'
              transition-next='jump-up'
            >
              <q-tab-panel name='general' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-primary' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('general') }}</span>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    {{ $t('language') }}
                  </div>
                  <q-select
                    dense
                    options-dense
                    :value='$t(language)'
                    :options='languageOptions'
                    @input='languageChangeHandler'
                  />
                </div>
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    {{ $t('theme') }}
                  </div>
                  <q-select
                    dense
                    options-dense
                    :value='$t(theme)'
                    :options='themeOptions'
                    @input='themeChangeHandler'
                  >
                    <template v-slot:after>
                      <q-btn round dense flat size="sm" icon="contact_support" @click="themeHelpHandler" />
                      <q-btn round dense flat size="sm" icon="refresh" @click="refreshThemeFolderHandler" />
                      <q-btn round dense flat size="sm" icon="open_in_new" @click="openThemeFolderHandler" />
                    </template>
                  </q-select>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row fa-align-center'>
                    <span>{{ $t('openLogFiles') }}</span>
                    <q-btn
                      class='fab-btn'
                      flat
                      round
                      dense
                      size='sm'
                      color='primary'
                      icon='open_in_new'
                      @click='openLogFilesHandler'
                    />
                  </div>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row fa-align-center'>
                    <span>{{ $t('currentVersion', { version }) }}</span>
                    <q-btn
                      class='fab-btn'
                      flat
                      round
                      dense
                      size='sm'
                      color='primary'
                      icon='cached'
                      @click='checkUpdateHandler'
                    />
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name='editor' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-primary' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('editor') }}</span>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
                    <span>{{ $t('markdownOnly') }}</span>
                    <q-toggle
                      :value='markdownOnly'
                      color='primary'
                      @input="
                        v => toggleChanged({ key: 'markdownOnly', value: v })
                      "
                    />
                  </div>
                </div>
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
                    <span>{{ $t('noteListDenseMode') }}</span>
                    <q-toggle
                      :value='noteListDenseMode'
                      color='primary'
                      @input="
                        v => toggleChanged({ key: 'noteListDenseMode', value: v })
                      "
                    />
                  </div>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    <span>{{ $t('noteOrder') }}</span>
                    <q-select
                      dense
                      options-dense
                      :value='$t(noteOrderType)'
                      :options='noteOrderOptions'
                      @input='noteOrderChangeHandler'
                    />
                  </div>
                </div>
                <!-- ✅ 已移除自动保存选项！不再需要自动保存配置 -->
              </q-tab-panel>

              <q-tab-panel name='server' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-primary' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('server') }}</span>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    <span>{{ $t('imageUploadService') }}</span>
                    <q-select
                      dense
                      options-dense
                      :value='$t(imageUploadService)'
                      :options='imageUploadServiceOptions'
                      @input='imageUploadServiceChangeHandler'
                    >
                    </q-select>
                  </div>
                </div>
                <q-separator class='q-my-xs' />

                <div class='row items-center no-wrap q-mb-xs panel-title q-mt-md'>
                  <div class='panel-title-bar bg-blue-7' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('cloudSync') }}</span>
                </div>
                <q-separator class='q-my-xs' />

                <!-- 未登录状态 -->
                <div v-if='!isLoggedIn' class='text-center q-pa-lg'>
                  <q-icon name='cloud_off' size='3rem' color='grey-5' />
                  <div class='text-h6 q-mt-sm text-grey-7'>{{ $t('cloudSyncNotLoggedIn') }}</div>
                  <div class='text-caption text-grey-5 q-mt-xs'>{{ $t('cloudSyncNotLoggedInHint') }}</div>
                  <q-btn
                    class='q-mt-md'
                    color='primary'
                    :label="$t('cloudSyncLogin')"
                    icon='login'
                    unelevated
                    @click='openLoginDialog'
                  />
                </div>

                <!-- 已登录状态 -->
                <div v-else>
                  <!-- 账号信息卡片 -->
                  <q-card flat bordered class='q-mb-sm'>
                    <q-card-section class='q-pa-sm'>
                      <div class='row items-center no-wrap'>
                        <q-icon name='account_circle' size='1.5rem' color='blue-7' class='q-mr-sm' />
                        <div>
                          <div class='text-body2 text-weight-medium'>{{ accountInfo.displayName || accountInfo.email || '-' }}</div>
                          <div class='text-caption text-grey-6'>
                            <span class='text-grey-5'>{{ $t('cloudSyncKbGuid') }}:</span>
                            {{ accountInfo.kbGuid ? accountInfo.kbGuid.substring(0, 8) + '...' : '-' }}
                          </div>
                        </div>
                        <q-space />
                        <q-btn
                          flat dense round
                          color='negative'
                          icon='logout'
                          size='sm'
                          :label="$t('cloudSyncLogout')"
                          @click='confirmLogout'
                        />
                      </div>
                    </q-card-section>
                  </q-card>

                  <!-- 同步状态 -->
                  <div class='row q-col-gutter-xs q-mb-sm'>
                    <div class='col-4'>
                      <div class='sync-stat-card'>
                        <div class='text-caption text-grey-6'>{{ $t('cloudSyncTotal') }}</div>
                        <div class='text-h6 text-primary'>{{ syncStats.total }}</div>
                      </div>
                    </div>
                    <div class='col-4'>
                      <div class='sync-stat-card'>
                        <div class='text-caption text-grey-6'>{{ $t('cloudSyncSynced') }}</div>
                        <div class='text-h6 text-positive'>{{ syncStats.synced }}</div>
                      </div>
                    </div>
                    <div class='col-4'>
                      <div class='sync-stat-card'>
                        <div class='text-caption text-grey-6'>{{ $t('cloudSyncPending') }}</div>
                        <div class='text-h6' :class="syncStats.pending > 0 ? 'text-orange' : 'text-grey'">{{ syncStats.pending }}</div>
                      </div>
                    </div>
                  </div>

                  <!-- 上次同步时间 -->
                  <div class='text-caption text-grey-6 q-mb-md'>
                    <q-icon name='schedule' size='xs' class='q-mr-xs' />
                    {{ $t('cloudSyncLastSync') }}:
                    {{ lastSyncTimeDisplay || $t('never') }}
                  </div>

                  <!-- 同步按钮 -->
                  <div class='row q-gutter-sm'>
                    <q-btn
                      class='col'
                      color='primary'
                      :label="$t('cloudSyncSyncPushOnly')"
                      icon='cloud_upload'
                      unelevated
                      :loading='isSyncing'
                      :disable='isSyncing'
                      @click='doPushOnly'
                    />
                    <q-btn
                      flat
                      class='col'
                      color='blue'
                      :label="$t('cloudSyncSyncPullOnly')"
                      icon='cloud_download'
                      :loading='isSyncing'
                      :disable='isSyncing'
                      @click='doPullOnly'
                    />
                  </div>

                  <!-- 错误提示 -->
                  <q-banner
                    v-if='syncError'
                    class='q-mt-sm'
                    rounded
                    type='negative'
                    dense
                    icon='error'
                  >
                    {{ syncError }}
                  </q-banner>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
                    <span>{{ $t('resetSqlite') }}</span>
                    <q-btn
                      class='fab-btn reset-sqlite-btn'
                      flat
                      no-caps
                      color='negative'
                      icon='delete_forever'
                      :label="$t('resetSqlite')"
                      @click='resetSqliteHandler'
                    />
                  </div>
                  <div class='text-caption text-grey-6'>
                    {{ $t('resetSqliteHint') }}
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name='rune' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-purple-5' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('runeManagement') }}</span>
                  <q-space />
                  <q-btn
                    dense flat no-caps
                    :label="$t('runeCardAdd')"
                    color='purple-5'
                    icon='add'
                    size='sm'
                    @click='openAddRune'
                  />
                </div>
                <div class='text-caption text-grey-6 q-mb-sm'>
                  <q-icon name='drag_indicator' size='xs' /> {{ $t('runeDragTip') }}
                </div>
                <q-separator class='q-my-xs' />
                <div class='rune-grid'>
                  <div
                    v-for='(rune, index) in localRuneCards'
                    :key='rune.id'
                    draggable='true'
                    class='rune-card-wrapper'
                    @dragstart='onDragStart($event, index)'
                    @dragover.prevent='onDragOver($event, index)'
                    @drop='onDrop($event, index)'
                    @dragend='onDragEnd'
                  >
                    <RuneCard
                      :rune='rune'
                      @edit='openEditRune'
                      @delete='confirmDeleteRune'
                    />
                  </div>
                </div>
                <div v-if='!localRuneCards || localRuneCards.length === 0' class='text-center text-grey q-pa-xl'>
                  <q-icon name='star' size='3rem' />
                  <div class='q-mt-sm'>{{ $t('runeCardAdd') }}</div>
                </div>
              </q-tab-panel>


            </q-tab-panels>
          </div>
        </div>
      </q-card-section>
    </q-card>
    <ImageUploadServiceDialog ref='imageUploadServiceDialog' />
    <UpdateDialog ref='updateDialog' />
    <RuneFormDialog
      v-model='runeFormVisible'
      :rune='editingRune'
      @submit='onRuneSubmit'
    />
  </q-dialog>
</template>

<script>
import { createNamespacedHelpers } from 'vuex'
import ImageUploadServiceDialog from './ImageUploadServiceDialog'
import UpdateDialog from 'components/ui/dialog/UpdateDialog'
import RuneCard from 'components/ui/dialog/RuneCard'
import RuneFormDialog from 'components/ui/dialog/RuneFormDialog'
import { i18n } from 'boot/i18n'
import bus from 'components/bus'
import events from 'src/constants/events'
import { version } from '../../../../package.json'
import { checkUpdate, needUpdate, openLogFiles, openThemeFolder, refreshThemeFolder } from 'src/ApiInvoker'
import helper from 'src/utils/helper'
import DatabaseClient from 'src/utils/DatabaseClient'
import CloudSyncService from 'src/services/CloudSyncService'
import SessionStorageService from 'src/services/SessionStorageService'
import { Dark, Loading } from 'quasar'

const {
  mapState: mapClientState,
  mapActions: mapActions
} = createNamespacedHelpers('client')

export default {
  name: 'SettingsDialog',
  components: {
    ImageUploadServiceDialog,
    UpdateDialog,
    RuneCard,
    RuneFormDialog
  },
  data () {
    return {
      tab: 'general',
      imageUploadServiceOptionsPlain: [
        'wizOfficialImageUploadService',
        'picgoServer',
        'none'
      ],
      noteOrderOptionsPlain: [
        'orderByNoteTitle',
        'orderByModifiedTime',
        'orderByCreatedTime'
      ],
      version: version,
      checkingNotify: null,
      runeFormVisible: false,
      editingRune: null,
      dragFromIndex: null,
      cloudSyncLoginState: {
        isLoggedIn: SessionStorageService.isLoggedIn(),
        accountInfo: SessionStorageService.getAccountInfo()
      },
      // 云同步状态
      syncStats: { total: 0, synced: 0, pending: 0 },
      lastSyncTimeDisplay: null,
      isSyncing: false,
      syncError: null
    }
  },
  computed: {
    languageOptions: function () {
      return i18n.availableLocales.map(l => i18n.t(l))
    },
    themeOptions: function () {
      return this.themes.map(t => i18n.t(t.name))
    },
    imageUploadServiceOptions: function () {
      return [
        this.$t('wizOfficialImageUploadService'),
        this.$t('picgoServer'),
        this.$t('none')
      ]
    },
    noteOrderOptions: function () {
      return [
        this.$t('orderByNoteTitle'),
        this.$t('orderByModifiedTime'),
        this.$t('orderByCreatedTime')
      ]
    },
    // ✅ 已移除 autoSaveGapLabel！不再需要
    // autoSaveGapLabel: function () { ... },
    
    localRuneCards: {
      get () {
        return this.runeCards
      },
      set (val) {
        this.updateStateAndStore({ runeCards: val })
      }
    },
    lastSyncTimeFormatted () {
      if (!this.syncStatus?.lastSyncTime) return this.$t('never')
      return helper.displayDateElegantly(this.syncStatus.lastSyncTime)
    },
    syncStatusText () {
      const s = this.syncStatus
      if (s?.isSyncing) return this.$t('syncing')
      if (!s) return this.$t('never')
      return `${s.synced || 0}/${s.total || 0}`
    },
    isLoggedIn () {
      return this.cloudSyncLoginState.isLoggedIn
    },
    accountInfo () {
      return this.cloudSyncLoginState.accountInfo || {}
    },
    ...mapClientState([
      'language',
      'darkMode',
      'noteListDenseMode',
      'markdownOnly',
      'imageUploadService',
      'noteOrderType',
      'theme',
      'themes',
      'runeCards',
      'syncStatus'
    ])
  },
  methods: {
    toggle: function () {
      this.refreshCloudSyncLoginState()
      this.refreshCloudSyncStatus()
      return this.$refs.dialog.toggle()
    },
    languageChangeHandler: function (lan) {
      lan = i18n.availableLocales.find(l => {
        return i18n.t(l) === lan
      })
      this.updateStateAndStore({ language: lan })
      i18n.locale = lan
      this.$q.notify({
        message: this.$t('switchLanguageHint'),
        color: 'primary',
        icon: 'info'
      })
    },
    themeChangeHandler: function (theme) {
      theme = this.themes.find(t => {
        return i18n.t(t.name) === theme
      })
      this.updateStateAndStore({ theme: theme.name })
      this.$q.dark.set(theme.dark)
      this.toggleChanged({ key: 'darkMode', value: theme.dark })
    },
    imageUploadServiceChangeHandler: function (service) {
      const servicePlain = this.imageUploadServiceOptionsPlain.find(
        i => this.$t(i) === service
      )
      this.updateStateAndStore({ imageUploadService: servicePlain })
    },
    noteOrderChangeHandler: function (type) {
      const typePlain = this.noteOrderOptionsPlain.find(
        i => this.$t(i) === type
      )
      this.updateStateAndStore({ noteOrderType: typePlain })
    },
    // ✅ 已移除 autoSaveGapChangeHandler！不再需要
    // autoSaveGapChangeHandler: function (value) { ... },
    
    checkUpdateHandler: function () {
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
    openThemeFolderHandler: function () {
      openThemeFolder()
    },
    refreshThemeFolderHandler: async function () {
      const themes = await refreshThemeFolder()
      this.toggleChanged({ key: 'themes', value: themes })
    },
    themeHelpHandler: function () {
      this.$q.electron.shell.openExternal('https://www.tanknee.cn/Memocast/docs/tutorial-development/create-theme')
    },
    updateAvailableHandler: function (info) {
      console.log(info)
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
        actions: [
          {
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
          }
        ]
      })
    },
    updateUnavailableHandler: function (info) {
      if (this.checkingNotify && this.checkingNotify instanceof Function) {
        this.checkingNotify()
        this.checkingNotify = null
      }
      // this.$q.notify({
      //   message: this.$t('noNewerVersion'),
      //   color: 'green',
      //   icon: 'check'
      // })
    },
    updateErrorHandler: function (err) {
      console.log(err)
      if (this.checkingNotify && this.checkingNotify instanceof Function) {
        this.checkingNotify()
        this.checkingNotify = null
      }
      if (err && !helper.isNullOrEmpty(err)) {
        this.$q.notify({
          caption: this.$t('updateError'),
          color: 'red-10',
          icon: 'error',
          message: err
        })
      }
    },
    openLogFilesHandler: function () {
      openLogFiles()
    },
    resetSqliteHandler: async function () {
      this.$q.dialog({
        title: this.$t('resetSqlite'),
        message: this.$t('resetSqliteConfirm'),
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('confirm'), color: 'negative' }
      }).onOk(async () => {
        const success = await DatabaseClient.sync.resetDatabase()
        if (success) {
          // 重置同步状态
          this.$store.commit('client/UPDATE_SYNC_STATUS', {
            isSyncing: false,
            lastSyncTime: null,
            total: 0,
            synced: 0,
            pending: 0
          })
          this.$q.notify({
            message: this.$t('resetSqliteSuccess'),
            type: 'positive',
            position: 'top'
          })
        } else {
          this.$q.notify({
            message: this.$t('resetSqliteFailed'),
            type: 'negative',
            position: 'top'
          })
        }
      })
    },
    onRuneSortEnd: function () {
      this.saveRunes(this.localRuneCards)
    },
    onDragStart: function (e, index) {
      this.dragFromIndex = index
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', index)
      e.target.closest('.rune-card-wrapper').classList.add('rune-dragging')
    },
    onDragOver: function (e, index) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const wrapper = e.target.closest('.rune-card-wrapper')
      if (wrapper && this.dragFromIndex !== index) {
        document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
        wrapper.classList.add('rune-dragover')
      }
    },
    onDrop: function (e, toIndex) {
      e.preventDefault()
      document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
      const fromIndex = this.dragFromIndex
      if (fromIndex === null || fromIndex === toIndex) return
      const cards = [...this.localRuneCards]
      const [moved] = cards.splice(fromIndex, 1)
      cards.splice(toIndex, 0, moved)
      this.updateStateAndStore({ runeCards: cards })
      this.saveRunes(cards)
    },
    onDragEnd: function (e) {
      const wrapper = e.target.closest('.rune-card-wrapper')
      if (wrapper) {
        wrapper.classList.remove('rune-dragging')
      }
      document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
      this.dragFromIndex = null
    },
    openEditRune: function (rune) {
      this.editingRune = { ...rune }
      this.runeFormVisible = true
    },
    openAddRune: function () {
      this.editingRune = null
      this.runeFormVisible = true
    },
    confirmDeleteRune: async function (rune) {
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
    onRuneSubmit: async function (data) {
      const saved = await this.saveRune(data)
      if (saved) {
        const cards = [...this.localRuneCards]
        const idx = cards.findIndex(r => r.id === data.id)
        if (idx >= 0) {
          cards.splice(idx, 1, saved)
        } else {
          cards.push(saved)
        }
        this.updateStateAndStore({ runeCards: cards })
      }
      this.editingRune = null
    },

    // ==================== 云同步 ====================
    refreshCloudSyncLoginState () {
      this.cloudSyncLoginState = {
        isLoggedIn: SessionStorageService.isLoggedIn(),
        accountInfo: SessionStorageService.getAccountInfo()
      }
    },

    async refreshCloudSyncStatus () {
      this.refreshCloudSyncLoginState()
      const stats = await DatabaseClient.sync.getStats()
      this.syncStats = {
        total: stats.total || 0,
        synced: stats.synced || 0,
        pending: stats.pending || 0
      }
      const lastTime = CloudSyncService.formatLastSyncTime()
      this.lastSyncTimeDisplay = lastTime
    },

    async doSync () {
      this.syncError = null
      this.isSyncing = true
      const result = await CloudSyncService.sync()
      this.isSyncing = false
      await this.refreshCloudSyncStatus()
      if (result.success) {
        this.$q.notify({ message: this.$t('cloudBackupComplete'), type: 'positive', icon: 'cloud_upload' })
      } else {
        this.syncError = result.error || this.$t('cloudSyncFailed')
      }
    },

    async doPullOnly () {
      this.syncError = null
      Loading.show({
        message: this.$t('cloudRestorePreviewLoading')
      })

      let preview = { success: false, stats: { total: 0, pulled: 0, skipped: 0, backfilled: 0 } }
      try {
        preview = await CloudSyncService.getRestorePreview()
      } finally {
        Loading.hide()
      }

      const stats = preview.stats || { total: 0, pulled: 0, skipped: 0, backfilled: 0 }
      const message = `${this.$t('cloudRestoreConfirmMessage')}<br><br><strong>${this.$t('cloudRestorePreviewTitle')}</strong><br>${this.$t('cloudRestorePreviewTotal')}: ${stats.total || 0}<br>${this.$t('cloudRestorePreviewNew')}: ${stats.pulled || 0}<br>${this.$t('cloudRestorePreviewSkipped')}: ${stats.skipped || 0}<br>${this.$t('cloudRestorePreviewBackfilled')}: ${stats.backfilled || 0}`

      this.$q.dialog({
        title: this.$t('cloudRestoreConfirmTitle'),
        message,
        html: true,
        cancel: { label: this.$t('cancel') },
        ok: { label: this.$t('cloudSyncSyncPullOnly'), color: 'primary' }
      }).onOk(async () => {
        this.syncError = null
        this.isSyncing = true
        const result = await CloudSyncService.pullOnly()
        this.isSyncing = false
        await this.refreshCloudSyncStatus()
        if (result.success) {
          this.$q.notify({ message: `${this.$t('cloudRestoreComplete')} ↓${result.pulled || 0}`, type: 'positive', icon: 'cloud_download' })
        } else {
          this.syncError = result.error || this.$t('cloudSyncFailed')
        }
      })
    },

    async doPushOnly () {
      this.syncError = null
      this.isSyncing = true
      const result = await CloudSyncService.pushOnly()
      this.isSyncing = false
      await this.refreshCloudSyncStatus()
      if (result.success) {
        this.$q.notify({ message: `${this.$t('cloudBackupComplete')} ↑${result.count || 0}`, type: 'positive', icon: 'cloud_upload' })
      } else {
        this.syncError = result.error || this.$t('cloudSyncFailed')
      }
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
        await this.refreshCloudSyncStatus()
        this.$q.notify({ message: this.$t('cloudSyncOfflineMode'), type: 'info', icon: 'cloud_off' })
      })
    },

    onCloudSyncStatusChange (event) {
      if (event.type === 'sync_start') {
        this.isSyncing = true
      } else if (event.type === 'sync_complete') {
        this.isSyncing = false
        this.refreshCloudSyncStatus()
      } else if (event.type === 'sync_error') {
        this.isSyncing = false
        this.syncError = event.error
      }
    },
    ...mapActions([
      'toggleChanged',
      'updateStateAndStore',
      'loadRunes',
      'saveRune',
      'deleteRune',
      'saveRunes',
      'sync',
      'refreshSyncStatus'
    ])
  },
  mounted () {
    bus.$on(events.UPDATE_EVENTS.updateAvailable, this.updateAvailableHandler)
    bus.$on(events.UPDATE_EVENTS.updateNotAvailable, this.updateUnavailableHandler)
    bus.$on(events.UPDATE_EVENTS.updateError, this.updateErrorHandler)
    this.loadRunes()
    // 初始化云同步状态
    CloudSyncService.addListener(this.onCloudSyncStatusChange)
    this.refreshCloudSyncStatus()
  },
  beforeDestroy () {
    bus.$off(events.UPDATE_EVENTS.updateAvailable)
    bus.$off(events.UPDATE_EVENTS.updateNotAvailable)
    bus.$off(events.UPDATE_EVENTS.updateError)
    CloudSyncService.removeListener(this.onCloudSyncStatusChange)
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

.settings-dialog-nav {
  flex: 0 0 auto;
  width: 4.75rem;
  min-width: 4.75rem;
  max-width: 4.75rem;
  padding: 2px 0 4px;
}

.settings-dialog-sep {
  flex-shrink: 0;
}

.settings-dialog-panels {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
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
}

.settings-dialog-tabs ::v-deep(.q-tab__icon) {
  font-size: 1.15rem;
}

.settings-dialog-tabs ::v-deep(.q-tab__label) {
  font-size: 0.7rem;
  line-height: 1.1;
  margin-top: 1px;
}

.panel-title {
  padding-left: 2px;
}

.panel-title-bar {
  width: 3px;
  min-height: 1rem;
  margin-right: 8px;
  border-radius: 1px;
  flex-shrink: 0;
}

.setting-item {
  margin-top: 0.45rem;
}

.setting-item--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.setting-item--row .q-toggle {
  flex-shrink: 0;
}

.rune-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 4px;
  min-height: 80px;
}

.rune-card-wrapper {
  display: inline-block;
}

.rune-card-wrapper.rune-dragging {
  opacity: 0.4;
  transform: scale(0.95);
}

.rune-card-wrapper.rune-dragover .rune-card {
  box-shadow: 0 0 0 3px #7E57C2;
  transform: translateY(-2px);
}

.rune-ghost {
  opacity: 0.4;
  transform: scale(0.95);
}

.rune-chosen {
  box-shadow: 0 4px 20px rgba(156, 39, 176, 0.4);
}

/* 云同步面板 */
.sync-stat-card {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 8px 12px;
  text-align: center;
}

.body--dark .sync-stat-card {
  background: #2a2a2a;
}
</style>
