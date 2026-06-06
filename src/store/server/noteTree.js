import { OFFLINE_ROOT_CATEGORY, normalizeCategoryForMatch } from 'src/utils/constants'

export function getCalendarNoteTimestamp (note, basis) {
  if (basis === 'created') {
    const c = note.dataCreated || note.data_created
    if (c != null && !Number.isNaN(Number(c))) return Number(c)
  }
  return Number(note.dataModified || note.data_modified || note.local_modified || 0)
}

export function formatYmd (ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function mapLocalNoteToSummary (note, fallbackCategory = OFFLINE_ROOT_CATEGORY) {
  const normalizedCategory = normalizeCategoryForMatch(note.category || fallbackCategory)
  return {
    docGuid: note.doc_guid,
    guid: note.doc_guid,
    title: note.title,
    abstractText: note.content ? note.content.substring(0, 200) : '',
    category: normalizedCategory,
    dataCreated: note.data_created || Date.now(),
    dataModified: note.data_modified || note.local_modified || Date.now(),
    _localId: note.id,
    _dirty: note.dirty === 1,
    _source: 'local'
  }
}

export function buildCategoryTreeFromNotes (notes, localCategories) {
  const categorySet = new Set()
  let hasOfflineRootContent = false

  const addCategoryPath = (rawCategory, options = {}) => {
    const normalized = options.normalizeRoot === false
      ? rawCategory
      : normalizeCategoryForMatch(rawCategory)

    if (!normalized || normalized === '') return
    if (normalized === '/') return

    if (normalized === OFFLINE_ROOT_CATEGORY) {
      hasOfflineRootContent = true
      categorySet.add(OFFLINE_ROOT_CATEGORY)
      return
    }

    const trimmed = normalized.replace(/\/$/, '')
    if (!trimmed) {
      hasOfflineRootContent = true
      categorySet.add(OFFLINE_ROOT_CATEGORY)
      return
    }

    const segments = trimmed.split('/').filter(Boolean)
    if (segments.length === 0) {
      hasOfflineRootContent = true
      categorySet.add(OFFLINE_ROOT_CATEGORY)
      return
    }

    let currentPath = ''
    for (const segment of segments) {
      currentPath += `/${segment}`
      categorySet.add(`${currentPath}/`)
    }
  }

  for (const note of notes) {
    addCategoryPath(note.category)
  }

  if (localCategories && localCategories.length > 0) {
    for (const cat of localCategories) {
      addCategoryPath(cat.category, { normalizeRoot: false })
      if (
        cat.category === OFFLINE_ROOT_CATEGORY ||
        cat.parent === OFFLINE_ROOT_CATEGORY ||
        (typeof cat.category === 'string' && cat.category.startsWith(OFFLINE_ROOT_CATEGORY))
      ) {
        hasOfflineRootContent = true
      }
    }
  }

  if (categorySet.size > 0 && Array.from(categorySet).some(path => path.startsWith(OFFLINE_ROOT_CATEGORY))) {
    hasOfflineRootContent = true
    categorySet.add(OFFLINE_ROOT_CATEGORY)
  }

  if (categorySet.size === 0) {
    return []
  }

  const nodeMap = new Map()

  if (hasOfflineRootContent || categorySet.has(OFFLINE_ROOT_CATEGORY)) {
    nodeMap.set(OFFLINE_ROOT_CATEGORY, {
      label: '我的笔记',
      key: OFFLINE_ROOT_CATEGORY,
      children: [],
      selectable: true,
      isOfflineRoot: true,
      categoryPath: OFFLINE_ROOT_CATEGORY
    })
  }

  for (const path of categorySet) {
    if (nodeMap.has(path)) continue
    const label = path.replace(/\/$/, '').split('/').filter(Boolean).pop() || '我的笔记'
    nodeMap.set(path, {
      label,
      key: path,
      children: [],
      selectable: true,
      categoryPath: path
    })
  }

  const roots = []
  for (const [path, node] of nodeMap) {
    if (path === OFFLINE_ROOT_CATEGORY) {
      roots.push(node)
      continue
    }

    const trimmed = path.replace(/\/$/, '')
    const lastSlashIndex = trimmed.lastIndexOf('/')
    const parentPath = lastSlashIndex > 0 ? `${trimmed.slice(0, lastSlashIndex + 1)}` : null
    const parent = parentPath ? nodeMap.get(parentPath) : null

    if (parent && parent !== node) {
      const alreadyExists = parent.children.some(child => child.key === node.key)
      if (!alreadyExists) {
        parent.children.push(node)
      }
    } else if (!roots.some(root => root.key === node.key)) {
      roots.push(node)
    }
  }

  const sortChildren = (node) => {
    node.children.sort((a, b) => a.label.localeCompare(b.label))
    for (const child of node.children) {
      sortChildren(child)
    }
  }

  for (const root of roots) {
    sortChildren(root)
  }

  roots.sort((a, b) => {
    if (a.key === OFFLINE_ROOT_CATEGORY) return -1
    if (b.key === OFFLINE_ROOT_CATEGORY) return 1
    return a.label.localeCompare(b.label)
  })

  return roots
}

export function findCategoryNode (node, key) {
  if (!node) return null
  if (node.key === key) return node
  if (node.children) {
    for (const child of node.children) {
      const found = findCategoryNode(child, key)
      if (found) return found
    }
  }
  return null
}

export function categoryExistsInTree (tree, category) {
  if (!Array.isArray(tree) || !category) return false
  return tree.some(node => !!findCategoryNode(node, category))
}
