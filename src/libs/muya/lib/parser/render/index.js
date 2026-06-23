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
        height
      })

      if (this.echoPlaceholderCache.get(host) === cacheKey) {
        return
      }

      host.classList.add(ECHO_HOST_CLASS)
      host.setAttribute('contenteditable', 'false')
      host.innerHTML = this.createEchoPlaceholderMarkup(echo, { ...dataset, hasExplicitWidth, hasExplicitHeight, width, height })
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

      if (mountedVm && mountedVm.$el && mountedVm.$el.parentNode === host && mountedVm.__runeRenderKey === renderKey) {
        mountedVm.runeId = runeId
        mountedVm.nodeId = nodeId
        mountedVm.rune = rune
        mountedVm.value = runeValue
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
          value: runeValue
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
    const children = blocks.map(block => {
      return this.renderBlock(null, block, activeBlocks, matches, true)
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
    const cursorOutMostBlock = activeBlocks[activeBlocks.length - 1]
    // If cursor is not in render blocks, need to render cursor block independently
    const needRenderCursorBlock = blocks.indexOf(cursorOutMostBlock) === -1
    const newVnode = h('section', blocks.map(block => this.renderBlock(null, block, activeBlocks, matches)))
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
        const newCursorVnode = this.renderBlock(null, cursorOutMostBlock, activeBlocks, matches)
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
    const selector = `#${block.key}`
    const newVdom = this.renderBlock(null, block, activeBlocks, matches, true)
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
