<!--
  EchoMonsterDeleterOverlay —— 全屏透明怪兽摧毁弹框（wujie 子应用版）

  用途：
    - 版权隔离：所有怪兽 / 雷欧 / 爆炸素材、剧本状态机都跑在
      _plugins/echo-monster-deleter 这个独立子项目里；
      下架时只需要 disable 这个 overlay（删 dist / 把 enabled 改 false），
      主项目源码 / 其它弹框完全不动。

  形态：
    - q-dialog maximized=true，遮罩半透明黑（0.35 opacity）让背后的笔记 / 侧栏仍可见
    - WujieVue 子应用全屏铺满，自身 background=transparent（子项目自带 transparent）
    - 顶部一个细 header bar（毛玻璃），放标题 / 关闭按钮 / 当前阶段
    - 底部一个细 status bar（毛玻璃），放当前状态文案

  通信链路（参考 echoMonsterDeleterBridge.js / genericMicroAppIpcBridge.js）：
    主项目 ──────┐
                ├─ props.target / props.summon=true ─────► 子应用
                ├─ bus 'microapp:monster:summon' ────────► 子应用
                ├─ bus 'microapp:monster:teardown' ─────► 子应用
                ├─ bus 'microapp:monster:request' ◄──── 子应用
                ├─ bus 'microapp:monster:response' ────► 子应用
                ├─ bus 'microapp:monster:ready' ◄────── 子应用
                ├─ bus 'microapp:monster:click-at' ◄── 子应用
                ├─ bus 'microapp:monster:choice' ◄──── 子应用
                └─ bus 'microapp:monster:completed' ◄─ 子应用

  调用方：
    - NoteList.vue 的 deleteCategoryHandler：
        1) 调 this.$refs.echoMonsterDeleterOverlay.summon({ target, mousePos })
        2) 拿到 Promise<{ outcome }>
        3) outcome === 'destroyed' 才真的 this.deleteCategory(...)
-->

<template>
  <q-dialog
    v-model="visible"
    :maximized="true"
    :transition-show="'jump-up'"
    :transition-hide="'jump-down'"
    :seamless="false"
    :persistent="false"
    :no-esc-dismiss="false"
    :no-backdrop-dismiss="false"
    content-class="echo-monster-overlay__dialog"
  >
    <!-- 全屏透明容器 -->
    <div class="echo-monster-overlay">
      <!-- 顶部细 header bar -->
      <header class="echo-monster-overlay__header">
        <div class="echo-monster-overlay__title">
          🐲 大将怪兽摧毁
          <span class="echo-monster-overlay__sub">{{ subtitle }}</span>
        </div>
        <div class="echo-monster-overlay__status">
          <span class="echo-monster-overlay__status-label">阶段：</span>
          <code>{{ stageLabel }}</code>
          <q-btn
            flat
            dense
            round
            icon="close"
            size="sm"
            class="echo-monster-overlay__close"
            @click="onCloseClick"
          >
            <q-tooltip>关闭怪兽剧场</q-tooltip>
          </q-btn>
        </div>
      </header>

      <!-- WujieVue 子应用：keep-alive + 自带 transparent -->
      <div class="echo-monster-overlay__body">
        <WujieVue
          v-if="wujieUrl && visible"
          :key="wujieMountKey"
          name="echo-monster-deleter"
          :url="wujieUrl"
          :alive="true"
          :sync="false"
          :props="wujieProps"
          class="echo-monster-overlay__wujie"
        />
      </div>

      <!-- 底部 status bar（毛玻璃） -->
      <footer class="echo-monster-overlay__footer">
        <span class="echo-monster-overlay__footer-label">状态：</span>
        <code>{{ lastLog }}</code>
        <span class="echo-monster-overlay__footer-spacer"></span>
        <span v-if="readyAt" class="echo-monster-overlay__footer-tag">bus ✓</span>
        <span v-else class="echo-monster-overlay__footer-tag echo-monster-overlay__footer-tag--warn">bus …</span>
      </footer>
    </div>
  </q-dialog>
