/**
 * [Fuzzaldrin was used here for fuzzy search, replaced with native includes-based filter]
 * Original fuzzaldrin usages:
 *   import { filter } from 'fuzzaldrin'
 *   filter(arr, text, { key: 'label' }) → customFilterByKey(arr, text, 'label')
 * Dependencies removed: fuzzaldrin
 */
import { v4 as uuidv4 } from 'uuid'
import { patch, h } from '../../parser/render/snabbdom'
import { deepCopy, getUniqueId } from '../../utils'
import BaseScrollFloat from '../baseScrollFloat'
import { quickInsertObj } from './config'
import './index.css'

const DEFAULT_GRID_COLUMNS = 6
const MIN_GRID_COLUMNS = 4
const MAX_GRID_COLUMNS = 8
/**
 * Simple substring-includes filter, replacing fuzzaldrin's fuzzy match for label search.
 * @param {Array} candidates - Array of objects to filter
 * @param {string} text - Search text
 * @param {string} key - Object key to match against
 * @returns {Array} Filtered array (sorted by match position)
 */
const customFilterByKey = (candidates, text, key) => {
  if (!candidates || !text) return candidates || []
  const lower = text.toLowerCase()
  return candidates
    .filter(c => String(c[key]).toLowerCase().includes(lower))
    .sort((a, b) => String(a[key]).toLowerCase().indexOf(lower) - String(b[key]).toLowerCase().indexOf(lower))
}

const mergeRenderObjects = (baseObj, extensionObj = {}) => {
  const result = deepCopy(baseObj)
  Object.keys(extensionObj).forEach(sectionName => {
    const sectionItems = Array.isArray(extensionObj[sectionName]) ? extensionObj[sectionName] : []
    if (!result[sectionName]) {
      result[sectionName] = []
    }
    result[sectionName].push(...sectionItems)
  })
  return result
}

