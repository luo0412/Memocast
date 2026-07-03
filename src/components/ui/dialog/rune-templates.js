// Rune 模板函数 - 这些模板字符串必须放在 .js 文件中
// 如果放在 .vue 文件的 <script> 块里，Vue 模板编译器会错误解析其中的 </ 序列

const ESCAPED_TEMPLATE_CLOSE = '<\/'

// ===== 空白模板：标准 Vue SFC 格式 =====
export const createBlankTemplate = () => {
  return `<template>
  <div class="blank-page">
    <!-- HTML 结构区域 -->
    <p>Vue2 空白组件</p>
  </div>
</template>

<script>
export default {
  name: 'BlankDemo',
  // 接收父组件参数
  props: {},
  data() {
    return {
      // 响应式数据
    }
  },
  computed: {
    // 计算属性
  },
  watch: {
    // 数据监听
  },
  methods: {
    // 业务方法
  },
  // 生命周期钩子
  created() {},
  mounted() {},
  updated() {},
  destroyed() {}
}
<\/script>

<style lang="less" scoped>

</style>`
}

// ===== 输入框模板：blur 时触发 $emit('input') =====
export const createInputTemplate = () => {
  return `<template>
  <div class="rune-echo-demo">
    <input
      class="rune-echo-demo__input"
      :value="text"
      placeholder="输入内容，失焦同步数据"
      @blur="handleInput"
    />
  </div>
</template>

<script>
export default {
  props: {
    value: {
      type: [String, Number],
      default: null
    }
  },
  data() {
    return {
      text: this.value == null ? '' : String(this.value)
    }
  },
  watch: {
    value(next) {
      const normalized = next == null ? '' : String(next)
      if (normalized !== this.text) {
        this.text = normalized
      }
    }
  },
  methods: {
    handleInput(event) {
      const next = event && event.target ? String(event.target.value || '') : ''
      this.text = next
      this.$emit('input', next)
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-echo-demo__input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid rgba(126, 87, 194, 0.4);
  background: rgba(255, 255, 255, 0.9);
  font: inherit;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.rune-echo-demo__input:focus {
  border-color: #7E57C2;
  box-shadow: 0 0 0 2px rgba(126, 87, 194, 0.2);
}
</style>`
}

// ===== hel-micro：演示 this.$hel.preFetchLib 远程加载 =====
export const createHolyShieldTemplate = () => {
  return `<template>
  <div class="hel-micro">
    <input
      class="hel-micro__input"
      v-model="rawInput"
      placeholder="输入数字，失焦后显示结果"
      @blur="onInput"
    />
    <div class="hel-micro__result" v-if="result !== null">
      <span>num.random 结果：</span>
      <code>{{ result }}</code>
    </div>
  </div>
<\/template>

<script>
// hel-micro 远程加载：this.$hel 在 src/boot/hel-micro-renderer.js 中挂载
export default {
  props: {
    value: { type: [String, Number], default: null },
    runeId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    rune: { type: Object, default: null }
  },
  data() {
    return {
      rawInput: '',
      result: null,
      _debounceTimer: null
    }
  },
  watch: {
    value(next) {
      const s = next == null ? '' : String(next)
      if (s !== this.rawInput) this.rawInput = s
    }
  },
  methods: {
    async onInput() {
      clearTimeout(this._debounceTimer)
      this._debounceTimer = setTimeout(async () => {
        try {
          const lib = await this.$hel.preFetchLib('hel-tpl-remote-lib', '2.0.1')
          console.log('lib', lib)
          const n = parseFloat(this.rawInput)
          this.result = lib.num.random(n)
          this.$emit('input', String(this.result))
        } catch (e) {
          console.error('[hel-micro] load failed:', e)
          this.result = 'load failed'
        }
      }, 300)
    }
  },
  beforeDestroy() {
    clearTimeout(this._debounceTimer)
  }
}
<\/script>

<style lang="less" scoped>
.hel-micro {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 193, 7, 0.06);
  border: 1px dashed rgba(255, 193, 7, 0.4);
  font-family: inherit;
  color: inherit;
}
.hel-micro__input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 193, 7, 0.5);
  background: rgba(255, 255, 255, 0.9);
  font: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.hel-micro__input:focus {
  border-color: #FFB300;
  box-shadow: 0 0 0 2px rgba(255, 193, 7, 0.2);
}
.hel-micro__result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.7);
  background: rgba(255, 193, 7, 0.1);
  border-radius: 6px;
  padding: 6px 10px;
}
.hel-micro__result code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(255, 160, 0, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
  color: #E65100;
  font-weight: 600;
}
</style>`
}

