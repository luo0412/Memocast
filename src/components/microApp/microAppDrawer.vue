<template>
  <q-drawer
    ref="drawer"
    :width="drawerWidth"
    side="right"
    overlay
    elevated
    content-class="hide-scrollbar"
    class="im-drawer"
  >
    <div class="im-drawer-container">
      <div class="im-drawer-header">
        <span class="im-drawer-title">{{ $t('microApps') }}</span>
        <q-btn
          dense
          flat
          round
          icon="close"
          size="sm"
          @click="hide"
        />
      </div>

      <div class="im-drawer-body">
        <transition name="sidebar-fade">
          <microAppPanelList
            v-if="!sidebarCollapsed"
            class="im-drawer-sidebar"
            :apps="enabledApps"
            :active-id="activeApp ? activeApp.id : ''"
            @select="onAppSelect"
          />
        </transition>
        <microAppHost
          class="im-drawer-host"
          :app="activeApp"
          :reload-key="reloadKey"
        />

        <!-- 贴边切换按钮：随侧边栏状态切换左右位置，悬停在分界线上 -->
        <q-btn
          class="im-drawer-sidebar-toggle"
          :class="{ 'im-drawer-sidebar-toggle--collapsed': sidebarCollapsed }"
          dense
          unelevated
          round
          size="sm"
          :icon="sidebarCollapsed ? 'chevron_right' : 'chevron_left'"
          @click="toggleSidebar"
        >
          <q-tooltip
            anchor="center right"
            self="center left"
            :offset="[8, 0]"
          >
            {{ sidebarCollapsed ? $t('microAppsSidebarShow') : $t('microAppsSidebarHide') }}
          </q-tooltip>
        </q-btn>
      </div>
    </div>
  </q-drawer>
</template>

<script>
import WujieVue from 'wujie-vue2'
import DatabaseClient from 'src/utils/DatabaseClient'
import bus from 'components/common/bus'
import microAppPanelList from './microAppPanelList.vue'
import microAppHost from './microAppHost.vue'
import {
  buildDefaultMicroApps,
  normalizeMicroApps,
  pickDefaultApp
} from './microAppService'