</template>

<script>
import { mapState } from 'vuex'
import WujieVue from 'wujie-vue2'
import { getAppPath } from 'src/ApiInvoker'
import { isDevEnv } from './microAppService'
import {
  installGenericMicroAppIpcBridge,
  isGenericMicroAppIpcBridgeInstalled
} from './genericMicroAppIpcBridge'
import {
  installEchoMonsterDeleterBridge,
  summonMonster,
  teardownMonster,
  updateCursorPosCache,
  isEchoMonsterDeleterBridgeInstalled
} from './echoMonsterDeleterBridge'

/**
 * 子项目入口 URL 解析：
 *   - dev 环境用 http://localhost:5175/（子项目 vite dev server）
 *   - prod 环境用 file://${appBasePath}_plugins/echo-monster-deleter/dist/index.html
 *     （子项目 vite build 出的 singlefile，自带全部素材）
 *
 * 为什么要分两套：
 *   - dev 时主项目跑在 webpack-dev-server 上，子项目 vite 单独跑，两个独立 HMR
 *   - prod 时必须 file://（electron renderer 没法跨 file:// 加载远程 url 除非禁 webSecurity）
 */
function resolveEchoMonsterDeleterUrl (appBasePath) {
  if (isDevEnv()) {
    return 'http://localhost:5175/'
  }
  return `file://${appBasePath || ''}_plugins/echo-monster-deleter/dist/index.html`
}

