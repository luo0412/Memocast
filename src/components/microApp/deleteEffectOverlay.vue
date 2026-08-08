<!--
  deleteEffectOverlay —— 全屏透明删除效果弹框（wujie 子应用版）

  用途：
    - 版权隔离：所有效果素材 / 剧本状态机都跑在
      _plugins/echo-monster-deleter 这个独立子项目里（子项目目录名/包名暂时保留，后续迁移时会同步改名）；
      下架时只需要 disable 这个 overlay（删 dist / 把 enabled 改 false），
      主项目源码 / 其它弹框完全不动。

  形态：
    - q-dialog maximized=true，遮罩半透明黑（0.35 opacity）让背后的笔记 / 侧栏仍可见
    - WujieVue 子应用全屏铺满，自身 background=transparent（子项目自带 transparent）
    - 顶部一个细 header bar（毛玻璃），放标题 / 关闭按钮 / 当前阶段
    - 底部一个细 status bar（毛玻璃），放当前状态文案

  通信链路（参考 deleteEffectBridge.js / genericMicroAppIpcBridge.js）：
    主项目 ──────┐
                ├─ props.target / props.summon=true ─────► 子应用
                ├─ bus 'microapp:delete-effect:summon' ────────► 子应用
                ├─ bus 'microapp:delete-effect:teardown' ─────► 子应用
                ├─ bus 'microapp:delete-effect:request' ◄──── 子应用
                ├─ bus 'microapp:delete-effect:response' ────► 子应用
                ├─ bus 'microapp:delete-effect:ready' ◄────── 子应用
                ├─ bus 'microapp:delete-effect:click-at' ◄── 子应用
                ├─ bus 'microapp:delete-effect:choice' ◄──── 子应用
                └─ bus 'microapp:delete-effect:completed' ◄─ 子应用

  调用方：
    - NoteList.vue 的 deleteCategoryHandler：
        1) 调 this.$refs.deleteEffectOverlay.summon({ target, mousePos })
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
    content-class="delete-effect-overlay__dialog"
  >
    <!-- 全屏透明容器 -->
    <div class="delete-effect-overlay">
      <!-- 顶部细 header bar -->
      <header class="delete-effect-overlay__header">
        <div class="delete-effect-overlay__title">
          删除效果
          <span class="delete-effect-overlay__sub">{{ subtitle }}</span>
        </div>
        <div class="delete-effect-overlay__status">
          <span class="delete-effect-overlay__status-label">阶段：</span>
          <code>{{ stageLabel }}</code>
          <q-btn
            flat
            dense
            round
            icon="close"
            size="sm"
            class="delete-effect-overlay__close"
            @click="onCloseClick"
          >
            <q-tooltip>关闭</q-tooltip>
          </q-btn>
        </div>
      </header>

      <!-- WujieVue 子应用：keep-alive + 自带 transparent -->
      <div class="delete-effect-overlay__body">
        <WujieVue
          v-if="wujieUrl && visible"
          :key="wujieMountKey"
          name="echo-monster-deleter"
          :url="wujieUrl"
          :alive="true"
          :sync="false"
          :props="wujieProps"
          class="delete-effect-overlay__wujie"
        />
      </div>

      <!-- 底部 status bar（毛玻璃） -->
      <footer class="delete-effect-overlay__footer">
        <span class="delete-effect-overlay__footer-label">状态：</span>
        <code>{{ lastLog }}</code>
        <span class="delete-effect-overlay__footer-spacer"></span>
        <span v-if="readyAt" class="delete-effect-overlay__footer-tag">bus ✓</span>
        <span v-else class="delete-effect-overlay__footer-tag delete-effect-overlay__footer-tag--warn">bus …</span>
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
  installDeleteEffectBridge,
  summonDeleteEffect,
  teardownDeleteEffect,
  updateCursorPosCache,
  isDeleteEffectBridgeInstalled
} from './deleteEffectBridge'

/**
 * 子项目入口 URL 解析：
 *   - dev 环境用 http://localhost:5175/（子项目 vite dev server）
 *   - prod 环境用 file://${appBasePath}_plugins/echo-monster-deleter/dist/index.html
 *     （子项目 vite build 出的 singlefile，自带全部素材；子项目目录名后续迁移时同步改名）
 *
 * 为什么要分两套：
 *   - dev 时主项目跑在 webpack-dev-server 上，子项目 vite 单独跑，两个独立 HMR
 *   - prod 时必须 file://（electron renderer 没法跨 file:// 加载远程 url 除非禁 webSecurity）
 */
