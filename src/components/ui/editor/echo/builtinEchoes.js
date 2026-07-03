import { createDefaultEchoAnnoSource as createRuntimeDefaultAnnoSource } from './EchoRuntime'

// 内置回响（系统提供，固定不可删改）
// 用于设置弹框展示、layout 初始化以及运行时合并 echoCards。
//
// === 内置语义类别 ===
//   marker     —— 纯标记（卡片提示），无副作用，例如 nice
//   rune       —— 符文型咒语，会对附近节点施加渲染/排版/AI 等运行时效果
//   rune-tbd   —— 占位型咒语，规则尚未敲定，先建数据以便后续补充
//
// === rune 系列的运行时副作用约定 ===
//   anno_source 的 render() 返回结构保持 { type, icon, color, title,
//   description, prompt, attrs, html, ... }。对于 rune 系列,会在后续版本里
//   由 EchoRuntime 识别 attrs.kind === 'rune' 时调用对应的副作用钩子（DOM
//   扫描 / 排版调整 / AI 调用）。当前 commit 阶段先保证数据与卡片完整呈现。

// 默认 echo 的 anno_source 直接复用 EchoRuntime 内置版本（避免双源漂移）
const createDefaultEchoAnnoSource = (echoName = '回响') => createRuntimeDefaultAnnoSource(echoName)

// ===== 生生不息：给附近符合条件的元素加上"生长"的动画特效 =====
const createGrowthAnnoSource = () => `export default {
  kind: 'rune',
  runeId: 'growth',
  version: 1,
  name: '生生不息',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'park',
      color: attrs.color || context.echo?.color || '#43A047',
      title: attrs.title || context.echo?.name || '生生不息',
      description: attrs.desc || context.echo?.desc || '为附近符合条件的元素加上生长的动画特效',
      prompt,
      attrs: { ...attrs, kind: 'rune', runeId: 'growth', scope: attrs.scope || 'siblings', trigger: attrs.trigger || 'auto' },
      html: '<span class="ag-rune ag-rune--growth" data-rune-id="growth">生生不息</span>'
    }
  }
}`

// ===== 破万法：使附近一行或一个块的回响作用都失效 =====
const createShatterAnnoSource = () => `export default {
  kind: 'rune',
  runeId: 'shatter',
  version: 1,
  name: '破万法',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'block',
      color: attrs.color || context.echo?.color || '#E53935',
      title: attrs.title || context.echo?.name || '破万法',
      description: attrs.desc || context.echo?.desc || '使附近一行或一个块的回响作用都失效',
      prompt,
      attrs: { ...attrs, kind: 'rune', runeId: 'shatter', target: attrs.target || 'line', neutraliseEchoes: true },
      html: '<span class="ag-rune ag-rune--shatter" data-rune-id="shatter">破万法</span>'
    }
  }
}`

// ===== 天行健：强化排版并指定某种主题 =====
const createSkywalkAnnoSource = () => `export default {
  kind: 'rune',
  runeId: 'skywalk',
  version: 1,
  name: '天行健',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'auto_awesome',
      color: attrs.color || context.echo?.color || '#1E88E5',
      title: attrs.title || context.echo?.name || '天行健',
      description: attrs.desc || context.echo?.desc || '强化排版并指定某种主题',
      prompt,
      attrs: { ...attrs, kind: 'rune', runeId: 'skywalk', theme: attrs.theme || 'auto', layout: attrs.layout || 'enhanced' },
      html: '<span class="ag-rune ag-rune--skywalk" data-rune-id="skywalk">天行健</span>'
    }
  }
}`

// ===== 双生花：复制上一个节点并占位 =====
const createTwinbloomAnnoSource = () => `export default {
  kind: 'rune',
  runeId: 'twinbloom',
  version: 1,
  name: '双生花',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'local_florist',
      color: attrs.color || context.echo?.color || '#8E24AA',
      title: attrs.title || context.echo?.name || '双生花',
      description: attrs.desc || context.echo?.desc || '复制上一个节点并占位',
      prompt,
      attrs: { ...attrs, kind: 'rune', runeId: 'twinbloom', source: attrs.source || 'prev-block', placeholder: attrs.placeholder || '双生节点' },
      html: '<span class="ag-rune ag-rune--twinbloom" data-rune-id="twinbloom">双生花</span>'
    }
  }
}`

