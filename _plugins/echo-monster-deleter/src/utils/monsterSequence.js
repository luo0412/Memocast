// ============================================================================
// monsterSequence.js —— 把 MonsterDeleter 的 5 阶段怪兽动画剧本
// 搬到一个状态机里，方便 Vue 组件挂载。
//
// 阶段顺序（对应 PyQt main.py:MonsterDeleter）：
//   1) walk     走路进场（loop 5×3=15 帧，4500ms 横向移动）
//   2) point    指着文件（11~14 帧，循环播一次）
//   3) kick     踹文件（15 帧，循环播一次；第 6 帧触发爆炸）
//   4) leo      雷欧登场（15 帧，循环播一次）
//   5) fly      出场飞行动效（15 帧，loop + 横向飞出屏幕）
//
// 关键不变量：
//   - targetPos 用「文档中怪兽要站着指哪儿的绝对坐标」表示（屏幕坐标）；
//   - 走路动画的横向位移结束 x = targetPos.x - sprite.width - 30
//     （保证怪兽的手指正好点在文件上）。
//   - 爆炸特效 5×3 spritesheet，targetHeight 150（PyQt 原版配置）。
// ============================================================================

import { SpriteAnimator, POINT_FRAME_INDICES, DEFAULT_TARGET_HEIGHT } from './spriteAnimator.js'

// 各阶段对应的 spritesheet 路径（相对资产根）
const SPRITE_FILE = {
  walk: '走路动效_spritesheet_transparent.png',
  point: '指着文件_spritesheet_transparent.png',
  kick: '踹文件动效_spritesheet_transparent.png',
  leo: '雷欧登场_spritesheet_transparent.png',
  fly: '出场飞行动效_spritesheet_transparent.png',
  explosion: '爆炸_spritesheet_transparent.png'
}

// 走路入场持续时间（毫秒），跟 PyQt `setDuration(4500)` 同步
const WALK_DURATION_MS = 4500
// 怪兽 y 偏移（PyQt 版的"+50"是为了让怪兽脚在文件下方）
const Y_OFFSET_PX = 50
// 走路终点 x（怪兽在文件左侧停下，手指正好指到文件）
const X_END_OFFSET_PX = 30

// 状态机的 8 个阶段
export const STAGE = Object.freeze({
  IDLE: 'idle',
  AWAIT_AIM: 'await-aim',  // overlay 启动，等用户瞄准点击（PyQt 原版流程）
  WALK: 'walk',
  POINT: 'point',
  AWAIT_CONFIRM: 'await-confirm',  // 怪兽停在指认姿态，等用户点"是的/不是"
  KICK: 'kick',
  EXPLOSION: 'explosion',
  LEO: 'leo',
  FLY: 'fly',
  DONE: 'done'
})

// ============================================================
// Audio —— 把 QMediaPlayer 三轨（bgm / sfx / explosion）映射到 HTMLAudioElement
// 三个轨道互不干扰、可独立 play/stop/loop。
// 爆炸音轨用 <audio> 元素加载 爆炸.MP4（PyQt 原版同样只取音轨）。
// ============================================================
export class MonsterAudio {
  constructor ({ bgmSrc, sfxSrc, explosionSrc } = {}) {
    this.bgm = bgmSrc ? new Audio(bgmSrc) : null
    this.sfx = sfxSrc ? new Audio(sfxSrc) : null
    this.explosion = explosionSrc ? new Audio(explosionSrc) : null
    if (this.bgm) {
      this.bgm.loop = true
      this.bgm.volume = 0.5
    }
    if (this.sfx) this.sfx.volume = 1.0
    if (this.explosion) this.explosion.volume = 0.3
  }

