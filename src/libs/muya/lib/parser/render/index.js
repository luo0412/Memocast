import loadRenderer from '../../renderers'
import { CLASS_OR_ID } from '../../config'
import { conflict, mixins, camelToSnake } from '../../utils'
import { patch, toVNode, toHTML, h } from './snabbdom'
import { beginRules } from '../rules'
import renderInlines from './renderInlines'
import renderBlock from './renderBlock'
import { tokenizer } from '../index'
import { i18n } from 'boot/i18n'

const RUNE_PLACEHOLDER_SELECTOR = '[data-rune-name][data-rune-id][data-rune-node-id]'
// Support both named (@name{...}(...)) and anonymous (@{...}(...)) echo annotations
const ECHO_PLACEHOLDER_SELECTOR = '[data-echo-node-id]'
const RUNE_HOST_CLASS = 'ag-rune-placeholder-host'
const RUNE_CARD_CLASS = 'ag-rune-placeholder-card'
const ECHO_HOST_CLASS = 'ag-echo-placeholder-host'
const ECHO_CARD_CLASS = 'ag-echo-placeholder-card'

// 把字符串安全地写进 HTML 属性值（双引号围栏 + 防注入）
const escapeAttrString = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

class StateRender {
  constructor (muya) {
    this.muya = muya
    this.eventCenter = muya.eventCenter
    this.codeCache = new Map()
    this.loadImageMap = new Map()
    this.loadMathMap = new Map()
    this.mermaidCache = new Map()
    this.diagramCache = new Map()
    this.tokenCache = new Map()
    this.labels = new Map()
    this.urlMap = new Map()
    this.renderingTable = null
    this.renderingRowContainer = null
    this.container = null
    this.runePlaceholderCache = new Map()
    this.echoPlaceholderCache = new Map()
    this.runeVmMap = new Map()
    this.echoVmMap = new Map()
  }

  setContainer (container) {
    this.container = container
  }

  // collect link reference definition
  collectLabels (blocks) {
    this.labels.clear()

    const travel = block => {
      const { text, children } = block
      if (children && children.length) {
        children.forEach(c => travel(c))
      } else if (text) {
        const tokens = beginRules.reference_definition.exec(text)
        if (tokens) {
          const key = (tokens[2] + tokens[3]).toLowerCase()
          if (!this.labels.has(key)) {
            this.labels.set(key, {
              href: tokens[6],
              title: tokens[10] || ''
            })
          }
        }
      }
    }

    blocks.forEach(b => travel(b))
  }

  checkConflicted (block, token, cursor) {
    const { start, end } = cursor
    const key = block.key
    const { start: tokenStart, end: tokenEnd } = token.range

    if (key !== start.key && key !== end.key) {
      return false
    } else if (key === start.key && key !== end.key) {
      return conflict([tokenStart, tokenEnd], [start.offset, start.offset])
    } else if (key !== start.key && key === end.key) {
      return conflict([tokenStart, tokenEnd], [end.offset, end.offset])
    } else {
      return conflict([tokenStart, tokenEnd], [start.offset, start.offset]) ||
        conflict([tokenStart, tokenEnd], [end.offset, end.offset])
    }
  }

  getClassName (outerClass, block, token, cursor) {
    return outerClass || (this.checkConflicted(block, token, cursor) ? CLASS_OR_ID.AG_GRAY : CLASS_OR_ID.AG_HIDE)
  }

  getHighlightClassName (active) {
    return active ? CLASS_OR_ID.AG_HIGHLIGHT : CLASS_OR_ID.AG_SELECTION
  }

  getSelector (block, activeBlocks) {
    const { cursor, selectedBlock } = this.muya.contentState
    const type = block.type === 'hr' ? 'p' : block.type
    const isActive = activeBlocks.some(b => b.key === block.key) || block.key === cursor.start.key

    let selector = `${type}#${block.key}.${CLASS_OR_ID.AG_PARAGRAPH}`
    if (isActive) {
      selector += `.${CLASS_OR_ID.AG_ACTIVE}`
    }
    if (type === 'span') {
      selector += `.ag-${camelToSnake(block.functionType)}`
    }
    if (!block.parent && selectedBlock && block.key === selectedBlock.key) {
      selector += `.${CLASS_OR_ID.AG_SELECTED}`
    }
    return selector
  }

  getRuneMap () {
    const runeCards = this.muya?.options?.runeCards || []
    return (Array.isArray(runeCards) ? runeCards : []).reduce((acc, rune) => {
      const runeName = String((rune?.name || '').trim())
      if (runeName) {
        acc.set(runeName, rune)
      }
      return acc
    }, new Map())
  }

  getEchoMap () {
    const echoRegistry = this.muya?.options?.echoRegistry
    const echoCards = echoRegistry?.getAll?.() || this.muya?.options?.echoCards || []
    return (Array.isArray(echoCards) ? echoCards : []).reduce((acc, echo) => {
      const echoName = String((echo?.name || '').trim())
      const echoId = String((echo?.id || '').trim())
      const normalizedEcho = echoName ? { ...echo, name: echoName, id: echoId } : echo
      if (echoName) {
        acc.set(echoName, normalizedEcho)
      }
      if (echoId) {
        acc.set(`id:${echoId}`, normalizedEcho)
      }
      return acc
    }, new Map())
  }