// ===== 萤火虫：基于 CSS3 多只随机飞行 + 发光脉冲（参考博客园《使用 CSS3 实现萤火虫发光动画效果》） =====
export const createFireflyTemplate = () => {
  return `<template>
  <div class="rune-firefly-demo">
    <div class="rune-firefly-demo__sky">
      <div
        v-for="(fly, idx) in fireflies"
        :key="fly.id"
        class="rune-firefly-demo__firefly"
        :style="fly.style"
        :class="{ 'is-active': activeId === fly.id }"
        @click="onPickFly(fly, idx)"
      />
    </div>

    <div class="rune-firefly-demo__panel">
      <div class="rune-firefly-demo__title">
        <q-icon name="auto_awesome" color="amber" size="1.2em" class="q-mr-xs" />
        萤火虫之夜
      </div>
      <div class="rune-firefly-demo__desc">基于 CSS3 发光动画 + 多点随机飞行，参考博客园文章思路</div>
      <div class="rune-firefly-demo__meta">
        <span>数量: <code>{{ fireflies.length }}</code></span>
        <span>当前: <code>{{ activeId || '-' }}</code></span>
        <span>坐标: <code>{{ lastPicked || '-' }}</code></span>
      </div>
    </div>
  </div>
</template>

<script>
// 萤火虫符文：多只萤火虫在夜空随机飞行 + 脉冲发光
// 思路来自 https://www.cnblogs.com/ai888/p/18622910
export default {
  props: {
    value: { type: String, default: '' },
    runeId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    rune: { type: Object, default: null }
  },
  data() {
    return {
      activeId: '',
      lastPicked: '',
      fireflies: this._buildFireflies(8)
    }
  },
  mounted() {
    this._timer && clearInterval(this._timer)
    this._timer = setInterval(() => {
      this.fireflies = this.fireflies.map(f => ({
        ...f,
        style: this._randomStyle()
      }))
    }, 2200)
  },
  beforeDestroy() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },
  methods: {
    _buildFireflies(n) {
      const list = []
      for (let i = 0; i < n; i++) {
        list.push({
          id: 'firefly-' + (i + 1),
          style: this._randomStyle()
        })
      }
      return list
    },
    _randomStyle() {
      const x = Math.random() * 95
      const y = Math.random() * 90
      const delay = (Math.random() * 2).toFixed(2)
      const dur = (1.2 + Math.random() * 1.6).toFixed(2)
      const size = 10 + Math.round(Math.random() * 10)
      const hue = Math.random() > 0.5 ? 'ff0' : 'ffe066'
      return {
        left: x + '%',
        top: y + '%',
        width: size + 'px',
        height: size + 'px',
        animationDelay: delay + 's',
        animationDuration: dur + 's',
        '--firefly-color': '#' + hue
      }
    },
    onPickFly(fly, idx) {
      this.activeId = fly.id
      this.lastPicked = fly.id + ' (' + fly.style.left + ', ' + fly.style.top + ')'
      this.$emit('input', this.lastPicked)
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-firefly-demo {
  position: relative;
  width: 100%;
  height: 320px;
  border-radius: 12px;
  overflow: hidden;
  background: radial-gradient(ellipse at top, #0f2027 0%, #203a43 45%, #2c5364 100%);
  border: 1px solid rgba(255, 235, 130, 0.25);
  font-family: inherit;
  color: #fff8d6;
}
.rune-firefly-demo__sky {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.rune-firefly-demo__firefly {
  position: absolute;
  border-radius: 50%;
  background: #333;
  cursor: pointer;
  animation-name: firefly-glow, firefly-float;
  animation-iteration-count: infinite, infinite;
  animation-direction: alternate, alternate;
  animation-timing-function: ease-in-out, ease-in-out;
  transform: translate(-50%, -50%);
  transition: filter 0.2s;
}
.rune-firefly-demo__firefly::before,
.rune-firefly-demo__firefly::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.rune-firefly-demo__firefly::before {
  width: 100%;
  height: 100%;
  background: radial-gradient(circle, #fff, transparent);
  opacity: 0.3;
  animation: firefly-glow 1s infinite alternate;
}
.rune-firefly-demo__firefly::after {
  width: 80%;
  height: 80%;
  top: 10%;
  left: 10%;
  background: radial-gradient(circle, #f00, transparent);
  opacity: 0.6;
  animation: firefly-pulse 1s infinite alternate;
}
.rune-firefly-demo__firefly.is-active {
  filter: brightness(1.6) drop-shadow(0 0 6px #fff7a8);
}
@keyframes firefly-glow {
  0%   { box-shadow: 0 0 5px #333, 0 0 10px #333, 0 0 15px #333, 0 0 20px var(--firefly-color, #ff0); }
  100% { box-shadow: 0 0 10px #333, 0 0 20px var(--firefly-color, #ff0), 0 0 30px var(--firefly-color, #ff0), 0 0 40px var(--firefly-color, #ff0); }
}
@keyframes firefly-pulse {
  0%   { transform: scale(1); }
  100% { transform: scale(1.15); }
}
@keyframes firefly-float {
  0%   { margin-left: 0;    margin-top: 0; }
  25%  { margin-left: 12px; margin-top: -8px; }
  50%  { margin-left: -10px; margin-top: 6px; }
  75%  { margin-left: 6px;  margin-top: -4px; }
  100% { margin-left: 0;    margin-top: 0; }
}
.rune-firefly-demo__panel {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  z-index: 2;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  color: #fff8d6;
  font-size: 12px;
}
.rune-firefly-demo__title {
  display: flex;
  align-items: center;
  font-weight: 700;
  letter-spacing: 0.5px;
  font-size: 13px;
}
.rune-firefly-demo__desc {
  margin-top: 2px;
  font-size: 11px;
  opacity: 0.8;
}
.rune-firefly-demo__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.9;
}
.rune-firefly-demo__meta code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(255, 235, 130, 0.15);
  padding: 1px 5px;
  border-radius: 4px;
  color: #ffe066;
}
</style>`
}

