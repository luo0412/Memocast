import { banner, handlerDoc } from './builtin-echo-shared.js'

// ============================================================================
// 内置回响（系统提供，固定不可删改）
// 用于设置弹框展示、layout 初始化以及运行时合并 echoCards。
//
// === 内部结构 ===
//   每个 echo-chant anno_source 由以下几段组成：
//     - banner 注释（描述这个 echo 做什么 / 影响谁 / 怎么传参）
//     - render(context)         决定回响卡片外观 + 写入 attrs 默认值
//     - handler(chantNode, scopeContainer, meta)  运行时副作用（jQuery 风格）
//                                后续会持续维护，不再使用 handlerExample 演示槽。
//
// === 分类约定（2026-07 调整）===
//   16 个内置回响分成两类：
//     - builtin（内置）：共 7 个 —— nice / peek / ignore / ad / diff / ref / todo
//                       都是「标记 / 排版 / 引用 / 待办」类的"基础内置"。
//     - showy（炫技）：  共 9 个 —— 生生不息 / 破万法 / 天行健 / 双生花 / 夺心魄
//                       / 强运 / 替罪 / 招灾 / 离析，都是"高级回响"，有运行时副作用。
//   用户自定义的回响默认归 marker（标记）或 typography（排版）分类。
//
// === 共享代码 ===
//   banner() 与 handlerDoc() 都从 './builtin-echo-shared' 导入，
//   handler 函数体内统一使用 jQuery，编译器（HANDLER_PRELUDE_SOURCE）会注入
//   `const $ = window.jQuery`，直接用即可。
// ============================================================================

