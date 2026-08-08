<!--
  EchoMonsterDeleter 子应用入口（wujie 微应用版）
  TODO 后续迁移：子项目目录/包名/内部文件名待统一改为 deleteEffect。

  - 接 wujie 注入的 props：{ target, mousePos, viewport, appBasePath, mountNonce }
  - 通过 window.$wujie.bus 与主项目通信：
      · 子 → 主: 'microapp:delete-effect:ready'
      · 子 → 主: 'microapp:delete-effect:click-at'         （用户在 overlay 上点了鼠标）
      · 子 → 主: 'microapp:delete-effect:completed'        （效果演出结束，outcome= destroyed|cancelled）
      · 子 → 主: 'microapp:delete-effect:request'         （请求获取鼠标坐标 / 主进程 IPC 结果）
      · 主 → 子: 'microapp:delete-effect:summon'          （主项目触发删除效果，附带最新 target / mousePos）
      · 主 → 子: 'microapp:delete-effect:teardown'        （主项目主动销毁 overlay）
      · 主 → 子: 'microapp:delete-effect:response'        （主项目对 microapp:delete-effect:request 的回包）
  - 版权隔离：所有效果素材、剧本状态机都留在这个子项目里；
    主项目只通过 props + bus 调它，**不** import 任何素材或脚本。
    下架时只需要在主项目侧 disable 这个微应用 / 删 dist 目录。
-->

<template>
  <div class="app-root">
    <!-- 顶部状态条：便于排查版权接入是否生效 -->
    <header class="app-header" v-if="headerVisible">
      <div class="app-header-title">
        🎯 怪兽剧场 · 微应用版
        <span class="app-header-sub">{{ subtitle }}</span>
      </div>
      <div class="app-header-actions">
        <button
          class="trigger-btn"
          :disabled="busy || !hasAliveTarget"
          @click="summonRandom"
        >🎯 召唤怪兽</button>
        <button
          class="reset-btn"
          :disabled="busy"
          @click="resetTargets"
        >� 重置</button>
        <span class="stats">已摧毁 <strong>{{ destroyedCount }}</strong> / {{ targets.length }}</span>
      </div>
    </header>

    <main v-if="targets.length" class="desktop">
      <div
        v-for="file in targets"
        :key="file.guid"
        class="file-tile"
        :class="{
          'file-tile-evil': file.corrupt && !file.destroyed,
          'file-tile-destroyed': file.destroyed,
          'file-tile-targeted': file === targetFile
        }"
        @click="summonOnFile(file, $event)"
      >
        <div class="file-icon">{{ file.destroyed ? '💥' : (file.icon || '📄') }}</div>
        <div class="file-name">
          <s v-if="file.destroyed">{{ file.name }}</s>
          <span v-else>{{ file.name }}</span>
        </div>
        <div class="file-meta">
          <span v-if="file.destroyed" class="meta-destroyed">已摧毁</span>
          <span v-else>{{ file.size || '' }}</span>
        </div>
      </div>
    </main>

    <main v-else class="desktop desktop--empty">
      <div class="empty-hint">
        <div class="empty-icon">🐲</div>
        <div class="empty-title">怪兽剧场待命</div>
        <div class="empty-sub">
          等待主项目召唤（右键文件夹 → 删除文件夹 → 怪兽摧毁）
        </div>
      </div>
    </main>

    <MonsterStage
      ref="stage"
      :visible="stageVisible"
      :target-pos="targetPos"
      :on-completed="onCompleted"
      @target-selected="onTargetSelected"
      @choice="onChoice"
      @stage-change="onStageChange"
    />

    <footer class="app-footer">
      <div class="stage-log">
        <span class="stage-log-label">当前阶段：</span>
        <code>{{ currentStage }}</code>
      </div>
      <div class="stage-log">
        <span class="stage-log-label">状态：</span>
        <code>{{ lastLog }}</code>
      </div>
      <div class="stage-log" v-if="busConnected !== null">
        <span class="stage-log-label">bus：</span>
        <code :class="{ 'bus-on': busConnected }">{{ busConnected ? 'connected' : 'disconnected' }}</code>
      </div>
    </footer>
  </div>
</template>

<script>
import MonsterStage from './components/monsterStage.vue'
import { STAGE } from './utils/monsterSequence.js'
import microAppBus from './utils/microAppBus.js'

/**
 * 默认的 demo targets —— 用于子项目独立运行（npm run dev 单开浏览器访问）。
 * 接入主项目后，主项目会通过 props.target / props.targets 把真实数据塞进来。
 */
