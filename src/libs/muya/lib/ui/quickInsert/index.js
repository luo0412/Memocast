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

// ============ 可配置常量 ============
const GRID_COLUMNS = 3 // 网格列数，可随时修改

// ==================================

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
    this.columnsCount = GRID_COLUMNS // 使用常量定义列数
    this.sectionOffsets = [] // 记录每个分区的起始索引
    this.shouldHideOnScroll = false // Prevent scroll from hiding the panel during keyboard navigation
    this.renderObj = quickInsertObj
    this.render()
    this.listen()
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
    let children = Object.keys(_renderObj).filter(key => {
      return _renderObj[key].length !== 0
    })
      .map(key => {
        const titleVnode = h('div.title', key.toUpperCase())
        const items = []
        for (const item of _renderObj[key]) {
          const {
            title,
            label,
            icon
          } = item
          const iconVnode = h('div.icon-container', h('i.icon', {
            style: {
              background: `url(${icon}) 0% 0% / 100% no-repeat`,
              'background-size': '100%'
            }
          }))

          const description = h('div.description', [
            h('div.big-title', title())
          ])
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

        return h('section', [titleVnode, h('div.items-grid', items)])
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
    const { contentState } = this.muya
    const canInsertFrontMatter = contentState.canInsertFrontMatter(this.block)
    const obj = deepCopy(quickInsertObj)
    if (!canInsertFrontMatter) {
      obj['basic block'].splice(2, 1)
    }
    let result = obj
    if (text !== '') {
      result = {}
      Object.keys(obj).forEach(key => {
        // [Fuzzaldrin] filter(arr, text, { key: 'label' }) → customFilterByKey(arr, text, 'label')
        result[key] = customFilterByKey(obj[key], text, 'label')
      })
    }
    this.renderObj = result
    this.render()
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
    } catch (err) {
      console.error('QuickInsert selectItem error:', err)
    } finally {
      // Always hide the panel after selection, regardless of success or failure
      setTimeout(this.hide.bind(this))
    }
  }

  /**
   * 键盘导航逻辑
   * 上/下：按列移动（保持同列位置）
   * 左/右：按行移动（保持同行位置）
   *
   * 布局示例（3列）：
   *   [0] [1] [2]  ← Section 1 (basic block)
   *   [3] [4] [5]  ← Section 2 (advance block)
   *   [6] [7]      ← Section 2 续
   */
  step (direction) {
    let index = this.renderArray.findIndex(item => item === this.activeItem)
    if (index === -1) return

    const { columnsCount, sectionOffsets, renderArray } = this
    const columns = columnsCount || 1
    const totalItems = renderArray.length

    // ============ 通用：计算当前位置信息 ============
    // 找到当前所在的分区
    let currentSectionIndex = 0
    for (let i = sectionOffsets.length - 1; i >= 0; i--) {
      if (index >= sectionOffsets[i]) {
        currentSectionIndex = i
        break
      }
    }

    const sectionStart = sectionOffsets[currentSectionIndex]
    const sectionEnd = currentSectionIndex + 1 < sectionOffsets.length
      ? sectionOffsets[currentSectionIndex + 1] - 1
      : totalItems - 1
    const sectionLength = sectionEnd - sectionStart + 1

    // 当前项在分区内的相对索引和行列位置
    const innerIndex = index - sectionStart
    const currentRow = Math.floor(innerIndex / columns)
    const currentCol = innerIndex % columns
    // 当前行有多少列（最后一行可能不满）
    const colsInCurrentRow = Math.min(columns, sectionLength - currentRow * columns)

    switch (direction) {
      // 上：跳到上一行同列
      case 'previous': {
        let targetIndex = index - columns
        if (targetIndex < sectionStart) {
          // 跳到上一分区末尾
          const prevSectionIndex = currentSectionIndex - 1
          if (prevSectionIndex >= 0) {
            const prevSectionStart = sectionOffsets[prevSectionIndex]
            const prevSectionEnd = sectionOffsets[currentSectionIndex] - 1
            const prevSectionLength = prevSectionEnd - prevSectionStart + 1
            const targetCol = Math.min(currentCol, prevSectionLength - 1)
            targetIndex = prevSectionEnd - targetCol
          }
        }
        if (targetIndex >= 0) index = targetIndex
        break
      }

      // 下：跳到下一行同列
      case 'next': {
        let targetIndex = index + columns
        if (targetIndex > sectionEnd) {
          // 跳到下一分区第一个
          const nextSectionIndex = currentSectionIndex + 1
          if (nextSectionIndex < sectionOffsets.length) {
            targetIndex = sectionOffsets[nextSectionIndex]
          } else {
            // 循环到开头
            targetIndex = sectionOffsets[0]
          }
        }
        if (targetIndex < totalItems) index = targetIndex
        break
      }

      // 左：跳到同行左边一列（跨分区时回到上一分区末尾）
      case 'left': {
        let newCol = currentCol - 1
        let targetRow = currentRow
        let targetSection = currentSectionIndex

        if (newCol < 0) {
          // 移到上一行
          targetRow = currentRow - 1
          if (targetRow < 0) {
            // 移到上一分区末尾
            targetSection = currentSectionIndex - 1
            if (targetSection < 0) {
              // 循环到底部最后一个分区
              targetSection = sectionOffsets.length - 1
            }
          }
        }

        if (targetSection !== currentSectionIndex) {
          // 跨分区：计算目标分区的行数和最后一行列数
          const targetSectionStart = sectionOffsets[targetSection]
          const targetSectionEnd = targetSection + 1 < sectionOffsets.length
            ? sectionOffsets[targetSection + 1] - 1
            : totalItems - 1
          const targetSectionLength = targetSectionEnd - targetSectionStart + 1
          const targetColsInRow = Math.min(columns, targetSectionLength - targetRow * columns)
          newCol = targetColsInRow - 1 // 取该行最后一列
          index = targetSectionEnd
        } else {
          index = sectionStart + targetRow * columns + newCol
        }
        break
      }

      // 右：跳到同行右边一列（跨分区时进入下一分区开头）
      case 'right': {
        let newCol = currentCol + 1
        let targetRow = currentRow
        let targetSection = currentSectionIndex

        if (newCol >= colsInCurrentRow) {
          // 移到下一行
          targetRow = currentRow + 1
          newCol = 0
          // 检查是否超出当前分区
          const itemsInNextRow = Math.min(columns, sectionLength - targetRow * columns)
          if (targetRow * columns + newCol >= sectionLength) {
            // 移到下一分区开头
            targetSection = currentSectionIndex + 1
            if (targetSection >= sectionOffsets.length) {
              // 循环到开头
              targetSection = 0
              newCol = 0
              targetRow = 0
            } else {
              newCol = 0
              targetRow = 0
            }
          }
        }

        if (targetSection !== currentSectionIndex) {
          index = sectionOffsets[targetSection]
        } else {
          index = sectionStart + targetRow * columns + newCol
        }
        break
      }

      default:
        return
    }

    if (index >= 0 && index < totalItems) {
      this.activeItem = renderArray[index]
      this.render()
      const activeEle = this.getItemElement(this.activeItem)
      this.activeEleScrollIntoView(activeEle)
    }
  }

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