// ============================================================================
// 1. nice：高亮行内除 @nice 之外的文本（<mark> 包裹）
// ============================================================================
// 示例：
//   - 你好世界 @nice              → li 内「你好世界」被 <mark> 包裹
//   # 今天天气真好 @nice           → h1 内文本被 <mark> 包裹
//   普通段落 xxx @nice              → p 内文本被 <mark> 包裹
const createNiceAnnoSource = () => `export default {
  ${banner([
    '【nice】 —— 把所在行 / block 内除 @nice 之外的节点用 <mark> 包裹',
    '使用示例：',
    '  - 你好世界 @nice              → li 内「你好世界」被 <mark> 高亮',
    '  # 今天天气真好 @nice          → h1 文本被 <mark> 高亮',
    '  普通段落 xxx @nice            → p 文本被 <mark> 高亮'
  ])},
  kind: 'echo-chant',
  id: 'nice',
  version: 1,
  name: 'nice',

  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'thumb_up',
      color: attrs.color || context.echo?.color || '#4CAF50',
      title: attrs.title || context.echo?.name || 'nice',
      description: attrs.desc || context.echo?.desc || '把所在行除 @nice 之外的文本用 <mark> 包裹',
      prompt,
      attrs: { ...attrs, kind: 'echo-chant', id: 'nice', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--nice" data-echo-chant-id="nice">nice</span>'
    }
  },

  ${handlerDoc([
    '【handler】把 block 内除 @nice 之外的节点用 <mark> 包起来；cleanup 时解包'
  ])}
    const $rune = $(chantNode)
    if (!$rune.length) return () => {}

    const $block = $rune.closest('li, p, pre, h1, h2, h3, h4, h5, h6, blockquote, [data-block-type], .mu-block').first()
    if (!$block.length || $block.attr('data-nice-marked')) return () => {}

    // 把 block 内除 @nice 自身 / 已有 mark / 其他 echo-chant 之外的节点，统一用 <mark> 包起来
    const targets = $block.contents().filter(function () {
      const $n = $(this)
      if (this === chantNode) return false
      if ($n.is('[data-echo-chant-id]')) return false
      if ($n.is('mark.ag-rune-nice-highlight')) return false
      // 跳过空白文本节点
      if (this.nodeType === 3 && !this.nodeValue.trim()) return false
      return true
    })

    const $mark = targets.length
      ? $('<mark class="ag-rune-nice-highlight"></mark>').append(targets)
      : $()
    if ($mark.length) $rune.after($mark)
    $rune.remove()
    $block.attr('data-nice-marked', 'true')

    return () => {
      if ($mark.length) $mark.replaceWith($mark.contents())
      $block.removeAttr('data-nice-marked')
    }
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
    '  @生生不息{scope: "siblings", trigger: "manual", target: "p, li"}(春风吹又生)'
  ])},
  kind: 'echo-chant',
  id: 'growth',
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
      attrs: { ...attrs, kind: 'echo-chant', id: 'growth', scope: attrs.scope || 'siblings', trigger: attrs.trigger || 'auto', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--growth" data-echo-chant-id="growth">生生不息</span>'
    }
  },

  ${handlerDoc([
    '【handler】自动给目标元素加生长动画；trigger=auto 时按 index 设置 stagger delay'
  ])}
    const attrs = Object.assign({ scope: 'siblings', trigger: 'auto', target: '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table' }, meta && meta.attrs || {})
    const targetSelector = attrs.target
    const $container = $(chantNode).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').parent()
    if (!$container.length) return () => {}
    const container = $container.get(0) || scopeContainer

    const $targets = $(container).find(targetSelector)
    $targets.each((i, el) => {
      $(el).addClass('ag-rune-growth-target')
      if (attrs.trigger === 'auto') {
        $(el).css('--ag-rune-growth-delay', (Math.min(i, 8) * 120) + 'ms')
      }
    })
    $(chantNode).addClass('ag-rune-growth-active')

    return () => {
      $targets.removeClass('ag-rune-growth-target').css('--ag-rune-growth-delay', '')
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
    '  @破万法{target: "block"}(此段一切回响失效)'
  ])},
  kind: 'echo-chant',
  id: 'shatter',
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
      attrs: { ...attrs, kind: 'echo-chant', id: 'shatter', target: attrs.target || 'line', neutraliseEchoes: true, inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--shatter" data-echo-chant-id="shatter">破万法</span>'
    }
  },

  ${handlerDoc([
    '【handler】target=line 时屏蔽同段 echo；target=block 时屏蔽整个 block 内的 echo'
  ])}
    const attrs = Object.assign({ target: 'line' }, meta && meta.attrs || {})
    const $rune = $(chantNode)
    const $scopeRoot = attrs.target === 'block'
      ? $rune.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote')
      : $rune.parent()
    if (!$scopeRoot.length) return () => {}

    const $echoes = $scopeRoot.find('[data-echo-inline="true"]').filter((_i, n) => n !== chantNode)
    $echoes.attr('data-shatter-disabled', 'true').addClass('ag-rune-shatter-disabled')
    $rune.addClass('ag-rune-shatter-active')

    return () => {
      $echoes.removeAttr('data-shatter-disabled').removeClass('ag-rune-shatter-disabled')
      $rune.removeClass('ag-rune-shatter-active')
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
  id: 'skywalk',
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
      attrs: { ...attrs, kind: 'echo-chant', id: 'skywalk', theme: attrs.theme || 'auto', layout: attrs.layout || 'enhanced', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--skywalk" data-echo-chant-id="skywalk">天行健</span>'
    }
  },

  ${handlerDoc([
    '【handler】document scope：记忆原 theme/layout，cleanup 时还原'
  ])}
    const attrs = Object.assign({ theme: 'auto', layout: 'enhanced' }, meta && meta.attrs || {})
    const $root = $(chantNode).closest('[data-echo-document], .mu-editor, article, [data-doc-id]').first()
    if (!$root.length) return () => {}
    const root = $root.get(0)
    const prev = {
      theme: root.getAttribute('data-skywalk-theme'),
      layout: root.getAttribute('data-skywalk-layout')
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
// 5. 双生花（twinbloom）：jQuery clone() 占位复制同行上一个 / 上一行元素
// ============================================================================
const createTwinbloomAnnoSource = () => `export default {
  ${banner([
    '【双生花 / twinbloom】 —— 用 jQuery .clone() 复制「上一个元素 / 上一行」作占位',
    '【核心】影响范围 source：',
    '  - prev-sibling(默认) 同行上一个 inline / element 兄弟节点；克隆后插在 @twinbloom 之后',
    '  - prev-line          上一行 block 节点（li / p / h1-h6 / pre / blockquote 等）；克隆后插在当前 block 之后',
    '  - next-line          下一行 block 节点；克隆后插在当前 block 之前',
    '参数：placeholder=占位文本（若被克隆节点没有可见文本则用此填充）',
    '可见性：克隆节点会带 .ag-rune-twinbloom-clone class 与粉紫虚线 outline',
    '使用示例：',
    '  双生花1:  - xxx @twinbloom                       ← 默认：克隆同行上一个元素',
    '  双生花2:  - xxx @twinbloom{source: "prev-line"} ← 克隆上一行 li/p/h1..',
    '  双生花3:  - xxx @twinbloom{source: "next-line"} ← 克隆下一行'
  ])},
  kind: 'echo-chant',
  id: 'twinbloom',
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
      description: attrs.desc || context.echo?.desc || '复制上一个元素 / 上一行节点作占位',
      prompt,
      attrs: { ...attrs, kind: 'echo-chant', id: 'twinbloom', source: attrs.source || 'prev-sibling', placeholder: attrs.placeholder || '双生节点', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--twinbloom" data-echo-chant-id="twinbloom">双生花</span>'
    }
  },

  ${handlerDoc([
    '【handler】jQuery .clone()：按 source 复制 prev-sibling / prev-line / next-line；cleanup 时移除克隆块'
  ])}
    const $rune = $(chantNode)
    if (!$rune.length) return () => {}

    const attrs = Object.assign({ source: 'prev-sibling', placeholder: '双生节点' }, meta && meta.attrs || {})
    const source = String(attrs.source || 'prev-sibling').toLowerCase()
    const placeholder = attrs.placeholder || '双生节点'
    const twinId = $rune.attr('data-echo-chant-id') || 'twinbloom'

    const $block = $rune.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}

    // 选源 + 插入位置
    let $src, $target, insertBefore = false
    if (source === 'prev-line' || source === 'prev-block') {
      $src = $block.prev()
      $target = $block
    } else if (source === 'next-line' || source === 'next-block') {
      $src = $block.next()
      $target = $block
      insertBefore = true
    } else {
      // 默认 prev-sibling：chantNode 紧邻的上一兄弟节点（排除 echo-chant 自身 / mark / rune-*）
      $src = $rune.prevAll(':not([data-echo-chant-id]):not(mark):not(.ag-rune)').first()
      if (!$src.length) $src = $block // fallback：克隆当前 block
      $target = $rune
    }
    if (!$src.length) return () => {}

    // 检查同 id 是否已克隆过
    const $neighbor = insertBefore ? $target.prev() : $target.next()
    let $clone = $neighbor.filter(function () { return this.getAttribute('data-twinbloom-of') === twinId })
    let existedBefore = $clone.length > 0

    if (!existedBefore) {
      $clone = $src.clone(true)
        .attr('data-twinbloom-of', twinId)
        .attr('data-twinbloom-source', source)
        .attr('contenteditable', 'false')
        .addClass('ag-rune-twinbloom-clone')
        .css({
          outline: '2px dashed #8E24AA',
          'outline-offset': '2px',
          'background-color': 'rgba(142,36,170,0.06)',
          'border-radius': '6px',
          padding: '8px 12px'
        })
      if (!$clone.find('[data-twinbloom-badge]').length) {
        $clone.prepend(
          $('<span></span>')
            .attr('data-twinbloom-badge', twinId)
            .text('🌸 双生花 · ' + placeholder)
            .css({
              'font-size': '11px',
              color: '#8E24AA',
              padding: '2px 8px',
              'background-color': 'rgba(142,36,170,.12)',
              border: '1px solid rgba(142,36,170,.4)',
              'border-radius': '4px',
              display: 'inline-block',
              'margin-bottom': '6px'
            })
        )
      }
      if (!$clone.text().replace(/🌸.*$/, '').trim()) {
        $clone.append(
          $('<span></span>').attr('data-twinbloom-placeholder', 'true').text(placeholder)
        )
      }
      insertBefore ? $target.before($clone) : $target.after($clone)
    }
    $rune.addClass('ag-rune-twinbloom-active')

    return () => {
      if (!existedBefore) $clone.remove()
      $rune.removeClass('ag-rune-twinbloom-active')
    }
  }
}`

// ============================================================================
// 6. 夺心魄（mindsteal）：覆写 nearby rune 效果
// ============================================================================
const createMindstealAnnoSource = () => `export default {
  ${banner([
    '【夺心魄 / mindsteal】 —— 篡改附近符合条件的符文效果',
    '参数：mode=override|stack|disable；targets=其它 id（逗号分隔）',
    '示例：@夺心魄{mode: "disable", targets: "growth,skywalk"}(覆盖附近的生长与主题)'
  ])},
  kind: 'echo-chant',
  id: 'mindsteal',
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
      attrs: { ...attrs, kind: 'echo-chant', id: 'mindsteal', mode: attrs.mode || 'override', targets: attrs.targets || '', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--mindsteal" data-echo-chant-id="mindsteal">夺心魄</span>'
    }
  },

  ${handlerDoc([
    '【handler】mode=disable 直接停掉动画；targets 为空时作用于所有 echo-chant'
  ])}
    const attrs = Object.assign({ mode: 'override', targets: '' }, meta && meta.attrs || {})
    const targetsCsv = String(attrs.targets || '').trim()
    const targets = targetsCsv ? targetsCsv.split(',').map(s => s.trim()).filter(Boolean) : null
    const $scope = $(chantNode).parent()
    if (!$scope.length) return () => {}

    const $candidates = $scope.find('[data-echo-chant-id]')
      .filter((_i, n) => n !== chantNode)
      .filter((_i, n) => !targets || targets.indexOf($(n).attr('data-echo-chant-id')) !== -1)

    $candidates.each((_i, n) => {
      $(n).attr('data-mindsteal-mode', attrs.mode)
      if (attrs.mode === 'disable') $(n).css('animation', 'none', 'important')
    })
    $(chantNode).addClass('ag-rune-mindsteal-active')

    return () => {
      $candidates.removeAttr('data-mindsteal-mode').css('animation', '')
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
    '示例：@强运{model: "gpt-4o-mini", action: "ai-proofread"}(一键润色)'
  ])},
  kind: 'echo-chant',
  id: 'lucky',
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
      attrs: { ...attrs, kind: 'echo-chant', id: 'lucky', action: attrs.action || 'ai-proofread', model: attrs.model || 'default', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--lucky" data-echo-chant-id="lucky">强运</span>'
    }
  },

  ${handlerDoc([
    '【handler】事件型：cleanup 必须解绑 + 移除属性',
    'callback 走 window.__memocastEchoChantHandlers.lucky（应用层注册）'
  ])}
    const attrs = Object.assign({ label: '点击触发 AI 校对' }, meta && meta.attrs || {})
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
// ============================================================================
const createScapegoatAnnoSource = () => `export default {
  ${banner([
    '【替罪 / scapegoat】 —— 作用域内的"救场位"',
    '回响种类：echo-chant（影响附近元素、做防灾 / 占位 / 兜底）',
    '语义：把最近 block 标为 standby；后续 echo / DOM 抛错时把 standby 转 injured，错误写到 data-scapegoat-error',
    '模仿提示：把 attr.intensity 改成 0.5 可以让 standby 默认变 injured（模拟"已知错误"）'
  ])},
  kind: 'echo-chant',
  id: 'scapegoat',
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
      attrs: { ...attrs, kind: 'echo-chant', id: 'scapegoat', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--scapegoat" data-echo-chant-id="scapegoat">替罪</span>'
    }
  },

  ${handlerDoc([
    'cleanup：移除监听 + 移除 standby/injured 状态'
  ])}
    const $block = $(chantNode).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').first()
    if (!$block.length) return () => {}

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
      $block.removeClass('ag-rune-scapegoat-standby').addClass('ag-rune-scapegoat-injured').attr('data-scapegoat-rune-error', String(detail.id || 'unknown'))
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
  id: 'calamity',
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
      attrs: { ...attrs, kind: 'echo-chant', id: 'calamity', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--calamity" data-echo-chant-id="calamity">招灾</span>'
    }
  },

  ${handlerDoc([
    'cleanup：取消染彩 class'
  ])}
    const scope = (meta && meta.attrs && meta.attrs.scope) || 'siblings'
    const $scope = scope === 'block'
      ? $(chantNode).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote')
      : $(chantNode).parent()
    if (!$scope.length) return () => {}

    const intensity = Math.max(0.05, Math.min(0.8,
      Number(meta && meta.attrs && meta.attrs.intensity) || 0.3))

    const textHosts = $scope.find('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, dd, dt')
      .filter((_i, el) => el && el !== chantNode && $(el).text().trim().length >= 2)
      .get()
    if (!textHosts.length) return () => {}

    const targetCount = Math.max(1, Math.floor(textHosts.length * intensity))
    // 简单 Fisher-Yates 抽样
    const pool = textHosts.slice()
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp
    }
    const picked = pool.slice(0, Math.min(targetCount, pool.length))

    $(picked).addClass('ag-rune-calamity-gothic')
    return () => {
      $(picked).removeClass('ag-rune-calamity-gothic')
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
  id: 'disperse',
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
      attrs: { ...attrs, kind: 'echo-chant', id: 'disperse', density: attrs.density || 'loose', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--disperse" data-echo-chant-id="disperse">离析</span>'
    }
  },

  ${handlerDoc([
    '【handler】block scope 写 data-disperse-density；CSS 据此调整 line-height/margin'
  ])}
    const attrs = Object.assign({ density: 'loose' }, meta && meta.attrs || {})
    const $block = $(chantNode).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}

    const previous = $block.attr('data-disperse-density')
    $block.attr('data-disperse-density', attrs.density)
    $(chantNode).addClass('ag-rune-disperse-active')

    return () => {
      if (previous === undefined) $block.removeAttr('data-disperse-density')
      else $block.attr('data-disperse-density', previous)
      $(chantNode).removeClass('ag-rune-disperse-active')
    }
  }
}`