const DEFAULT_TARGETS = [
  { guid: 'demo-1', name: '毕业论文.docx', icon: '📄', size: '2.1 MB', corrupt: false },
  { guid: 'demo-2', name: '需求文档.pdf', icon: '📕', size: '5.8 MB', corrupt: false },
  { guid: 'demo-3', name: 'demo.mp4', icon: '🎬', size: '128 MB', corrupt: false },
  { guid: 'demo-4', name: 'err.log', icon: '🐛', size: '12 KB', corrupt: true },
  { guid: 'demo-5', name: 'intern-report.xlsx', icon: '📊', size: '768 KB', corrupt: false },
  { guid: 'demo-6', name: 'unused-app.exe', icon: '⚙️', size: '44 MB', corrupt: true }
]

export default {
  name: 'app',
  components: { MonsterStage },
  data () {
    return {
      // === 业务状态 ===
      targets: [],
      stageVisible: false,
      targetFile: null,
      targetPos: { x: 0, y: 0 },
      currentStage: STAGE.IDLE,
      lastLog: '怪兽待命中',
      subtitle: '',
      busy: false,
      busConnected: null
    }
  },
  computed: {
    isWujieChild () {
      return typeof window !== 'undefined' && Boolean(window.__POWERED_BY_WUJIE__)
    },
    headerVisible () {
      // wujie 子应用模式下，主项目已经在 overlay 上挂了 header；这里不再重复
      return !this.isWujieChild
    },
    destroyedCount () {
      return this.targets.filter(f => f.destroyed).length
    },
    hasAliveTarget () {
      return this.targets.some(f => !f.destroyed)
    },
    targetGuid () {
      return this.targetFile ? this.targetFile.guid : null
    },
    // === wujie 注入 ===
    // 必须是 computed 实时读 window.$wujie.props，data() 里只跑一次会缓存旧引用，
    // 导致主项目后续召唤时的最新 props（target / summon / nonce 等）进不来。
    wujieProps () {
      return (typeof window !== 'undefined' && window.$wujie && window.$wujie.props) || {}
    }
  },
  async mounted () {
    // 1) wujie 注入的 props 立刻应用一次（wujieMountKey++ 强制 remount，每次重 mount 都会重新跑 mounted，
    //    所以即使没有 watcher 也能拿到最新 props —— Vue 不知道 window.$wujie.props 的外部变更，
    //    computed 不会自动重算，watcher 也起不到作用，靠 remount 重建触发 mounted 重跑）
    this.applyIncomingProps(this.wujieProps)

    // 2) bus 接入
    this.busConnected = microAppBus.isAvailable()
    if (this.busConnected) {
      microAppBus.on('microapp:delete-effect:summon', this.handleSummonCommand)
      microAppBus.on('microapp:delete-effect:teardown', this.handleTeardownCommand)
      microAppBus.on('microapp:delete-effect:response', this.handleBusResponse)
      // 上报 ready
      microAppBus.emit('microapp:delete-effect:ready', {
        version: '0.2.0',
        capabilities: ['summon', 'click-at', 'completed', 'cursor-pos', 'screen-info'],
        ts: Date.now()
      })
      this.lastLog = '已连接主项目 bus，待命中'
    } else {
      this.lastLog = '独立运行模式（未接入主项目 bus）'
    }

    // 2) 独立运行 fallback：填入默认 demo targets
    if (!this.targets.length) {
      this.targets = DEFAULT_TARGETS.map(f => ({ ...f, destroyed: false }))
      if (!this.isWujieChild) this.subtitle = '独立 demo 模式'
    } else {
      this.subtitle = `主项目注入 · ${this.targets.length} 个目标`
    }
  },
  beforeDestroy () {
    if (this.busConnected) {
      microAppBus.off('microapp:delete-effect:summon', this.handleSummonCommand)
      microAppBus.off('microapp:delete-effect:teardown', this.handleTeardownCommand)
      microAppBus.off('microapp:delete-effect:response', this.handleBusResponse)
    }
  },
  methods: {
    /**
     * 把 wujie 注入的 props 应用到组件状态。
     * 主项目每次召唤怪兽时都会重新发一组 props（含最新 target / mousePos / nonce）。
     */
    applyIncomingProps (props) {
      if (!props || typeof props !== 'object') return
      // 主项目可以传 targets（批量）或单个 target
      if (Array.isArray(props.targets) && props.targets.length) {
        // 合并：保留已摧毁状态，仅当 guid 变化时整体替换
        const destroyedMap = new Map(this.targets.filter(t => t.destroyed).map(t => [t.guid, true]))
        this.targets = props.targets.map(t => ({
          ...t,
          destroyed: t.destroyed === true || destroyedMap.get(t.guid) === true
        }))
        this.subtitle = `主项目注入 · ${this.targets.length} 个目标`
      } else if (props.target && props.target.guid) {
        // 单个目标：merge 或 append
        const idx = this.targets.findIndex(t => t.guid === props.target.guid)
        const merged = { ...props.target, destroyed: false }
        if (idx >= 0) this.targets.splice(idx, 1, merged)
        else this.targets.push(merged)
        this.subtitle = `主项目注入 · 单目标 ${props.target.name || props.target.guid}`
      }
      // 若主项目主动召唤：打开 overlay + 启动怪兽
      if (props.summon === true && props.target && props.target.guid) {
        this.summonOnFile(this.findOrInsertTarget(props.target), null, props.mousePos)
      }
    },

    findOrInsertTarget (t) {
      const idx = this.targets.findIndex(x => x.guid === t.guid)
      if (idx >= 0) {
        this.targets.splice(idx, 1, { ...t, destroyed: this.targets[idx].destroyed })
        return this.targets[idx]
      }
      const next = { ...t, destroyed: false }
      this.targets.push(next)
      return next
    },

    // ============ 召唤怪兽（鼠标坐标可来自主项目 IPC，也可来自事件 e） ============
    async summonOnFile (file, e, mouseOverride) {
      if (this.busy) {
        this.lastLog = '怪兽出没中，请等本轮结束'
        return
      }
      if (file && file.destroyed) {
        this.lastLog = `${file.name} 已被摧毁`
        return
      }
      this.targetFile = file
      this.currentStage = STAGE.IDLE
      // 1) 先问主项目要鼠标坐标（走 bus 请求，异步）
      let pos = null
      if (mouseOverride && typeof mouseOverride.x === 'number') {
        pos = mouseOverride
      } else if (e && typeof e.clientX === 'number') {
        pos = { x: e.clientX, y: e.clientY }
      }
      if (!pos && this.busConnected) {
        try {
          pos = await microAppBus.request('get-cursor-pos', { viewportHint: this.viewportHint() })
          this.lastLog = `主项目返回鼠标坐标 (${pos.x}, ${pos.y})`
        } catch (err) {
          console.warn('[echo-monster-deleter] get-cursor-pos 失败：', err)
        }
      }
      // 2) 兜底：取 tile 中心
      if (!pos) pos = this.tileCenter(file) || { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      this.targetPos = pos
      this.busy = true
      this.stageVisible = true
      this.lastLog = `瞄准 ${file ? file.name : '未知'}（点击 overlay 微调瞄准点）`
      // 3) 如果是主项目召唤（mouseOverride 已传），跳过 AWAIT_AIM 阶段直接开演
      // 这样用户体验：右键删除文件夹 → 怪兽立刻飞过来，不需要再点击 overlay。
      // 独立运行（无 mouseOverride 且无 bus）时仍走瞄准交互。
      this.$nextTick(() => {
        const stage = this.$refs && this.$refs.stage
        if (mouseOverride && stage && typeof stage.performSequence === 'function') {
          stage.performSequence(pos)
        }
      })
    },

    summonRandom () {
      const candidates = this.targets.filter(f => !f.destroyed)
      if (!candidates.length) {
        this.lastLog = '无可摧毁目标'
        return
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)]
      this.summonOnFile(pick, null)
    },

    resetTargets () {
      this.targets = this.targets.map(t => ({ ...t, destroyed: false }))
      this.targetFile = null
      this.stageVisible = false
      this.currentStage = STAGE.IDLE
      this.busy = false
      this.lastLog = '已重置所有目标'
    },

    tileCenter (file) {
      // 优先找 tile DOM 的真实中心
      if (typeof document === 'undefined') return null
      const tiles = document.querySelectorAll('.file-tile')
      for (const t of tiles) {
        if (file && file.icon && t.textContent && t.textContent.includes(file.icon)) {
          const rect = t.getBoundingClientRect()
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        }
      }
      return null
    },

    viewportHint () {
      return {
        innerWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
        innerHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1
      }
    },

    // ============ MonsterStage 事件回调 → 转发给主项目 ============
    onTargetSelected (target) {
      this.lastLog = `狙击定位到 (${Math.round(target.x)}, ${Math.round(target.y)})，怪兽正在赶来`
    },
    onChoice (label) {
      this.lastLog = `用户选择：${label}`
      // 上报给主项目（用于主项目同步自己的 UI 状态）
      if (this.busConnected) {
        microAppBus.emit('microapp:delete-effect:choice', { label, targetGuid: this.targetGuid })
      }
    },
    onStageChange (stage) {
      this.currentStage = stage
    },
    onCompleted ({ outcome }) {
      // outcome = 'destroyed' | 'cancelled'
      this.busy = false
      if (outcome === 'destroyed' && this.targetFile) {
        const targetName = this.targetFile.name
        const targetGuid = this.targetFile.guid
        this.targets = this.targets.map(f =>
          f.guid === targetGuid || f.name === targetName ? { ...f, destroyed: true } : f
        )
      }
      // 在通知主项目前快照 guid（destroyed 分支结束后 targetFile 会被清掉）
      const completedGuid = this.targetGuid
      this.targetFile = null
      this.stageVisible = false
      this.currentStage = STAGE.IDLE
      // 子应用 footer 状态文案：刻意不报"已摧毁 / 删除成功"，避免和主项目 deleteCategory
      // 自带的 toast / 提示重复显示。这里只给一个简短过渡，1-2 秒后被主项目 toast 接管。
      this.lastLog = outcome === 'cancelled' ? '算了吧？怪兽 + 雷欧一起飞走了' : '效果结束'
      // 关键事件：通知主项目结果
      if (this.busConnected) {
        microAppBus.emit('microapp:delete-effect:completed', {
          outcome,
          targetGuid: completedGuid,
          targetName: completedGuid ? (this.targets.find(t => t.guid === completedGuid) || {}).name : null,
          ts: Date.now()
        })
      }
    },

    // ============ 主项目 → 子项目的命令 ============
    handleSummonCommand (payload = {}) {
      if (payload.target && payload.target.guid) {
        const file = this.findOrInsertTarget(payload.target)
        this.summonOnFile(file, null, payload.mousePos)
      } else {
        this.summonRandom()
      }
    },
    handleTeardownCommand () {
      this.busy = false
      this.targetFile = null
      // 主动调 forceStop() 强制 controller.stop() 跑一遍（无视 _tornDown 幂等），
      // 保证 BGM / SFX / 爆炸音被 audio.stopAll() 静默 —— 关闭 overlay 后音效立刻停。
      try {
        if (this.$refs.stage && typeof this.$refs.stage.forceStop === 'function') {
          this.$refs.stage.forceStop()
        }
      } catch (e) {
        console.warn('[echoMonsterDeleter] forceStop failed:', e)
      }
      this.stageVisible = false
      this.currentStage = STAGE.IDLE
      this.lastLog = '主项目要求销毁 overlay'
    },
    handleBusResponse (payload = {}) {
      // 由 microAppBus 内部按 requestId 配对到具体的 pending promise
      // 这里不用做事，但保留 listener 防漏
    }
  }
}
</script>