  createRunePlaceholderMarkup (rune, dataset = {}) {
    const runeName = rune?.name || dataset.runeName || 'Rune'
    return `
      <div class="${RUNE_CARD_CLASS}" data-rune-mounted="true">
        <div class="ag-rune-placeholder-body">
          <div class="ag-rune-placeholder-title">${runeName}</div>
        </div>
      </div>
    `
  }

  createEchoPlaceholderMarkup (echo, dataset = {}) {
    const echoName = echo?.name || dataset.echoName || '回响'
    const echoValue = String(dataset.echoValue || '').replace(/\s+/g, ' ')
    const echoDescription = echoValue || echo?.desc || ''
    const color = echo?.color || '#26A69A'
    const icon = echo?.icon || 'play_arrow'
    const hasExplicitWidth = dataset.hasExplicitWidth === true
    const hasExplicitHeight = dataset.hasExplicitHeight === true
    const width = dataset.width || ''
    const height = dataset.height || ''

    const baseStyle = `--echo-accent:${color};display:inline-flex;box-sizing:border-box;overflow:hidden;align-items:center;`
    const widthStyle = hasExplicitWidth ? `width:${width};min-width:${width};` : 'width:auto;min-width:0;'
    const heightStyle = hasExplicitHeight ? `height:${height};min-height:${height};` : 'height:auto;min-height:0;'

    return `
      <span class="${ECHO_CARD_CLASS}" data-echo-mounted="true" style="${baseStyle}${widthStyle}${heightStyle}">
        <span class="ag-echo-placeholder-body">
          <span class="ag-echo-placeholder-icon material-icons">${icon}</span>
          <span class="ag-echo-placeholder-copy">
            <span class="ag-echo-placeholder-title">${echoName}</span>
            ${echoDescription
              ? `<span class="ag-echo-placeholder-desc">${echoDescription}</span>`
              : `<span class="ag-echo-placeholder-value-marker" data-echo-value-marker="true" contenteditable="true" spellcheck="false"> </span>`
            }
          </span>
        </span>
      </span>
    `
  }

  renderRunePlaceholderNodes () {
    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (!root) return

    const runeMap = this.getRuneMap()
    const hosts = root.querySelectorAll(RUNE_PLACEHOLDER_SELECTOR)
    console.log('[Muya.StateRender.renderRunePlaceholderNodes] scanning placeholders', {
      selector: RUNE_PLACEHOLDER_SELECTOR,
      hostCount: hosts.length,
      runeMapSize: runeMap.size
    })

    hosts.forEach(host => {
      const dataset = host.dataset || {}
      const runeName = String(dataset.runeName || '').trim()
      const instanceId = String(dataset.runeId || '')
      const nodeId = String(dataset.runeNodeId || '')
      const rune = runeMap.get(runeName) || null
      const cacheKey = JSON.stringify({
        runeName,
        instanceId,
        nodeId,
        innerText: host.textContent || '',
        template: rune?.template || ''
      })

      if (this.runePlaceholderCache.get(host) === cacheKey) {
        return
      }

      host.classList.add(RUNE_HOST_CLASS)
      host.setAttribute('contenteditable', 'false')
      host.innerHTML = this.createRunePlaceholderMarkup(rune, dataset)
      host.dataset.runeRenderKey = cacheKey
      this.runePlaceholderCache.set(host, cacheKey)
    })
  }

  cleanupDetachedRunePlaceholders () {
    for (const host of Array.from(this.runePlaceholderCache.keys())) {
      if (!host.isConnected) {
        this.runePlaceholderCache.delete(host)
      }
    }
  }

  cleanupDetachedEchoPlaceholders () {
    for (const host of Array.from(this.echoPlaceholderCache.keys())) {
      if (!host.isConnected) {
        this.echoPlaceholderCache.delete(host)
      }
    }
  }