// ============================================================================
// 11. peek：高亮展示内容，折叠展开
// ============================================================================
const createPeekAnnoSource = () => `export default {
  ${banner([
    '【peek】 —— 高亮展示内容，支持折叠展开',
    '参数：collapsed=true|false（默认 false），level=1-3（高亮强度）',
    'CSS 钩子：ag-rune-peek, ag-rune-peek-collapsed',
    '示例：@peek{collapsed: true}(折叠展示)'
  ])},
  kind: 'echo-chant',
  id: 'peek',
  version: 1,
  name: 'peek',

  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'visibility',
      color: attrs.color || context.echo?.color || '#FF7043',
      title: attrs.title || context.echo?.name || 'peek',
      description: attrs.desc || context.echo?.desc || '高亮展示内容，支持折叠展开',
      prompt,
      attrs: { ...attrs, kind: 'echo-chant', id: 'peek', collapsed: attrs.collapsed === true, level: attrs.level || 1, inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--peek" data-echo-chant-id="peek">peek</span>'
    }
  },

  ${handlerDoc([
    '【handler】添加高亮 class，可交互折叠'
  ])}
    const attrs = Object.assign({ collapsed: false, level: 1 }, meta && meta.attrs || {})
    const $rune = $(chantNode)
    const level = Math.max(1, Math.min(3, Number(attrs.level) || 1))
    $rune.addClass('ag-rune-peek ag-rune-peek-level-' + level)
    if (attrs.collapsed) $rune.addClass('ag-rune-peek-collapsed')
    return () => {
      $rune.removeClass('ag-rune-peek ag-rune-peek-collapsed ag-rune-peek-level-1 ag-rune-peek-level-2 ag-rune-peek-level-3')
    }
  }
}`