export default {
  name: 'echoMonsterDeleterOverlay',
  components: { WujieVue },
  data () {
    return {
      visible: false,
      appBasePath: '',
      // 每次 show() 都自增：保活模式下强制重新挂载，避免上一轮怪兽残留
      wujieMountKey: 0,
      // 子应用上报的状态
      readyAt: null,        // 子应用 ready 上报的时间戳
      stage: 'IDLE',        // 子应用 monsterStage 的当前阶段
      lastLog: '等待召唤',
      subtitle: '',
      busy: false,          // 当前是否在进行怪兽剧场（阻止关闭）
      // 待兑现的 completed promise（summon() 返回的）
      _pendingCompleteds: [],
      _busUninstall: null,
      _monsterBusUninstall: null,
      _mouseMoveListener: null
    }
  },
  computed: {
    ...mapState('client', ['currentNote']),
    wujieUrl () {
      return resolveEchoMonsterDeleterUrl(this.appBasePath)
    },
    /**
     * 透传给子应用的 props。
     * 主项目每轮召唤时会更新 summon / target / mousePos；
     * 子应用 watch 这个对象做反应。
     */
    wujieProps () {
      return {
        target: this._currentTarget,
        // 主项目召唤的"一次性 trigger"：true 表示「请立刻按 target 召唤怪兽」
        summon: this._summonFlag === true,
        mousePos: this._currentMousePos,
        theme: 'dark',
        locale: this.$i18n ? this.$i18n.locale : 'zh-CN',
        // 每次召唤递增的 nonce：子应用可用作「新一轮召唤」标记
        nonce: this._summonNonce
      }
    },
    stageLabel () {
      return this.stage || 'IDLE'
    }
  },
  watch: {
    visible (val) {
      if (val) {
        // 打开：递增 nonce → 触发子应用 watcher
        this._summonNonce = (this._summonNonce || 0) + 1
      } else {
        // 关闭：把 busy / target / stage / flag 都清掉
        this.busy = false
        this._currentTarget = null
        this._currentMousePos = null
        this._summonFlag = false
        this.stage = 'IDLE'
        this.lastLog = '已销毁 overlay'
      }
    }
  },
  async mounted () {
    try {
      this.appBasePath = await getAppPath()
    } catch (err) {
      console.warn('[echoMonsterDeleterOverlay] getAppPath failed:', err)
    }
    // 注册通用 IPC 桥（白名单 channel）
    if (!isGenericMicroAppIpcBridgeInstalled()) {
      this._busUninstall = installGenericMicroAppIpcBridge()
    }
    // 注册怪兽专属桥（业务事件透传）—— 必须独立保存 uninstall，
    // 否则会被上面通用桥的 uninstall 赋值给覆盖，导致怪兽桥永远无法卸载。
    this._monsterBusUninstall = installEchoMonsterDeleterBridge({
      onReady: (payload) => {
        this.readyAt = payload.ts || Date.now()
        this.lastLog = `子应用就绪 · v${payload.version || '?'} · ${(payload.capabilities || []).join(',')}`
      },
      onStageChange: (payload) => {
        if (payload && payload.stage) {
          this.stage = payload.stage
          this.lastLog = `怪兽阶段：${payload.stage}`
        }
      },
      onClickAt: (payload) => {
        // 子应用把鼠标点击坐标透回主项目（用于日志 / 调试 / 未来扩展）
        // 这里不打日志，避免控制台被刷屏
      },
      onChoice: (payload) => {
        if (payload && payload.label) {
          this.lastLog = `怪兽对话选择：${payload.label}`
        }
      },
      onCompleted: (payload) => {
        // 关键回调：resolve 所有 pending promise（每个 promise 自己决定 outcome 处理）
        // _pendingCompleteds 可能在组件销毁后被 GC（race condition），
        // 这里防御性 fallback 避免 beforeDestroy 期间的 .slice crash。
        this.busy = false
        this.lastLog = payload && payload.outcome === 'destroyed'
          ? '怪兽摧毁完成'
          : '怪兽剧场取消'
        this.stage = 'IDLE'
        const list = (this._pendingCompleteds || []).slice()
        this._pendingCompleteds = []
        list.forEach(({ resolve }) => {
          try { resolve(payload || { outcome: 'cancelled' }) } catch (e) { console.warn('[echoMonsterDeleterOverlay] onCompleted resolver threw:', e) }
        })
      }
    })
    // 鼠标坐标缓存：子应用 get-cursor-pos 会读这里
    this._mouseMoveListener = (e) => {
      updateCursorPosCache(0, e.clientX, e.clientY)
    }
    window.addEventListener('mousemove', this._mouseMoveListener)
  },
  beforeDestroy () {
    if (this._busUninstall) {
      try { this._busUninstall() } catch (_) { /* noop */ }
      this._busUninstall = null
    }
    if (this._monsterBusUninstall) {
      try { this._monsterBusUninstall() } catch (_) { /* noop */ }
      this._monsterBusUninstall = null
    }
    if (this._mouseMoveListener) {
      window.removeEventListener('mousemove', this._mouseMoveListener)
      this._mouseMoveListener = null
    }
    // 主动销毁 wujie 子应用，释放 iframe
    if (WujieVue && typeof WujieVue.destroyApp === 'function') {
      try {
        const ret = WujieVue.destroyApp('echo-monster-deleter')
        if (ret && typeof ret.then === 'function') {
          ret.catch(err => console.warn('[echoMonsterDeleterOverlay] destroyApp failed:', err))
        }
      } catch (err) {
        console.warn('[echoMonsterDeleterOverlay] destroyApp threw:', err)
      }
    }
    // 释放所有 pending（避免调用方永远 hang）
    const list = (this._pendingCompleteds || []).slice()
    this._pendingCompleteds = []
    list.forEach(({ resolve }) => {
      try { resolve({ outcome: 'cancelled', reason: 'overlay-destroyed' }) } catch (_) { /* noop */ }
    })
  },
  methods: {
    /**
     * 召唤怪兽。
     * @param {Object} payload
     * @param {{guid:string,name:string,icon?:string,size?:string,corrupt?:boolean}} payload.target
     * @param {{x:number,y:number}} [payload.mousePos]
     * @returns {Promise<{outcome:'destroyed'|'cancelled'}>}
     */
    summon ({ target, mousePos } = {}) {
      if (!target || !target.guid) {
        return Promise.reject(new Error('summon() requires target.guid'))
      }
      this._currentTarget = target
      this._currentMousePos = mousePos || this._captureCurrentMousePos()
      this._summonFlag = true
      this.busy = true
      this.subtitle = `瞄准：${target.name || target.guid}`
      this.lastLog = `召唤怪兽 → ${target.name || target.guid}`
      this.wujieMountKey = (this.wujieMountKey || 0) + 1
      this.visible = true
      this._summonNonce = (this._summonNonce || 0) + 1
      // 兜底：如果 bus 不可用 / 子应用没起来，2s 后强制 resolve 一次 cancelled
      return new Promise((resolve) => {
        this._pendingCompleteds.push({ resolve })
        // 兜底超时：5 分钟还没回包，自动 cancel
        setTimeout(() => {
          const idx = this._pendingCompleteds.findIndex(p => p.resolve === resolve)
          if (idx >= 0) {
            this._pendingCompleteds.splice(idx, 1)
            this.busy = false
            this.lastLog = '召唤超时，自动取消'
            this.stage = 'IDLE'
            try { resolve({ outcome: 'cancelled', reason: 'timeout' }) } catch (_) { /* noop */ }
          }
        }, 5 * 60 * 1000)
      })
    },

    /**
     * 主动销毁 overlay（不召唤怪兽）。
     */
    teardown () {
      this.busy = false
      this.visible = false
      try { teardownMonster() } catch (_) { /* noop */ }
    },

    _captureCurrentMousePos () {
      // 兜底：用鼠标缓存里的最近一次值（microAppBridge.updateCursorPosCache 写入）
      // 这里直接返回当前 wujieProps.mousePos 即可——子应用没起的话也不影响
      return { x: window.innerWidth / 2, y: window.innerHeight / 2, fallback: true }
    },

    onCloseClick () {
      // 即使 busy（怪兽表演中）也允许强制关闭：用户体验优先于脚本约束。
      // 子应用收到 'microapp:monster:teardown' 后会清自己的状态（handleTeardownCommand），
      // 并在下一帧不再阻挡我们关闭 overlay。
      if (this.busy) {
        this.lastLog = '已强制中断怪兽剧场'
      }
      this.teardown()
      this.$emit('closed')
    }
  }
}
</script>