export default {
  name: 'microAppDrawer',
  components: {
    microAppPanelList,
    microAppHost
  },
  data () {
    return {
      apps: [],
      activeId: '',
      // 每次保存后 +1，用于强制重建 microAppHost，使 wujie 子应用重新挂载
      reloadNonce: 0,
      ready: false,
      sidebarCollapsed: false
    }
  },
  computed: {
    enabledApps () {
      return normalizeMicroApps(this.apps).filter(a => a.enabled)
    },
    activeApp () {
      const list = this.enabledApps
      if (!list.length) return null
      return list.find(a => a.id === this.activeId) || list[0]
    },
    reloadKey () {
      return String(this.reloadNonce)
    },
    drawerWidth () {
      if (this.activeApp && this.activeApp.isMobile) {
        return Math.min(this.$q.screen.width * 0.6, 480)
      }
      return this.$q.screen.width * 0.8
    }
  },
  methods: {
    async loadApps () {
      const stored = await DatabaseClient.microApps.getAll()
      let list = normalizeMicroApps(stored)
      if (!list.length) {
        list = normalizeMicroApps(buildDefaultMicroApps())
        await DatabaseClient.microApps.saveAll(list)
      }
      this.apps = list
      const defaultApp = pickDefaultApp(list)
      this.activeId = defaultApp ? defaultApp.id : ''
    },
    async loadUiState () {
      const raw = await DatabaseClient.appState.get('setting/microApps/sidebarCollapsed')
      if (raw === true || raw === 'true') {
        this.sidebarCollapsed = true
      }
    },
    persistSidebarCollapsed () {
      DatabaseClient.appState
        .set('setting/microApps/sidebarCollapsed', this.sidebarCollapsed)
        .catch(err => console.warn('[microAppDrawer] persistSidebarCollapsed failed:', err))
    },
    toggleSidebar () {
      this.sidebarCollapsed = !this.sidebarCollapsed
      this.persistSidebarCollapsed()
    },
    onAppSelect (app) {
      this.activeId = app.id
    },
    show () {
      if (!this.ready) {
        this.loadApps().then(() => { this.ready = true })
      }
      this.$nextTick(() => {
        if (this.$refs.drawer) this.$refs.drawer.show()
      })
    },
    hide () {
      if (this.$refs.drawer) this.$refs.drawer.hide()
    },
    toggle () {
      if (this.$refs.drawer && this.$refs.drawer.showing) {
        this.hide()
      } else {
        this.show()
      }
    },
    // 主动销毁已挂载（即便 keep-alive 模式）的 wujie 子应用，确保下次重新加载
    destroyAppsById (ids) {
      if (!ids || !ids.length) return Promise.resolve()
      return Promise.all(ids.map(id => {
        if (!id) return Promise.resolve()
        try {
          const ret = WujieVue.destroyApp(id)
          return ret && typeof ret.then === 'function' ? ret : Promise.resolve()
        } catch (err) {
          console.warn('[microAppDrawer] destroyApp failed for', id, err)
          return Promise.resolve()
        }
      }))
    },
    async onMicroAppsChanged (payload) {
      // 兼容旧格式（直接传列表）
      const list = Array.isArray(payload) ? payload : (payload && payload.list)
      const dirtyIds = payload && Array.isArray(payload.dirtyIds) ? payload.dirtyIds : []
      if (!Array.isArray(list)) return

      const oldActiveId = this.activeId
      const activeStillValid = list.some(a => a.id === oldActiveId && a.enabled)

      // 先按 dirty 销毁（被改 url / devUrl 的、被删的）；等待销毁完成再递增 nonce，避免与 host 重渲染争抢
      if (dirtyIds.length) {
        await this.destroyAppsById(dirtyIds)
      }

      this.apps = normalizeMicroApps(list)

      const enabled = this.apps.filter(a => a.enabled)
      if (activeStillValid) {
        this.activeId = oldActiveId
      } else {
        const fallback = pickDefaultApp(this.apps)
        this.activeId = fallback ? fallback.id : ''
      }

      if (dirtyIds.length) {
        // 等数据流就位后再递增，使 :key 变化时机略晚于 destroy 完成
        this.reloadNonce += 1
      }
    }
  },
  mounted () {
    this.loadApps().then(() => { this.ready = true })
    this.loadUiState()
    bus.$on('microAppsChanged', this.onMicroAppsChanged)
  },
  beforeDestroy () {
    bus.$off('microAppsChanged', this.onMicroAppsChanged)
    // 抽屉销毁时也清一遍，避免内存里残留 iframe
    this.destroyAppsById(this.enabledApps.map(a => a.id))
  }
}
</script>

<style scoped lang="scss">
.im-drawer {
  background-color: transparent !important;
  box-shadow: none !important;
}

.im-drawer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--editorBgColor, #ffffff);
  border-radius: 8px 0 0 8px;
  overflow: hidden;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
}

.im-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--floatBorderColor, #e8e8e8);
  flex-shrink: 0;
}

.im-drawer-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--editorColor, #333);
}

.im-drawer-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: row;
  min-height: 0;
  position: relative;
}

.im-drawer-sidebar {
  flex-shrink: 0;
  width: 56px;
  min-width: 56px;
  max-width: 56px;
}

.im-drawer-host {
  flex: 1 1 auto;
  min-width: 0;
}

/* Vue <transition> 控制卸载/挂载时的透明度淡入淡出 */
.sidebar-fade-enter-active,
.sidebar-fade-leave-active {
  transition: opacity 0.18s ease;
}
.sidebar-fade-enter-from,
.sidebar-fade-leave-to {
  opacity: 0;
}

/* 贴边切换按钮：随侧边栏状态切换左右位置 */
.im-drawer-sidebar-toggle {
  position: absolute;
  top: 50%;
  left: 56px;
  transform: translateY(-50%);
  opacity: 0.45;
  transition: opacity 0.18s ease, left 0.18s ease;
  z-index: 5;
}

.im-drawer-sidebar-toggle--collapsed {
  left: 0;
}

.im-drawer-sidebar-toggle:hover,
.im-drawer-sidebar-toggle:focus {
  opacity: 1;
}
</style>
