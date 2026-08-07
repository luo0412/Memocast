// ============================================================================
// spriteAnimator.js —— 帧序列播放器（解构 MonsterDeleter/main.py 的
// SpriteAnimator/QPropertyAnimation 逻辑，移植到浏览器原生环境）
//
// 设计要点：
//   - 单一职责：拿到一张 spritesheet（5 列 × 3 行 = 15 帧，默认 FPS=8）
//     切帧后用 requestAnimationFrame 驱动播放。
//   - 跟原 PyQt 实现的差异：
//       * PyQt 用 QPixmap / QPainter；这里用 canvas + ImageBitmap 内存对象，
//         切帧在 ImageBitmap 上做（一帧对应一个 ImageBitmap，留在实例里缓存）。
//       * PyQt 用 QTimer 1000/fps 间隔；这里用 rAF + 累计 dt，保证不掉帧。
//       * PyQt 用 QMovie / QTransform.flip；这里用 canvas.drawImage + ctx.scale(-1, 1)。
//   - 与 Vue 解耦：导出纯 JS 类，单文件可被 Vue 组件 `methods` 引用；不依赖 jQuery。
// ============================================================================

const COLS = 5
const ROWS = 3
const DEFAULT_FPS = 8
const DEFAULT_TARGET_HEIGHT = 250

const clampIndex = (i, len) => Math.max(0, Math.min(len - 1, i))

// 一次性把所有帧切好，存在闭包内（每个动画器一份），避免每帧重切。
//   - meta = { width, height, frameW, frameH, bitmaps: ImageBitmap[] }
const sliceSpritesheet = async (image, {
  cols = COLS,
  rows = ROWS,
  targetHeight = DEFAULT_TARGET_HEIGHT,
  targetWidth = null, // 若指定，按 targetWidth 等比缩放（覆盖默认按 targetHeight 等比）
  frameIndices = null
} = {}) => {
  const naturalW = image.naturalWidth || image.width
  const naturalH = image.naturalHeight || image.height
  if (!naturalW || !naturalH) {
    throw new Error('[spriteAnimator] spritesheet 宽高无效')
  }
  const frameW = Math.floor(naturalW / cols)
  const frameH = Math.floor(naturalH / rows)
  // 等比缩放：默认按 targetHeight；如指定 targetWidth 则按 targetWidth（让爆炸缩到正方形 240x240）
  let scale
  if (targetWidth != null && targetWidth > 0) {
    scale = targetWidth / frameW
  } else {
    scale = targetHeight / frameH
  }
  const dstW = Math.round(frameW * scale)
  const dstH = Math.round(frameH * scale)
  const frameCount = cols * rows
  // 不再 createImageBitmap —— 直接保存原始 image + 切片矩形 + 目标尺寸，
  // render 时用 ctx.drawImage(image, sx, sy, sw, sh, 0, 0, dstW, dstH)。
  // 原因：createImageBitmap resize 在某些 PNG 上会丢失 alpha 细节（爆炸 spritesheet
  // 实测 frame 0 max alpha=94，但仍应保留原始像素；createImageBitmap 会把稀疏
  // alpha 进一步抹掉变 0）。drawImage 走原始 alpha。
  const slices = []
  for (let i = 0; i < frameCount; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    slices.push({
      sx: c * frameW,
      sy: r * frameH,
      sw: frameW,
      sh: frameH,
      dw: dstW,
      dh: dstH,
      src: image
    })
  }
  let frames = slices
  if (Array.isArray(frameIndices)) {
    frames = frameIndices
      .filter(i => Number.isInteger(i) && i >= 0 && i < slices.length)
      .map(i => slices[i])
  }
  return { frameW: dstW, frameH: dstH, frames }
}

export class SpriteAnimator {
  constructor () {
    this.frames = []
    this.currentFrame = 0
    this.loop = true
    this.flip = false
    this.fps = DEFAULT_FPS
    this._rafId = 0
    this._lastTimestamp = 0
    this._accumulator = 0
    this._onFrame = null
    this._onFinish = null
    this._loaded = false
  }