// ===== 夺心魄：使附近符合条件的符文叠加或篡改某种制定的效果 =====
const createMindstealAnnoSource = () => `export default {
  kind: 'rune',
  runeId: 'mindsteal',
  version: 1,
  name: '夺心魄',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'psychology',
      color: attrs.color || context.echo?.color || '#F4511E',
      title: attrs.title || context.echo?.name || '夺心魄',
      description: attrs.desc || context.echo?.desc || '使附近符合条件的符文叠加或篡改某种制定的效果',
      prompt,
      attrs: { ...attrs, kind: 'rune', runeId: 'mindsteal', mode: attrs.mode || 'override', targets: attrs.targets || '' },
      html: '<span class="ag-rune ag-rune--mindsteal" data-rune-id="mindsteal">夺心魄</span>'
    }
  }
}`

// ===== 强运：点击后触发 AI 识别当前 MD 的错别字并修正 =====
const createLuckyAnnoSource = () => `export default {
  kind: 'rune',
  runeId: 'lucky',
  version: 1,
  name: '强运',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'casino',
      color: attrs.color || context.echo?.color || '#FB8C00',
      title: attrs.title || context.echo?.name || '强运',
      description: attrs.desc || context.echo?.desc || '点击后触发 AI 识别当前 Markdown 的错别字并修正',
      prompt,
      attrs: { ...attrs, kind: 'rune', runeId: 'lucky', action: attrs.action || 'ai-proofread', model: attrs.model || 'default' },
      html: '<span class="ag-rune ag-rune--lucky" data-rune-id="lucky">强运</span>'
    }
  }
}`

// ===== 替罪：待定（规则尚未敲定，先占位） =====
const createScapegoatAnnoSource = () => `export default {
  kind: 'rune-tbd',
  runeId: 'scapegoat',
  version: 1,
  name: '替罪',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'shield',
      color: attrs.color || context.echo?.color || '#6D4C41',
      title: attrs.title || context.echo?.name || '替罪',
      description: attrs.desc || context.echo?.desc || '规则待定',
      prompt,
      attrs: { ...attrs, kind: 'rune-tbd', runeId: 'scapegoat' },
      html: '<span class="ag-rune ag-rune--scapegoat" data-rune-id="scapegoat">替罪</span>'
    }
  }
}`

// ===== 招灾：待定（规则尚未敲定，先占位） =====
const createCalamityAnnoSource = () => `export default {
  kind: 'rune-tbd',
  runeId: 'calamity',
  version: 1,
  name: '招灾',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'thunderstorm',
      color: attrs.color || context.echo?.color || '#5E35B1',
      title: attrs.title || context.echo?.name || '招灾',
      description: attrs.desc || context.echo?.desc || '规则待定',
      prompt,
      attrs: { ...attrs, kind: 'rune-tbd', runeId: 'calamity' },
      html: '<span class="ag-rune ag-rune--calamity" data-rune-id="calamity">招灾</span>'
    }
  }
}`

// ===== 离析：使附近的元素使用更加宽松的排版 =====
const createDisperseAnnoSource = () => `export default {
  kind: 'rune',
  runeId: 'disperse',
  version: 1,
  name: '离析',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'call_split',
      color: attrs.color || context.echo?.color || '#00897B',
      title: attrs.title || context.echo?.name || '离析',
      description: attrs.desc || context.echo?.desc || '使附近的元素使用更加宽松的排版',
      prompt,
      attrs: { ...attrs, kind: 'rune', runeId: 'disperse', density: attrs.density || 'loose' },
      html: '<span class="ag-rune ag-rune--disperse" data-rune-id="disperse">离析</span>'
    }
  }
}`