  renderEchoPlaceholderNodes () {
    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (!root) return

    const echoMap = this.getEchoMap()
    const runtime = this.muya?.options?.__echoRuntime || null
    const hosts = root.querySelectorAll(ECHO_PLACEHOLDER_SELECTOR)

    hosts.forEach(host => {
      const dataset = host.dataset || {}
      const echoName = String(dataset.echoName || '').trim() || '回响'
      const echoId = String(dataset.echoId || '').trim()
      const definitionId = String(dataset.echoDefinitionId || '').trim()
      const nodeId = String(dataset.echoNodeId || '').trim()
      const value = String(dataset.echoValue || '').trim()
      const hasExplicitWidth = dataset.echoWidth !== undefined
      const hasExplicitHeight = dataset.echoHeight !== undefined
      const width = String(dataset.echoWidth || '').trim()
      const height = String(dataset.echoHeight || '').trim()
      // Support anonymous echo: lookup by echoId first, then by echoName
      // For anonymous echo with only attrs, use echoId or echoName for lookup
      const lookupKey = echoId ? `id:${echoId}` : echoName
      const echo = echoMap.get(lookupKey) || (echoId ? echoMap.get(echoName) : null) || null
      // 解析出当前实例的 attrs，决定是否走 rune 副作用链路
      const instanceAttrs = (() => {
        try {
          // 来源 1：attrsRaw 已经写在 token；这里暂用 definition 的 anno_source 默认空对象
          // 来源 2：从 echo 定义里推断 kind（多数 echo-chant 类的 kind 由 anno_source.render() 注入）
          // v2026-07-15 重命名后，'rune' / 'rune-tbd' 是历史值；新值为 'echo-chant' / 'echo-tbd'
          return {}
        } catch (error) { return {} }
      })()
      const isRuneLike = (() => {
        if (!echo) return false
        const kindFromAnno = (() => {
          try {
            const src = String(echo.anno_source || echo.template || '')
            const m = src.match(/kind\s*:\s*['"]([^'"]+)['"]/)
            return m ? m[1] : ''
          } catch (error) { return '' }
        })()
        // 兼容新名 + 历史 ABI：'echo-chant' / 'echo-tbd' / 'rune' / 'rune-tbd'
        const normalized = ({
          'echo-chant': 'echo-chant', 'echo-tbd': 'echo-tbd',
          rune: 'echo-chant', 'rune-tbd': 'echo-tbd'
        })[kindFromAnno] || ''
        if (normalized === 'echo-chant' || normalized === 'echo-tbd') return true
        // 兜底：attrs 已经写在 host dataset（如果有 echoHighlight 等场景）
        const dsKind = String(dataset.kind || '')
        return dsKind === 'echo-chant' || dsKind === 'echo-tbd'
          || dsKind === 'rune' || dsKind === 'rune-tbd'
      })()
      const cacheKey = JSON.stringify({
        echoName,
        echoId,
        definitionId,
        nodeId,
        value,
        desc: echo?.desc || '',
        color: echo?.color || '',
        icon: echo?.icon || '',
        annoSource: echo?.anno_source || echo?.template || '',
        hasExplicitWidth,
        hasExplicitHeight,
        width,
        height,
        runeLike: isRuneLike
      })

      if (this.echoPlaceholderCache.get(host) === cacheKey) {
        return
      }

      host.classList.add(ECHO_HOST_CLASS)
      host.setAttribute('contenteditable', 'false')

      // === 回响可以"影响附近元素"的真正接线点 ===
      // 对于 kind === 'echo-chant' | 'echo-tbd'（旧 'rune' / 'rune-tbd'）的 echo 定义
      // （生生不息 / 破万法 / 天行健 / 双生花 / 夺心魄 / 强运 / 离析 / 替罪 / 招灾），
      // 调用 EchoRuntime.renderToHtml 输出包含 data-rune-id / data-rune-kind 的 span；
      // 随后在 renderRunes() 末由 afterRender() 接管，让对应 handler 改兄弟 / 容器节点的 CSS / 动画 / 边距。
      // 其它（普通的 nice / 自定义 echo / 找不到定义的 echo）继续走卡片 markup。
      // 数据结构：
      //   数据结构字面在代码层面叫 echoChant，但 DOM 端保留 data-rune-id / data-rune-kind 以兼容既有 markdown ABI。
      //
      // === 配套桥接：把 echo 实例的 attrsParsed 序列化到 host 的 dataset，
      // 让 EchoRuntime._readRuneAttrs() 在 afterRender() 时能够读到具体参数
      // （比如 @离析{density:'very-loose'} 中的 density 会改变排版密度）。
      const echoAttrsJson = (() => {
        try { return JSON.stringify(echo?.anno_source || '') } catch (error) { return '' }
      })()
      if (echo && echoAttrsJson) {
        host.dataset.echoAttrsJson = echoAttrsJson
      }
      let innerHtml = ''
      if (isRuneLike && runtime && typeof runtime.renderToHtml === 'function') {
        try {
          // 1) 用 editor 默认的 *当前* echo 定义做一次 sim-text render，拿 attrs 上下文
          //    （因为快捷插入/迁移进来的 token 可能没把 attrsParsed 写到 host dataset 上，
          //    这里从 echoCard 上重新组装一份。）
          const simAttrs = (() => {
            const out = { id: echoId, definitionId, value }
            try {
              if (echo?.anno_source || echo?.template) {
                // 只从 echoCard 的 anno_source 抽取直接写明的 kind / runeId / 派生 attrs，
                // 真实的实例属性（如 @离析{density:'very-loose'}）目前 host dataset 还没有
                // 这一层（见 Muya.vue 中 echoToken 回写流程）。这里把"echoCard 渲染结果"
                // 作为兜底 baseline，再在 afterRender() 时尝试从宿主 dataset 里再扩一层。
                return out
              }
            } catch (error) { /* ignore */ }
            return out
          })()
          const token = {
            echoName,
            echoId,
            attrsParsed: simAttrs,
            attrsRaw: '',
            prompt: value,
            value,
            raw: '',
            payload: '',
            payloadRaw: ''
          }
          const matchedEcho = echo || null
          innerHtml = runtime.renderToHtml(token, matchedEcho)
          // 2) 把内层 span 的 data-rune-attrs 直接补成"当前 echoCard 渲染结果 + id/definitionId"
          //    —— 这样 EchoRuntime._readRuneAttrs() 走 node.querySelector('[data-rune-attrs]')
          //    或者回退读 data-rune-attr-* 时都能拿到 baseline。
          try {
            const baselineAttrs = Object.assign({}, simAttrs, {
              echoName,
              echoId,
              definitionId,
              value: simAttrs.value || value
            })
            const attrJson = JSON.stringify(baselineAttrs)
            if (attrJson) {
              innerHtml = innerHtml.replace(
                /<span\b/,
                `<span data-rune-attrs="${escapeAttrString(attrJson)}"`,
                1
              )
              if (innerHtml.indexOf('data-rune-attrs=') === -1) {
                // 渲染产物不包含 span（例如只是文本），包裹一层
                innerHtml = `<span data-rune-attrs="${escapeAttrString(attrJson)}">${innerHtml}</span>`
              }
            }
          } catch (error) { /* ignore */ }
        } catch (error) {
          console.warn('[StateRender] runtime.renderToHtml failed, fallback to card', error)
          innerHtml = ''
        }
      }
      if (!innerHtml) {
        innerHtml = this.createEchoPlaceholderMarkup(echo, { ...dataset, hasExplicitWidth, hasExplicitHeight, width, height })
      }
      host.innerHTML = innerHtml
      host.dataset.echoRenderKey = cacheKey
      this.echoPlaceholderCache.set(host, cacheKey)
    })
  }

