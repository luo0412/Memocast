/**
 * [Fuzzaldrin was used here for fuzzy search, replaced with native includes-based filter]
 * Original fuzzaldrin usages:
 *   import { filter } from 'fuzzaldrin'
 *   filter(arr, text, { key: 'label' }) → customFilterByKey(arr, text, 'label')
 * Dependencies removed: fuzzaldrin
 */
import { patch, h } from '../../parser/render/snabbdom'
import { deepCopy } from '../../utils'
import BaseScrollFloat from '../baseScrollFloat'
import { quickInsertObj } from './config'
import './index.css'

const DEFAULT_GRID_COLUMNS = 6
const MIN_GRID_COLUMNS = 4
const MAX_GRID_COLUMNS = 8
const DEFAULT_RUNE_SECTION = 'last'
const FALLBACK_RUNE_ICON = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%237E57C2"/><path d="M32 12 18 24l6 6-8 8 16 14 16-14-8-8 6-6-14-12z" fill="%23fff"/></svg>'

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
  const color = encodeURIComponent(rune.color || '#7E57C2')
  return FALLBACK_RUNE_ICON.replace('%237E57C2', color)
}

const createRuneQuickInsertItem = (rune = {}) => {
  const id = rune.id || `rune-${Date.now()}`
  const name = (rune.name || '').trim() || 'Rune'
  const desc = (rune.desc || '').trim()
  const template = typeof rune.template === 'string' ? rune.template : ''
  const searchText = [name, desc, template].filter(Boolean).join(' ')

  return {
    title: () => name,
    subTitle: () => desc,
    label: `rune:${id}`,
    shortCut: '',
    icon: normalizeRuneIcon(rune),
    searchText,
    meta: {
      type: 'rune',
      runeId: id,
      insertContent: template
    }
  }
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
    this.runeSectionName = DEFAULT_RUNE_SECTION
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

  insertRuneTemplate(item) {
    const { contentState } = this.muya
    const insertContent = item?.meta?.insertContent || ''
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
    contentState.partialRender()
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
