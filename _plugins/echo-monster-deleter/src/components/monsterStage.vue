<!--
  monsterStage.vue —— 完整的舞台（= PyQt 中的 MonsterDeleter QWidget）

  包含：
    - 半透明狙击背景（带"选择界面"贴图）
    - 怪兽动画（走路 / 指 / 踹 / 雷欧 / 飞行）
    - 爆炸特效（独立 sprite，targetHeight=150）
    - 对话气泡 + "是的 / 嘤嘤嘤就是这个"按钮
    - 红色十字狙击光标（自定义 cursor）

  Props：
    - targetPos: { x, y }   怪兽要指的位置（屏幕坐标）
    - visible:   true 时 mount，false 时 teardown
    - onFinished:() => void 整个 5 阶段结束后回调

  暴露事件：
    - confirm   用户在对话泡上点击了"是的 / 嘤嘤嘤就是这个" → 触发踹 + 爆炸
-->

<template>
  <div
    v-if="visible"
    ref="root"
    class="monster-stage"
    :style="{ cursor: cursorStyle }"
    @mousedown="onBackgroundClick"
  >
    <!-- 背景层（PyQt paintEvent 里的 QImage scaled） -->
    <div
      class="monster-stage-bg"
      :style="{ opacity: bgOpacity, backgroundImage: `url(${backgroundUrl})` }"
    />
    <div
      v-if="bgOpacity > 0.01"
      class="monster-stage-text"
      :style="{ opacity: textOpacity }"
    >{{ promptText }}</div>

    <!-- 取消按钮（瞄准阶段按 Esc / 点此按钮都能取消召唤） -->
    <button
      v-if="stage === 'await-aim'"
      class="monster-cancel-btn"
      @click.stop="onCancelAim"
      @mousedown.stop
    >✕ 取消召唤</button>

    <!-- 怪兽层（走路 + 指 + 踹 + 雷欧 + 飞行） -->
    <monsterSprite
      v-if="monsterSprite && monsterPos"
      :sprite="monsterSprite"
      :x="monsterPos.x"
      :y="monsterPos.y"
    />

    <!-- 爆炸层（spritesheet canvas 渲染爆炸帧序列 + Audio 单独播 MP4 声音） -->
    <monsterSprite
      v-if="explosionSprite"
      :sprite="explosionSprite"
      :x="explosionPos.x"
      :y="explosionPos.y"
    />

    <!-- 对话泡 + 按钮 -->
    <div
      v-if="bubbleVisible"
      class="monster-bubble"
      :style="{ left: bubblePos.x + 'px', top: bubblePos.y + 'px' }"
    >
      <div class="monster-bubble-text">{{ bubbleText }}</div>
    </div>
    <div
      v-if="choicesVisible"
      class="monster-choices"
      :style="{ left: choicesPos.x + 'px', top: choicesPos.y + 'px' }"
    >
      <button
        v-for="choice in choiceLabels"
        :key="choice"
        class="monster-choice-btn"
        @click="onChoice(choice)"
      >{{ choice }}</button>
    </div>
  </div>
</template>

<script>
import { MonsterStageController, STAGE, MonsterAudio } from '../utils/monsterSequence.js'
import { SPRITE_URLS, ASSETS } from '../utils/assetPath.js'
import { SNIPER_CURSOR_URL_HREF, SNIPER_CURSOR_FALLBACK, SNIPER_CURSOR_HOTSPOT } from '../utils/sniperCursor.js'
import monsterSprite from './monsterSprite.vue'

const BUBBLE_DEFAULT_TEXT = '喂，是这个吗？'
const CHOICE_DEFAULT_LABELS = ['不是', '嘤嘤嘤就是这个']
const PROMPT_DEFAULT_TEXT = '请选择你要摧毁的文件'
const FADE_IN_MS = 800
const FADE_OUT_MS = 500
const BG_MAX_OPACITY = 0.35