// ===== 报时（clock）：演示"用户自定义 rune handler"的样板 —— 在容器内注入一个本地时间小标记 =====
const createClockAnnoSource = () => `export default {
  kind: 'rune',
  runeId: 'clock',
  version: 1,
  name: '报时',

  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'schedule',
      color: attrs.color || context.echo?.color || '#3949AB',
      title: attrs.title || context.echo?.name || '报时',
      description: attrs.desc || context.echo?.desc || '在容器右上角注入当前时间',
      prompt,
      attrs: { ...attrs, kind: 'rune', runeId: 'clock', position: attrs.position || 'top-right' },
      html: '<span class="ag-rune ag-rune--clock" data-rune-id="clock">报时</span>'
    }
  },

  // 自定义副作用：给当前 block 容器加一个悬浮的时间标签
  handler (runeNode, container, meta) {
    const block = runeNode.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote') || runeNode.parentElement
    if (!block) return () => {}
    const previous = block.getAttribute('data-clock-active')
    block.setAttribute('data-clock-active', 'true')
    block.style.position = block.style.position || 'relative'
    const tag = document.createElement('span')
    tag.className = 'ag-rune-clock-tag'
    tag.textContent = new Date().toLocaleTimeString()
    tag.style.cssText = 'position:absolute;top:6px;right:8px;padding:1px 6px;font-size:11px;background:rgba(57,73,171,.12);color:#3949AB;border-radius:4px;'
    block.appendChild(tag)
    const timer = setInterval(() => {
      try { tag.textContent = new Date().toLocaleTimeString() } catch (error) { /* ignore */ }
    }, 1000)
    return () => {
      clearInterval(timer)
      if (tag && tag.parentElement) tag.parentElement.removeChild(tag)
      if (previous === null) block.removeAttribute('data-clock-active')
      else block.setAttribute('data-clock-active', previous)
    }
  }
}`

export const BUILTIN_ECHO_CARDS = Object.freeze([
  Object.freeze({
    id: '__builtin_nice__',
    name: 'nice',
    desc: '标记为赞的内容',
    icon: 'thumb_up',
    color: '#4CAF50',
    anno_source: createDefaultEchoAnnoSource('nice'),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_growth__',
    name: '生生不息',
    desc: '给附近符合条件的元素加上生长的动画特效',
    icon: 'park',
    color: '#43A047',
    anno_source: createGrowthAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_shatter__',
    name: '破万法',
    desc: '使附近一行或一个块的回响作用都失效',
    icon: 'block',
    color: '#E53935',
    anno_source: createShatterAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_skywalk__',
    name: '天行健',
    desc: '强化排版并指定某种主题',
    icon: 'auto_awesome',
    color: '#1E88E5',
    anno_source: createSkywalkAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_twinbloom__',
    name: '双生花',
    desc: '复制上一个节点并占位',
    icon: 'local_florist',
    color: '#8E24AA',
    anno_source: createTwinbloomAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_mindsteal__',
    name: '夺心魄',
    desc: '使附近符合条件的符文叠加或篡改某种制定的效果',
    icon: 'psychology',
    color: '#F4511E',
    anno_source: createMindstealAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_lucky__',
    name: '强运',
    desc: '点击后触发 AI 识别当前 Markdown 的错别字并修正',
    icon: 'casino',
    color: '#FB8C00',
    anno_source: createLuckyAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_scapegoat__',
    name: '替罪',
    desc: '规则待定',
    icon: 'shield',
    color: '#6D4C41',
    anno_source: createScapegoatAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_calamity__',
    name: '招灾',
    desc: '规则待定',
    icon: 'thunderstorm',
    color: '#5E35B1',
    anno_source: createCalamityAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_disperse__',
    name: '离析',
    desc: '使附近的元素使用更加宽松的排版',
    icon: 'call_split',
    color: '#00897B',
    anno_source: createDisperseAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_clock__',
    name: '报时',
    desc: '演示：自定义 rune handler，在当前 block 注入悬浮时间标签',
    icon: 'schedule',
    color: '#3949AB',
    anno_source: createClockAnnoSource(),
    isBuiltin: true
  })
])

export const getDefaultEchoAnnoSource = createDefaultEchoAnnoSource

export const isBuiltinEcho = (echo = {}) => Boolean(echo && echo.isBuiltin)

// 11 个符文 / 替罪 / 招灾 / 离析 / 报时 元信息集中导出，方便外部按 runeId 查找
export const BUILTIN_RUNE_IDS = Object.freeze([
  'growth',
  'shatter',
  'skywalk',
  'twinbloom',
  'mindsteal',
  'lucky',
  'scapegoat',
  'calamity',
  'disperse',
  'clock'
])

export const isBuiltinRuneId = (runeId = '') => BUILTIN_RUNE_IDS.includes(String(runeId || '').trim())