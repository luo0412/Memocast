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
    this._startLoop()
  },
  beforeDestroy () {
    if (this._tickHandle) cancelAnimationFrame(this._tickHandle)
    this._tickHandle = 0
  },
  methods: {
    _draw () {
      const ctx = this.$refs.canvas && this.$refs.canvas.getContext('2d')
      if (!ctx || !this.sprite || !this.sprite.isLoaded) return
      this.sprite.render(ctx)
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