// ===== 星河绘图：演示 this.$jxg 绑定 JSXGraph 绘制数学图形 =====
export const createJxgDemoTemplate = () => {
  return `<template>
  <div class="rune-jxg-demo">
    <div class="rune-jxg-demo__header">
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" class="rune-jxg-demo__icon">
        <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
      </svg>
      <span class="rune-jxg-demo__title">星河绘图</span>
    </div>
    <div class="rune-jxg-demo__desc">通过 this.$jxg 绘制数学坐标系与函数图像</div>

    <div id="jxgBox" ref="jxgBox" class="rune-jxg-demo__board"/>

    <div class="rune-jxg-demo__controls">
      <span class="rune-jxg-demo__hint">点击坐标轴上的点查看坐标值</span>
    </div>

    <div class="rune-jxg-demo__meta">
      <span>nodeId: <code>{{ nodeId || '-' }}</code></span>
      <span>runeId: <code>{{ runeId || '-' }}</code></span>
    </div>
  </div>
<\/template>

<script>
// 星河绘图符文：通过 this.$jxg 调用 JSXGraph 绘制坐标系和函数图像
// this.$jxg 在 src/boot/jxgraph.js 中挂载。
export default {
  props: {
    value: { type: [String, Number], default: null },
    runeId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    rune: { type: Object, default: null }
  },
  data() {
    return {
      board: null
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.initJxg()
    })
  },
  beforeDestroy() {
    if (this.board) {
      this.board.destroy && this.board.destroy()
      this.board = null
    }
  },
  methods: {
    initJxg() {
      const container = this.$refs.jxgBox
      if (!container || !this.$jxg) return
      if (this.board) {
        this.board.destroy && this.board.destroy()
      }
      this.board = this.$jxg.JSXGraph.initBoard('jxgBox', {
        boundingbox: [-6, 6, 6, -6],
        axis: true,
        grid: true,
        showNavigation: false
      })
      const p1 = this.board.create('point', [-1, 2], { name: 'A', color: '#2196F3', size: 4 })
      const p2 = this.board.create('point', [3, -2], { name: 'B', color: '#4CAF50', size: 4 })
      this.board.create('line', [p1, p2], { strokeColor: '#9C27B0', strokeWidth: 2 })
      this.board.create('functiongraph', [
        (x) => Math.sin(x) * 2,
        -5, 5
      ], { strokeColor: '#F44336', strokeWidth: 3, curveType: 'plot' })
      this.board.create('text', [4, 4, 'y = 2sin(x)'], { fontSize: 14, color: '#F44336' })
      this.board.on('down', (e) => {
        const pos = this.board.getUsrCoordsOfMouse(e)
        this.$emit('input', JSON.stringify({ x: pos[0].toFixed(2), y: pos[1].toFixed(2) }))
      })
    }
  }
}
<\/script>

<style lang="less" scoped>
.rune-jxg-demo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(33, 150, 243, 0.05);
  border: 1px solid rgba(33, 150, 243, 0.35);
  font-family: inherit;
  color: inherit;
}
.rune-jxg-demo__header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rune-jxg-demo__icon {
  color: #2196F3;
  flex-shrink: 0;
}
.rune-jxg-demo__title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: rgba(33, 150, 243, 0.9);
}
.rune-jxg-demo__desc {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  margin-top: -4px;
}
.rune-jxg-demo__board {
  width: 100%;
  height: 280px;
  border: 1px solid rgba(33, 150, 243, 0.25);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.rune-jxg-demo__controls {
  display: flex;
  align-items: center;
}
.rune-jxg-demo__hint {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.5);
  font-style: italic;
}
.rune-jxg-demo__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
}
.rune-jxg-demo__meta code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(33, 150, 243, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
}
.body--dark .rune-jxg-demo__board {
  background: #2a2a2a;
}
</style>`
}
