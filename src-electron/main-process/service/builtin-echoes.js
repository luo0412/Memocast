/**
 * 内置回响 seed（自包含：不依赖任何外部目录的 require）。
 *
 * ⚠️ 本文件必须放在 src-electron/main-process/service/ 内（而不是 src/），
 *    否则 electron-builder 打包后 asar 跨目录相对路径会失效。
 *    同时严禁跨目录 require — 模板字符串全部 inline 在本文件内。
 *
 * 11 个 seed 元素与 src/components/ui/editor/echo/builtinEchoes.js 中
 * 导出的 BUILTIN_ECHO_CARDS 一一对应；以后如果改了 builtinEchoes.js 内的
 * 某个 anno_source，本文件也要同步更新。首启动时会 idempotent seed（按 id
 * 决定 INSERT 或 UPDATE），保证内置回响在 SQLite 中存在且最新。
 *
 * anno_source 与 BUILTIN_ECHO_CARDS 字段约定：
 *   - id         —— `__builtin_xxx__` 前缀，用于 UI 标记 isBuiltin
 *   - name       —— 显示名（与渲染端 BUILTIN_ECHO_CARDS 一致）
 *   - desc       —— 描述
 *   - icon       —— material icons
 *   - color      —— 16 进制颜色
 *   - anno_source —— 完整 export default {} 字符串，含 banner + render + handlerExample
 *   - render_type —— 固定 'anno'
 *   - category   —— 固定 'builtin'
 *   - sort_order —— 列表中显示顺序，值越小越靠前
 *
 * ★ 模仿者提示：anno_source 中 handler / handlerExample 字段详解见 renderer 端
 *   builtinEchoes.js 同位置的注释。这里只提供"双源对齐的 anno_source 字符串"。
 */

// banner() —— 与 renderer 端 builtinEchoes.js 同步使用
const banner = (lines) => `/* ===RUNE_BANNER_START===
${lines.map(line => ` * ${line}`).join('\n')}
 * ===RUNE_BANNER_END=== */`

// 默认 echo 的 anno_source —— 完整 export default {} 代码
const createDefaultEchoAnnoSource = (echoName = '回响') => `export default {
  kind: 'echo',
  version: 1,
  name: '${String(echoName || '回响').replace(/'/g, "\\'")}',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    const icon = attrs.icon || context.echo?.icon || 'graphic_eq'
    const color = attrs.color || context.echo?.color || '#26A69A'
    const title = attrs.title || context.echo?.name || '${String(echoName || '回响').replace(/'/g, "\\'")}'
    const description = attrs.desc || context.echo?.desc || ''

    return {
      type: 'card',
      icon,
      color,
      title,
      description,
      prompt,
      attrs,
      html: attrs.html || ''
    }
  }
}`

// ===== 1. nice：纯标记 =====
const niceAnnoSource = createDefaultEchoAnnoSource('nice')