  playBgm () { if (this.bgm) this.bgm.play().catch(() => {}) }
  /**
   * stop BGM：pause + currentTime=0。
   * 必须重置 currentTime —— 否则下轮 playBgm() 会从断点继续播（loop 模式下问题不明显，
   * 但单次播放如 SFX 残留 / 爆炸音从 0.8s 处开始会非常突兀）。
   */
  stopBgm () { if (this.bgm) { this.bgm.pause(); this.bgm.currentTime = 0 } }
  playSfx () { if (this.sfx) { this.sfx.currentTime = 0; this.sfx.play().catch(() => {}) } }
  playExplosion () { if (this.explosion) { this.explosion.currentTime = 0; this.explosion.play().catch(() => {}) } }
  /**
   * 停所有音轨：pause + currentTime=0（不仅是 pause）。
   * 【关键】爆炸音必须在 stopAll 时把 currentTime 也归零，否则下次 playExplosion
   * 会从上次停止处继续播（如果同一 audio 实例复用的话）。同时 currentTime=0 让浏览器
   * 立即"释放"对该 media 的解码缓冲，缩短 GC 回收时间。
   */
  stopAll () {
    this.stopBgm()
    if (this.sfx) { this.sfx.pause(); this.sfx.currentTime = 0 }
    if (this.explosion) { this.explosion.pause(); this.explosion.currentTime = 0 }
  }
  /**
   * 释放 audio 资源：stopAll 后清空引用，让 GC 立刻回收 <audio> 元素。
   * 调用方应在 destroy / 切下一轮 audio 之前调一次，避免 <audio> 元素在 JS 堆里
   * 持续占内存（浏览器默认不会主动回收 paused 的 audio 元素）。
   */
  destroy () {
    this.stopAll()
    this.bgm = null
    this.sfx = null
    this.explosion = null
  }
}

// ============================================================
// stageController —— 一次性 5 阶段剧本
//   - 接收 `targetPos`（屏幕坐标）、`audio`、回调 mount
//   - 内部用 SpriteAnimator 跑每个阶段
//   - 走路阶段用 rAF 模拟 QPropertyAnimation 的匀减速（OutQuad）位移
// ============================================================
export class MonsterStageController {
  constructor ({
    assetBase,
    assetBaseOverride, // 可选：直接传 {walk, point, kick, leo, fly, explosion} 的 URL 表
    audio,
    onStageChange,       // (stage) => void
    onWalkProgress,      // ({ratio, x, y}) => void
    onFrame,             // ({stage, currentFrame, frameCount}) => void
    onWalkFinished,      // () => void
    onPointFinished,     // () => void
    onAwaitConfirm,      // () => void   —— 怪兽停在指认姿态等用户确认
    onKickFrame,         // (frameIdx) => void   —— 第 6 帧触发爆炸
    onExplosionStarted,  // ({x, y}) => void     —— 爆炸即将开始播放，通知上层挂 sprite
    onExplosionFinished, // () => void
    onLeoFinished,       // () => void
    onFlyFinished        // () => void
  }) {
    this.assetBase = assetBase
    this.assetBaseOverride = assetBaseOverride || null
    this.audio = audio
    this.onStageChange = onStageChange || (() => {})
    this.onWalkProgress = onWalkProgress || (() => {})
    this.onFrame = onFrame || (() => {})
    this.onWalkFinished = onWalkFinished || (() => {})
    this.onPointFinished = onPointFinished || (() => {})
    this.onAwaitConfirm = onAwaitConfirm || (() => {})
    this.onKickFrame = onKickFrame || (() => {})
    this.onExplosionStarted = onExplosionStarted || (() => {})
    this.onExplosionFinished = onExplosionFinished || (() => {})
    this.onLeoFinished = onLeoFinished || (() => {})
    this.onFlyFinished = onFlyFinished || (() => {})
    this.stage = STAGE.IDLE
    this.targetPos = null
    this.monster = null
    this.explosion = null
    this._walkStart = null
    this._walkStartX = 0
    this._walkEndX = 0
    this._walkY = 0
    this._walkStartTs = 0
    this._walkRafId = 0
    this._flyRafId = 0
    this._confirmPromise = null        // 供 confirm()/cancel() resolve 的 Promise
    this._confirmResolve = null
    this._confirmReject = null
  }

  _setStage (stage) {
    this.stage = stage
    this.onStageChange(stage)
  }

  _resolve (key) {
    if (this.assetBaseOverride && this.assetBaseOverride[key]) {
      return this.assetBaseOverride[key]
    }
    return `${this.assetBase}${SPRITE_FILE[key]}`
  }