  cleanupDetachedRuneVms (force = false) {
    for (const [nodeId, vm] of this.runeVmMap.entries()) {
      if (force || !vm || !vm.$el || !vm.$el.isConnected) {
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.runeVmMap.delete(nodeId)
      }
    }
  }

  cleanupDetachedEchoVms (force = false) {
    for (const [nodeId, vm] of this.echoVmMap.entries()) {
      if (force || !vm || !vm.$el || !vm.$el.isConnected) {
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.echoVmMap.delete(nodeId)
      }
    }
  }

  mountRuneVueHosts () {
    const RuneRenderer = this.muya?.options?.runeRendererCtor
    console.log('[Muya.StateRender.mountRuneVueHosts] called', {
      hasRuneRenderer: !!RuneRenderer,
      enableRuneVueRenderer: !!this.muya?.options?.enableRuneVueRenderer
    })
    if (!RuneRenderer) return

    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (!root) return

    const runeMap = this.getRuneMap()
    const hosts = root.querySelectorAll(RUNE_PLACEHOLDER_SELECTOR)
    console.log('[Muya.StateRender.mountRuneVueHosts] scanning hosts', {
      hostCount: hosts.length,
      runeMapSize: runeMap.size,
      runeKeys: Array.from(runeMap.keys())
    })
    const aliveNodeIds = new Set()

    hosts.forEach(host => {
      const dataset = host.dataset || {}
      const runeName = String(dataset.runeName || '').trim()
      const runeId = String(dataset.runeId || '')
      const nodeId = String(dataset.runeNodeId || '')
      if (!runeName || !runeId || !nodeId) {
        console.log('[Muya.StateRender.mountRuneVueHosts] skip host due to missing dataset', {
          runeName,
          runeId,
          nodeId,
          dataset
        })
        return
      }

      aliveNodeIds.add(nodeId)
      const matchedRune = runeMap.get(runeName) || null
      console.log('[Muya.StateRender.mountRuneVueHosts] resolved rune by name', {
        runeName,
        runeId,
        nodeId,
        matched: !!matchedRune,
        matchedRuneId: matchedRune?.id || '',
        matchedTemplateLen: (matchedRune?.template || '').length,
        matchedTemplatePreview: String(matchedRune?.template || '').substring(0, 120)
      })
      const rune = matchedRune || {
        id: '',
        name: runeName,
        template: ''
      }
      const runeValue = String(dataset.runeValue || '').trim()
      const renderKey = host.dataset.runeRenderKey || ''
      const mountedVm = this.runeVmMap.get(nodeId)
      // Memocast 扩展：把 Muya 实例的回写方法作为 onValueChange 注入，
      // 这样内层 SFC emit('input', value) 时就能写回 Markdown 的 data-rune-value。
      const muyaInstance = this.muya?.options?.__memocastMuya || null
      const onValueChange = (payload) => {
        if (!muyaInstance || typeof muyaInstance.updateRunePlaceholderValue !== 'function') return
        muyaInstance.updateRunePlaceholderValue({
          runeId: payload?.runeId || runeId,
          nodeId: payload?.nodeId || nodeId,
          value: payload?.value
        })
      }

      if (mountedVm && mountedVm.$el && mountedVm.$el.parentNode === host && mountedVm.__runeRenderKey === renderKey) {
        mountedVm.runeId = runeId
        mountedVm.nodeId = nodeId
        mountedVm.rune = rune
        mountedVm.value = runeValue
        mountedVm.onValueChange = onValueChange
        console.log('[Muya.StateRender.mountRuneVueHosts] reuse vm', {
          nodeId,
          runeId,
          runeName,
          templateLen: (rune?.template || '').length
        })
        return
      }

      if (mountedVm && typeof mountedVm.$destroy === 'function') {
        console.log('[Muya.StateRender.mountRuneVueHosts] destroy stale vm', { nodeId, runeId, runeName })
        mountedVm.$destroy()
      }

      host.innerHTML = ''
      const vm = new RuneRenderer({
        propsData: {
          runeId,
          nodeId,
          rune,
          value: runeValue,
          onValueChange
        }
      })
      vm.__runeRenderKey = renderKey
      vm.$mount()
      host.appendChild(vm.$el)
      this.runeVmMap.set(nodeId, vm)
      console.log('[Muya.StateRender.mountRuneVueHosts] mounted vm', {
        nodeId,
        runeId,
        runeName,
        templateLen: (rune?.template || '').length,
        renderKey
      })
    })

    for (const [savedNodeId, vm] of this.runeVmMap.entries()) {
      if (!aliveNodeIds.has(savedNodeId)) {
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.runeVmMap.delete(savedNodeId)
      }
    }
  }