export default {
  name: 'monsterStage',
  components: { monsterSprite },
  props: {
    visible: { type: Boolean, default: false },
    targetPos: { type: Object, default: () => ({ x: 0, y: 0 }) },
    bubbleText: { type: String, default: BUBBLE_DEFAULT_TEXT },
    choiceLabels: { type: Array, default: () => CHOICE_DEFAULT_LABELS },
    promptText: { type: String, default: PROMPT_DEFAULT_TEXT },
    onFinished: {
      type: Function,
      default: () => {}
    },
    /**
     * 流程结束回调，与 onFinished 二选一；优先级高于 onFinished。
     * 参数: { outcome: 'destroyed' | 'cancelled' }
     *  - outcome='destroyed'   怪兽 + 爆炸摧毁完成，应该把目标文件标记 destroyed
     *  - outcome='cancelled'   用户在对话泡上点了"不是"（或类似否定），跳过炸毁，
     *                          怪兽 + 雷欧一起飞走；目标文件**不应**被标记 destroyed
     */
    onCompleted: {
      type: Function,
      default: null
    }
  },
  data () {
    return {
      bgOpacity: 0,
      textOpacity: 0,
      monsterSprite: null,
      monsterPos: null,
      // 爆炸改用 spritesheet + Audio 播声音（视频元素不再负责显示）
      explosionSprite: null,
      explosionPos: { x: 0, y: 0 },
      explosionSize: { width: 200, height: 200 },
      bubbleVisible: false,
      bubblePos: { x: 0, y: 0 },
      choicesVisible: false,
      choicesPos: { x: 0, y: 0 },
      controller: null,
      backgroundUrl: ASSETS.background,
      stage: STAGE.IDLE,
      statusMessage: '点击文件召唤怪兽',
      // 内部缓存：用户实际瞄准的位置（performSequence 传进来的那个点）
      // prop targetPos 是父级传过来的"默认瞄准点"（文件中心），可能与用户实际瞄准位置不同
      aimPos: { x: 0, y: 0 }
    }
  },
  computed: {
    cursorStyle () {
      // 双 fallback：先 SVG 文件 URL，再内嵌 dataURL，最后降级到 crosshair
      return `url("${SNIPER_CURSOR_URL_HREF}") ${SNIPER_CURSOR_HOTSPOT.x} ${SNIPER_CURSOR_HOTSPOT.y}, url("${SNIPER_CURSOR_FALLBACK}") ${SNIPER_CURSOR_HOTSPOT.x} ${SNIPER_CURSOR_HOTSPOT.y}, crosshair`
    }
  },
  watch: {
    stage (val) {
      // 同步状态文案给 statusMessage（onStageChange 已写入，
      // 这里仅为 stage 字段被外部改动时的兜底）
      if (val === STAGE.AWAIT_AIM) this.statusMessage = '狙击瞄准中，点击目标位置'
      else if (val === STAGE.AWAIT_CONFIRM) this.statusMessage = '等用户确认'
    },
    visible: {
      handler (val) {
        if (val) {
          this._start()
        } else {
          // visible=false 兜底：保证所有内部状态彻底复位 + 通知父级
          this._teardown({ silent: false })
        }
      },
      // 同步触发 —— onFinished 走 _teardown 同步设 stageVisible=false，
      // 若 watcher 异步，第二次 _teardown 要等 nextTick 才跑，期间 visible=false 状态未清理
      flush: 'sync'
    }
  },
  beforeDestroy () {
    this._teardown({ silent: true })
  },
  methods: {
    // 启动瞄准 overlay（半透明背景 + 红色十字光标 + "请选择"文案）
    // 进入 AWAIT_AIM 阶段，等用户点击。在此之前不召唤怪兽。
    _start () {
      // 重置 teardown 幂等标记（允许新一轮召唤）
      this._tornDown = false
      this._notifiedFinished = false
      this.stage = STAGE.AWAIT_AIM
      this.bgOpacity = 0
      this.textOpacity = 0
      this._fadeIn()
      // 挂全局键盘监听（瞄准阶段 Esc 取消）
      window.addEventListener('keydown', this._onKeydown)
    },
    async performSequence (targetPos) {
      this.aimPos = { x: targetPos.x, y: targetPos.y }
      this._fadeOut()
      await this._wait(FADE_OUT_MS)
      this.bgOpacity = 0
      this.textOpacity = 0
      this.statusMessage = '怪兽正在赶来'
      // 3) 启动怪兽动画
      const audio = new MonsterAudio({
        bgmSrc: ASSETS.audio.bgm,
        sfxSrc: ASSETS.audio.sfx,
        explosionSrc: ASSETS.audio.explosion
      })
      const controller = new MonsterStageController({
        assetBaseOverride: SPRITE_URLS,
        audio,
        onStageChange: (stage) => {
          this.stage = stage
          if (stage === STAGE.WALK) this.statusMessage = '怪兽正在赶来'
          else if (stage === STAGE.POINT) this.statusMessage = '怪兽正在指认'
          else if (stage === STAGE.AWAIT_CONFIRM) this.statusMessage = '等你确认'
          else if (stage === STAGE.KICK) this.statusMessage = '踢！'
          else if (stage === STAGE.EXPLOSION) this.statusMessage = '爆炸中'
          else if (stage === STAGE.LEO) this.statusMessage = '雷欧登场'
          else if (stage === STAGE.FLY) this.statusMessage = '飞走了'
          else if (stage === STAGE.DONE) this.statusMessage = '剧场结束'
          // 通知父级更新底部状态栏
          this.$emit('stage-change', stage)
        },
        onWalkProgress: ({ x, y, ratio }) => {
          // 走路过程就要把 monsterSprite 设上 —— 之前只在 ratio===1 才设，
          // 导致走路过程中 <monsterSprite v-if="monsterSprite && monsterPos" /> 一直 false，
          // 怪兽在走路过程不可见，瞬间出现在终点
          if (controller.monster) this.monsterSprite = controller.monster
          this.monsterPos = { x, y }
        },
        onFrame: () => {},
        onWalkFinished: () => {
          this.monsterSprite = controller.monster
        },
        onPointFinished: () => {
          // 怪兽停在指认最后一帧，弹出气泡 + 按钮
          this.monsterSprite = controller.monster
          this._showBubble()
        },
        onAwaitConfirm: () => {
          // 不需要额外动作；performSequence.awaitConfirm() 已被 onPointFinished 内置
        },
        onKickFrame: () => {
          // controller 内部已经触发 _stageExplosion()，这里不再做任何事
          // —— 等 controller 的 onExplosionStarted 回调拿到 explosion 加载完成的位置
        },
        onExplosionStarted: ({ x, y, width, height, sprite }) => {
          // 爆炸改回 spritesheet + Audio 播声音（视频元素不再负责显示）
          console.log('[monsterStage] onExplosionStarted: pos=', x, y, 'size=', width, height, 'viewport=', window.innerWidth, window.innerHeight)
          this.explosionPos = { x, y }
          this.explosionSize = { width, height }
          this.explosionSprite = sprite
        },
        onExplosionFinished: () => {
          this.explosionSprite = null
        },
        onLeoFinished: () => {},
        onFlyFinished: () => {
          // 整个流程结束：彻底拆 controller + 通知父级关闭
          this._teardown()
        }
      })
      this.controller = controller
      // 真正进入状态机（这里会阻塞到 AWAIT_CONFIRM，等待用户 confirm()）
      // 不在外面用 resumeKick/tail —— 用 controller.confirm() 走正式 API
      try {
        await controller.start(targetPos)
      } catch (e) {
        // cancelled —— 静默退出
      }
    },
    _showBubble () {
      if (!this.controller || !this.controller.monster) return
      const { width, height } = this.controller.monster.size
      // monster 当前在 monsterPos 处（指物阶段停在那儿）
      const m = this.monsterPos || { x: 0, y: 0 }
      this.bubblePos = {
        x: m.x + width / 2 - 80,
        y: m.y - 60
      }
      this.choicesPos = {
        x: m.x + width / 2 - 130,
        y: m.y + height - 20
      }
      this.bubbleVisible = true
      this.choicesVisible = true
    },
    onBackgroundClick (e) {
      // 仅在 AWAIT_AIM 阶段（瞄准中）接受点击；其他阶段（走路 / 指认 / 踹 / 飞）
      // 都不响应背景点击，避免误触
      if (this.stage !== STAGE.AWAIT_AIM) return
      // target 不能是容器自己以外的子节点（取消按钮等已 @click.stop 拦截）
      if (e.target !== this.$refs.root) return
      const targetPos = { x: e.clientX, y: e.clientY }
      this.$emit('target-selected', targetPos)
      // 触发怪兽走来（performSequence 内部会缓存一份 targetPos 用于爆炸位置）
      this.performSequence(targetPos)
    },
    onCancelAim () {
      // 瞄准阶段用户主动取消（按 Esc / 点取消按钮）
      if (this.stage !== STAGE.AWAIT_AIM) return
      this._teardown({ silent: false }) // 通知父级，让 targetFile 也清掉
    },
    _onKeydown (e) {
      if (e.key === 'Escape' && this.stage === STAGE.AWAIT_AIM) {
        this.onCancelAim()
      }
    },
    onChoice (label) {
      this.bubbleVisible = false
      this.choicesVisible = false
      this.$emit('choice', label)
      if (!this.controller) return
      // 第一个按钮（"不是"）= 不摧毁当前文件，跳过 kick/explosion，
      // 走 leo + fly 一起飞走（怪兽 + 雷欧）
      // 第二个按钮（"嘤嘤嘤就是这个"）= 确认摧毁，走 kick + explosion
      const isNegative = label === CHOICE_DEFAULT_LABELS[0]
      if (isNegative) {
        this.statusMessage = '不是这个？那走吧……'
        this.controller.cancel({ fly: true })
      } else {
        const ok = this.controller.confirm()
        if (!ok) {
          console.warn('[monsterStage] confirm() returned false, stage =', this.controller.stage)
        }
      }
    },
    _fadeIn () {
      const start = performance.now()
      const step = (ts) => {
        const t = Math.min(1, (ts - start) / FADE_IN_MS)
        this.bgOpacity = t * BG_MAX_OPACITY
        this.textOpacity = Math.min(1, this.bgOpacity / BG_MAX_OPACITY)
        if (t < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    },
    _fadeOut () {
      const start = performance.now()
      const startVal = this.bgOpacity
      const step = (ts) => {
        const t = Math.min(1, (ts - start) / FADE_OUT_MS)
        this.bgOpacity = startVal * (1 - t)
        this.textOpacity = Math.min(1, this.bgOpacity / BG_MAX_OPACITY)
        if (t < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    },
    _wait (ms) {
      return new Promise(resolve => setTimeout(resolve, ms))
    },
    _stop () {
      // 兼容性保留：什么都不做，所有清理都走 _teardown
    },
    _teardown (opts = {}) {
      const { silent = false, force = false } = opts
      // 幂等保护：已 teardown 过就不重复（除非 force）
      if (this._tornDown && !force) {
        if (!silent && !this._notifiedFinished) {
          this._notifiedFinished = true
          try { this.onFinished() } catch (e) { console.error('[monsterStage] onFinished threw:', e) }
        }
        return
      }
      this._tornDown = true
      if (this.controller) {
        this.controller.stop()
        this.controller = null
      }
      window.removeEventListener('keydown', this._onKeydown)
      this.bgOpacity = 0
      this.textOpacity = 0
      this.monsterSprite = null
      this.monsterPos = null
      this.explosionSprite = null
      this.bubblePos = { x: 0, y: 0 }
      this.choicesPos = { x: 0, y: 0 }
      this.bubbleVisible = false
      this.choicesVisible = false
      this.stage = STAGE.IDLE
      this.statusMessage = '点击文件召唤怪兽'
      if (!silent) {
        this._notifiedFinished = true
        const outcome = (this.controller && this.controller.outcome) || 'destroyed'
        if (typeof this.onCompleted === 'function') {
          this.onCompleted({ outcome })
        } else {
          // 兼容旧的 onFinished(Fn) —— 默认按 destroyed 走（保留旧行为）
          this.onFinished()
        }
      }
    }
  }
}
</script>

<style scoped>
.monster-stage {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: transparent;
  user-select: none;
}
.monster-stage-bg {
  position: absolute;
  inset: 0;
  background-color: #000;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  transition: opacity 60ms linear;
  /* 不响应鼠标事件 —— 让点击穿透到 root 容器，
     避免鼠标被 .monster-stage-bg 拦截（mousedown 事件的 e.target 就不是 root 了） */
  pointer-events: none;
}
.monster-stage-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 30px;
  font-weight: 700;
  pointer-events: none;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
.monster-bubble {
  position: absolute;
  background: rgba(255, 255, 255, 0.95);
  color: #1c1c1e;
  padding: 15px 30px;
  border-radius: 20px;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 20px;
  font-weight: 600;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  pointer-events: none;
}
.monster-bubble::after {
  content: '';
  position: absolute;
  bottom: -14px;
  left: calc(50% - 15px);
  border-left: 15px solid transparent;
  border-right: 15px solid transparent;
  border-top: 15px solid rgba(255, 255, 255, 0.95);
}
.monster-choices {
  position: absolute;
  display: flex;
  gap: 15px;
  pointer-events: auto;
}
.monster-choice-btn {
  background: rgba(255, 255, 255, 0.95);
  color: #1c1c1e;
  border: 1px solid #e5e5ea;
  border-radius: 18px;
  padding: 12px 25px;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.monster-choice-btn:hover {
  background: #007aff;
  color: #fff;
  border-color: #007aff;
}
.monster-choice-btn:active {
  background: #005bb5;
  color: #fff;
  border-color: #005bb5;
}
.monster-cancel-btn {
  position: absolute;
  top: 24px;
  right: 24px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  z-index: 10;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  transition: background 0.15s, border-color 0.15s;
}
.monster-cancel-btn:hover {
  background: rgba(255, 82, 82, 0.8);
  border-color: rgba(255, 82, 82, 1);
}
.monster-explosion-video {
  position: absolute;
  pointer-events: none;
  object-fit: contain;
  z-index: 5;
}
</style>