// ===== 2. 生生不息（rune） — handlerExample 完整可读示例 =====
const growthAnnoSource = `export default {
  ${banner([
    '【生生不息 / growth】 —— 给附近符合条件的元素加上"生长"的动画特效',
    '影响范围（scope）：',
    '  - siblings(默认)   同段落或同 block 的兄弟节点（最常用）',
    '  - prev-block  前一块兄弟节点',
    '  - block       当前 block（含自身）',
    '  - document    整篇容器（用于主题级切换，一般交给 天行健）',
    '命中元素（target）：CSS 选择器，默认覆盖 p/pre/h1~h6/li/blockquote/table 等块级元素',
    '触发方式（trigger）：auto=自动 stagger；manual=需要配合外部触发器',
    '使用示例（写到 markdown）：',
    '  @生生不息{scope: "siblings", trigger: "manual", target: "p, li"}(春风吹又生)',
    '  ↑ scope / target / trigger 会通过 meta.attrs 传给 handler，可在 handler 内按需读取',
    '模仿提示：要把 handlerExample 字段名改成 handler 即可接管运行时'
  ])},
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
  },

  handlerExample: function (runeNode, scopeContainer, meta) {
    const attrs = (meta && meta.attrs) || {}
    const scope = attrs.scope || 'siblings'
    const trigger = attrs.trigger || 'auto'
    const targetSelector = attrs.target || '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table'
    const safeQueryAll = (root, sel) => Array.from((root || document).querySelectorAll(sel))
    const resolveScopeContainer = (node, sc) => {
      const block = node.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table') || node.parentElement
      switch ((sc || 'siblings').toLowerCase()) {
        case 'prev-block': return block && block.previousElementSibling || block
        case 'block':      return block
        case 'document':   return node.closest('[data-echo-document], .mu-editor, article') || document.body
        case 'siblings':
        default:           return block && block.parentElement || document.body
      }
    }
    const container = resolveScopeContainer(runeNode, scope)
    if (!container) return () => {}
    const targets = safeQueryAll(container, targetSelector)
    targets.forEach((node, i) => {
      node.classList.add('ag-rune-growth-target')
      if (trigger === 'auto') node.style.setProperty('--ag-rune-growth-delay', (Math.min(i, 8) * 120) + 'ms')
    })
    runeNode.classList.add('ag-rune-growth-active')
    return () => {
      targets.forEach(node => node.classList.remove('ag-rune-growth-target'))
      runeNode.classList.remove('ag-rune-growth-active')
    }
  }
}`

// ===== 3. 破万法（rune） =====
const shatterAnnoSource = `export default {
  ${banner([
    '【破万法 / shatter】 —— 让附近一行或一个块的回响作用都失效',
    '影响范围（target）：line(默认) 同一 paragraph 内 / block 整个当前 block',
    '使用示例：',
    '  @破万法{target: "block"}(此段一切回响失效)',
    '模仿提示：把 handlerExample 改名 handler 即可实装'
  ])},
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
  },

  handlerExample: function (runeNode, scopeContainer, meta) {
    const attrs = (meta && meta.attrs) || {}
    const target = attrs.target || 'line'
    const scope = target === 'block' ? 'block' : 'siblings'
    const container = scope === 'block'
      ? (runeNode.closest('[data-block-type], .mu-block, p, pre, li, blockquote') || runeNode.parentElement)
      : (runeNode.closest('[data-block-type], .mu-block, p, pre, li, blockquote')?.parentElement || scopeContainer)
    if (!container) return () => {}
    const echoes = Array.from(container.querySelectorAll('[data-echo-inline="true"]')).filter(n => n !== runeNode)
    echoes.forEach(n => { n.setAttribute('data-shatter-disabled', 'true'); n.classList.add('ag-rune-shatter-disabled') })
    runeNode.classList.add('ag-rune-shatter-active')
    return () => {
      echoes.forEach(n => { n.removeAttribute('data-shatter-disabled'); n.classList.remove('ag-rune-shatter-disabled') })
      runeNode.classList.remove('ag-rune-shatter-active')
    }
  }
}`

// ===== 4. 天行健（rune） =====
const skywalkAnnoSource = `export default {
  ${banner([
    '【天行健 / skywalk】 —— 强化排版并切换主题（document 级别）',
    '参数：theme(light/dark/sepia/auto) + layout(compact/enhanced/luxe)',
    'CSS 钩子：data-skywalk-theme / data-skywalk-layout',
    '示例：@天行健{theme: "sepia", layout: "luxe"}(本文走浓郁路线)'
  ])},
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
  },

  handlerExample: function (runeNode, scopeContainer, meta) {
    const attrs = (meta && meta.attrs) || {}
    const theme = attrs.theme || 'auto'
    const layout = attrs.layout || 'enhanced'
    const documentRoot = runeNode.closest('[data-echo-document], .mu-editor, article, [data-doc-id]') || scopeContainer || document.body
    if (!documentRoot) return () => {}
    const prev = {
      theme: documentRoot.getAttribute('data-skywalk-theme'),
      layout: documentRoot.getAttribute('data-skywalk-layout')
    }
    documentRoot.setAttribute('data-skywalk-theme', theme)
    documentRoot.setAttribute('data-skywalk-layout', layout)
    runeNode.classList.add('ag-rune-skywalk-active')
    return () => {
      prev.theme === null ? documentRoot.removeAttribute('data-skywalk-theme') : documentRoot.setAttribute('data-skywalk-theme', prev.theme)
      prev.layout === null ? documentRoot.removeAttribute('data-skywalk-layout') : documentRoot.setAttribute('data-skywalk-layout', prev.layout)
      runeNode.classList.remove('ag-rune-skywalk-active')
    }
  }
}`

