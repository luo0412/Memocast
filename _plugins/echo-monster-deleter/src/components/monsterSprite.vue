<!--
  monsterSprite.vue —— 单帧怪兽渲染器（走路 / 指 / 踹 / 雷欧 / 飞行 5 个动画共用）

  Props：
    - sprite:   SpriteAnimator 实例（已经 load 过 spritesheet）
    - x,y:      屏幕坐标（控制 div 位置；不在这里改 canvas 内部 transform）
    - mirror:   true 时水平翻转（PyQt `set_flip(True)` 替代）
  设计：
    - 用单个唯一的 <canvas> 把 SpriteAnimator.render(ctx) 输出的最新 frame 画出来。
    - 由 watcher.watch(sprite, ...) 在每次 currentFrame 变化时调用 render，避免 rAF 空转。
    - 父组件 MonsterStage 用 `position: absolute` 容器 + 两层 canvas（怪兽 + 爆炸）
      叠加实现 PyQt 里的多个 QLabel 行为。
-->

<template>
  <canvas
    ref="canvas"
    class="monster-sprite-canvas"
    :class="{ 'monster-sprite-mirror': mirror }"
    :style="{ left: x + 'px', top: y + 'px' }"
  />
</template>

<script>
export default {
  name: 'monsterSprite',
  props: {
    sprite: { type: Object, required: true },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    mirror: { type: Boolean, default: false }
  },
  data () {
    return { _tickHandle: 0 }
  },
  mounted () {
    console.log('[monsterSprite] mounted, sprite.isLoaded=', this.sprite && this.sprite.isLoaded, 'size=', this.sprite && this.sprite.size)
    this._syncCanvasSize()
    // 等一帧 dump 元素位置 + 大小
    this.$nextTick(() => {
      const c = this.$refs.canvas
      if (!c) return
      const rect = c.getBoundingClientRect()
      const parentRect = c.parentElement && c.parentElement.getBoundingClientRect()
      console.log('[monsterSprite] canvas bbox:', JSON.stringify({ x: rect.x, y: rect.y, w: rect.width, h: rect.height, attrW: c.width, attrH: c.height, styleW: c.style.width, styleH: c.style.height, parentX: parentRect && parentRect.x, parentY: parentRect && parentRect.y, parentW: parentRect && parentRect.width, parentH: parentRect && parentRect.height }))
    })
    this._startLoop()
  },
  beforeDestroy () {
    if (this._tickHandle) cancelAnimationFrame(this._tickHandle)
    this._tickHandle = 0
  },
  watch: {
    // sprite 异步 load 完成后 size 才有效，等下一帧再同步一次 canvas CSS
    'sprite.isLoaded' () { this._syncCanvasSize() },
    'sprite.currentFrame' () {
      // 调试用：每次帧变化打日志
      // console.log('[monsterSprite] frame=', this.sprite.currentFrame)
    }
  },
  methods: {
    _syncCanvasSize () {
      if (!this.$refs.canvas || !this.sprite || !this.sprite.isLoaded) return
      const { width, height } = this.sprite.size
      if (!width || !height) return
      this.$refs.canvas.style.width = width + 'px'
      this.$refs.canvas.style.height = height + 'px'
    },
    _draw () {
      const ctx = this.$refs.canvas && this.$refs.canvas.getContext('2d')
      if (!ctx || !this.sprite || !this.sprite.isLoaded) {
        return
      }
      const frame = this.sprite.frames[this.sprite.currentFrame]
      if (!frame) {
        console.warn('[monsterSprite] no frame at index', this.sprite.currentFrame, 'total=', this.sprite.frames.length)
        return
      }
      this.sprite.render(ctx)
      // 第一次 _draw 时 dump 像素统计，确认 drawImage 真的画上了像素
      if (!this._loggedPixelDump) {
        this._loggedPixelDump = true
        try {
          const data = ctx.getImageData(0, 0, this.$refs.canvas.width, this.$refs.canvas.height).data
          let nonZero = 0
          let opaque = 0
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) nonZero++
            if (data[i] > 200) opaque++
          }
          console.log('[monsterSprite] firstDraw stats: alpha>0 =', nonZero, '/', data.length / 4, '| alpha>200 =', opaque, '| canvas attr=', this.$refs.canvas.width, 'x', this.$refs.canvas.height, '| css=', this.$refs.canvas.style.width, 'x', this.$refs.canvas.style.height, '| frame=', this.sprite.currentFrame)
        } catch (e) {
          console.warn('[monsterSprite] pixel dump failed:', e.message)
        }
      }
    },
    _startLoop () {
      const loop = () => {
        this._draw()
        this._tickHandle = requestAnimationFrame(loop)
      }
      this._tickHandle = requestAnimationFrame(loop)
    }
  }
}
</script>

<style scoped>
.monster-sprite-canvas {
  position: absolute;
  pointer-events: none;
  image-rendering: pixelated;
}
.monster-sprite-mirror {
  /* 兜底：sprite 自身的 flip 已经在 render() 里用 ctx.scale(-1, 1) 处理；
     这里再加一道 CSS 防御以防外部强行改了 sprite.flip */
  transform: scaleX(-1);
  transform-origin: 50% 50%;
}
</style>
