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

// ===== 圣光庇护：演示 this.$hel.preFetchLib 远程加载 lodash =====
export const createHolyShieldTemplate = () => {
  return `<template>
  <div class="rune-holy-shield">
    <div class="rune-holy-shield__banner">
      <div class="rune-holy-shield__icon">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
        </svg>
      </div>
      <div class="rune-holy-shield__title">圣光庇护</div>
    </div>

    <div class="rune-holy-shield__desc">
      演示 hel-micro 远程加载 lodash
    </div>

    <div class="rune-holy-shield__input-row">
      <input
        class="rune-holy-shield__input"
        v-model="rawInput"
        placeholder="输入数字，每 300ms 防抖后显示结果"
        @blur="onInput"
      />
    </div>

    <div class="rune-holy-shield__result" v-if="result !== null">
      <span class="rune-holy-shield__result-label">lodash debounce 结果：</span>
      <code class="rune-holy-shield__result-value">{{ result }}</code>
    </div>

    <div class="rune-holy-shield__meta">
      <span>nodeId: <code>{{ nodeId || '-' }}</code></span>
      <span>runeId: <code>{{ runeId || '-' }}</code></span>
    </div>
  </div>
<\/template>

<script>
// 圣光庇护符文：通过 this.$hel.preFetchLib 远程加载 lodash
// hel-micro 会先从 CDN 拉取模块，缓存在内存中供后续调用复用。
// this.$hel 在 src/boot/hel-micro-renderer.js 中挂载。
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
          // hel-micro 会按 appName='hel-tpl-remote-lib' 从 CDN 拉取并缓存
          const lib = await this.$hel.preFetchLib('hel-tpl-remote-lib', '2.0.1')

          console.log('lib', lib)
          const n = parseFloat(this.rawInput)
          this.result = lib.num.random(n)
          this.$emit('input', String(this.result))
        } catch (e) {
          console.error('[HolyShield] lodash load failed:', e)
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
.rune-holy-shield {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 202, 40, 0.07);
  border: 1px solid rgba(255, 193, 7, 0.4);
  font-family: inherit;
  color: inherit;
}
.rune-holy-shield__banner {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rune-holy-shield__icon {
  color: #FFC107;
  display: flex;
  align-items: center;
}
.rune-holy-shield__title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: rgba(255, 160, 0, 0.9);
}
.rune-holy-shield__desc {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  margin-top: -4px;
}
.rune-holy-shield__input-row {
  display: flex;
}
.rune-holy-shield__input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 193, 7, 0.5);
  background: rgba(255, 255, 255, 0.92);
  font: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.rune-holy-shield__input:focus {
  border-color: #FFB300;
  box-shadow: 0 0 0 2px rgba(255, 193, 7, 0.18);
}
.rune-holy-shield__result {
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
.rune-holy-shield__result-label {
  font-weight: 500;
}
.rune-holy-shield__result-value {
  font-family: Consolas, Monaco, monospace;
  background: rgba(255, 160, 0, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
  color: #E65100;
  font-weight: 600;
}
.rune-holy-shield__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
}
.rune-holy-shield__meta code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(255, 193, 7, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
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