function resolveDeleteEffectUrl (appBasePath) {
  if (isDevEnv()) {
    return 'http://localhost:5175/'
  }
  return `file://${appBasePath || ''}_plugins/echo-monster-deleter/dist/index.html`
}

export default {
  name: 'deleteEffectOverlay',
  components: { WujieVue },
  data () {
    return {
      visible: false,
      appBasePath: '',
      // 每次 show() 都自增：保活模式下强制重新挂载，避免上一轮残留
      wujieMountKey: 0,
      // 子应用上报的状态
      readyAt: null,        // 子应用 ready 上报的时间戳
      stage: 'IDLE',        // 子应用效果剧本的当前阶段
      lastLog: '等待召唤',
      subtitle: '',
      busy: false,          // 当前是否在效果演出中（阻止关闭）
      // 待兑现的 completed promise（summon() 返回的）
      _pendingCompleteds: [],
      _busUninstall: null,
      _effectBusUninstall: null,
      _mouseMoveListener: null
    }
  },
  computed: {
    ...mapState('client', ['currentNote']),
    wujieUrl () {
      return resolveDeleteEffectUrl(this.appBasePath)
    },
    /**
     * 透传给子应用的 props。
     * 主项目每轮召唤时会更新 summon / target / mousePos；
     * 子应用 watch 这个对象做反应。
     */
    wujieProps () {
      return {
        target: this._currentTarget,
        // 主项目召唤的"一次性 trigger"：true 表示「请立刻按 target 触发效果」
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
        // 【兜底】q-dialog 在多种路径下都会把 visible=false：
        //   1) onCloseClick（X 按钮）→ 已调过 teardown()，pending 已经 resolve，这里幂等无害
        //   2) q-dialog 默认 Esc 键（no-esc-dismiss=false）
        //   3) q-dialog 默认点遮罩（no-backdrop-dismiss=false）
        //   4) onCompleted 自动关闭 overlay
        // 路径 2/3 不会走 onCloseClick → 不会 resolve pending → 必须这里兜底，
        // 否则 NoteList.deleteCategoryHandler 拿到的 promise 永远不 resolve，
        // "右上角 X 关闭 / Esc / 点遮罩" 全部语义模糊成"等 5 分钟 timeout"。
        if ((this._pendingCompleteds || []).length > 0) {
          this._resolveAllPendingAsCancelled('overlay-hidden-by-qdialog')
        }
      }
    }
  },
  async mounted () {
    try {
      this.appBasePath = await getAppPath()
    } catch (err) {
      console.warn('[deleteEffectOverlay] getAppPath failed:', err)
    }
    // 注册通用 IPC 桥（白名单 channel）
    if (!isGenericMicroAppIpcBridgeInstalled()) {
      this._busUninstall = installGenericMicroAppIpcBridge()
    }
    // 注册效果专属桥（业务事件透传）—— 必须独立保存 uninstall，
    // 否则会被上面通用桥的 uninstall 赋值给覆盖，导致效果桥永远无法卸载。
    this._effectBusUninstall = installDeleteEffectBridge({
      onReady: (payload) => {
        this.readyAt = payload.ts || Date.now()
        this.lastLog = `子应用就绪 · v${payload.version || '?'} · ${(payload.capabilities || []).join(',')}`
      },
      onStageChange: (payload) => {
        if (payload && payload.stage) {
          this.stage = payload.stage
          this.lastLog = `效果阶段：${payload.stage}`
        }
      },
      onClickAt: (payload) => {
        // 子应用把鼠标点击坐标透回主项目（用于日志 / 调试 / 未来扩展）
        // 这里不打日志，避免控制台被刷屏
      },
      onChoice: (payload) => {
        if (payload && payload.label) {
          this.lastLog = `对话选择：${payload.label}`
        }
      },
      onCompleted: (payload) => {
        // 关键回调：resolve 所有 pending promise（每个 promise 自己决定 outcome 处理）
        // _pendingCompleteds 可能在组件销毁后被 GC（race condition），
        // 这里防御性 fallback 避免 beforeDestroy 期间的 .slice crash。
        this.busy = false
        this.lastLog = payload && payload.outcome === 'destroyed'
          // 子应用 destroyed 路径上不再单独报"删除效果完成"——主项目 deleteCategory 自带
          // 成功 toast，特效 overlay 这里只给一个中性过渡态即可。
          ? '效果结束'
          : '已取消'
        this.stage = 'IDLE'
        // 完成（destroyed）或取消（cancelled）后自动关闭 overlay —— 用户不再需要点 X。
        // _currentTarget / _summonFlag 由 watch.visible 异步清空。
        this.visible = false
        // 用统一兜底方法 resolve pending，避免 watch.visible / onCloseClick / 这里三处
        // 重复逻辑。注意：这里不能塞 onCloseClick 的 reason 字符串 —— payload 是子应用
        // 上报的真实 outcome，应原样透传。
        const list = (this._pendingCompleteds || []).slice()
        this._pendingCompleteds = []
        list.forEach(({ resolve }) => {
          try { resolve(payload || { outcome: 'cancelled' }) } catch (e) { console.warn('[deleteEffectOverlay] onCompleted resolver threw:', e) }
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
    if (this._effectBusUninstall) {
      try { this._effectBusUninstall() } catch (_) { /* noop */ }
      this._effectBusUninstall = null
    }
    if (this._mouseMoveListener) {
      window.removeEventListener('mousemove', this._mouseMoveListener)
      this._mouseMoveListener = null
    }
    // 主动销毁 wujie 子应用，释放 iframe
    // 注意：WujieVue 子应用 name 仍为 'echo-monster-deleter'，待子项目目录迁移时一并改
    if (WujieVue && typeof WujieVue.destroyApp === 'function') {
      try {
        const ret = WujieVue.destroyApp('echo-monster-deleter')
        if (ret && typeof ret.then === 'function') {
          ret.catch(err => console.warn('[deleteEffectOverlay] destroyApp failed:', err))
        }
      } catch (err) {
        console.warn('[deleteEffectOverlay] destroyApp threw:', err)
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
     * 召唤删除效果。
     * @param {Object} payload
     * @param {{guid:string,name:string,icon?:string,size?:string,corrupt?:boolean}} payload.target
     * @param {{x:number,y:number}} [payload.mousePos]
     * @returns {Promise<{outcome:'destroyed'|'cancelled'}>}
     */
    summon ({ target, mousePos } = {}) {
      if (!target || !target.guid) {
        return Promise.reject(new Error('summon() requires target.guid'))
      }
      // ─── 硬重置：每次召唤都从零开始，避免上一轮状态残留 ───
      // 背景：用户每次邮件文件夹删除 → 重开 overlay 都期望「小怪兽重新选中」。
      // 这里要做四件事：
      //   1) 通知子应用清内部状态机（targetFile / busy / stageVisible / currentStage）——
      //      走 teardownDeleteEffect() 复用现有 teardown 事件（子应用 handleTeardownCommand
      //      已经在做硬重置），wujie 内部状态机立刻归零。
      //   2) 清空主项目侧上一轮的 pending resolves —— 否则上轮 cancelled 的 late emit
      //      会同时 resolve 本轮的 pending，导致用户期望删除 B 却被 cancelled 跳过。
      //   3) wujieMountKey++ 强制 wujie 重新挂载（保险丝，覆盖任何 bus 事件丢/未到的边界）。
      //      注意：:alive=true 时 :key 改变**不会**让子应用 Vue remount，但 webcomponent 会
      //      重新连接，bus listener 一直在，所以这条只在子应用被真卸载的情况下生效。
      //   4) 【关键】发 'microapp:delete-effect:summon' bus 事件显式驱动子应用
      //      handleSummonCommand —— 因为 alive=true 下子应用 mounted() 不再重跑，
      //      props 路径不可靠，必须走 bus 事件路径让怪兽重新走过来。
      try { teardownDeleteEffect() } catch (_) { /* noop */ }
      const staleList = (this._pendingCompleteds || []).slice()
      this._pendingCompleteds = []
      staleList.forEach(({ resolve }) => {
        try { resolve({ outcome: 'cancelled', reason: 'superseded-by-new-summon' }) } catch (_) { /* noop */ }
      })
      this.stage = 'IDLE'
      // ─── 推新状态 ───
      this._currentTarget = target
      this._currentMousePos = mousePos || this._captureCurrentMousePos()
      this._summonFlag = true
      this.busy = true
      this.subtitle = `瞄准：${target.name || target.guid}`
      this.lastLog = `触发删除效果 → ${target.name || target.guid}`
      this.wujieMountKey = (this.wujieMountKey || 0) + 1
      this.visible = true
      this._summonNonce = (this._summonNonce || 0) + 1
      // 显式驱动子应用：发 summon bus 事件，让子应用 handleSummonCommand 把怪兽拉过来。
      // 即使 alive=true 下 wujieProps 不更新、mounted 不重跑，这条 bus 路径永远生效
      // （bus.$on 在 mounted 注册一次就一直在，直到子应用真正卸载）。
      try {
        summonDeleteEffect({ target, mousePos: this._currentMousePos })
      } catch (e) { console.warn('[deleteEffectOverlay] summonDeleteEffect failed:', e) }
      // 兜底：如果 bus 不可用 / 子应用没起来，5 分钟后强制 resolve 一次 cancelled
      return new Promise((resolve) => {
        this._pendingCompleteds.push({ resolve })
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
     * 主动销毁 overlay（不召唤效果）。
     */
    teardown () {
      this.busy = false
      this.visible = false
      try { teardownDeleteEffect() } catch (_) { /* noop */ }
      // 【关键】右上角 X 关闭 = 取消删除。必须立刻把 _pendingCompleteds 里挂着的 promise
      // 全部 resolve 为 cancelled，否则 NoteList.deleteCategoryHandler 的 await 会一直挂着，
      // 直到 5 分钟超时 —— 这期间用户期望的"不删除"语义被推迟到 timeout 才生效。
      // 跟子应用随后可能 emit 的 'microapp:delete-effect:completed' 不会重复 resolve：
      // resolve 时直接从 _pendingCompleteds 列表里 splice，list 为空时 onCompleted 不做任何事。
      this._resolveAllPendingAsCancelled('user-closed-overlay')
    },

    /**
     * 把 _pendingCompleteds 里所有挂着的 promise 一次性 resolve 为 cancelled。
     * 用于：右上角 X 关闭、Esc/点遮罩(q-dialog 自动关)、定时器 timeout 等场景。
     * 调用方应自行决定 reason 文案，方便调试区分触发源。
     */
    _resolveAllPendingAsCancelled (reason = 'cancelled') {
      const staleList = (this._pendingCompleteds || []).slice()
      this._pendingCompleteds = []
      staleList.forEach(({ resolve }) => {
        try { resolve({ outcome: 'cancelled', reason }) } catch (_) { /* noop */ }
      })
    },

    _captureCurrentMousePos () {
      // 兜底：用鼠标缓存里的最近一次值（microAppBridge.updateCursorPosCache 写入）
      // 这里直接返回当前 wujieProps.mousePos 即可——子应用没起的话也不影响
      return { x: window.innerWidth / 2, y: window.innerHeight / 2, fallback: true }
    },

    onCloseClick () {
      // 即使 busy（效果演出中）也允许强制关闭：用户体验优先于脚本约束。
      // 子应用收到 'microapp:delete-effect:teardown' 后会清自己的状态（handleTeardownCommand），
      // 并在下一帧不再阻挡我们关闭 overlay。
      if (this.busy) {
        this.lastLog = '已强制中断'
      }
      this.teardown()
      this.$emit('closed')
    }
  }
}
</script>

<style scoped lang="scss">
.delete-effect-overlay__dialog {
  background: transparent !important;
  box-shadow: none !important;
}
.delete-effect-overlay {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.35); // 半透明黑：背后的笔记 / 侧栏仍可见
  /* 不响应键盘事件：避免和子应用内的 keydown 抢 */
}

.delete-effect-overlay__header {
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
.delete-effect-overlay__title {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.delete-effect-overlay__sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 400;
}
.delete-effect-overlay__status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
}
.delete-effect-overlay__status code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  color: #80d8ff;
}
.delete-effect-overlay__close {
  margin-left: 8px;
  color: rgba(255, 255, 255, 0.75);
  &:hover { color: #fff; }
}

.delete-effect-overlay__body {
  flex: 1 1 auto;
  position: relative;
  overflow: hidden;
}
.delete-effect-overlay__wujie {
  display: block;
  width: 100%;
  height: 100%;
}

.delete-effect-overlay__footer {
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
.delete-effect-overlay__footer code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  color: #80d8ff;
}
.delete-effect-overlay__footer-label { color: rgba(255, 255, 255, 0.6); margin-right: 6px; }
.delete-effect-overlay__footer-spacer { flex: 1; }
.delete-effect-overlay__footer-tag {
  background: rgba(102, 187, 106, 0.25);
  color: #c8e6c9;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.delete-effect-overlay__footer-tag--warn {
  background: rgba(255, 167, 38, 0.2);
  color: #ffe0b2;
}
</style>