  async start (targetPos) {
    this.targetPos = { ...targetPos }
    this.monster = new SpriteAnimator()
    this.explosion = new SpriteAnimator()
    this.outcome = 'destroyed' // 默认走完所有阶段 = 摧毁
    await this._stageWalk()
    // _stagePoint 内部会 await confirmPromise；用户 confirm() 后 resolve → 走 kick
    // 用户 cancel() 后 reject → catch 块走 leo + fly 一起飞走（不摧毁文件）
    try {
      await this._stagePoint()
      await this._stageKick()
    } catch (e) {
      // cancelled（用户点"不是"或外部 stop 触发）
      if (this._cancelFly) {
        this._cancelFly = false
        this.outcome = 'cancelled'
        try {
          await this._stageLeo()
          await this._stageFly()
        } catch (e2) { /* ignore */ }
      } else {
        // 真正的 stop() 取消（不是用户主动 cancel）—— 也当作 cancelled
        this.outcome = 'cancelled'
      }
      this._setStage(STAGE.DONE)
      this.onFlyFinished()
      return
    }
    await this._stageLeo()
    await this._stageFly()
    // 注意：_stageFly 内部 rAF 推进到 t>=1 时已经调过 onFlyFinished()，
    // 这里不要再调一次（否则 monsterStage._teardown 被调用两遍）
    this._setStage(STAGE.DONE)
  }

  async _stageWalk () {
    this._setStage(STAGE.WALK)
    this.audio.playBgm()
    await this.monster.load(this._resolve('walk'), {
      targetHeight: DEFAULT_TARGET_HEIGHT
    })
    const { width: w, height: h } = this.monster.size
    this._walkStartX = -w
    this._walkEndX = this.targetPos.x - w - X_END_OFFSET_PX
    this._walkY = this.targetPos.y - h / 2 + Y_OFFSET_PX
    this._walkStartTs = 0
    this._setStage(STAGE.WALK) // 通知上层把怪兽画到屏幕外
    // 用 rAF 模拟 QPropertyAnimation OutQuad 缓动
    this._walkStart = this._walkY
    this._walkStartX = -w
    this._walkEndX = this.targetPos.x - w - X_END_OFFSET_PX
    this._setWalkProgress(0)
    this.monster.play({
      fps: 8,
      loop: true,
      onFrame: (currentFrame, frameCount) => this.onFrame({ stage: STAGE.WALK, currentFrame, frameCount })
    })
    await new Promise(resolve => {
      const step = (ts) => {
        if (!this._walkRafId) {
          // 可能被 stop() 取消
          resolve()
          return
        }
        if (!this._walkStartTs) this._walkStartTs = ts
        const t = Math.min(1, (ts - this._walkStartTs) / WALK_DURATION_MS)
        // OutQuad: 1 - (1 - t)^2
        const eased = 1 - (1 - t) * (1 - t)
        this._setWalkProgress(eased)
        if (t >= 1) {
          this._walkRafId = 0
          this.onWalkFinished()
          resolve()
          return
        }
        this._walkRafId = requestAnimationFrame(step)
      }
      this._walkRafId = requestAnimationFrame(step)
    })
  }

  _setWalkProgress (ratio) {
    const x = this._walkStartX + (this._walkEndX - this._walkStartX) * ratio
    this.onWalkProgress({ ratio, x, y: this._walkY })
  }

  async _stagePoint () {
    this._setStage(STAGE.POINT)
    this.monster.stop()
    this.audio.playSfx()
    await this.monster.load(this._resolve('point'), {
      frameIndices: POINT_FRAME_INDICES
    })
    // 一次性播放 11~14 帧；播完后停在最后一帧（停止 rAF）
    // 注意：原 PyQt 这里是 frame_indices=[11,12,13,14] 一次性，
    // 播完给用户弹气泡 + 按钮。Web 上必须停在最后一帧，
    // 不要 takeLoop 也不要切到下一阶段，否则用户还没点就踢。
    await new Promise(resolve => {
      this.monster.play({
        fps: 8,
        loop: false,
        onFrame: (currentFrame, frameCount) => this.onFrame({ stage: STAGE.POINT, currentFrame, frameCount }),
        onFinish: () => {
          // 播完最后一帧后：把当前帧钉死在最后一帧，防止后序
          // 外部 render() 调到下一帧索引（防御性）
          this.monster.stop()
          this.monster.currentFrame = this.monster.frames.length - 1
          this.onPointFinished()
          resolve()
        }
      })
    })
    // 进入"等待确认"中间态；不主动 await kick / leo / fly
    this._setStage(STAGE.AWAIT_CONFIRM)
    this.onAwaitConfirm()
    if (!this._confirmPromise) {
      this._confirmPromise = new Promise((res, rej) => {
        this._confirmResolve = res
        this._confirmReject = rej
      })
    }
    await this._confirmPromise
  }