  mountEchoVueHosts () {
    const EchoRenderer = this.muya?.options?.echoRendererCtor
    const echoRegistry = this.muya?.options?.echoRegistry
    if (!EchoRenderer || !echoRegistry) return

    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (!root) return

    const echoMap = this.getEchoMap()
    const hosts = root.querySelectorAll(ECHO_PLACEHOLDER_SELECTOR)
    const aliveNodeIds = new Set()
    console.log('[Muya.StateRender.mountEchoVueHosts] scanning hosts', {
      hostCount: hosts.length,
      echoMapSize: echoMap.size,
      existingVmCount: this.echoVmMap.size
    })

    hosts.forEach(host => {
      const dataset = host.dataset || {}
      const echoName = String(dataset.echoName || '').trim()
      const echoId = String(dataset.echoId || '')
      const definitionId = String(dataset.echoDefinitionId || '')
      const nodeId = String(dataset.echoNodeId || '')
      const value = String(dataset.echoValue || '')
      if (!echoName || !echoId || !nodeId) {
        console.log('[Muya.StateRender.mountEchoVueHosts] skip host due to missing dataset', {
          echoName,
          echoId,
          nodeId,
          dataset
        })
        return
      }

      aliveNodeIds.add(nodeId)
      const echo = echoMap.get(`id:${definitionId}`) || echoMap.get(echoName) || {
        id: definitionId,
        name: echoName
      }
      const renderKey = host.dataset.echoRenderKey || ''
      const mountedVm = this.echoVmMap.get(nodeId)

      if (mountedVm && mountedVm.$el && mountedVm.$el.parentNode === host && mountedVm.__echoRenderKey === renderKey) {
        mountedVm.echoId = echoId
        mountedVm.nodeId = nodeId
        mountedVm.echo = echo
        mountedVm.value = value
        console.log('[Muya.StateRender.mountEchoVueHosts] reuse vm', {
          nodeId,
          echoId,
          echoName,
          renderKey,
          hostConnected: host.isConnected,
          vmConnected: !!mountedVm.$el?.isConnected
        })
        return
      }

      if (mountedVm && typeof mountedVm.$destroy === 'function') {
        console.log('[Muya.StateRender.mountEchoVueHosts] destroy stale vm', {
          nodeId,
          echoId,
          echoName,
          renderKey,
          hasEl: !!mountedVm.$el,
          vmConnected: !!mountedVm.$el?.isConnected
        })
        mountedVm.$destroy()
      }

      while (host.firstChild) {
        host.removeChild(host.firstChild)
      }
      const vm = new EchoRenderer({
        propsData: {
          echoId,
          nodeId,
          echo,
          value,
          onCommit: this.muya?.options?.onEchoPlaceholderCommit || null
        }
      })
      vm.echoRegistry = echoRegistry
      vm.$root = { echoRegistry }
      vm.__echoRenderKey = renderKey
      vm.$mount()
      host.appendChild(vm.$el)
      this.echoVmMap.set(nodeId, vm)
      console.log('[Muya.StateRender.mountEchoVueHosts] mounted vm', {
        nodeId,
        echoId,
        echoName,
        renderKey,
        hostConnected: host.isConnected,
        vmConnected: !!vm.$el?.isConnected,
        hostChildCount: host.childNodes.length,
        outerHtmlPreview: String(vm.$el?.outerHTML || '').substring(0, 200)
      })
    })

    for (const [savedNodeId, vm] of this.echoVmMap.entries()) {
      if (!aliveNodeIds.has(savedNodeId)) {
        console.log('[Muya.StateRender.mountEchoVueHosts] cleanup detached vm', {
          savedNodeId,
          hasEl: !!vm?.$el,
          vmConnected: !!vm?.$el?.isConnected
        })
        if (vm && typeof vm.$destroy === 'function') {
          vm.$destroy()
        }
        this.echoVmMap.delete(savedNodeId)
      }
    }
  }

