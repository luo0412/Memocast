import { createDefaultEchoAnnoSource as createRuntimeDefaultAnnoSource } from './EchoRuntime'
import { banner, handlerExampleDoc, handlerAndExampleDoc, handlerPrelude } from './builtin-echo-shared'

// ============================================================================
// 内置回响（系统提供，固定不可删改）
// 用于设置弹框展示、layout 初始化以及运行时合并 echoCards。
//
// === 内部结构 ===
//   每个 echo-chant anno_source 由以下几段组成：
//     - banner 注释（描述这个 echo 做什么 / 影响谁 / 怎么传参）
//     - render(context)         决定回响卡片外观 + 写入 attrs 默认值
//     - handlerExample 字段     apply(chantNode, scopeContainer, meta) 模板；
//                              字段名带 Example 后缀，运行时不会自动注册为 handler。
//                              把字段名改成 handler 即可接管运行时副作用。
//
// === 共享代码 ===
//   banner() 与 handlerExampleDoc() 都从 './builtin-echo-shared' 导入，
//   三个工具函数（__resolveScopeContainer / __safeQueryAll / __withAttrs）
//   自动嵌入到 handlerExample 顶部，模仿者可直接使用。
//
// === jQuery 集成（2026-07 改造）===
//   apply 函数体里所有 DOM 调用都改用 jQuery 形式：$(node).addClass / .attr /
//   .css / .removeClass / .on / .off / .clone / .append / .before 等。
//   编译器（HANDLER_PRELUDE_SOURCE）会注入 `const $ = window.jQuery`，直接用即可，
//   无需在函数体里再写 const $ = ...。
// ============================================================================

// 默认 echo 的 anno_source 直接复用 EchoRuntime 内置版本（避免双源漂移）
const createDefaultEchoAnnoSource = (echoName = '回响') => createRuntimeDefaultAnnoSource(echoName)