  get isLoaded () { return this._loaded && this.frames.length > 0 }
  get isPlaying () { return this._rafId !== 0 }
  get frameCount () { return this.frames.length }
  get size () {
    if (!this.frames.length) return { width: 0, height: 0 }
    const f = this.frames[0]
    // 兼容旧结构（ImageBitmap 有 width/height）和新结构（{dw, dh}）
    return { width: f.dw ?? f.width ?? 0, height: f.dh ?? f.height ?? 0 }
  }

  setFlip (flip) {
    this.flip = !!flip
  }

  async load (src, options = {}) {
    this._loaded = false
    this.stop()
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      // 不强制 crossOrigin —— file:// 协议下 'anonymous' 会让图片加载失败（CORS）
      // 同源 http/https 下默认就有 CORS 头；跨域场景可在 options 里强制开
      if (options.crossOrigin) i.crossOrigin = options.crossOrigin
      i.onload = () => resolve(i)
      i.onerror = (err) => reject(err)
      i.src = src
    })
    const { frames } = await sliceSpritesheet(img, options)
    this.frames = frames
    this.currentFrame = 0
    this._loaded = true
    return this
  }

  play ({ fps = DEFAULT_FPS, loop = true, onFrame, onFinish } = {}) {
    if (!this.isLoaded) return this
    this.fps = fps
    this.loop = loop
    this._onFrame = onFrame || null
    this._onFinish = onFinish || null
    this.currentFrame = 0
    this._lastTimestamp = 0
    this._accumulator = 0
    if (this._rafId) cancelAnimationFrame(this._rafId)
    this._rafId = requestAnimationFrame(this._tick)
    return this
  }

  stop () {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = 0
    }
  }

  reset () {
    this.stop()
    this.currentFrame = 0
    if (this._onFrame) this._onFrame(0, this.frames.length)
  }

  // 渲染到给定 canvas 上下文；canvas 大小自动适配第一帧尺寸
  render (ctx) {
    if (!this.isLoaded || !this.frames.length) return
    const frame = this.frames[clampIndex(this.currentFrame, this.frames.length)]
    if (!frame) return
    const canvas = ctx.canvas
    // frame 现在是 { sx, sy, sw, sh, dw, dh, src } —— 走 drawImage 9 参数版
    const w = frame.dw
    const h = frame.dh
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (this.flip) {
      ctx.save()
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(frame.src, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.dw, frame.dh)
      ctx.restore()
    } else {
      ctx.drawImage(frame.src, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.dw, frame.dh)
    }
  }

  _tick = (ts) => {
    if (!this._rafId) return
    if (!this._lastTimestamp) this._lastTimestamp = ts
    const dt = ts - this._lastTimestamp
    this._lastTimestamp = ts
    const interval = 1000 / this.fps
    this._accumulator += dt
    while (this._accumulator >= interval) {
      this._accumulator -= interval
      this._advanceFrame()
      if (!this._rafId) return // advanceFrame 中已经触发 stop
    }
    this._rafId = requestAnimationFrame(this._tick)
  }

  _advanceFrame () {
    if (!this.frames.length) return
    const next = this.currentFrame + 1
    if (next >= this.frames.length) {
      if (this.loop) {
        this.currentFrame = 0
        if (this._onFrame) this._onFrame(this.currentFrame, this.frames.length)
        return
      }
      this.currentFrame = this.frames.length - 1
      if (this._onFrame) this._onFrame(this.currentFrame, this.frames.length)
      this.stop()
      if (this._onFinish) this._onFinish()
      return
    }
    this.currentFrame = next
    if (this._onFrame) this._onFrame(this.currentFrame, this.frames.length)
  }
}

export default SpriteAnimator

// ============================================================================
// MonsterDeleter 原版常量镜像（动画阶段 / FPS / 切帧索引）
// ============================================================================
export const SPRITESHEET_LAYOUT = { COLS, ROWS, DEFAULT_FPS, DEFAULT_TARGET_HEIGHT }

export { DEFAULT_TARGET_HEIGHT }

// 阶段 2：指着文件——只播 11~14 帧（PyQt 源 frame_indices=[11,12,13,14]）
export const POINT_FRAME_INDICES = [11, 12, 13, 14]