// ===== 5. 双生花（rune） =====
const twinbloomAnnoSource = `export default {
  ${banner([
    '【双生花 / twinbloom】 —— 复制上一个节点生成占位（prev-block scope）',
    '参数：source=prev-block|next-block|clone-self；placeholder=占位文本',
    '示例：@双生花{placeholder: "请把上半段论点重述一遍"}()'
  ])},
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
  },

  handlerExample: function (runeNode, _scopeContainer, meta) {
    const attrs = (meta && meta.attrs) || {}
    const placeholder = attrs.placeholder || '双生节点'
    const block = runeNode.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote') || runeNode.parentElement
    if (!block) return () => {}
    const twinId = runeNode.getAttribute('data-rune-id') || 'twinbloom'
    if (block.nextElementSibling && block.nextElementSibling.getAttribute('data-twinbloom-of') === twinId) return () => {}
    const cloned = block.cloneNode(true)
    cloned.setAttribute('data-twinbloom-of', twinId)
    cloned.classList.add('ag-rune-twinbloom-clone')
    cloned.setAttribute('data-twinbloom-placeholder', placeholder)
    if (!(cloned.textContent || '').trim()) cloned.textContent = placeholder
    block.parentElement && block.parentElement.insertBefore(cloned, block.nextSibling)
    runeNode.classList.add('ag-rune-twinbloom-active')
    return () => {
      if (cloned.parentElement) cloned.parentElement.removeChild(cloned)
      runeNode.classList.remove('ag-rune-twinbloom-active')
    }
  }
}`

// ===== 6. 夺心魄（rune） =====
const mindstealAnnoSource = `export default {
  ${banner([
    '【夺心魄 / mindsteal】 —— 篡改附近符合条件的符文效果',
    '参数：mode=override|stack|disable；targets=其它 runeId（逗号分隔）',
    '示例：@夺心魄{mode: "disable", targets: "growth,skywalk"}(覆盖附近的生长与主题)'
  ])},
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
  },

  handlerExample: function (runeNode, scopeContainer, meta) {
    const attrs = (meta && meta.attrs) || {}
    const mode = attrs.mode || 'override'
    const targetsCsv = String(attrs.targets || '').trim()
    const targets = targetsCsv ? targetsCsv.split(',').map(s => s.trim()).filter(Boolean) : null
    const siblings = (runeNode.closest('[data-block-type], .mu-block, p, pre, li, blockquote')?.parentElement) || scopeContainer
    if (!siblings) return () => {}
    const candidates = Array.from(siblings.querySelectorAll('[data-rune-id]'))
      .filter(n => n !== runeNode)
      .filter(n => !targets || targets.includes(n.getAttribute('data-rune-id')))
    candidates.forEach(n => {
      n.setAttribute('data-mindsteal-mode', mode)
      if (mode === 'disable') n.style.setProperty('animation', 'none', 'important')
    })
    runeNode.classList.add('ag-rune-mindsteal-active')
    return () => {
      candidates.forEach(n => { n.removeAttribute('data-mindsteal-mode'); n.style.removeProperty('animation') })
      runeNode.classList.remove('ag-rune-mindsteal-active')
    }
  }
}`

