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
const {
  mapActions: mapOfflineActions,
  mapState: mapOfflineState
} = createNamespacedHelpers('offline')
export default {
  name: 'App',
  components: { ConflictResolveDialog, OfflineSyncPromptDialog },
  data () {
    return {
      autoSaveInterval: null,
      antdZhCN: zhCN,
      // 记录上次冲突数，避免重复弹出
      lastConflictCount: 0
    }
  },
  computed: {
    // ✅ 已移除 autoSaveGap！不再需要自动保存配置
    // ...mapClientState(['autoSaveGap']),
    ...mapOfflineState(['isInitialized', 'conflictNotes'])
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
    // 初始化离线存储后，加载离线模式（显示本地 SQLite 笔记）
    // ✅ 不再自动同步！只在用户手动点击同步按钮时才同步
    this.initOfflineStore().then(() => {
      if (this.isLogin) {
        // 已登录：初始化服务器状态（不触发同步）
        this.initServerStore().then(() => {
          console.log('[App] Initialized server store (no auto-sync)')
        })
      } else {
        // 未登录：初始化离线模式，加载本地 SQLite 笔记
        this.initOfflineMode()
      }
    })
    // ✅ 移除自动保存定时器！用户编辑时只保存到 SQLite
    // this.setupAutoSaveInterval(this.autoSaveGap)  ← 已移除
  },
  methods: {
    // ✅ 已移除 setupAutoSaveInterval！不再自动保存
    // setupAutoSaveInterval: function (gap) { ... }
    
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
        const result = await this.sync()
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
    ...mapClientActions(['initClientStore']),
    ...mapServerActions(['initServerStore', 'reLogin', 'initOfflineMode', 'getAllCategories', 'getCategoryNotes']),
    ...mapServerState(['isLogin']),
    ...mapOfflineActions(['initOfflineStore', 'sync'])
  },
  watch: {
    // ✅ 已移除 autoSaveGap watcher！不再自动保存
    // autoSaveGap: function (val) { ... }
    
    // 冲突笔记变化时自动弹出对话框（只在数量增加时触发）
    conflictNotes: {
      handler (notes) {
        if (notes && notes.length > this.lastConflictCount) {
          this.showConflictDialog(notes[0])
        }
        this.lastConflictCount = notes ? notes.length : 0
      },
      deep: true
    }
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