  // 外部调用：用户确认摧毁。resolve 后 _stagePoint 才推进到 kick
  confirm () {
    if (this.stage !== STAGE.AWAIT_CONFIRM) {
      return false
    }
    if (this._confirmResolve) {
      const r = this._confirmResolve
      this._confirmResolve = null
      this._confirmReject = null
      r()
    }
    return true
  }

  // 外部调用：用户取消（保留接口；当前不真的取消）
  // options.fly = true → 走 leo + fly 动画一起飞走（怪兽 + 雷欧）
  cancel (options = {}) {
    if (this.stage !== STAGE.AWAIT_CONFIRM) {
      return false
    }
    if (options.fly) {
      this._cancelFly = true
      // 用户说"算了吧" → 怪兽 + 雷欧飞走，所有音轨立即停，避免飞走动画尾巴。
      // 用 audio.stopAll() 而非单独 stopBgm + sfx.pause：爆炸音轨如果在 cancel 之前
      // 已经被触发了（理论上 cancel 只在 AWAIT_CONFIRM 阶段调用，但防御性写 stopAll
      // 不会有问题，且能避免漏掉 explosion 音轨残音）。_stageFly 完成后 audio.stopAll()
      // 还会再调一次（幂等安全）。
      if (this.audio) {
        try { this.audio.stopAll() } catch (_) {}
      }
    }
    if (this._confirmReject) {
      const r = this._confirmReject
      this._confirmResolve = null
      this._confirmReject = null
      r(new Error('cancelled'))
    }
    return true
  }

  async _stageKick () {
    this._setStage(STAGE.KICK)
    await this.monster.load(this._resolve('kick'))
    // 等到第 6 帧就异步触发 explosion（不等它完成，explosion 跟 kick 余下帧并行；
    // 真正串行在 start() 里靠 _stageExplosion 自己管理）
    let explosionPromise = null
    await new Promise(resolve => {
      this.monster.play({
        fps: 8,
        loop: false,
        onFrame: (currentFrame, frameCount) => {
          this.onFrame({ stage: STAGE.KICK, currentFrame, frameCount })
          // PyQt 原版：第 6 帧（index 5）触发爆炸
          if (currentFrame === 5 && !explosionPromise) {
            explosionPromise = this._stageExplosion().catch((e) => { /* swallow */ })
            // 通知上层（monsterStage）把 explosionSprite 挂上
            this.onKickFrame(currentFrame)
          }
        },
        onFinish: () => {
          this.onFrame({ stage: STAGE.KICK, currentFrame: this.monster.frameCount - 1, frameCount: this.monster.frameCount })
          resolve()
        }
      })
    })
    // 等爆炸跑完（即使 kick 先结束，explosion 还没完）
    if (explosionPromise) await explosionPromise
  }

