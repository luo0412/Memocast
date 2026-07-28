// ============================================================================
// echoBuiltins —— 16 个内置回响（系统提供，固定不可删改）
//
// 每张卡片形态：
//   {
//     id, name, desc, icon, color, category,         // 元数据
//     propsSchema,                                    // form-create schema（来自 echoPropsSchema）
//     anno_source: '<export default {...}>'           // anno_source 字符串（render + afterRender）
//   }
//
// anno_source 字符串模板由 createBaseAnnoSource 工厂统一拼装：
//   - 前置 banner 注释（描述这个 echo 做什么 / 影响谁 / 怎么传参）
//   - render(node, props) 头部
//   - afterRender(node, props) 头 + handler body
//
// render / afterRender 函数体按 echo 卡片特性分别提供。
// ============================================================================

import { banner, handlerDoc } from './builtin-echo-shared.js'

// ---------------------------------------------------------------------------
// render(props) 工厂：直接产出 echo host HTML 字符串
//   - 元数据（type / field / title / version）由 createAnnoSource 顶层写死
//   - render() 只返回 HTML，不再打包 type/icon/color/... 那些运行时再补
// ---------------------------------------------------------------------------
const baseRender = (meta = {}) => `render (props = {}) {
    return '<span class="ag-rune ag-rune--${meta.id}" data-echo-chant-id="${meta.id}">${meta.name}</span>'
  }`

// ---------------------------------------------------------------------------
// 通用 afterRender 工厂（签名 (node, props) → cleanup|undefined，与旧版一致）
// ---------------------------------------------------------------------------
const baseAfterRender = (handlerBody = '', meta = {}) => `${handlerDoc([`【handler】${meta.handlerDesc || ''}`])}
    ${handlerBody}
  }`

// ---------------------------------------------------------------------------
// 把 meta + render + afterRender 拼装成 anno_source 字符串
//
// === 新结构（v2026-07-28 起固定）===
//   export default {
//     type: 'echo' | 'echo-chant' | 'echo-tbd',  // 顶层 type 直接承担分类语义
//     field: '<id>',                            // 顶层 field，原 id 的别名
//     title: '<name>',                          // 顶层 title，原 name 的别名
//     version: 1,
//     props: {                                   // ★ 实例可配置参数提到顶层
//       ...meta.propsDefaults,
//     },
//     render (props = {}) { ... },              // 只返回 HTML 字符串
//     afterRender (node, props = {}) { ... }    // 签名不变
//   }
// ---------------------------------------------------------------------------
const createAnnoSource = ({ meta, renderBody, handlerBody }) => `export default {
  ${banner(meta.banner || [])},
  type: '${meta.type}',
  field: '${meta.id}',
  title: '${meta.name}',
  version: 1,

  props: ${JSON.stringify(meta.propsDefaults || {})},

  ${renderBody},

  ${baseAfterRender(handlerBody, meta)}
}`

