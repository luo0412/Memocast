<template>
  <div id='q-app'>
    <a-config-provider :locale='antdZhCN'>
      <router-view />
    </a-config-provider>
    <!-- 冲突解决对话框 -->
    <ConflictResolveDialog ref="conflictDialog" />
    <!-- 离线笔记同步提示对话框 -->
    <OfflineSyncPromptDialog ref="offlineSyncDialog" @sync="handleOfflineSync" @skip="handleOfflineSkipSync" />
  </div>
</template>
<script>
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import ErrorHandler from './ErrorHandler'
import ScheduleHandler from './ScheduleHandler'
import ApiHandler from 'src/ApiHandler'
import { createNamespacedHelpers } from 'vuex'
import bus from './components/bus'
import events from './constants/events'
import { checkUpdate } from './ApiInvoker'
import ConflictResolveDialog from './components/ui/dialog/ConflictResolveDialog.vue'
import OfflineSyncPromptDialog from './components/ui/dialog/OfflineSyncPromptDialog.vue'

const { RegisterErrorHandler } = ErrorHandler
const { RegisterScheduleJobs } = ScheduleHandler
const { RegisterApiHandler } = ApiHandler

const { mapActions: mapClientActions, mapState: mapClientState } = createNamespacedHelpers('client')
const {
  mapActions: mapServerActions,
  mapState: mapServerState
} = createNamespacedHelpers('server')
export default {
  name: 'App',
  components: { ConflictResolveDialog, OfflineSyncPromptDialog },
  data () {
    return {
      autoSaveInterval: null,
      antdZhCN: zhCN
    }
  },
  computed: {
    ...mapServerState(['isLogin'])
  },
  async mounted () {
    RegisterErrorHandler()
    RegisterScheduleJobs(this)
    RegisterApiHandler()
    bus.$on(events.RELOGIN, this.reLogin)
    bus.$on('showOfflineSyncPrompt', this.showOfflineSyncPrompt)
    this.registerSyncListener()
    checkUpdate()
    this.initClientStore().then()
    this.initServerStore().then()
  },
  methods: {
    // 显示离线笔记同步提示对话框
    showOfflineSyncPrompt (offlineNotes) {
      if (this.$refs.offlineSyncDialog) {
        this.$refs.offlineSyncDialog.show(offlineNotes)
      }
    },
    // 注册同步完成监听器，刷新服务器笔记列表
    async registerSyncListener () {
      const SyncService = (await import('./services/SyncService')).default
      this._syncListener = (event) => {
        if (event.type === 'sync_complete') {
          this.getAllCategories()
          this.getCategoryNotes()
        }
      }
      SyncService.addListener(this._syncListener)
    },
    // 确认同步离线笔记
    async handleOfflineSync () {
      console.log('[App] handleOfflineSync: starting sync...')
      try {
        const result = await this.runClientSync()
        if (result && result.success) {
          console.log('[App] Offline sync completed successfully')
        } else {
          console.warn('[App] Offline sync completed with issues:', result)
        }
      } catch (err) {
        console.error('[App] Offline sync failed:', err)
      }
    },
    // 跳过同步离线笔记
    handleOfflineSkipSync () {
      console.log('[App] handleOfflineSkipSync: skipped')
    },
    // 显示冲突解决对话框
    showConflictDialog (note) {
      if (this.$refs.conflictDialog) {
        this.$refs.conflictDialog.show(note)
      }
    },
    ...mapClientActions({
      initClientStore: 'initClientStore',
      runClientSync: 'sync'
    }),
    ...mapServerActions(['initServerStore', 'reLogin', 'getAllCategories', 'getCategoryNotes'])
  },
  beforeDestroy () {
    bus.$off('showOfflineSyncPrompt', this.showOfflineSyncPrompt)
    if (this._syncListener) {
      import('./services/SyncService').then(({ default: SyncService }) => {
        SyncService.removeListener(this._syncListener)
      })
    }
  }
}
</script>