// ============================================================================
// 12. ignore：标记为可忽略内容
// ============================================================================
const createIgnoreAnnoSource = () => `export default {
  ${banner([
    '【ignore】 —— 标记为可忽略内容，视觉淡化',
    '参数：opacity=0.1-1（淡化透明度，默认 0.4）',
    'CSS 钩子：ag-rune-ignore',
    '示例：@ignore{opacity: 0.3}(淡化次要内容)'
  ])},
  kind: 'echo-chant',
  id: 'ignore',
  version: 1,
  name: 'ignore',

  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'visibility_off',
      color: attrs.color || context.echo?.color || '#90A4AE',
      title: attrs.title || context.echo?.name || 'ignore',
      description: attrs.desc || context.echo?.desc || '标记为可忽略内容，视觉淡化',
      prompt,
      attrs: { ...attrs, kind: 'echo-chant', id: 'ignore', opacity: attrs.opacity || 0.4, inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--ignore" data-echo-chant-id="ignore">ignore</span>'
    }
  },

  ${handlerDoc([
    '【handler】降低 block 透明度，cleanup 时还原'
  ])}
    const attrs = Object.assign({ opacity: 0.4 }, meta && meta.attrs || {})
    const $block = $(chantNode).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    const prevOpacity = $block.css('opacity') || '1'
    $block.addClass('ag-rune-ignore').css('opacity', attrs.opacity)
    return () => {
      $block.removeClass('ag-rune-ignore').css('opacity', prevOpacity)
    }
  }
}`