// ===== 7. 强运（rune）事件型样板 =====
const luckyAnnoSource = `export default {
  ${banner([
    '【强运 / lucky】 —— 点击触发 AI 校对，是"事件型 rune"样板',
    '事件流：handler 给节点加 role=button / tabindex=0；点击时调用',
    '  window.__memocastRuneHandlers.lucky({runeNode, meta})，由应用层注册回调',
    '示例：@强运{model: "gpt-4o-mini", action: "ai-proofread"}(一键润色)',
    '模仿提示：把 handlerExample 改成 handler 后，再注册 window.__memocastRuneHandlers.lucky'
  ])},
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
  },

  handlerExample: function (runeNode, scopeContainer, meta) {
    const attrs = (meta && meta.attrs) || {}
    const label = attrs.label || '点击触发 AI 校对'
    runeNode.style.cursor = 'pointer'
    runeNode.setAttribute('role', 'button')
    runeNode.setAttribute('tabindex', '0')
    runeNode.setAttribute('title', label)
    runeNode.classList.add('ag-rune-lucky-active')
    const trigger = async (ev) => {
      ev.preventDefault(); ev.stopPropagation()
      runeNode.classList.add('ag-rune-lucky-loading')
      try {
        const handler = (typeof window !== 'undefined') ? (window.__memocastRuneHandlers && window.__memocastRuneHandlers.lucky) : null
        if (typeof handler === 'function') await handler({ runeNode, meta, scopeContainer })
        else console.info('[lucky] no window.__memocastRuneHandlers.lucky registered')
      } catch (err) { console.error('[lucky] handler failed:', err) }
      finally { runeNode.classList.remove('ag-rune-lucky-loading') }
    }
    const onClick = (ev) => trigger(ev)
    const onKey = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') trigger(ev) }
    runeNode.addEventListener('click', onClick)
    runeNode.addEventListener('keydown', onKey)
    return () => {
      runeNode.removeEventListener('click', onClick)
      runeNode.removeEventListener('keydown', onKey)
      runeNode.classList.remove('ag-rune-lucky-active', 'ag-rune-lucky-loading')
      runeNode.style.cursor = ''
      runeNode.removeAttribute('role')
      runeNode.removeAttribute('tabindex')
      runeNode.removeAttribute('title')
    }
  }
}`

// ===== 8. 替罪（rune-tbd） =====
const scapegoatAnnoSource = `export default {
  ${banner([
    '【替罪 / scapegoat】 —— 占位符文（rune-tbd）',
    '回响种类：rune-tbd（兜底 handler 仅给节点加 active 标记）',
    '模仿提示：把 kind 改为 rune 并补一份完整 handler 即可接管'
  ])},
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
  },

  handlerExample: function (runeNode, _container, meta) {
    runeNode.classList.add('ag-rune-scapegoat-stub')
    console.info('[scapegoat] stub invoked, attrs =', meta && meta.attrs)
    return () => runeNode.classList.remove('ag-rune-scapegoat-stub')
  }
}`

// ===== 9. 招灾（rune-tbd） =====
const calamityAnnoSource = `export default {
  ${banner([
    '【招灾 / calamity】 —— 占位符文（rune-tbd）',
    '回响种类：rune-tbd（同 scapegoat）',
    '模仿提示：当 rule 敲定时把 kind 改成 rune，再补完整 handler'
  ])},
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
  },

  handlerExample: function (runeNode, _container, meta) {
    runeNode.classList.add('ag-rune-calamity-stub')
    console.info('[calamity] stub invoked, attrs =', meta && meta.attrs)
    return () => runeNode.classList.remove('ag-rune-calamity-stub')
  }
}`

// ===== 10. 离析（rune） =====
const disperseAnnoSource = `export default {
  ${banner([
    '【离析 / disperse】 —— 让附近元素使用更宽松排版（block 级别）',
    '参数：density=tight|normal|loose（loose 是默认）',
    'CSS 钩子：data-disperse-density',
    '示例：@离析{density: "tight"}(回归紧凑排版)'
  ])},
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
  },

  handlerExample: function (runeNode, _scopeContainer, meta) {
    const attrs = (meta && meta.attrs) || {}
    const density = attrs.density || 'loose'
    const block = runeNode.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote') || runeNode.parentElement
    if (!block) return () => {}
    const previous = block.getAttribute('data-disperse-density')
    block.setAttribute('data-disperse-density', density)
    runeNode.classList.add('ag-rune-disperse-active')
    return () => {
      previous === null ? block.removeAttribute('data-disperse-density') : block.setAttribute('data-disperse-density', previous)
      runeNode.classList.remove('ag-rune-disperse-active')
    }
  }
}`