const normalizeRuneIcon = (rune = {}) => {
  if (rune.icon && /^data:image\//.test(rune.icon)) {
    return rune.icon
  }

  const sourceText = String(rune.name || rune.text || rune.label || '').trim()
  const glyph = Array.from(sourceText)[0] || '符'
  const color = rune.color || '#7E57C2'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${color}"/><text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="28" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,PingFang SC,Microsoft YaHei,sans-serif" font-weight="700" fill="#fff">${glyph.toUpperCase()}</text></svg>`

  return `data:image/svg+xml;base64,${typeof window !== 'undefined' && typeof window.btoa === 'function'
    ? window.btoa(unescape(encodeURIComponent(svg)))
    : svg}`
}

const createRuneQuickInsertItem = (rune = {}) => {
  const id = rune.id || ''
  const name = (rune.name || '').trim() || 'Rune'
  const desc = (rune.desc || '').trim()
  const template = typeof rune.template === 'string' ? rune.template : ''
  const searchText = [name, desc, template].filter(Boolean).join(' ')

  return {
    title: () => name,
    subTitle: () => desc,
    label: `rune:${id || name}`,
    shortCut: '',
    icon: normalizeRuneIcon(rune),
    searchText,
    meta: {
      type: 'rune',
      runeTemplateId: id,
      runeName: name,
      insertContent: template
    }
  }
}

const escapeHtmlAttribute = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const createRunePlaceholderHtml = (item = {}, displayText = '', runeValue = '') => {
  const runeName = item?.meta?.runeName || 'Rune'
  const text = displayText || runeName
  const normalizedRuneValue = String(runeValue || '').trim()
  const runeId = uuidv4()
  const nodeId = `rune-${getUniqueId()}`

  return `<div data-rune-name="${escapeHtmlAttribute(runeName)}" data-rune-id="${escapeHtmlAttribute(runeId)}" data-rune-node-id="${escapeHtmlAttribute(nodeId)}" data-rune-value="${escapeHtmlAttribute(normalizedRuneValue)}">${escapeHtmlAttribute(text)}</div>`
}

class QuickInsert extends BaseScrollFloat {
  static pluginName = 'quickInsert'

  constructor(muya) {
    const name = 'ag-quick-insert'
    super(muya, name)
    this.reference = null
    this.oldVnode = null
    this._renderObj = null
    this.renderArray = null
    this.activeItem = null
    this.block = null
    this.columnsCount = this.getColumnsCount()
    this.sectionOffsets = [] // 记录每个分区的起始索引
    this.shouldHideOnScroll = false // Prevent scroll from hiding the panel during keyboard navigation
    this.runeSectionName = ''
    this.renderObj = this.getRenderObj()
    this.render()
    this.listen()
  }

  getDynamicRenderObj () {
    const provider = this.muya.options.quickInsertProvider
    if (typeof provider !== 'function') return {}

    const provided = provider({
      muya: this.muya,
      block: this.block,
      sectionName: this.runeSectionName,
      createRuneItem: createRuneQuickInsertItem
    })

    if (provided && typeof provided === 'object') {
      if (provided.sectionName && typeof provided.sectionName === 'string') {
        this.runeSectionName = provided.sectionName
      }
      if (provided.items && typeof provided.items === 'object') {
        return provided.items
      }
      return provided
    }

    return {}
  }

  getRenderObj () {
    const { contentState } = this.muya
    const canInsertFrontMatter = this.block ? contentState.canInsertFrontMatter(this.block) : true
    const obj = deepCopy(quickInsertObj)
    if (!canInsertFrontMatter) {
      obj['basic block'].splice(2, 1)
    }
    return mergeRenderObjects(obj, this.getDynamicRenderObj())
  }

  getColumnsCount () {
    if (typeof document === 'undefined') return DEFAULT_GRID_COLUMNS
    const value = Number(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--quick-insert-columns')
        .trim()
    )
    if (!Number.isFinite(value)) return DEFAULT_GRID_COLUMNS
    return Math.min(MAX_GRID_COLUMNS, Math.max(MIN_GRID_COLUMNS, value))
  }

  set renderObj(obj) {
    this._renderObj = obj
    const renderArray = []
    const sectionOffsets = []
    Object.keys(obj).forEach(key => {
      sectionOffsets.push(renderArray.length)
      renderArray.push(...obj[key])
    })
    this.sectionOffsets = sectionOffsets
    this.renderArray = renderArray
    if (this.renderArray.length > 0) {
      this.activeItem = this.renderArray[0]
      const activeEle = this.getItemElement(this.activeItem)
      this.activeEleScrollIntoView(activeEle)
    }
  }

  render () {
    const {
      scrollElement,
      activeItem,
      _renderObj
    } = this
    this.columnsCount = this.getColumnsCount()
    let children = Object.keys(_renderObj).filter(key => {
      return _renderObj[key].length !== 0
    })
      .map(key => {
        const titleVnode = h('div.title', key.toUpperCase())
        const items = []
        for (const item of _renderObj[key]) {
          const {
            title,
            subTitle,
            label,
            icon
          } = item
          const iconVnode = h('div.icon-container', h('i.icon', {
            style: {
              background: `url(${icon}) 0% 0% / 100% no-repeat`,
              'background-size': '100%'
            }
          }))

          const descriptionChildren = [
            h('div.big-title', title())
          ]
          if (typeof subTitle === 'function' && subTitle()) {
            descriptionChildren.push(h('div.sub-title', subTitle()))
          }
          const description = h('div.description', descriptionChildren)
          const selector =
            activeItem.label === label ? 'div.item.active' : 'div.item'
          items.push(
            h(
              selector,
              {
                dataset: { label },
                on: {
                  click: () => {
                    this.selectItem(item)
                  }
                }
              },
              [iconVnode, description]
            )
          )
        }

        return h('section', [titleVnode, h('div.items-grid', {
          style: {
            'grid-template-columns': `repeat(${this.columnsCount}, minmax(0, 1fr))`
          }
        }, items)])
      })

    if (children.length === 0) {
      children = h('div.no-result', 'No result')
    }
    const vnode = h('div', children)

    if (this.oldVnode) {
      patch(this.oldVnode, vnode)
    } else {
      patch(scrollElement, vnode)
    }
    this.oldVnode = vnode
  }

  listen() {
    super.listen()
    const { eventCenter } = this.muya

    eventCenter.subscribe('muya-quick-insert', (reference, block, status) => {
      if (status) {
        this.block = block
        this.show(reference)
        this.search(block.text.substring(1)) // remove `@` char
      } else {
        this.hide()
      }
    })
  }

  search(text) {
    const obj = this.getRenderObj()
    let result = obj
    if (text !== '') {
      result = {}
      Object.keys(obj).forEach(key => {
        // [Fuzzaldrin] filter(arr, text, { key: 'label' }) → customFilterByKey(arr, text, 'label')
        result[key] = customFilterByKey(obj[key], text, 'searchText')
      })
    }
    this.renderObj = result
    this.render()
  }

  getRuneDisplayText (item) {
    const runeName = item?.meta?.runeName || 'Rune'
    const rawText = String(this.block?.text || '')
      .replace(/^@+/, '')
      .trim()

    if (!rawText) return runeName

    const compactText = rawText.replace(/\s+/g, ' ').trim()
    if (!compactText) return runeName

    const withoutRuneName = compactText.replace(runeName, '').trim()
    return withoutRuneName || runeName
  }

  getPreviousNonEmptyLineText () {
    const { contentState } = this.muya
    if (!contentState || !this.block) return ''

    const outMostBlock = typeof contentState.findOutMostBlock === 'function'
      ? contentState.findOutMostBlock(this.block)
      : this.block
    const blocks = typeof contentState.getBlocks === 'function'
      ? contentState.getBlocks()
      : contentState.blocks || []
    const currentIndex = Array.isArray(blocks) ? blocks.findIndex(block => block && block.key === outMostBlock.key) : -1

    if (currentIndex <= 0) {
      return ''
    }

    for (let index = currentIndex - 1; index >= 0; index--) {
      const candidate = blocks[index]
      const text = String(candidate?.text || '')
        .replace(/\s+/g, ' ')
        .trim()

      if (text) {
        return text
      }

      const paragraphText = Array.isArray(candidate?.children)
        ? candidate.children
          .map(child => String(child?.text || '').trim())
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        : ''

      if (paragraphText) {
        return paragraphText
      }
    }

    return ''
  }

  insertRuneTemplate(item) {
    const { contentState } = this.muya
    const displayText = this.getRuneDisplayText(item)
    const runeValue = this.getPreviousNonEmptyLineText()
    const insertContent = createRunePlaceholderHtml(item, displayText, runeValue)
    const { key } = this.block
    this.block.text = insertContent
    const offset = insertContent.length
    contentState.cursor = {
      start: {
        key,
        offset
      },
      end: {
        key,
        offset
      }
    }
    contentState.updateParagraph('html', true)
  }

  selectItem(item) {
    const { contentState } = this.muya
    try {
      // Guard against null block
      if (!this.block) {
        this.hide()
        return
      }
      const { key } = this.block
      // Guard against invalid key (block may have been removed from editor)
      if (!key || !contentState.getBlock(key)) {
        this.hide()
        return
      }
      switch (item?.meta?.type) {
        case 'rune':
          this.insertRuneTemplate(item)
          break
        default:
          this.block.text = ''
          const offset = 0
          contentState.cursor = {
            start: {
              key,
              offset
            },
            end: {
              key,
              offset
            }
          }
          switch (item.label) {
            case 'paragraph':
              contentState.partialRender()
              break
            case 'image':
              contentState.format(item.label, true)
              break
            default:
              contentState.updateParagraph(item.label, true)
              break
          }
          break
      }
    } catch (err) {
      console.error('QuickInsert selectItem error:', err)
    } finally {
      // Always hide the panel after selection, regardless of success or failure
      setTimeout(this.hide.bind(this))
    }
  }

  // step() 方法继承自 BaseScrollFloat，无需重写

  getItemElement(item) {
    const { label } = item
    return this.scrollElement.querySelector(`[data-label="${label}"]`)
  }
  filter (candidates, target, { key }) {
    for (const candidate of candidates) {
      if (typeof candidate[key] === 'string' && candidate[key].includes(target)) {
        return candidate
      } else if (typeof candidate[key] === 'function' && candidate[key]().includes(target)) {
        return candidate
      }
    }
  }
}

export default QuickInsert
