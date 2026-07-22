<template>
  <div id='q-app'>
    <a-config-provider :locale='antdZhCN'>
      <router-view />
    </a-config-provider>
    <!-- 离线笔记同步提示对话框 -->
    <OfflineSyncPromptDialog ref="offlineSyncDialog" @sync="handleOfflineSync" @skip="handleOfflineSkipSync" />
    <!-- 全屏火焰效果 -->
    <FireEffect ref="fireEffect" />
    <HeartEffect ref="heartEffect" />
    <ButterflyEffect ref="butterflyEffect" />
  </div>
</template>
<script>
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import ErrorHandler from './ErrorHandler'
import ScheduleHandler from './ScheduleHandler'
import ApiHandler from 'src/ApiHandler'
import { createNamespacedHelpers } from 'vuex'
import bus from './components/common/bus'
import { EVENTS as events } from 'src/utils/const/eventsConst'
import { checkUpdate } from './ApiInvoker'
import OfflineSyncPromptDialog from './components/sync/OfflineSyncPromptDialog.vue'
import FireEffect from './components/common/FireEffect.vue'
import HeartEffect from './components/common/HeartEffect.vue'
import ButterflyEffect from './components/common/ButterflyEffect.vue'

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
  components: { OfflineSyncPromptDialog, FireEffect, HeartEffect, ButterflyEffect },
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
    bus.$on(events.UI_EVENTS.playFireEffect, this.handlePlayFireEffect)
    bus.$on(events.UI_EVENTS.playHeartEffect, this.handlePlayHeartEffect)
    bus.$on(events.UI_EVENTS.playButterflyEffect, this.handlePlayButterflyEffect)
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
    // 播放火焰效果
    handlePlayFireEffect () {
      if (this.$refs.fireEffect) {
        this.$refs.fireEffect.start()
      }
    },
    // 播放爱心效果
    handlePlayHeartEffect () {
      if (this.$refs.heartEffect) {
        this.$refs.heartEffect.start()
      }
    },
    // 播放蝴蝶效果
    handlePlayButterflyEffect () {
      if (this.$refs.butterflyEffect) {
        this.$refs.butterflyEffect.start()
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
    bus.$off(events.UI_EVENTS.playFireEffect, this.handlePlayFireEffect)
    bus.$off(events.UI_EVENTS.playHeartEffect, this.handlePlayHeartEffect)
    bus.$off(events.UI_EVENTS.playButterflyEffect, this.handlePlayButterflyEffect)
    if (this._syncListener) {
      import('./services/SyncService').then(({ default: SyncService }) => {
        SyncService.removeListener(this._syncListener)
      })
    }
  }
}
</script>