  async _stageExplosion () {
    this._setStage(STAGE.EXPLOSION)
    // 爆炸用 spritesheet（canvas 渲染 5×3 帧序列）+ Audio 单独播 MP4 声音
    // —— 视频元素只用来播声音，不负责显示
    await this.explosion.load(this._resolve('explosion'), {
      // 缩放到正方形 240x240（与原 MP4 视频元素位置/大小一致；1440x1920 单帧会等比拉成正方形）
      targetWidth: 240,
      targetHeight: 240
    })
    console.log('[controller] explosion loaded:', {
      isLoaded: this.explosion.isLoaded,
      frames: this.explosion.frames.length,
      size: this.explosion.size,
      src: this._resolve('explosion')
    })
    // 用 sprite.size 作为定位基础（不再写死 240x240），保证 canvas 中心和 W/2,H/2 对齐
    const spriteSize = this.explosion.size
    const W = spriteSize.width || 240
    const H = spriteSize.height || 240
    const x = this.targetPos.x - W / 2
    const y = this.targetPos.y - H / 2 - 40
    // 通知上层挂上 explosion sprite（monsterStage 渲染 <monsterSprite>）
    this.onExplosionStarted({
      x, y, width: W, height: H,
      sprite: this.explosion
    })
    // 同步播爆炸音效（Audio 元素，不影响 sprite 显示）
    this.audio.playExplosion()
    // sprite 播完后 resolve，让 _stageLeo 推进
    await new Promise(resolve => {
      this.explosion.play({
        fps: 12,
        loop: false,
        onFrame: (currentFrame, frameCount) => this.onFrame({ stage: STAGE.EXPLOSION, currentFrame, frameCount }),
        onFinish: () => {
          console.log('[controller] explosion play finished')
          this.explosion.stop()
          resolve()
        }
      })
    })
  }

  resolveExplosion () {
    // 兼容保留：旧版本 monsterStage 会在 video 'ended' 时调它来推进 _stageLeo。
    // 现在 _stageExplosion 用 spritesheet + onFinish 自行 resolve，理论上不该再被调；
    // 但保留兜底（防止旧 video 路径偶发残留）
    if (this._explosionResolve) {
      const r = this._explosionResolve
      this._explosionResolve = null
      r()
    }
    this.onExplosionFinished()
  }

  async _stageLeo () {
    this._setStage(STAGE.LEO)
    await this.monster.load(this._resolve('leo'))
    await new Promise(resolve => {
      this.monster.play({
        fps: 8,
        loop: false,
        onFrame: (currentFrame, frameCount) => this.onFrame({ stage: STAGE.LEO, currentFrame, frameCount }),
        onFinish: () => {
          this.onLeoFinished()
          resolve()
        }
      })
    })
    // FLY 推进由 start() 负责，不在这里 await
  }

  async _stageFly () {
    this._setStage(STAGE.FLY)
    await this.monster.load(this._resolve('fly'))
    this.monster.play({
      fps: 8,
      loop: true,
      onFrame: (currentFrame, frameCount) => this.onFrame({ stage: STAGE.FLY, currentFrame, frameCount })
    })
    // 飞行动画：水平滑出屏幕外（2 秒）
    const startX = this._walkEndX
    const startY = this._walkY
    const endX = window.innerWidth + 200
    const endY = startY
    const duration = 2000
    const startTs = performance.now()
    await new Promise(resolve => {
      const step = (ts) => {
        const t = Math.min(1, (ts - startTs) / duration)
        const eased = t * t // InQuad
        const x = startX + (endX - startX) * eased
        const y = startY + (endY - startY) * eased
        this.onWalkProgress({ ratio: 1, x, y })
        if (t >= 1) {
          this._flyRafId = 0
          this.onFlyFinished()
          resolve()
          return
        }
        this._flyRafId = requestAnimationFrame(step)
      }
      this._flyRafId = requestAnimationFrame(step)
    })
  }

  // 触发怪兽踹文件 + 同步爆炸（被 kick 阶段回调驱动）
  // 由于 onKickFrame 是同步触发，这里允许外部在脚部第 6 帧时调用
  triggerExplosion () {
    this._stageExplosion()
  }

  stop () {
    if (this._walkRafId) {
      cancelAnimationFrame(this._walkRafId)
      this._walkRafId = 0
    }
    if (this._flyRafId) {
      cancelAnimationFrame(this._flyRafId)
      this._flyRafId = 0
    }
    if (this.monster) this.monster.stop()
    if (this.explosion) this.explosion.stop()
    // 如果还在等用户确认，把 confirm promise 拒绝掉，让 start() 走 cancel 分支
    if (this._confirmReject) {
      const r = this._confirmReject
      this._confirmResolve = null
      this._confirmReject = null
      try { r(new Error('cancelled')) } catch (e) { /* ignore */ }
    }
    this.audio.stopAll()
    this._setStage(STAGE.IDLE)
  }
}