// ===== 11. 报时（clock） —— 已实装 handler，作为"事件型 + 周期型"最小可运行示例 =====
const clockAnnoSource = `export default {
  ${banner([
    '【报时 / clock】 —— 11 个内置回响里唯一已实装 handler 的样板',
    '模仿提示：把这一段当成"事件型 + 周期型"handler 的最小可运行示例'
  ])},
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

  handler (runeNode, _container, _meta) {
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

/**
 * 11 个内置回响的有序列表。
 * ⚠️ 与 src/components/ui/editor/echo/builtinEchoes.js 的 BUILTIN_ECHO_CARDS 一一对应。
 *    改一处必须同步另一处；seed 时只 INSERT 不存在的 id，已有 row 保留用户/迁移数据。
 */
const BUILTIN_ECHO_CARDS = Object.freeze([
  Object.freeze({
    id: '__builtin_nice__',
    name: 'nice',
    desc: '标记为赞的内容',
    icon: 'thumb_up',
    color: '#4CAF50',
    anno_source: niceAnnoSource,
    sort_order: 0
  }),
  Object.freeze({
    id: '__builtin_growth__',
    name: '生生不息',
    desc: '给附近符合条件的元素加上生长的动画特效',
    icon: 'park',
    color: '#43A047',
    anno_source: growthAnnoSource,
    sort_order: 1
  }),
  Object.freeze({
    id: '__builtin_shatter__',
    name: '破万法',
    desc: '使附近一行或一个块的回响作用都失效',
    icon: 'block',
    color: '#E53935',
    anno_source: shatterAnnoSource,
    sort_order: 2
  }),
  Object.freeze({
    id: '__builtin_skywalk__',
    name: '天行健',
    desc: '强化排版并指定某种主题',
    icon: 'auto_awesome',
    color: '#1E88E5',
    anno_source: skywalkAnnoSource,
    sort_order: 3
  }),
  Object.freeze({
    id: '__builtin_twinbloom__',
    name: '双生花',
    desc: '复制上一个节点并占位',
    icon: 'local_florist',
    color: '#8E24AA',
    anno_source: twinbloomAnnoSource,
    sort_order: 4
  }),
  Object.freeze({
    id: '__builtin_mindsteal__',
    name: '夺心魄',
    desc: '使附近符合条件的符文叠加或篡改某种制定的效果',
    icon: 'psychology',
    color: '#F4511E',
    anno_source: mindstealAnnoSource,
    sort_order: 5
  }),
  Object.freeze({
    id: '__builtin_lucky__',
    name: '强运',
    desc: '点击后触发 AI 识别当前 Markdown 的错别字并修正',
    icon: 'casino',
    color: '#FB8C00',
    anno_source: luckyAnnoSource,
    sort_order: 6
  }),
  Object.freeze({
    id: '__builtin_scapegoat__',
    name: '替罪',
    desc: '规则待定',
    icon: 'shield',
    color: '#6D4C41',
    anno_source: scapegoatAnnoSource,
    sort_order: 7
  }),
  Object.freeze({
    id: '__builtin_calamity__',
    name: '招灾',
    desc: '规则待定',
    icon: 'thunderstorm',
    color: '#5E35B1',
    anno_source: calamityAnnoSource,
    sort_order: 8
  }),
  Object.freeze({
    id: '__builtin_disperse__',
    name: '离析',
    desc: '使附近的元素使用更加宽松的排版',
    icon: 'call_split',
    color: '#00897B',
    anno_source: disperseAnnoSource,
    sort_order: 9
  }),
  Object.freeze({
    id: '__builtin_clock__',
    name: '报时',
    desc: '演示：自定义 rune handler，在当前 block 注入悬浮时间标签',
    icon: 'schedule',
    color: '#3949AB',
    anno_source: clockAnnoSource,
    sort_order: 10
  })
])

module.exports = BUILTIN_ECHO_CARDS