// ============================================================================
// 16 张内置卡片的 meta 数据
// ============================================================================
const BUILTIN_ECHO_META = [
  {
    id: 'nice', name: 'nice', icon: 'thumb_up', color: '#4CAF50', category: 'builtin', type: 'echo-chant',
    desc: '把所在行除 @nice 之外的文本用 <mark> 包裹',
    banner: ['【nice】 —— 把所在行 / block 内除 @nice 之外的节点用 <mark> 包裹',
      '使用示例：',
      '  - 你好世界 @nice              → li 内「你好世界」被 <mark> 高亮',
      '  # 今天天气真好 @nice          → h1 文本被 <mark> 高亮',
      '  普通段落 xxx @nice            → p 文本被 <mark> 高亮'],
    handlerDesc: '把 block 内除 @nice 之外的节点用 <mark> 包起来',
    handlerBody: `
    const $rune = $(node)
    if (!$rune.length) return
    const $prev = $rune.prev()
    if (!$prev.length) return
    const $parent = $prev.parent()
    if ($parent.attr('data-nice-marked')) return
    const $mark = $('<mark class="ag-rune-nice-highlight"></mark>').append($prev.clone())
    $prev.replaceWith($mark)
    $parent.attr('data-nice-marked', 'true')`
  },
  {
    id: 'growth', name: '生生不息', icon: 'park', color: '#43A047', category: 'showy', type: 'echo-chant',
    desc: '为附近符合条件的元素加上生长的动画特效',
    banner: ['【生生不息 / growth】 —— 给附近符合条件的元素加上"生长"的动画特效',
      '影响范围（scope）：',
      '  - siblings(默认)   同段落或同 block 的兄弟节点',
      '  - prev-block       前一块兄弟节点',
      '  - block            当前 block（含自身）',
      '  - document         整篇容器',
      '命中元素（target）：CSS 选择器，默认 p/pre/h1~h6/li/blockquote/table',
      '触发方式（trigger）：auto=自动 stagger；manual=需要外部触发器',
      '示例：@生生不息{scope: "siblings", trigger: "manual", target: "p, li"}(春风吹又生)'],
    handlerDesc: '自动给目标元素加生长动画；trigger=auto 时按 index 设置 stagger delay',
    propsDefaults: { scope: 'siblings', trigger: 'auto', target: '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table' },
    handlerBody: `
    const mergedProps = Object.assign({ scope: 'siblings', trigger: 'auto', target: '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table' }, props || {})
    const targetSelector = mergedProps.target
    const $container = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').parent()
    if (!$container.length) return () => {}
    const container = $container.get(0)
    const $targets = $(container).find(targetSelector)
    $targets.each((i, el) => {
      $(el).addClass('ag-rune-growth-target')
      if (mergedProps.trigger === 'auto') $(el).css('--ag-rune-growth-delay', (Math.min(i, 8) * 120) + 'ms')
    })
    $(node).addClass('ag-rune-growth-active')
    return () => {
      $targets.removeClass('ag-rune-growth-target').css('--ag-rune-growth-delay', '')
      $(node).removeClass('ag-rune-growth-active')
    }`
  },
  {
    id: 'shatter', name: '破万法', icon: 'block', color: '#E53935', category: 'showy', type: 'echo-chant',
    desc: '使附近一行或一个块的回响作用都失效',
    banner: ['【破万法 / shatter】 —— 让附近一行或一个块的回响作用都失效',
      '影响范围（target）：line(默认) 同段落的兄弟 echo；block 整个当前 block',
      '示例：@破万法{target: "block"}(此段一切回响失效)'],
    handlerDesc: 'target=line 时屏蔽同段 echo；target=block 时屏蔽整个 block 内的 echo',
    handlerBody: `
    const mergedProps = Object.assign({ target: 'line' }, props || {})
    const $rune = $(node)
    const $scopeRoot = mergedProps.target === 'block'
      ? $rune.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote')
      : $rune.parent()
    if (!$scopeRoot.length) return () => {}
    const $echoes = $scopeRoot.find('[data-echo-inline="true"]').filter((_i, n) => n !== node)
    $echoes.attr('data-shatter-disabled', 'true').addClass('ag-rune-shatter-disabled')
    $rune.addClass('ag-rune-shatter-active')
    return () => {
      $echoes.removeAttr('data-shatter-disabled').removeClass('ag-rune-shatter-disabled')
      $rune.removeClass('ag-rune-shatter-active')
    }`
  },
  {
    id: 'skywalk', name: '天行健', icon: 'auto_awesome', color: '#1E88E5', category: 'showy', type: 'echo-chant',
    desc: '强化排版并指定某种主题',
    banner: ['【天行健 / skywalk】 —— 强化排版并切换主题（document 级别）',
      '参数：theme(light/dark/sepia/auto) + layout(compact/enhanced/luxe)',
      'CSS 钩子：data-skywalk-theme / data-skywalk-layout',
      '示例：@天行健{theme: "sepia", layout: "luxe"}(本文走浓郁路线)'],
    handlerDesc: 'document scope：记忆原 theme/layout，cleanup 时还原',
    handlerBody: `
    const mergedProps = Object.assign({ theme: 'auto', layout: 'enhanced' }, props || {})
    const $root = $(node).closest('[data-echo-document], .mu-editor, article, [data-doc-id]').first()
    if (!$root.length) return () => {}
    const root = $root.get(0)
    const prev = {
      theme: root.getAttribute('data-skywalk-theme'),
      layout: root.getAttribute('data-skywalk-layout')
    }
    $root.attr('data-skywalk-theme', mergedProps.theme).attr('data-skywalk-layout', mergedProps.layout)
    $(node).addClass('ag-rune-skywalk-active')
    return () => {
      if (prev.theme === null) $root.removeAttr('data-skywalk-theme')
      else $root.attr('data-skywalk-theme', prev.theme)
      if (prev.layout === null) $root.removeAttr('data-skywalk-layout')
      else $root.attr('data-skywalk-layout', prev.layout)
      $(node).removeClass('ag-rune-skywalk-active')
    }`
  },
  {
    id: 'twinbloom', name: '双生花', icon: 'local_florist', color: '#8E24AA', category: 'showy', type: 'echo-chant',
    desc: '复制前/后一个 block 并生成占位副本',
    banner: ['【双生花 / twinbloom】 —— 用 jQuery .clone() 复制「上一个元素 / 上一行」作占位',
      '【核心】影响范围 source：',
      '  - prev-sibling(默认) 同行上一个 inline / element 兄弟节点',
      '  - prev-line          上一行 block 节点',
      '  - next-line          下一行 block 节点',
      '参数：placeholder=占位文本（若被克隆节点没有可见文本则用此填充）',
      '示例：@twinbloom{source: "prev-line"}(克隆上一行)'],
    handlerDesc: 'jQuery .clone()：按 source 复制 prev-sibling / prev-line / next-line；cleanup 时移除克隆块',
    handlerBody: `
    const $rune = $(node)
    if (!$rune.length) return () => {}
    const mergedProps = Object.assign({ source: 'prev-sibling', placeholder: '双生节点' }, props || {})
    const source = String(mergedProps.source || 'prev-sibling').toLowerCase()
    const placeholder = mergedProps.placeholder || '双生节点'
    const twinId = $rune.attr('data-echo-chant-id') || 'twinbloom'
    const $block = $rune.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    let $src, $target, insertBefore = false
    if (source === 'prev-line' || source === 'prev-block') {
      $src = $block.prev(); $target = $block
    } else if (source === 'next-line' || source === 'next-block') {
      $src = $block.next(); $target = $block; insertBefore = true
    } else {
      $src = $rune.prevAll(':not([data-echo-chant-id]):not(mark):not(.ag-rune)').first()
      if (!$src.length) $src = $block
      $target = $rune
    }
    if (!$src.length) return () => {}
    const $neighbor = insertBefore ? $target.prev() : $target.next()
    let $clone = $neighbor.filter(function () { return this.getAttribute('data-twinbloom-of') === twinId })
    let existedBefore = $clone.length > 0
    if (!existedBefore) {
      $clone = $src.clone(true)
        .attr('data-twinbloom-of', twinId)
        .attr('data-twinbloom-source', source)
        .attr('contenteditable', 'false')
        .addClass('ag-rune-twinbloom-clone')
        .css({ outline: '2px dashed #8E24AA', 'outline-offset': '2px',
          'background-color': 'rgba(142,36,170,0.06)', 'border-radius': '6px',
          padding: '8px 12px' })
      if (!$clone.find('[data-twinbloom-badge]').length) {
        $clone.prepend(
          $('<span></span>').attr('data-twinbloom-badge', twinId)
            .text('🌸 双生花 · ' + placeholder)
            .css({ 'font-size': '11px', color: '#8E24AA',
              padding: '2px 8px', 'background-color': 'rgba(142,36,170,.12)',
              border: '1px solid rgba(142,36,170,.4)', 'border-radius': '4px',
              display: 'inline-block', 'margin-bottom': '6px' })
        )
      }
      if (!$clone.text().replace(/🌸.*$/, '').trim()) {
        $clone.append($('<span></span>').attr('data-twinbloom-placeholder', 'true').text(placeholder))
      }
      insertBefore ? $target.before($clone) : $target.after($clone)
    }
    $rune.addClass('ag-rune-twinbloom-active')
    return () => {
      if (!existedBefore) $clone.remove()
      $rune.removeClass('ag-rune-twinbloom-active')
    }`
  },
  {
    id: 'mindsteal', name: '夺心魄', icon: 'psychology', color: '#F4511E', category: 'showy', type: 'echo-chant',
    desc: '使附近符合条件的咏唱叠加或篡改某种制定的效果',
    banner: ['【夺心魄 / mindsteal】 —— 篡改附近符合条件的符文效果',
      '参数：mode=override|stack|disable；targets=其它 id（逗号分隔）',
      '示例：@夺心魄{mode: "disable", targets: "growth,skywalk"}(覆盖附近的生长与主题)'],
    handlerDesc: 'mode=disable 直接停掉动画；targets 为空时作用于所有 echo-chant',
    handlerBody: `
    const mergedProps = Object.assign({ mode: 'override', targets: '' }, props || {})
    const targetsCsv = String(mergedProps.targets || '').trim()
    const targets = targetsCsv ? targetsCsv.split(',').map(s => s.trim()).filter(Boolean) : null
    const $scope = $(node).parent()
    if (!$scope.length) return () => {}
    const $candidates = $scope.find('[data-echo-chant-id]')
      .filter((_i, n) => n !== node)
      .filter((_i, n) => !targets || targets.indexOf($(n).attr('data-echo-chant-id')) !== -1)
    $candidates.each((_i, n) => {
      $(n).attr('data-mindsteal-mode', mergedProps.mode)
      if (mergedProps.mode === 'disable') $(n).css('animation', 'none', 'important')
    })
    $(node).addClass('ag-rune-mindsteal-active')
    return () => {
      $candidates.removeAttr('data-mindsteal-mode').css('animation', '')
      $(node).removeClass('ag-rune-mindsteal-active')
    }`
  },
  {
    id: 'lucky', name: '强运', icon: 'casino', color: '#FB8C00', category: 'showy', type: 'echo-chant',
    desc: '点击后触发 AI 识别当前 Markdown 的错别字并修正',
    banner: ['【强运 / lucky】 —— 点击触发 AI 校对，是"事件型 echo-chant"样板',
      '事件流：handler 给节点加 role=button / tabindex=0；点击时调用',
      '  window.__memocastEchoChantHandlers.lucky({node, props})，由应用层注册回调',
      '示例：@强运{model: "gpt-4o-mini", action: "ai-proofread"}(一键润色)'],
    handlerDesc: '事件型：cleanup 必须解绑 + 移除属性；callback 走 window.__memocastEchoChantHandlers.lucky（应用层注册）',
    handlerBody: `
    const mergedProps = Object.assign({ label: '点击触发 AI 校对' }, props || {})
    const $rune = $(node)
    $rune.css('cursor', 'pointer').attr('role', 'button').attr('tabindex', '0')
      .attr('title', mergedProps.label).addClass('ag-rune-lucky-active')
    const trigger = async (ev) => {
      ev.preventDefault(); ev.stopPropagation()
      $rune.addClass('ag-rune-lucky-loading')
      try {
        const handler = (typeof window !== 'undefined')
          ? (window.__memocastEchoChantHandlers && window.__memocastEchoChantHandlers.lucky)
          : null
        if (typeof handler === 'function') await handler({ node, props })
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
        .css('cursor', '').removeAttr('role').removeAttr('tabindex').removeAttr('title')
    }`
  },
  {
    id: 'scapegoat', name: '替罪', icon: 'shield', color: '#6D4C41', category: 'showy', type: 'echo-chant',
    desc: '在作用域内接住后续 echo / DOM 抛出的错误，并以受伤态提示',
    banner: ['【替罪 / scapegoat】 —— 作用域内的"救场位"',
      '回响种类：echo-chant（影响附近元素、做防灾 / 占位 / 兜底）',
      '语义：把最近 block 标为 standby；后续 echo / DOM 抛错时把 standby 转 injured，错误写到 data-scapegoat-error',
      '模仿提示：把 props.intensity 改成 0.5 可以让 standby 默认变 injured（模拟"已知错误"）'],
    handlerDesc: 'cleanup：移除监听 + 移除 standby/injured 状态',
    handlerBody: `
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').first()
    if (!$block.length) return () => {}
    const intensity = Number(props.intensity) || 0
    if (intensity > 0) {
      $block.addClass('ag-rune-scapegoat-injured').attr('data-scapegoat-error', props.error || 'pre-injured by intensity')
    } else {
      $block.addClass('ag-rune-scapegoat-standby')
    }
    const onError = (event) => {
      $block.removeClass('ag-rune-scapegoat-standby').addClass('ag-rune-scapegoat-injured')
        .attr('data-scapegoat-error', (event && event.message) || 'unknown error')
    }
    const onRuneError = (event) => {
      const detail = event && event.detail
      if (!detail) return
      $block.removeClass('ag-rune-scapegoat-standby').addClass('ag-rune-scapegoat-injured')
        .attr('data-scapegoat-rune-error', String(detail.id || 'unknown'))
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
        .removeAttr('data-scapegoat-error').removeAttr('data-scapegoat-rune-error')
    }`
  },
  {
    id: 'calamity', name: '招灾', icon: 'thunderstorm', color: '#5E35B1', category: 'showy', type: 'echo-chant',
    desc: '在作用域内随机给文字片段染上哥特渐变彩',
    banner: ['【招灾 / calamity】 —— "随机哥德"：作用域内随机给文字片段染上哥特渐变彩',
      '回响种类：echo-chant',
      '参数：intensity = 0.1-0.8 的小数（默认 0.3，最大 0.8）',
      'CSS 钩子：.ag-rune-calamity-gothic',
      '示例：@招灾{intensity: 0.5}(周围一半文字染彩)'],
    handlerDesc: 'cleanup：取消染彩 class',
    handlerBody: `
    const scope = props.scope || 'siblings'
    const $scope = scope === 'block'
      ? $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote')
      : $(node).parent()
    if (!$scope.length) return () => {}
    const intensity = Math.max(0.05, Math.min(0.8, Number(props.intensity) || 0.3))
    const textHosts = $scope.find('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, dd, dt')
      .filter((_i, el) => el && el !== node && $(el).text().trim().length >= 2)
      .get()
    if (!textHosts.length) return () => {}
    const targetCount = Math.max(1, Math.floor(textHosts.length * intensity))
    const pool = textHosts.slice()
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp
    }
    const picked = pool.slice(0, Math.min(targetCount, pool.length))
    $(picked).addClass('ag-rune-calamity-gothic')
    return () => { $(picked).removeClass('ag-rune-calamity-gothic') }`
  },
  {
    id: 'disperse', name: '离析', icon: 'call_split', color: '#00897B', category: 'showy', type: 'echo-chant',
    desc: '使附近的元素使用更加宽松的排版',
    banner: ['【离析 / disperse】 —— 让附近元素使用更宽松排版（block 级别）',
      '参数：density=tight|normal|loose（loose 是默认）',
      'CSS 钩子：data-disperse-density',
      '示例：@离析{density: "tight"}(回归紧凑排版)'],
    handlerDesc: 'block scope 写 data-disperse-density；CSS 据此调整 line-height/margin',
    handlerBody: `
    const mergedProps = Object.assign({ density: 'loose' }, props || {})
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    const previous = $block.attr('data-disperse-density')
    $block.attr('data-disperse-density', mergedProps.density)
    $(node).addClass('ag-rune-disperse-active')
    return () => {
      if (previous === undefined) $block.removeAttr('data-disperse-density')
      else $block.attr('data-disperse-density', previous)
      $(node).removeClass('ag-rune-disperse-active')
    }`
  },
  {
    id: 'peek', name: 'peek', icon: 'visibility', color: '#FF7043', category: 'builtin', type: 'echo-chant',
    desc: '高亮展示内容，支持折叠展开',
    banner: ['【peek】 —— 高亮展示内容，支持折叠展开',
      '参数：collapsed=true|false（默认 false），level=1-3（高亮强度）',
      'CSS 钩子：ag-rune-peek, ag-rune-peek-collapsed',
      '示例：@peek{collapsed: true}(折叠展示)'],
    handlerDesc: '添加高亮 class，可交互折叠',
    handlerBody: `
    const mergedProps = Object.assign({ collapsed: false, level: 1 }, props || {})
    const $rune = $(node)
    const level = Math.max(1, Math.min(3, Number(mergedProps.level) || 1))
    $rune.addClass('ag-rune-peek ag-rune-peek-level-' + level)
    if (mergedProps.collapsed) $rune.addClass('ag-rune-peek-collapsed')
    return () => {
      $rune.removeClass('ag-rune-peek ag-rune-peek-collapsed ag-rune-peek-level-1 ag-rune-peek-level-2 ag-rune-peek-level-3')
    }`
  },
  {
    id: 'ignore', name: 'ignore', icon: 'visibility_off', color: '#90A4AE', category: 'builtin', type: 'echo-chant',
    desc: '标记为可忽略内容，视觉淡化',
    banner: ['【ignore】 —— 标记为可忽略内容，视觉淡化',
      '参数：opacity=0.1-1（淡化透明度，默认 0.4）',
      'CSS 钩子：ag-rune-ignore',
      '示例：@ignore{opacity: 0.3}(淡化次要内容)'],
    handlerDesc: '降低 block 透明度，cleanup 时还原',
    handlerBody: `
    const mergedProps = Object.assign({ opacity: 0.4 }, props || {})
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    const prevOpacity = $block.css('opacity') || '1'
    $block.addClass('ag-rune-ignore').css('opacity', mergedProps.opacity)
    return () => {
      $block.removeClass('ag-rune-ignore').css('opacity', prevOpacity)
    }`
  },
  {
    id: 'ad', name: 'ad', icon: 'campaign', color: '#FFB300', category: 'builtin', type: 'echo-chant',
    desc: '插入广告占位或标注为广告内容',
    banner: ['【ad】 —— 插入广告占位或标注为广告内容',
      '参数：type=banner|inline|sidebar（默认 banner）',
      'CSS 钩子：ag-rune-ad, ag-rune-ad-banner, ag-rune-ad-inline, ag-rune-ad-sidebar',
      '示例：@ad{type: "inline"}(内联广告标注)'],
    handlerDesc: '添加广告标记样式',
    handlerBody: `
    const mergedProps = Object.assign({ type: 'banner' }, props || {})
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    const adType = String(mergedProps.type || 'banner').toLowerCase()
    $block.addClass('ag-rune-ad ag-rune-ad-' + adType)
    return () => {
      $block.removeClass('ag-rune-ad ag-rune-ad-banner ag-rune-ad-inline ag-rune-ad-sidebar')
    }`
  },
  {
    id: 'diff', name: 'diff', icon: 'difference', color: '#7E57C2', category: 'builtin', type: 'echo-chant',
    desc: '标记差异对比内容',
    banner: ['【diff】 —— 标记差异对比内容',
      '参数：mode=add|remove|change（默认 change）',
      'CSS 钩子：ag-rune-diff, ag-rune-diff-add, ag-rune-diff-remove, ag-rune-diff-change',
      '示例：@diff{mode: "add"}(新增内容)'],
    handlerDesc: '添加 diff 标记样式',
    handlerBody: `
    const mergedProps = Object.assign({ mode: 'change' }, props || {})
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    const diffMode = String(mergedProps.mode || 'change').toLowerCase()
    $block.addClass('ag-rune-diff ag-rune-diff-' + diffMode)
    return () => {
      $block.removeClass('ag-rune-diff ag-rune-diff-add ag-rune-diff-remove ag-rune-diff-change')
    }`
  },
  {
    id: 'ref', name: 'ref', icon: 'link', color: '#29B6F6', category: 'builtin', type: 'echo-chant',
    desc: '标记为参考资料，可跳转链接',
    banner: ['【ref】 —— 标记为参考资料，可跳转链接',
      '参数：url=外部链接（可选），title=标题（可选）',
      'CSS 钩子：ag-rune-ref',
      '示例：@ref{url: "https://..."}(参考资料)'],
    handlerDesc: '添加参考标记样式，可点击跳转',
    handlerBody: `
    const mergedProps = Object.assign({ url: '', title: '' }, props || {})
    const $rune = $(node)
    $rune.addClass('ag-rune-ref')
    if (mergedProps.url) {
      $rune.css('cursor', 'pointer')
      $rune.on('click', (e) => {
        e.preventDefault()
        window.open(mergedProps.url, '_blank')
      })
    }
    return () => { $rune.removeClass('ag-rune-ref').css('cursor', '').off('click') }`
  },
  {
    id: 'todo', name: 'todo', icon: 'check_box', color: '#26A69A', category: 'builtin', type: 'echo-chant',
    desc: '标记待办事项，可交互勾选',
    banner: ['【todo】 —— 标记待办事项，可交互勾选',
      '参数：checked=true|false（默认 false）',
      'CSS 钩子：ag-rune-todo, ag-rune-todo-checked',
      '示例：@todo{checked: false}(待完成事项)'],
    handlerDesc: '添加待办标记样式',
    handlerBody: `
    const mergedProps = Object.assign({ checked: false }, props || {})
    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()
    if (!$block.length) return () => {}
    $block.addClass('ag-rune-todo')
    if (mergedProps.checked) $block.addClass('ag-rune-todo-checked')
    return () => { $block.removeClass('ag-rune-todo ag-rune-todo-checked') }`
  }
]

// ============================================================================
// 把 meta + render + handler body 拼装成一张完整 echo 卡片
// ============================================================================
const buildEchoCard = (meta) => {
  // render 返回值在 anno_source 里硬编码（无需运行时 JS 模板函数），
  // renderBody 直接是 `render (node, props = {}) { ... }` 函数体模板。
  const renderBody = baseRender(meta)
  const anno_source = createAnnoSource({ meta, renderBody, handlerBody: meta.handlerBody || '' })
  return Object.freeze({
    id: `__builtin_${meta.id}__`,
    name: meta.name,
    desc: meta.desc,
    icon: meta.icon,
    color: meta.color,
    category: meta.category,
    anno_source,
    isBuiltin: true
  })
}

// 16 张内置 echo 卡片（freeze，运行时不可改）
export const BUILTIN_ECHO_CARDS = Object.freeze(BUILTIN_ECHO_META.map(buildEchoCard))

// 派生：BUILTIN_ECHO_CHANT_IDS 直接由 meta 推出
export const BUILTIN_ECHO_CHANT_IDS = Object.freeze(BUILTIN_ECHO_META.map(m => m.id))

export const isBuiltinEchoChantId = (id = '') => BUILTIN_ECHO_CHANT_IDS.includes(String(id || '').trim())