<style scoped>
.app-root {
  min-height: 100vh;
  background: transparent;
  color: #fff;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  display: flex;
  flex-direction: column;
}
.app-header {
  padding: 16px 24px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
}
.app-header-title {
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.app-header-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 400;
}
.app-header-actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.trigger-btn, .reset-btn {
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.trigger-btn {
  background: #ff5252;
  box-shadow: 0 4px 12px rgba(255, 82, 82, 0.4);
}
.reset-btn {
  background: #448aff;
  box-shadow: 0 4px 12px rgba(68, 138, 255, 0.4);
}
.trigger-btn:hover:not(:disabled), .reset-btn:hover:not(:disabled) {
  transform: translateY(-2px);
}
.trigger-btn:disabled, .reset-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.stats {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  margin-left: auto;
}
.stats strong {
  color: #ff8a80;
  font-weight: 700;
}
.desktop {
  flex: 1;
  padding: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 18px;
  align-content: start;
}
.desktop--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-hint {
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.35);
  padding: 32px 48px;
  border-radius: 16px;
  backdrop-filter: blur(8px);
}
.empty-icon { font-size: 48px; }
.empty-title { font-size: 16px; font-weight: 700; margin-top: 8px; }
.empty-sub { font-size: 12px; margin-top: 4px; opacity: 0.7; }
.file-tile {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 16px 12px;
  cursor: pointer;
  text-align: center;
  transition: transform 0.15s, background 0.15s, border-color 0.15s;
}
.file-tile:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.1);
}
.file-tile-evil { border-color: rgba(255, 82, 82, 0.4); background: rgba(255, 82, 82, 0.08); }
.file-tile-targeted {
  outline: 2px solid #ffeb3b;
  outline-offset: 2px;
  box-shadow: 0 0 0 6px rgba(255, 235, 59, 0.2);
}
.file-tile-destroyed {
  opacity: 0.55;
  background: rgba(80, 0, 0, 0.25);
  border-color: rgba(255, 82, 82, 0.5);
  cursor: not-allowed;
  filter: grayscale(0.6);
}
.file-icon { font-size: 36px; margin-bottom: 8px; }
.file-name { font-size: 12px; font-weight: 600; margin-bottom: 4px; word-break: break-all; }
.file-meta { font-size: 11px; color: rgba(255, 255, 255, 0.5); }
.meta-destroyed { color: #ff8a80; font-weight: 700; }
.app-footer {
  padding: 12px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
}
.stage-log code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  color: #80d8ff;
}
.bus-on { color: #80ff80 !important; }
</style>
