const { banner, handlerExampleDoc } = require('./builtin-echo-shared')

// ============================================================================
// 内置回响（系统提供，固定不可删改）
// 用于设置弹框展示、layout 初始化以及运行时合并 echoCards。
//
// === 内部结构 ===
//   每个 rune anno_source 由以下几段组成：
//     - banner 注释（描述这个 rune 做什么 / 影响谁 / 怎么传参）
//     - render(context)         决定回响卡片外观 + 写入 attrs 默认值
//     - handlerExample 字段     apply(runeNode, container, meta) 模板；
//                              字段名带 Example 后缀，运行时不会自动注册为 handler。
//                              把字段名改成 handler 即可接管运行时副作用。
//
// === 共享代码 ===
//   banner() 与 handlerExampleDoc() 都从 './builtin-echo-shared' 导入，
//   三个工具函数（__resolveScopeContainer / __safeQueryAll / __withAttrs）
//   自动嵌入到 handlerExample 顶部，模仿者可直接使用。
// ============================================================================

// 默认 echo 的 anno_source 直接复用 EchoRuntime 内置版本（避免双源漂移）
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
    return { type: 'card', icon, color, title, description, prompt, attrs, html: attrs.html || '' }
  }
}`

// ============================================================================
// 1. nice：纯标记，无副作用（用 createDefaultEchoAnnoSource 即可）
// ============================================================================

// ============================================================================
// 2. 生生不息（growth）：自动 stagger 生长动画
// ============================================================================
const createGrowthAnnoSource = () => `export default {
  ${banner([
    '【生生不息 / growth】 —— 给附近符合条件的元素加上"生长"的动画特效',
    '影响范围（scope）：',
    '  - siblings(默认)   同段落或同 block 的兄弟节点（最常用）',
    '  - prev-block  前一块兄弟节点',
    '  - block       当前 block（含自身）',
    '  - document    整篇容器（一般交给 天行健）',
    '命中元素（target）：CSS 选择器，默认覆盖 p/pre/h1~h6/li/blockquote/table',
    '触发方式（trigger）：auto=自动 stagger；manual=需要外部触发器',
    '使用示例：',
    '  @生生不息{scope: "siblings", trigger: "manual", target: "p, li"}(春风吹又生)',
    '模仿提示：把 handlerExample 字段名改成 handler 即可接管运行时'
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

  ${handlerExampleDoc([
    '【示例模式】apply(runeNode, scopeContainer, meta) 返回 cleanup？',
    '   __resolveScopeContainer(node, scope)  按 4 种 scope 取目标容器',
    '   __safeQueryAll(root, sel)             容错 querySelectorAll',
    '   __withAttrs(meta, defaults)           meta.attrs 默认值合并'
  ])}
    const attrs = __withAttrs(meta, { scope: 'siblings', trigger: 'auto' })
    const targetSelector = attrs.target || '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table'
    const container = __resolveScopeContainer(runeNode, attrs.scope)
    if (!container) return () => {}

    const targets = __safeQueryAll(container, targetSelector)
    targets.forEach((node, i) => {
      node.classList.add('ag-rune-growth-target')
      if (attrs.trigger === 'auto') {
        node.style.setProperty('--ag-rune-growth-delay', (Math.min(i, 8) * 120) + 'ms')
      }
    })
    runeNode.classList.add('ag-rune-growth-active')

    // 必须返回 cleanup：下一次重渲染 / 卸载时被调用，撤销副作用
    return () => {
      targets.forEach(node => node.classList.remove('ag-rune-growth-target'))
      runeNode.classList.remove('ag-rune-growth-active')
    }
  }
}`

// ============================================================================
// 3. 破万法（shatter）：让 nearby echo 失效
// ============================================================================
const createShatterAnnoSource = () => `export default {
  ${banner([
    '【破万法 / shatter】 —— 让附近一行或一个块的回响作用都失效',
    '影响范围（target）：line(默认) 同段落的兄弟 echo；block 整个当前 block',
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

  ${handlerExampleDoc([
    '【示例模式】target=line 关闭同段其他 echo；target=block 关闭整个 block'
  ])}
    const attrs = __withAttrs(meta, { target: 'line' })
    const useBlockScope = attrs.target === 'block'
    const container = useBlockScope
      ? (runeNode.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote') || runeNode.parentElement)
      : __resolveScopeContainer(runeNode, 'siblings')
    if (!container) return () => {}

    const echoes = __safeQueryAll(container, '[data-echo-inline="true"]').filter(n => n !== runeNode)
    echoes.forEach(n => {
      n.setAttribute('data-shatter-disabled', 'true')
      n.classList.add('ag-rune-shatter-disabled')
    })
    runeNode.classList.add('ag-rune-shatter-active')

    return () => {
      echoes.forEach(n => {
        n.removeAttribute('data-shatter-disabled')
        n.classList.remove('ag-rune-shatter-disabled')
      })
      runeNode.classList.remove('ag-rune-shatter-active')
    }
  }
}`

// ============================================================================
// 4. 天行健（skywalk）：document 级别排版主题
// ============================================================================
const createSkywalkAnnoSource = () => `export default {
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

  ${handlerExampleDoc([
    '【示例模式】document scope：记忆原值，cleanup 还原'
  ])}
    const attrs = __withAttrs(meta, { theme: 'auto', layout: 'enhanced' })
    const documentRoot = runeNode.closest('[data-echo-document], .mu-editor, article, [data-doc-id]') || scopeContainer || document.body
    if (!documentRoot) return () => {}

    // 记忆原值，cleanup 还原
    const prev = {
      theme: documentRoot.getAttribute('data-skywalk-theme'),
      layout: documentRoot.getAttribute('data-skywalk-layout')
    }
    documentRoot.setAttribute('data-skywalk-theme', attrs.theme)
    documentRoot.setAttribute('data-skywalk-layout', attrs.layout)
    runeNode.classList.add('ag-rune-skywalk-active')

    return () => {
      if (prev.theme === null) documentRoot.removeAttribute('data-skywalk-theme')
      else documentRoot.setAttribute('data-skywalk-theme', prev.theme)
      if (prev.layout === null) documentRoot.removeAttribute('data-skywalk-layout')
      else documentRoot.setAttribute('data-skywalk-layout', prev.layout)
      runeNode.classList.remove('ag-rune-skywalk-active')
    }
  }
}`

// ============================================================================
// 5. 双生花（twinbloom）：clone prev-block / next-block / current
//    这是用户最容易看出效果的 demo，特意把可见性做明显。
// ============================================================================
const createTwinbloomAnnoSource = () => `export default {
  ${banner([
    '【双生花 / twinbloom】 —— 复制前/后一个 block 并生成占位副本',
    '【核心】影响范围 source：',
    '  - prev-block(默认) 前一块 block；克隆插入到当前 block 之后',
    '  - next-block       下一块 block；克隆插入到当前 block 之前',
    '  - clone-self       克隆当前 block；插入到当前 block 之后',
    '参数：placeholder=占位文本（若 prev-block 无文本则用此填充）',
    '可见性：克隆段落会带 .ag-rune-twinbloom-clone class 与粉紫虚线 outline；',
    '  并在段落顶部贴一张 "🌸 双生花 · 双生节点" 标记条，便于直观确认已克隆。',
    '使用示例：',
    '  双生花1:  @双生花{source: "prev-block"}()                 ← 拷贝上方段落',
    '  双生花2:  @双生花{source: "prev-block", placeholder: "..."}() ← 带占位',
    '  双生花3:  @双生花{source: "next-block"}()                  ← 拷贝下方段落',
    '  双生花4:  @双生花{source: "clone-self"}()                  ← 克隆当前段落',
    '模仿提示：双生花的克隆是 readonly 的（contenteditable=false），',
    '  想重新编辑请双击克隆块使其解除 readonly，或直接删除重写。'
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

  ${handlerExampleDoc([
    '【示例模式】3 种 source：克隆位置 / 可见性标记',
    '  - 用 __resolveScopeContainer(., source) 直接复用 4 种 scope 的解析',
    '  - 给克隆块加 outline + 标记条，cleanup 时一并移除'
  ])}
    const attrs = __withAttrs(meta, { source: 'prev-block', placeholder: '双生节点' })
    const source = String(attrs.source || 'prev-block').toLowerCase()
    const placeholder = attrs.placeholder || '双生节点'

    // 拿当前 block（runeNode 所在的 paragraph / heading 等）
    const block = runeNode.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote') || runeNode.parentElement
    if (!block || !block.parentElement) return () => {}

    // 决定克隆源：
    //   prev-block / next-block：取相邻 block；clone-self：取当前 block
    let sourceNode = block
    let insertTarget = block
    if (source === 'prev-block') {
      const resolved = __resolveScopeContainer(runeNode, 'prev-block')
      if (resolved && resolved !== block) {
        sourceNode = resolved
        insertTarget = block  // 插入到当前 block 之后
      }
    } else if (source === 'next-block') {
      const next = block.nextElementSibling
      if (next && next !== block) {
        sourceNode = next
        insertTarget = block  // 插入到当前 block 之前（= 插到 insertTarget 之前）
      }
    } else {
      // clone-self：克隆当前 block，插入到当前之后
      sourceNode = block
      insertTarget = block
    }

    // 防重入：检查上一次插入的克隆
    const twinId = runeNode.getAttribute('data-rune-id') || 'twinbloom'
    const sentinel = 'data-twinbloom-of'
    let cloned = null
    let insertedBefore = (source === 'next-block')
    let existedBefore = false
    {
      const neighbor = insertedBefore ? insertTarget.previousElementSibling : insertTarget.nextElementSibling
      if (neighbor && neighbor.getAttribute(sentinel) === twinId) {
        cloned = neighbor
        existedBefore = true
      }
    }
    if (!cloned) {
      cloned = sourceNode.cloneNode(true)
      cloned.setAttribute(sentinel, twinId)
      cloned.setAttribute('data-twinbloom-source', source)
      cloned.classList.add('ag-rune-twinbloom-clone')
      // ★ 关键：用 style 直接加 outline / padding，让用户**直观看到克隆**，
      //   不会与源 block 混淆；并把段落标只读防止误编辑
      cloned.setAttribute('contenteditable', 'false')
      cloned.style.outline = '2px dashed #8E24AA'
      cloned.style.outlineOffset = '2px'
      cloned.style.position = cloned.style.position || 'relative'
      cloned.style.padding = cloned.style.padding || '8px 12px'
      cloned.style.borderRadius = cloned.style.borderRadius || '6px'
      cloned.style.background = 'rgba(142,36,170,0.06)'

      // 在克隆块顶部追加一张 "🌸 双生花 · 双生节点" 标记条（仅一次）
      if (!cloned.querySelector('[data-twinbloom-badge]')) {
        const badge = document.createElement('div')
        badge.setAttribute('data-twinbloom-badge', twinId)
        badge.textContent = '🌸 双生花 · ' + placeholder
        badge.style.cssText = 'font-size:11px;color:#8E24AA;padding:2px 8px;background:rgba(142,36,170,.12);border:1px solid rgba(142,36,170,.4);border-radius:4px;display:inline-block;margin-bottom:6px;'
        cloned.insertBefore(badge, cloned.firstChild)
      }

      // 若克隆源是 prev-block 但 prev-block 全空，用 placeholder 文本填充
      if (source === 'prev-block' && !(cloned.textContent || '').trim()) {
        cloned.textContent = placeholder
      }

      // 插入：
      //   insertedBefore=true 时插入到 insertTarget 之前；否则插入到 insertTarget 之后
      if (insertedBefore) {
        block.parentElement.insertBefore(cloned, insertTarget)
      } else {
        block.parentElement.insertBefore(cloned, insertTarget.nextSibling)
      }
    }
    runeNode.classList.add('ag-rune-twinbloom-active')

    return () => {
      if (!existedBefore && cloned && cloned.parentElement) {
        cloned.parentElement.removeChild(cloned)
      }
      runeNode.classList.remove('ag-rune-twinbloom-active')
    }
  }
}`

// ============================================================================
// 6. 夺心魄（mindsteal）：覆写 nearby rune 效果
// ============================================================================
const createMindstealAnnoSource = () => `export default {
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

  ${handlerExampleDoc([
    '【示例模式】mode=disable 直接停掉动画，stack/override 由各 rune 自己解读'
  ])}
    const attrs = __withAttrs(meta, { mode: 'override', targets: '' })
    const targetsCsv = String(attrs.targets || '').trim()
    const targets = targetsCsv ? targetsCsv.split(',').map(s => s.trim()).filter(Boolean) : null
    const container = __resolveScopeContainer(runeNode, 'siblings')
    if (!container) return () => {}

    const candidates = __safeQueryAll(container, '[data-rune-id]')
      .filter(n => n !== runeNode)
      .filter(n => !targets || targets.includes(n.getAttribute('data-rune-id')))

    candidates.forEach(n => {
      n.setAttribute('data-mindsteal-mode', attrs.mode)
      if (attrs.mode === 'disable') n.style.setProperty('animation', 'none', 'important')
    })
    runeNode.classList.add('ag-rune-mindsteal-active')

    return () => {
      candidates.forEach(n => {
        n.removeAttribute('data-mindsteal-mode')
        n.style.removeProperty('animation')
      })
      runeNode.classList.remove('ag-rune-mindsteal-active')
    }
  }
}`

// ============================================================================
// 7. 强运（lucky）：点击触发 AI 校对（事件型）
// ============================================================================
const createLuckyAnnoSource = () => `export default {
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

  ${handlerExampleDoc([
    '【示例模式】事件型 handler：cleanup 必须解绑 + 移除属性',
    '   handlerExample 给节点加 role=button / tabindex=0；click 与 Enter/Space 触发',
    '   callback 走 window.__memocastRuneHandlers.lucky（应用层注册）'
  ])}
    const attrs = __withAttrs(meta, { label: '点击触发 AI 校对' })
    runeNode.style.cursor = 'pointer'
    runeNode.setAttribute('role', 'button')
    runeNode.setAttribute('tabindex', '0')
    runeNode.setAttribute('title', attrs.label)
    runeNode.classList.add('ag-rune-lucky-active')

    const trigger = async (ev) => {
      ev.preventDefault(); ev.stopPropagation()
      runeNode.classList.add('ag-rune-lucky-loading')
      try {
        const handler = (typeof window !== 'undefined')
          ? (window.__memocastRuneHandlers && window.__memocastRuneHandlers.lucky)
          : null
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

// ============================================================================
// 8. 替罪（scapegoat）：rune-tbd 占位
// ============================================================================
const createScapegoatAnnoSource = () => `export default {
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

  ${handlerExampleDoc([
    '【stub 示例】仅打印、便于调试'
  ])}
    runeNode.classList.add('ag-rune-scapegoat-stub')
    console.info('[scapegoat] stub invoked, attrs =', meta && meta.attrs)
    return () => runeNode.classList.remove('ag-rune-scapegoat-stub')
  }
}`

// ============================================================================
// 9. 招灾（calamity）：rune-tbd 占位
// ============================================================================
const createCalamityAnnoSource = () => `export default {
  ${banner([
    '【招灾 / calamity】 —— 占位符文（rune-tbd）',
    '回响种类：rune-tbd（同 scapegoat）',
    '模仿提示：当规则敲定时把 kind 改为 rune，补上完整 handler'
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

  ${handlerExampleDoc([
    '【stub 示例】仅打印、便于调试'
  ])}
    runeNode.classList.add('ag-rune-calamity-stub')
    console.info('[calamity] stub invoked, attrs =', meta && meta.attrs)
    return () => runeNode.classList.remove('ag-rune-calamity-stub')
  }
}`

// ============================================================================
// 10. 离析（disperse）：让附近元素排版更宽松
// ============================================================================
const createDisperseAnnoSource = () => `export default {
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

  ${handlerExampleDoc([
    '【示例模式】block scope 写 data-disperse-density；CSS 据此调整 line-height/margin'
  ])}
    const attrs = __withAttrs(meta, { density: 'loose' })
    const block = runeNode.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote') || runeNode.parentElement
    if (!block) return () => {}

    const previous = block.getAttribute('data-disperse-density')
    block.setAttribute('data-disperse-density', attrs.density)
    runeNode.classList.add('ag-rune-disperse-active')

    return () => {
      if (previous === null) block.removeAttribute('data-disperse-density')
      else block.setAttribute('data-disperse-density', previous)
      runeNode.classList.remove('ag-rune-disperse-active')
    }
  }
}`

// ============================================================================
// 11. 报时（clock）：真正实装 handler 的样板（事件型 + 周期型）
// ============================================================================
const createClockAnnoSource = () => `export default {
  ${banner([
    '【报时 / clock】 —— 11 个内置回响里唯一已实装 handler 的样板',
    '模仿提示：把这一段当成"事件型 + 周期型"handler 的最小可运行示例',
    '  - 找到 runeNode.closest 的 block 容器',
    '  - 在容器内追加一个 span，每秒更新文本',
    '  - cleanup 必须 clearInterval + DOM 移除'
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

  // 【已实装 handler】—— 注意：内置 RUNE_HANDLERS 没占这个 id，所以这里实装是安全的
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

// ============================================================================
// 对外导出
// ============================================================================
const BUILTIN_ECHO_CARDS = Object.freeze([
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
    desc: '复制前/后一个 block 并生成占位副本',
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

const getDefaultEchoAnnoSource = createDefaultEchoAnnoSource

const isBuiltinEcho = (echo = {}) => Boolean(echo && echo.isBuiltin)

// 11 个符文元信息集中导出，方便外部按 runeId 查找
const BUILTIN_RUNE_IDS = Object.freeze([
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

const isBuiltinRuneId = (runeId = '') => BUILTIN_RUNE_IDS.includes(String(runeId || '').trim())

module.exports = {
  BUILTIN_ECHO_CARDS,
  getDefaultEchoAnnoSource,
  isBuiltinEcho,
  BUILTIN_RUNE_IDS,
  isBuiltinRuneId,
  createDefaultEchoAnnoSource
}