// ============================================================================
// 1. nice：纯标记，无副作用（用 createDefaultEchoAnnoSource 即可）
// ============================================================================
//
// nice 的卡片源不像其他 10 个内置 rune 那样有 render / handler，因此单独提供一个
// createNiceAnnoSource：在 namespace / render(node, ancestors) / afterRender 三块结构的基础上，
// 在 attrs 末尾显式写入 inheritFromPrevious: false，让"默认不开启上一节点继承"的语义对齐。
const createNiceAnnoSource = () => `export default {
  kind: 'echo',
  version: 1,
  name: 'nice',
  namespace: '回响',

  // === 新模板签名（TODO 提议）：node + ancestors ===
  //   - node     : token = { type:'echo_anno', echoName, echoId, attrsParsed, prompt, raw, range, ... }
  //   - ancestors: { echo: echoCard, block, document, parent }
  // 默认与 createDefaultEchoAnnoSource 保持一致；attrs 末尾写入 inheritFromPrevious: false，
  // 让该回响走「默认不继承」路径（用户在自己的 anno_source 里改 inheritFromPrevious: true 即可开启）。
  render (node, ancestors) {
    const attrs = (node && node.attrsParsed) || {}
    const prompt = (node && node.prompt) || ''
    const echoMeta = (ancestors && ancestors.echo) || {}
    return {
      type: 'card',
      icon: attrs.icon || echoMeta.icon || 'thumb_up',
      color: attrs.color || echoMeta.color || '#4CAF50',
      title: attrs.title || echoMeta.name || 'nice',
      description: attrs.desc || echoMeta.desc || '标记为赞的内容',
      prompt,
      attrs: { ...attrs, inheritFromPrevious: false },
      html: attrs.html || ''
    }
  },

  // === 后渲染钩子：domElement 已插入到 DOM ===
  // 直接用 jQuery 操作节点，简洁明了。
  afterRender (node, domElement, ancestors) {
    $(domElement).addClass('ag-echo-default-mounted')
  }
}`

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
  kind: 'echo-chant',
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
      attrs: { ...attrs, kind: 'echo-chant', runeId: 'growth', scope: attrs.scope || 'siblings', trigger: attrs.trigger || 'auto', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--growth" data-rune-id="growth">生生不息</span>'
    }
  },

  ${handlerExampleDoc([
    '【示例模式】apply(chantNode, scopeContainer, meta) 返回 cleanup？',
    '   __resolveScopeContainer(node, scope)  按 4 种 scope 取目标容器',
    '   __safeQueryAll(root, sel)             容错 querySelectorAll（jQuery 版）',
    '   __withAttrs(meta, defaults)           meta.attrs 默认值合并'
  ])}
    const attrs = __withAttrs(meta, { scope: 'siblings', trigger: 'auto' })
    const targetSelector = attrs.target || '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table'
    const container = __resolveScopeContainer(chantNode, attrs.scope)
    if (!container) return () => {}

    const $targets = __safeQueryAll(container, targetSelector)
    $targets.each((i, el) => {
      $(el).addClass('ag-rune-growth-target')
      if (attrs.trigger === 'auto') {
        $(el).css('--ag-rune-growth-delay', (Math.min(i, 8) * 120) + 'ms')
      }
    })
    $(chantNode).addClass('ag-rune-growth-active')

    // 必须返回 cleanup：下一次重渲染 / 卸载时被调用，撤销副作用
    return () => {
      $targets.each((_i, el) => $(el).removeClass('ag-rune-growth-target'))
      $(chantNode).removeClass('ag-rune-growth-active')
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
  kind: 'echo-chant',
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
      attrs: { ...attrs, kind: 'echo-chant', runeId: 'shatter', target: attrs.target || 'line', neutraliseEchoes: true, inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--shatter" data-rune-id="shatter">破万法</span>'
    }
  },

  ${handlerExampleDoc([
    '【示例模式】target=line 关闭同段其他 echo；target=block 关闭整个 block'
  ])}
    const attrs = __withAttrs(meta, { target: 'line' })
    const useBlockScope = attrs.target === 'block'
    const container = useBlockScope
      ? ($(chantNode).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').get(0) || chantNode.parentElement)
      : __resolveScopeContainer(chantNode, 'siblings')
    if (!container) return () => {}

    const $echoes = __safeQueryAll(container, '[data-echo-inline="true"]').filter((_i, n) => n !== chantNode)
    $echoes.each((_i, n) => {
      $(n).attr('data-shatter-disabled', 'true').addClass('ag-rune-shatter-disabled')
    })
    $(chantNode).addClass('ag-rune-shatter-active')

    return () => {
      $echoes.each((_i, n) => {
        $(n).removeAttr('data-shatter-disabled').removeClass('ag-rune-shatter-disabled')
      })
      $(chantNode).removeClass('ag-rune-shatter-active')
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
  kind: 'echo-chant',
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
      attrs: { ...attrs, kind: 'echo-chant', runeId: 'skywalk', theme: attrs.theme || 'auto', layout: attrs.layout || 'enhanced', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--skywalk" data-rune-id="skywalk">天行健</span>'
    }
  },

  ${handlerExampleDoc([
    '【示例模式】document scope：记忆原值，cleanup 还原'
  ])}
    const attrs = __withAttrs(meta, { theme: 'auto', layout: 'enhanced' })
    const documentRoot = $(chantNode).closest('[data-echo-document], .mu-editor, article, [data-doc-id]').get(0) || scopeContainer || document.body
    if (!documentRoot) return () => {}

    // 记忆原值，cleanup 还原
    const $root = $(documentRoot)
    const prev = {
      theme: $root.attr('data-skywalk-theme') || null,
      layout: $root.attr('data-skywalk-layout') || null
    }
    $root.attr('data-skywalk-theme', attrs.theme).attr('data-skywalk-layout', attrs.layout)
    $(chantNode).addClass('ag-rune-skywalk-active')

    return () => {
      if (prev.theme === null) $root.removeAttr('data-skywalk-theme')
      else $root.attr('data-skywalk-theme', prev.theme)
      if (prev.layout === null) $root.removeAttr('data-skywalk-layout')
      else $root.attr('data-skywalk-layout', prev.layout)
      $(chantNode).removeClass('ag-rune-skywalk-active')
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
  kind: 'echo-chant',
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
      attrs: { ...attrs, kind: 'echo-chant', runeId: 'twinbloom', source: attrs.source || 'prev-block', placeholder: attrs.placeholder || '双生节点', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--twinbloom" data-rune-id="twinbloom">双生花</span>'
    }
  },

  ${handlerExampleDoc([
    '【示例模式】3 种 source：克隆位置 / 可见性标记',
    '  - 用 __resolveScopeContainer(., source) 直接复用 4 种 scope 的解析',
    '  - 给克隆块加 outline + 标记条，cleanup 时一并移除'
  ])}
    const $rune = $(chantNode)
    const attrs = __withAttrs(meta, { source: 'prev-block', placeholder: '双生节点' })
    const source = String(attrs.source || 'prev-block').toLowerCase()
    const placeholder = attrs.placeholder || '双生节点'

    // 拿当前 block（chantNode 所在的 paragraph / heading 等）
    const block = $rune.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').get(0) || chantNode.parentElement
    if (!block || !block.parentElement) return () => {}

    // 决定克隆源：
    //   prev-block / next-block：取相邻 block；clone-self：取当前 block
    let sourceNode = block
    let insertTarget = block
    if (source === 'prev-block') {
      const resolved = __resolveScopeContainer(chantNode, 'prev-block')
      if (resolved && resolved !== block) {
        sourceNode = resolved
        insertTarget = block  // 插入到当前 block 之后
      }
    } else if (source === 'next-block') {
      const $next = $(block).next()
      if ($next.length && $next.get(0) !== block) {
        sourceNode = $next.get(0)
        insertTarget = block
      }
    } else {
      sourceNode = block
      insertTarget = block
    }

    const twinId = $rune.attr('data-rune-id') || 'twinbloom'
    const sentinel = 'data-twinbloom-of'
    let cloned = null
    let insertedBefore = (source === 'next-block')
    let existedBefore = false
    {
      const $neighbor = $(insertTarget)[insertedBefore ? 'prev' : 'next']()
      if ($neighbor.length && $neighbor.attr(sentinel) === twinId) {
        cloned = $neighbor.get(0)
        existedBefore = true
      }
    }
    if (!cloned) {
      const $clone = $(sourceNode).clone(true)
      cloned = $clone.get(0)
      $(cloned)
        .attr(sentinel, twinId)
        .attr('data-twinbloom-source', source)
        .addClass('ag-rune-twinbloom-clone')
        .attr('contenteditable', 'false')
        .css({
          'outline': '2px dashed #8E24AA',
          'outline-offset': '2px',
          'position': $(cloned).css('position') || 'relative',
          'padding': $(cloned).css('padding') || '8px 12px',
          'border-radius': $(cloned).css('border-radius') || '6px',
          'background': 'rgba(142,36,170,0.06)'
        })

      // 在克隆块顶部追加一张 "🌸 双生花 · 双生节点" 标记条（仅一次）
      if (!$(cloned).find('[data-twinbloom-badge]').length) {
        const $badge = $('<div></div>')
          .attr('data-twinbloom-badge', twinId)
          .text('🌸 双生花 · ' + placeholder)
          .css({
            'font-size': '11px',
            'color': '#8E24AA',
            'padding': '2px 8px',
            'background': 'rgba(142,36,170,.12)',
            'border': '1px solid rgba(142,36,170,.4)',
            'border-radius': '4px',
            'display': 'inline-block',
            'margin-bottom': '6px'
          })
        $(cloned).prepend($badge)
      }

      // 若克隆源是 prev-block 但 prev-block 全空，用 placeholder 文本填充
      if (source === 'prev-block' && !$(cloned).text().trim()) {
        $(cloned).text(placeholder)
      }

      // 插入：
      //   insertedBefore=true 时插入到 insertTarget 之前；否则插入到 insertTarget 之后
      if (insertedBefore) {
        $(insertTarget).before($(cloned))
      } else {
        $(insertTarget).after($(cloned))
      }
    }
    $(chantNode).addClass('ag-rune-twinbloom-active')

    return () => {
      if (!existedBefore && cloned && cloned.parentElement) {
        $(cloned).remove()
      }
      $(chantNode).removeClass('ag-rune-twinbloom-active')
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
  kind: 'echo-chant',
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
      attrs: { ...attrs, kind: 'echo-chant', runeId: 'mindsteal', mode: attrs.mode || 'override', targets: attrs.targets || '', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--mindsteal" data-rune-id="mindsteal">夺心魄</span>'
    }
  },

  ${handlerExampleDoc([
    '【示例模式】mode=disable 直接停掉动画，stack/override 由各 rune 自己解读'
  ])}
    const attrs = __withAttrs(meta, { mode: 'override', targets: '' })
    const targetsCsv = String(attrs.targets || '').trim()
    const targets = targetsCsv ? targetsCsv.split(',').map(s => s.trim()).filter(Boolean) : null
    const container = __resolveScopeContainer(chantNode, 'siblings')
    if (!container) return () => {}

    const $candidates = __safeQueryAll(container, '[data-rune-id]')
      .filter((_i, n) => n !== chantNode)
      .filter((_i, n) => !targets || targets.includes($(n).attr('data-rune-id')))

    $candidates.each((_i, n) => {
      $(n).attr('data-mindsteal-mode', attrs.mode)
      if (attrs.mode === 'disable') $(n).css('animation', 'none', 'important')
    })
    $(chantNode).addClass('ag-rune-mindsteal-active')

    return () => {
      $candidates.each((_i, n) => {
        $(n).removeAttr('data-mindsteal-mode').css('animation', '')
      })
      $(chantNode).removeClass('ag-rune-mindsteal-active')
    }
  }
}`

// ============================================================================
// 7. 强运（lucky）：点击触发 AI 校对（事件型）
// ============================================================================
const createLuckyAnnoSource = () => `export default {
  ${banner([
    '【强运 / lucky】 —— 点击触发 AI 校对，是"事件型 echo-chant"样板',
    '事件流：handler 给节点加 role=button / tabindex=0；点击时调用',
    '  window.__memocastEchoChantHandlers.lucky({chantNode, meta})，由应用层注册回调',
    '示例：@强运{model: "gpt-4o-mini", action: "ai-proofread"}(一键润色)',
    '模仿提示：把 handlerExample 改成 handler 后，再注册 window.__memocastEchoChantHandlers.lucky'
  ])},
  kind: 'echo-chant',
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
      attrs: { ...attrs, kind: 'echo-chant', runeId: 'lucky', action: attrs.action || 'ai-proofread', model: attrs.model || 'default', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--lucky" data-rune-id="lucky">强运</span>'
    }
  },

  ${handlerExampleDoc([
    '【示例模式】事件型 handler：cleanup 必须解绑 + 移除属性',
    '   handlerExample 给节点加 role=button / tabindex=0；click 与 Enter/Space 触发',
    '   callback 走 window.__memocastEchoChantHandlers.lucky（应用层注册）'
  ])}
    const attrs = __withAttrs(meta, { label: '点击触发 AI 校对' })
    const $rune = $(chantNode)
    $rune.css('cursor', 'pointer')
      .attr('role', 'button')
      .attr('tabindex', '0')
      .attr('title', attrs.label)
      .addClass('ag-rune-lucky-active')

    const trigger = async (ev) => {
      ev.preventDefault(); ev.stopPropagation()
      $rune.addClass('ag-rune-lucky-loading')
      try {
        const handler = (typeof window !== 'undefined')
          ? (window.__memocastEchoChantHandlers && window.__memocastEchoChantHandlers.lucky)
          : null
        if (typeof handler === 'function') await handler({ chantNode, meta, scopeContainer })
        else console.info('[lucky] no window.__memocastEchoChantHandlers.lucky registered')
      } catch (err) { console.error('[lucky] handler failed:', err) }
      finally { $rune.removeClass('ag-rune-lucky-loading') }
    }
    const onClick = (ev) => trigger(ev)
    const onKey = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') trigger(ev) }
    $rune.on('click', onClick).on('keydown', onKey)

    return () => {
      $rune.off('click', onClick).off('keydown', onKey)
        .removeClass('ag-rune-lucky-active ag-rune-lucky-loading')
        .css('cursor', '')
        .removeAttr('role').removeAttr('tabindex').removeAttr('title')
    }
  }
}`

// ============================================================================
// 8. 替罪（scapegoat）：作用域内的"救场位"
//   - 把最近的 block 标记为 ag-rune-scapegoat-standby（黄色描边 + "🛡️ 救场位"）
//   - 监听 window.error 与 ag:rune:error 事件，
//     一旦后续 rune 抛错 / DOM 异常，把它转成 ag-rune-scapegoat-injured（红边 + 错误描述）
//   - handler 清理时移除监听并清掉 standby/injured 状态。
// ============================================================================
const createScapegoatAnnoSource = () => `export default {
  ${banner([
    '【替罪 / scapegoat】 —— 作用域内的"救场位"',
    '回响种类：echo-chant（影响附近元素、做防灾 / 占位 / 兜底）',
    '语义：把最近 block 标为 standby；后续 echo / DOM 抛错时把 standby 转 injured，错误写到 data-scapegoat-error',
    '模仿提示：把 attr.intensity 改成 0.5 可以让 standby 默认变 injured（模拟"已知错误"）'
  ])},
  kind: 'echo-chant',
  runeId: 'scapegoat',
  version: 1,
  name: '替罪',

  render (node, ancestors) {
    const attrs = (node && node.attrsParsed) || {}
    const prompt = (node && node.prompt) || ''
    const echoMeta = (ancestors && ancestors.echo) || {}
    return {
      type: 'card',
      icon: attrs.icon || echoMeta.icon || 'shield',
      color: attrs.color || echoMeta.color || '#6D4C41',
      title: attrs.title || echoMeta.name || '替罪',
      description: attrs.desc || echoMeta.desc || '在作用域内接住后续 rune / DOM 抛出的错误，并以受伤态提示',
      prompt,
      attrs: { ...attrs, kind: 'echo-chant', runeId: 'scapegoat', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--scapegoat" data-rune-id="scapegoat">替罪</span>'
    }
  },

  ${handlerAndExampleDoc([
    'handler / handlerExample 同体；handler 在 afterRender 时被 EchoRuntime 注册接管',
    '—— 见 __resolveScopeContainer / __safeQueryAll / __withAttrs 三个 prelude helper',
    'cleanup：移除监听 + 移除 standby/injured 状态'
  ])},
    const block = __resolveScopeContainer(chantNode, 'block')
    if (!block) return () => {}
    const $block = $(block)

    const intensity = Number(meta && meta.attrs && meta.attrs.intensity) || 0
    if (intensity > 0) {
      $block.addClass('ag-rune-scapegoat-injured').attr('data-scapegoat-error', (meta && meta.attrs && meta.attrs.error) || 'pre-injured by intensity')
    } else {
      $block.addClass('ag-rune-scapegoat-standby')
    }

    const onError = (event) => {
      $block.removeClass('ag-rune-scapegoat-standby').addClass('ag-rune-scapegoat-injured').attr('data-scapegoat-error', (event && event.message) || 'unknown error')
    }
    const onRuneError = (event) => {
      const detail = event && event.detail
      if (!detail) return
      $block.removeClass('ag-rune-scapegoat-standby').addClass('ag-rune-scapegoat-injured').attr('data-scapegoat-rune-error', String(detail.runeId || 'unknown'))
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('error', onError, true)
      window.addEventListener('ag:rune:error', onRuneError)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('error', onError, true)
        window.removeEventListener('ag:rune:error', onRuneError)
      }
      $block.removeClass('ag-rune-scapegoat-standby ag-rune-scapegoat-injured')
        .removeAttr('data-scapegoat-error')
        .removeAttr('data-scapegoat-rune-error')
    }
  }
}`

// ============================================================================
// 9. 招灾（calamity）：echo-chant（随机染色）
// ============================================================================
const createCalamityAnnoSource = () => `export default {
  ${banner([
    '【招灾 / calamity】 —— "随机哥德"：作用域内随机给文字片段染上哥特渐变彩',
    '回响种类：echo-chant（影响附近元素、做染色 / 炫彩 / 动效）',
    '参数：intensity = 0.1-0.8 的小数（默认 0.3，最大 0.8）',
    'CSS 钩子：.ag-rune-calamity-gothic',
    '示例：@招灾{intensity: 0.5}(周围一半文字染彩)'
  ])},
  kind: 'echo-chant',
  runeId: 'calamity',
  version: 1,
  name: '招灾',

  render (node, ancestors) {
    const attrs = (node && node.attrsParsed) || {}
    const prompt = (node && node.prompt) || ''
    const echoMeta = (ancestors && ancestors.echo) || {}
    return {
      type: 'card',
      icon: attrs.icon || echoMeta.icon || 'thunderstorm',
      color: attrs.color || echoMeta.color || '#5E35B1',
      title: attrs.title || echoMeta.name || '招灾',
      description: attrs.desc || echoMeta.desc || '在作用域内随机给文字片段染上哥特渐变彩',
      prompt,
      attrs: { ...attrs, kind: 'echo-chant', runeId: 'calamity', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--calamity" data-rune-id="calamity">招灾</span>'
    }
  },

  ${handlerAndExampleDoc([
    'handler / handlerExample 同体；handler 在 afterRender 时被 EchoRuntime 注册接管',
    '—— 见 __resolveScopeContainer / __safeQueryAll / __sampleShuffle 三个 prelude helper',
    'cleanup：取消染彩 class'
  ])},
    const container = __resolveScopeContainer(chantNode, (meta && meta.attrs && meta.attrs.scope) || 'siblings')
    if (!container) return () => {}

    const intensity = Math.max(0.05, Math.min(0.8,
      Number(meta && meta.attrs && meta.attrs.intensity) || 0.3))

    const textHosts = __safeQueryAll(container, 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, dd, dt')
      .filter((_i, el) => el && el !== chantNode && $(el).text().trim().length >= 2)
      .get()
    const targetCount = Math.max(1, Math.floor(textHosts.length * intensity))
    const picked = __sampleShuffle(textHosts, targetCount)

    picked.forEach((el) => $(el).addClass('ag-rune-calamity-gothic'))
    return () => {
      picked.forEach((el) => $(el).removeClass('ag-rune-calamity-gothic'))
    }
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
  kind: 'echo-chant',
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
      attrs: { ...attrs, kind: 'echo-chant', runeId: 'disperse', density: attrs.density || 'loose', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--disperse" data-rune-id="disperse">离析</span>'
    }
  },

  ${handlerExampleDoc([
    '【示例模式】block scope 写 data-disperse-density；CSS 据此调整 line-height/margin'
  ])}
    const attrs = __withAttrs(meta, { density: 'loose' })
    const block = $(chantNode).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').get(0) || chantNode.parentElement
    if (!block) return () => {}
    const $block = $(block)

    const previous = $block.attr('data-disperse-density') || null
    $block.attr('data-disperse-density', attrs.density)
    $(chantNode).addClass('ag-rune-disperse-active')

    return () => {
      if (previous === null) $block.removeAttr('data-disperse-density')
      else $block.attr('data-disperse-density', previous)
      $(chantNode).removeClass('ag-rune-disperse-active')
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
    '  - 找到 chantNode.closest 的 block 容器',
    '  - 在容器内追加一个 span，每秒更新文本',
    '  - cleanup 必须 clearInterval + DOM 移除'
  ])},
  kind: 'echo-chant',
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
      attrs: { ...attrs, kind: 'echo-chant', runeId: 'clock', position: attrs.position || 'top-right', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--clock" data-rune-id="clock">报时</span>'
    }
  },

  // 【已实装 handler】—— 注意：内置 ECHO_CHANT_HANDLERS 没占这个 id，所以这里实装是安全的
  handler (chantNode, _container, _meta) {
    const $chant = $(chantNode)
    const $block = $chant.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').addBack().first()
    const block = $block.get(0)
    if (!block) return () => {}
    const previous = $block.attr('data-clock-active') || null
    $block.attr('data-clock-active', 'true')
    if (!$block.css('position')) $block.css('position', 'relative')
    const $tag = $('<span></span>')
      .addClass('ag-rune-clock-tag')
      .text(new Date().toLocaleTimeString())
      .css({
        'position': 'absolute',
        'top': '6px',
        'right': '8px',
        'padding': '1px 6px',
        'font-size': '11px',
        'background': 'rgba(57,73,171,.12)',
        'color': '#3949AB',
        'border-radius': '4px'
      })
    $block.append($tag)
    const timer = setInterval(() => {
      try { $tag.text(new Date().toLocaleTimeString()) } catch (error) { /* ignore */ }
    }, 1000)
    return () => {
      clearInterval(timer)
      $tag.remove()
      if (previous === null) $block.removeAttr('data-clock-active')
      else $block.attr('data-clock-active', previous)
    }
  }
}`

// ============================================================================
// 对外导出
// ============================================================================
export const BUILTIN_ECHO_CARDS = Object.freeze([
  Object.freeze({
    id: '__builtin_nice__',
    name: 'nice',
    desc: '标记为赞的内容',
    icon: 'thumb_up',
    color: '#4CAF50',
    anno_source: createNiceAnnoSource(),
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
    desc: '使附近符合条件的咏唱叠加或篡改某种制定的效果',
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
    desc: '在作用域内接住后续 echo / DOM 抛出的错误，并以受伤态提示',
    icon: 'shield',
    color: '#6D4C41',
    anno_source: createScapegoatAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_calamity__',
    name: '招灾',
    desc: '在作用域内随机给文字片段染上哥特渐变彩',
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
    desc: '演示：自定义 echo handler，在当前 block 注入悬浮时间标签',
    icon: 'schedule',
    color: '#3949AB',
    anno_source: createClockAnnoSource(),
    isBuiltin: true
  })
])

export const getDefaultEchoAnnoSource = createDefaultEchoAnnoSource

export const isBuiltinEcho = (echo = {}) => Boolean(echo && echo.isBuiltin)

// 11 个 echo-chant 内置 id 集中导出，方便外部按 runeId 查找
export const BUILTIN_ECHO_CHANT_IDS = Object.freeze([
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

export const isBuiltinEchoChantId = (runeId = '') => BUILTIN_ECHO_CHANT_IDS.includes(String(runeId || '').trim())