// ============================================================================
// 13. ad：插入广告占位或标注
// ============================================================================
const createAdAnnoSource = () => `export default {
  ${banner([
    '【ad】 —— 插入广告占位或标注为广告内容',
    '参数：type=banner|inline|sidebar（默认 banner）',
    'CSS 钩子：ag-rune-ad, ag-rune-ad-banner, ag-rune-ad-inline, ag-rune-ad-sidebar',
    '示例：@ad{type: "inline"}(内联广告标注)'
  ])},
  kind: 'echo-chant',
  id: 'ad',
  version: 1,
  name: 'ad',

  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'campaign',
      color: attrs.color || context.echo?.color || '#FFB300',
      title: attrs.title || context.echo?.name || 'ad',
      description: attrs.desc || context.echo?.desc || '插入广告占位或标注为广告内容',
      prompt,
      attrs: { ...attrs, kind: 'echo-chant', id: 'ad', type: attrs.type || 'banner', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--ad" data-echo-chant-id="ad">ad</span>'
    }
  },

  ${handlerDoc([
    '【handler】添加广告标记样式'
  ])}
    const attrs = Object.assign({ type: 'banner' }, meta && meta.attrs || {})
    const $block = $(chantNode).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    const adType = String(attrs.type || 'banner').toLowerCase()
    $block.addClass('ag-rune-ad ag-rune-ad-' + adType)
    return () => {
      $block.removeClass('ag-rune-ad ag-rune-ad-banner ag-rune-ad-inline ag-rune-ad-sidebar')
    }
  }
}`