  renderRunesWithVue () {
    this.mountRuneVueHosts()
    this.mountEchoVueHosts()
    this.cleanupDetachedRuneVms()
    this.cleanupDetachedEchoVms()
  }

  renderRunes () {
    this.renderRunePlaceholderNodes()
    this.renderEchoPlaceholderNodes()
    this.cleanupDetachedRunePlaceholders()
    this.cleanupDetachedEchoPlaceholders()
    if (this.muya?.options?.enableRuneVueRenderer) {
      this.renderRunesWithVue()
    } else {
      this.cleanupDetachedRuneVms(true)
      this.cleanupDetachedEchoVms(true)
    }
    // === 让回响（rune 类）真正影响附近节点的排版/动画/边距 ===
    // 上面 renderEchoPlaceholderNodes 已经把包含 data-rune-id 的 span 写进了 host.innerHTML，
    // 这里再让 EchoRuntime 派发对应 handler（growth / shatter / skywalk / twinbloom /
    // mindsteal / lucky / disperse / tbd）。
    const runtime = this.muya?.options?.__echoRuntime
    const root = document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`) || this.container
    if (runtime && typeof runtime.afterRender === 'function' && root) {
      try {
        runtime.afterRender(root, { cleanupFirst: true })
      } catch (error) {
        console.warn('[StateRender] runtime.afterRender failed:', error)
      }
    }
  }

  getEchoHighlightOptions () {
    const options = this.muya?.options || {}
    if (options.echoHighlightOptions && typeof options.echoHighlightOptions === 'object') {
      return options.echoHighlightOptions
    }
    return {
      scope: options.echoHighlightScope || 'block',
      className: options.echoHighlightClassName || 'ag-echo-highlight',
      matchField: options.echoHighlightMatchField || 'name',
      filter: options.echoHighlightFilter || null,
      maxDistance: typeof options.echoHighlightMaxDistance === 'number' ? options.echoHighlightMaxDistance : 1
    }
  }

  getEchoHighlightMatcher () {
    const options = this.getEchoHighlightOptions()
    const matcher = options.filter
    if (typeof matcher === 'function') {
      return matcher
    }
    const matchField = String(options.matchField || 'name').trim()
    const fieldMap = new Map([
      ['name', echo => String(echo?.name || '').trim()],
      ['id', echo => String(echo?.id || '').trim()],
      ['nameOrId', echo => {
        const name = String(echo?.name || '').trim()
        const id = String(echo?.id || '').trim()
        return name || id
      }]
    ])
    const getter = fieldMap.get(matchField) || fieldMap.get('name')
    const matched = new Set()
    return echo => {
      if (!echo || matched.has(echo)) return false
      const value = getter(echo)
      if (!value) return false
      matched.add(echo)
      return true
    }
  }

  normalizeEchoHighlights (rawHighlights = []) {
    const highlights = (Array.isArray(rawHighlights) ? rawHighlights : [])
      .map(item => {
        if (!item || typeof item !== 'object') return null
        const blockKey = String(item.blockKey || '').trim()
        const scope = String(item.scope || this.getEchoHighlightOptions().scope || 'block').trim()
        const className = String(item.className || this.getEchoHighlightOptions().className || 'ag-echo-highlight').trim()
        const echoName = String(item.echoName || '').trim()
        const echoId = String(item.echoId || '').trim()
        const echo = item.echo || null
        if (!blockKey || (!echoName && !echoId && !echo)) return null
        return {
          blockKey,
          scope,
          className,
          echoName,
          echoId,
          echo: echo && typeof echo === 'object' ? echo : null
        }
      })
      .filter(Boolean)
    const seen = new Set()
    return highlights.filter(item => {
      const key = `${item.blockKey}:${item.scope}:${item.className}:${item.echoName}:${item.echoId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  buildEchoBlockHighlights (blocks = [], echoCards = []) {
    const options = this.getEchoHighlightOptions()
    const matcher = this.getEchoHighlightMatcher()
    const matchedEcho = []
    const all = Array.isArray(echoCards) ? echoCards : []
    for (let i = 0; i < all.length; i++) {
      const echo = all[i]
      if (matcher(echo)) matchedEcho.push(echo)
    }
    if (!matchedEcho.length) return []

    const highlights = []
    const travel = (blockList) => {
      for (const block of blockList) {
        if (!block) continue
        const text = String(block.text || '')
        const hasEchoMarker = text.indexOf('@') !== -1
        const childEchoBlocks = []

        if (hasEchoMarker && /span/.test(block.type) && /atxLine|paragraphContent|cellContent/.test(block.functionType || '')) {
          const tokens = tokenizer(text, {
            hasBeginRules: false,
            options: this.muya.options
          })
          for (const token of tokens) {
            if (token.type !== 'echo_anno') continue
            const echoName = String(token.echoName || '').trim()
            const echoId = String(token.echoId || token?.attrsParsed?.id || '').trim()
            const matched = matchedEcho.find(echo => {
              const name = String(echo?.name || '').trim()
              const id = String(echo?.id || '').trim()
              return (echoName && name && echoName === name) || (echoId && id && echoId === id)
            })
            if (!matched) continue

            if (options.scope === 'token') {
              highlights.push({
                blockKey: block.key,
                scope: 'token',
                className: options.className,
                echoName: matched.name || echoName,
                echoId: matched.id || echoId,
                echo: matched
              })
            } else {
              childEchoBlocks.push({ block, distance: 0, matched })
            }
          }
        }

        if (Array.isArray(block.children) && block.children.length) {
          travel(block.children)
        }

        for (const item of childEchoBlocks) {
          this.addEchoHighlightForBlock(highlights, item.block, item.distance, item.matched, options)
        }
      }
    }

    travel(blocks)
    return highlights
  }

  addEchoHighlightForBlock (highlights, block, distance, matchedEcho, options) {
    const maxDistance = typeof options.maxDistance === 'number' ? options.maxDistance : 1
    const scope = distance === 0 ? 'block' : 'children'
    highlights.push({
      blockKey: block.key,
      scope,
      className: options.className,
      echoName: matchedEcho?.name || '',
      echoId: matchedEcho?.id || '',
      echo: matchedEcho
    })
    if (distance >= maxDistance) return
    if (Array.isArray(block.children) && block.children.length) {
      for (const child of block.children) {
        this.addEchoHighlightForBlock(highlights, child, distance + 1, matchedEcho, options)
      }
    }
  }

  getEchoHighlightsForBlock (block, echoBlockHighlights = []) {
    if (!block || !Array.isArray(echoBlockHighlights) || !echoBlockHighlights.length) {
      return []
    }
    const direct = echoBlockHighlights.filter(item => item.blockKey === block.key)
    if (!direct.length) {
      return []
    }
    const scoped = {
      token: [],
      block: [],
      children: []
    }
    for (const item of direct) {
      const scope = String(item.scope || 'block').trim()
      if (!scoped[scope]) continue
      scoped[scope].push(item)
    }
    return [
      ...scoped.token,
      ...scoped.block,
      ...scoped.children
    ]
  }

  shouldInvalidateTokenCacheForEchoHighlights (block, echoBlockHighlights = []) {
    if (!block || !Array.isArray(echoBlockHighlights) || !echoBlockHighlights.length) {
      return false
    }
    return echoBlockHighlights.some(item => {
      if (!item || !item.blockKey) return false
      if (item.blockKey !== block.key) return false
      return true
    })
  }

  async renderMermaid () {
    if (this.mermaidCache.size) {
      const mermaid = await loadRenderer('mermaid')
      mermaid.initialize({
        theme: this.muya.options.mermaidTheme
      })
      for (const [key, value] of this.mermaidCache.entries()) {
        const { code } = value
        const target = document.querySelector(key)
        if (!target) {
          continue
        }
        try {
          mermaid.parse(code)
          target.innerHTML = code
          mermaid.init(undefined, target)
        } catch (err) {
          target.innerHTML = i18n.t('invalidMermaid')
          target.classList.add(CLASS_OR_ID.AG_MATH_ERROR)
        }
      }

      this.mermaidCache.clear()
    }
  }

  async renderDiagram () {
    const cache = this.diagramCache
    if (cache.size) {
      const RENDER_MAP = {
        flowchart: await loadRenderer('flowchart'),
        // sequence: await loadRenderer('sequence'),
        'vega-lite': await loadRenderer('vega-lite')
      }

      for (const [key, value] of cache.entries()) {
        const target = document.querySelector(key)
        if (!target) {
          continue
        }
        const { code, functionType } = value
        const render = RENDER_MAP[functionType]
        const options = {}
        if (functionType === 'sequence') {
          Object.assign(options, { theme: this.muya.options.sequenceTheme })
        } else if (functionType === 'vega-lite') {
          Object.assign(options, {
            actions: false,
            tooltip: false,
            renderer: 'svg',
            theme: this.muya.options.vegaTheme
          })
        }
        try {
          if (functionType === 'flowchart' || functionType === 'sequence') {
            const diagram = render.parse(code)
            target.innerHTML = ''
            diagram.drawSVG(target, options)
          } else if (functionType === 'vega-lite') {
            await render(key, JSON.parse(code), options)
          }
        } catch (err) {
          if(functionType === 'flowchart'){
            target.innerHTML = i18n.t('invalidFlowChart')
          }else if(functionType === 'sequence'){
            target.innerHTML = i18n.t('invalidSequence')
          }else{
            target.innerHTML = i18n.t('invalidVega')
          }
          // target.innerHTML = `< Invalid ${functionType === 'flowchart' ? 'Flow Chart' : 'Sequence'} Codes >`
          target.classList.add(CLASS_OR_ID.AG_MATH_ERROR)
        }
      }
      this.diagramCache.clear()
    }
  }

  hasEchoInlineToken (block) {
    if (!block || !/span/.test(block.type) || !/atxLine|paragraphContent|cellContent/.test(block.functionType || '')) {
      return false
    }
    const text = String(block.text || '')
    if (!text || text.indexOf('@') === -1) {
      return false
    }
    const tokens = tokenizer(text, {
      hasBeginRules: false,
      options: this.muya.options
    })
    return tokens.some(token => token.type === 'echo_anno')
  }

  hasEchoInlineTokenInBlocks (blocks = []) {
    return (Array.isArray(blocks) ? blocks : []).some(block => {
      if (!block) return false
      if (this.hasEchoInlineToken(block)) return true
      return Array.isArray(block.children) && this.hasEchoInlineTokenInBlocks(block.children)
    })
  }

  render (blocks, activeBlocks, matches) {
    const selector = `div#${CLASS_OR_ID.AG_EDITOR_ID}`
    const echoCards = this.muya?.options?.echoCards || []
    const echoBlockHighlights = this.buildEchoBlockHighlights(blocks, echoCards)
    const children = blocks.map(block => {
      return this.renderBlock(null, block, activeBlocks, matches, true, echoBlockHighlights)
    })

    const newVdom = h(selector, children)
    const rootDom = document.querySelector(selector) || this.container
    const oldVdom = toVNode(rootDom)

    patch(oldVdom, newVdom)
    this.renderMermaid()
    this.renderDiagram()
    this.renderRunes()
    this.codeCache.clear()
  }

  // Only render the blocks which you updated
  partialRender (blocks, activeBlocks, matches, startKey, endKey) {
    const echoCards = this.muya?.options?.echoCards || []
    const echoBlockHighlights = this.buildEchoBlockHighlights(blocks, echoCards)
    const cursorOutMostBlock = activeBlocks[activeBlocks.length - 1]
    // If cursor is not in render blocks, need to render cursor block independently
    const needRenderCursorBlock = blocks.indexOf(cursorOutMostBlock) === -1
    const newVnode = h('section', blocks.map(block => this.renderBlock(null, block, activeBlocks, matches, false, echoBlockHighlights)))
    const html = toHTML(newVnode).replace(/^<section>([\s\S]+?)<\/section>$/, '$1')

    const needToRemoved = []
    const firstOldDom = startKey
      ? document.querySelector(`#${startKey}`)
      : document.querySelector(`div#${CLASS_OR_ID.AG_EDITOR_ID}`).firstElementChild
    if (!firstOldDom) {
      // TODO@Jocs Just for fix #541, Because I'll rewrite block and render method, it will nolonger have this issue.
      return
    }
    needToRemoved.push(firstOldDom)
    let nextSibling = firstOldDom.nextElementSibling
    while (nextSibling && nextSibling.id !== endKey) {
      needToRemoved.push(nextSibling)
      nextSibling = nextSibling.nextElementSibling
    }
    nextSibling && needToRemoved.push(nextSibling)

    firstOldDom.insertAdjacentHTML('beforebegin', html)

    Array.from(needToRemoved).forEach(dom => {
      if (dom && dom.parentNode) {
        dom.parentNode.removeChild(dom)
      }
    })

    // Render cursor block independently
    if (needRenderCursorBlock) {
      const { key } = cursorOutMostBlock
      const cursorDom = document.querySelector(`#${key}`)
      if (cursorDom) {
        const oldCursorVnode = toVNode(cursorDom)
        const newCursorVnode = this.renderBlock(null, cursorOutMostBlock, activeBlocks, matches, true, echoBlockHighlights)
        patch(oldCursorVnode, newCursorVnode)
      }
    }

    this.renderMermaid()
    this.renderDiagram()
    this.renderRunes()
    this.codeCache.clear()
  }

  /**
   * Only render one block.
   *
   * @param {object} block
   * @param {array} activeBlocks
   * @param {array} matches
   */
  singleRender (block, activeBlocks, matches) {
    const echoCards = this.muya?.options?.echoCards || []
    const echoBlockHighlights = this.buildEchoBlockHighlights([block], echoCards)
    const selector = `#${block.key}`
    const newVdom = this.renderBlock(null, block, activeBlocks, matches, true, echoBlockHighlights)
    const rootDom = document.querySelector(selector)
    const oldVdom = toVNode(rootDom)
    patch(oldVdom, newVdom)
    this.renderMermaid()
    this.renderDiagram()
    this.renderRunes()
    this.codeCache.clear()
  }
}

mixins(StateRender, renderInlines, renderBlock)

export default StateRender