<style scoped lang="scss">
.echo-monster-overlay__dialog {
  background: transparent !important;
  box-shadow: none !important;
}
.echo-monster-overlay {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.35); // 半透明黑：背后的笔记 / 侧栏仍可见
  /* 不响应键盘事件：避免和子应用内的 keydown 抢 */
}

.echo-monster-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 44px;
  padding: 0 16px;
  background: rgba(20, 20, 28, 0.65);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #fff;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
}
.echo-monster-overlay__title {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.echo-monster-overlay__sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 400;
}
.echo-monster-overlay__status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
}
.echo-monster-overlay__status code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  color: #80d8ff;
}
.echo-monster-overlay__close {
  margin-left: 8px;
  color: rgba(255, 255, 255, 0.75);
  &:hover { color: #fff; }
}

.echo-monster-overlay__body {
  flex: 1 1 auto;
  position: relative;
  overflow: hidden;
}
.echo-monster-overlay__wujie {
  display: block;
  width: 100%;
  height: 100%;
}

.echo-monster-overlay__footer {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 32px;
  padding: 0 16px;
  background: rgba(20, 20, 28, 0.65);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 12px;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
}
.echo-monster-overlay__footer code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  color: #80d8ff;
}
.echo-monster-overlay__footer-label { color: rgba(255, 255, 255, 0.6); margin-right: 6px; }
.echo-monster-overlay__footer-spacer { flex: 1; }
.echo-monster-overlay__footer-tag {
  background: rgba(102, 187, 106, 0.25);
  color: #c8e6c9;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.echo-monster-overlay__footer-tag--warn {
  background: rgba(255, 167, 38, 0.2);
  color: #ffe0b2;
}
</style>