// ============================================================================
// 14. diff：标记差异对比
// ============================================================================
const createDiffAnnoSource = () => `export default {
  ${banner([
    '【diff】 —— 标记差异对比内容',
    '参数：mode=add|remove|change（默认 change）',
    'CSS 钩子：ag-rune-diff, ag-rune-diff-add, ag-rune-diff-remove, ag-rune-diff-change',
    '示例：@diff{mode: "add"}(新增内容)'
  ])},
  kind: 'echo-chant',
  id: 'diff',
  version: 1,
  name: 'diff',

  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'difference',
      color: attrs.color || context.echo?.color || '#7E57C2',
      title: attrs.title || context.echo?.name || 'diff',
      description: attrs.desc || context.echo?.desc || '标记差异对比内容',
      prompt,
      attrs: { ...attrs, kind: 'echo-chant', id: 'diff', mode: attrs.mode || 'change', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--diff" data-echo-chant-id="diff">diff</span>'
    }
  },

  ${handlerDoc([
    '【handler】添加 diff 标记样式'
  ])}
    const attrs = Object.assign({ mode: 'change' }, meta && meta.attrs || {})
    const $block = $(chantNode).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    const diffMode = String(attrs.mode || 'change').toLowerCase()
    $block.addClass('ag-rune-diff ag-rune-diff-' + diffMode)
    return () => {
      $block.removeClass('ag-rune-diff ag-rune-diff-add ag-rune-diff-remove ag-rune-diff-change')
    }
  }
}`

// ============================================================================
// 15. ref：标记为参考资料
// ============================================================================
const createRefAnnoSource = () => `export default {
  ${banner([
    '【ref】 —— 标记为参考资料，可跳转链接',
    '参数：url=外部链接（可选），title=标题（可选）',
    'CSS 钩子：ag-rune-ref',
    '示例：@ref{url: "https://..."}(参考资料)'
  ])},
  kind: 'echo-chant',
  id: 'ref',
  version: 1,
  name: 'ref',

  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'link',
      color: attrs.color || context.echo?.color || '#29B6F6',
      title: attrs.title || context.echo?.name || 'ref',
      description: attrs.desc || context.echo?.desc || '标记为参考资料，可跳转链接',
      prompt,
      attrs: { ...attrs, kind: 'echo-chant', id: 'ref', url: attrs.url || '', inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--ref" data-echo-chant-id="ref">ref</span>'
    }
  },

  ${handlerDoc([
    '【handler】添加参考标记样式，可点击跳转'
  ])}
    const attrs = Object.assign({ url: '', title: '' }, meta && meta.attrs || {})
    const $rune = $(chantNode)
    $rune.addClass('ag-rune-ref')
    if (attrs.url) {
      $rune.css('cursor', 'pointer')
      $rune.on('click', (e) => {
        e.preventDefault()
        window.open(attrs.url, '_blank')
      })
    }
    return () => {
      $rune.removeClass('ag-rune-ref').css('cursor', '').off('click')
    }
  }
}`

// ============================================================================
// 16. todo：标记待办事项
// ============================================================================
const createTodoAnnoSource = () => `export default {
  ${banner([
    '【todo】 —— 标记待办事项，可交互勾选',
    '参数：checked=true|false（默认 false）',
    'CSS 钩子：ag-rune-todo, ag-rune-todo-checked',
    '示例：@todo{checked: false}(待完成事项)'
  ])},
  kind: 'echo-chant',
  id: 'todo',
  version: 1,
  name: 'todo',

  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    return {
      type: 'card',
      icon: attrs.icon || context.echo?.icon || 'check_box',
      color: attrs.color || context.echo?.color || '#26A69A',
      title: attrs.title || context.echo?.name || 'todo',
      description: attrs.desc || context.echo?.desc || '标记待办事项，可交互勾选',
      prompt,
      attrs: { ...attrs, kind: 'echo-chant', id: 'todo', checked: attrs.checked === true, inheritFromPrevious: false },
      html: '<span class="ag-rune ag-rune--todo" data-echo-chant-id="todo">todo</span>'
    }
  },

  ${handlerDoc([
    '【handler】添加待办标记样式'
  ])}
    const attrs = Object.assign({ checked: false }, meta && meta.attrs || {})
    const $block = $(chantNode).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    $block.addClass('ag-rune-todo')
    if (attrs.checked) $block.addClass('ag-rune-todo-checked')
    return () => {
      $block.removeClass('ag-rune-todo ag-rune-todo-checked')
    }
  }
}`

// ============================================================================
// 对外导出
// ============================================================================
export const BUILTIN_ECHO_CARDS = Object.freeze([
  // ===== 内置（基础） =====
  Object.freeze({
    id: '__builtin_nice__',
    name: 'nice',
    desc: '把所在行除 @nice 之外的文本用 <mark> 包裹（高亮）',
    icon: 'thumb_up',
    color: '#4CAF50',
    category: 'builtin',
    anno_source: createNiceAnnoSource(),
    isBuiltin: true
  }),
  // ===== 炫技（高级回响） =====
  Object.freeze({
    id: '__builtin_growth__',
    name: '生生不息',
    desc: '给附近符合条件的元素加上生长的动画特效',
    icon: 'park',
    color: '#43A047',
    category: 'showy',
    anno_source: createGrowthAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_shatter__',
    name: '破万法',
    desc: '使附近一行或一个块的回响作用都失效',
    icon: 'block',
    color: '#E53935',
    category: 'showy',
    anno_source: createShatterAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_skywalk__',
    name: '天行健',
    desc: '强化排版并指定某种主题',
    icon: 'auto_awesome',
    color: '#1E88E5',
    category: 'showy',
    anno_source: createSkywalkAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_twinbloom__',
    name: '双生花',
    desc: '复制前/后一个 block 并生成占位副本',
    icon: 'local_florist',
    color: '#8E24AA',
    category: 'showy',
    anno_source: createTwinbloomAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_mindsteal__',
    name: '夺心魄',
    desc: '使附近符合条件的咏唱叠加或篡改某种制定的效果',
    icon: 'psychology',
    color: '#F4511E',
    category: 'showy',
    anno_source: createMindstealAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_lucky__',
    name: '强运',
    desc: '点击后触发 AI 识别当前 Markdown 的错别字并修正',
    icon: 'casino',
    color: '#FB8C00',
    category: 'showy',
    anno_source: createLuckyAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_scapegoat__',
    name: '替罪',
    desc: '在作用域内接住后续 echo / DOM 抛出的错误，并以受伤态提示',
    icon: 'shield',
    color: '#6D4C41',
    category: 'showy',
    anno_source: createScapegoatAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_calamity__',
    name: '招灾',
    desc: '在作用域内随机给文字片段染上哥特渐变彩',
    icon: 'thunderstorm',
    color: '#5E35B1',
    category: 'showy',
    anno_source: createCalamityAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_disperse__',
    name: '离析',
    desc: '使附近的元素使用更加宽松的排版',
    icon: 'call_split',
    color: '#00897B',
    category: 'showy',
    anno_source: createDisperseAnnoSource(),
    isBuiltin: true
  }),
  // ===== 内置基础回响（标记类：peek / ignore / ad / diff / ref / todo） =====
  Object.freeze({
    id: '__builtin_peek__',
    name: 'peek',
    desc: '高亮展示内容，支持折叠展开',
    icon: 'visibility',
    color: '#FF7043',
    category: 'builtin',
    anno_source: createPeekAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_ignore__',
    name: 'ignore',
    desc: '标记为可忽略内容，视觉淡化',
    icon: 'visibility_off',
    color: '#90A4AE',
    category: 'builtin',
    anno_source: createIgnoreAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_ad__',
    name: 'ad',
    desc: '插入广告占位或标注为广告内容',
    icon: 'campaign',
    color: '#FFB300',
    category: 'builtin',
    anno_source: createAdAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_diff__',
    name: 'diff',
    desc: '标记差异对比内容',
    icon: 'difference',
    color: '#7E57C2',
    category: 'builtin',
    anno_source: createDiffAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_ref__',
    name: 'ref',
    desc: '标记为参考资料，可跳转链接',
    icon: 'link',
    color: '#29B6F6',
    category: 'builtin',
    anno_source: createRefAnnoSource(),
    isBuiltin: true
  }),
  Object.freeze({
    id: '__builtin_todo__',
    name: 'todo',
    desc: '标记待办事项，可交互勾选',
    icon: 'check_box',
    color: '#26A69A',
    category: 'builtin',
    anno_source: createTodoAnnoSource(),
    isBuiltin: true
  })
])

// 10 个 echo-chant 内置 id 集中导出，方便外部按 id 查找
export const BUILTIN_ECHO_CHANT_IDS = Object.freeze([
  'nice',
  'growth',
  'shatter',
  'skywalk',
  'twinbloom',
  'mindsteal',
  'lucky',
  'scapegoat',
  'calamity',
  'disperse',
  'peek',
  'ignore',
  'ad',
  'diff',
  'ref',
  'todo'
])

export const isBuiltinEchoChantId = (id = '') => BUILTIN_ECHO_CHANT_IDS.includes(String(id || '').trim())