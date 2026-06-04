import types from 'src/store/server/types'
import api from 'src/utils/api'
import DatabaseClient from 'src/utils/DatabaseClient'
import bus from 'src/components/bus'
import { OFFLINE_ROOT_CATEGORY, OFFLINE_ROOT_CATEGORY_KEY, normalizeCategoryForMatch } from 'src/utils/constants'
import SessionStorageService from 'src/services/SessionStorageService'

const APP_STATE_KEYS = {
  currentCategory: 'workspace.currentCategory',
  sidebarTreeType: 'workspace.sidebarTreeType',
  categoryTreeExpandedKeys: 'workspace.categoryTreeExpandedKeys',
  syncStatus: 'workspace.syncStatus'
}

/** @deprecated 请从 src/utils/constants 导入，保持单点定义 */
export { OFFLINE_ROOT_CATEGORY_KEY } from 'src/utils/constants'
/** @deprecated 请从 src/utils/constants 导入，保持单点定义 */
export { OFFLINE_ROOT_CATEGORY } from 'src/utils/constants'

function getCalendarNoteTimestamp (note, basis) {
  if (basis === 'created') {
    const c = note.dataCreated || note.data_created
    if (c != null && !Number.isNaN(Number(c))) return Number(c)
  }
  return Number(note.dataModified || note.data_modified || note.local_modified || 0)
}

function getNoteTagList(note) {
  return (note?.tags || '').split('*').filter(Boolean)
}

function formatYmd(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mapLocalNoteToSummary (note, fallbackCategory = OFFLINE_ROOT_CATEGORY) {
  return {
    docGuid: note.doc_guid,
    guid: note.doc_guid,
    title: note.title,
    abstractText: note.content ? note.content.substring(0, 200) : '',
    category: note.category || fallbackCategory,
    dataCreated: note.data_created || Date.now(),
    dataModified: note.data_modified || note.local_modified || Date.now(),
    _localId: note.id,
    _dirty: note.dirty === 1,
    _source: 'local'
  }
}

function parseLocalTagId(tagGuid) {
  if (!tagGuid || typeof tagGuid !== 'string') return null
  if (!tagGuid.startsWith('local_tag_')) return null
  const id = Number(tagGuid.replace('local_tag_', ''))
  return Number.isFinite(id) ? id : null
}

function replaceTagGuidString(tagString = '', fromTagGuid, toTagGuid) {
  const parts = tagString.split('*').filter(Boolean)
  const mapped = parts.map(tag => (tag === fromTagGuid ? toTagGuid : tag))
  return Array.from(new Set(mapped)).join('*')
}

async function migrateOfflineTagsToCloud(kbGuid) {
  if (!kbGuid) return { created: 0, attached: 0, updatedNotes: 0 }

  const localTags = await DatabaseClient.getTags()
  if (!Array.isArray(localTags) || localTags.length === 0) {
    return { created: 0, attached: 0, updatedNotes: 0 }
  }

  const cloudTags = await api.KnowledgeBaseApi.getAllTags({ kbGuid })
  const cloudTagMap = new Map((cloudTags || []).map(tag => [tag.name, tag]))

  let created = 0
  let attached = 0
  let updatedNotes = 0

  const localNotes = await DatabaseClient.getNotes()
  for (const localTag of localTags) {
    let cloudTag = cloudTagMap.get(localTag.name)
    if (!cloudTag) {
      cloudTag = await api.KnowledgeBaseApi.createTag({
        kbGuid,
        data: {
          name: localTag.name,
          parentTagGuid: ''
        }
      })
      if (cloudTag) {
        created++
        cloudTagMap.set(localTag.name, cloudTag)
      }
    }

    const cloudTagGuid = cloudTag?.tagGuid || cloudTag?.guid
    if (!cloudTagGuid) continue

    for (const note of (localNotes || [])) {
      const noteTags = getNoteTagList(note)
      if (!noteTags.includes(localTag.tagGuid)) continue

      const nextTags = replaceTagGuidString(note.tags || '', localTag.tagGuid, cloudTagGuid)
      if (nextTags !== (note.tags || '')) {
        await DatabaseClient.updateNote(note.id, {
          tags: nextTags,
          dirty: 1,
          local_modified: Date.now()
        })
        attached++
        updatedNotes++
      }
    }
  }

  return { created, attached, updatedNotes }
}

/**
 * 从笔记的 category 字段和 local_categories 表构建目录树
 * 路径格式：'/My Notes/'（根）、'/My Notes/Folder/'（子文件夹）
 * 笔记 category 和 local_categories 两个来源的路径都要显示（合并）
 * @param {Array} notes - notes 表中的所有笔记
 * @param {Array} [localCategories] - local_categories 表记录（空文件夹）
 * @returns {Array} 树形结构
 */
function buildCategoryTreeFromNotes (notes, localCategories) {
  const categorySet = new Set()

  // 从笔记的 category 字段收集所有唯一路径
  for (const note of notes) {
    if (note.category && note.category !== '/' && note.category !== '') {
      categorySet.add(note.category)
    }
  }

  // 始终合并 local_categories（确保空文件夹也显示）
  if (localCategories && localCategories.length > 0) {
    for (const cat of localCategories) {
      if (cat.category && cat.category !== '/' && cat.category !== '' && cat.category !== OFFLINE_ROOT_CATEGORY) {
        categorySet.add(cat.category)
      }
    }
  }

  if (categorySet.size === 0) {
    return []
  }

  // 构建所有路径节点（从根到每一级）
  const nodeMap = new Map()
  nodeMap.set(OFFLINE_ROOT_CATEGORY, {
    label: '我的笔记',
    key: OFFLINE_ROOT_CATEGORY,
    children: [],
    selectable: true,
    isOfflineRoot: true,
    categoryPath: OFFLINE_ROOT_CATEGORY
  })

  for (const path of categorySet) {
    if (nodeMap.has(path)) continue
    const label = path.replace(/\/$/, '').replace(/^\//, '') || '我的笔记'
    nodeMap.set(path, {
      label,
      key: path,
      children: [],
      selectable: true,
      categoryPath: path
    })
  }

  // 链接父子关系（根据路径字符串父子关系）
  const roots = [nodeMap.get(OFFLINE_ROOT_CATEGORY)]
  for (const [path, node] of nodeMap) {
    if (path === OFFLINE_ROOT_CATEGORY) continue
    // 去掉末尾 / 后找父路径
    const parentPath = path.slice(0, -1).slice(0, path.slice(0, -1).lastIndexOf('/') + 1) + '/'
    const parent = nodeMap.get(parentPath)
    if (parent && parentPath !== path) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // 递归排序子文件夹（字母序）
  const sortChildren = (node) => {
    node.children.sort((a, b) => a.label.localeCompare(b.label))
    for (const child of node.children) {
      sortChildren(child)
    }
  }
  if (roots[0]) sortChildren(roots[0])

  return roots[0] ? [roots[0]] : []
}

/**
 * 在树中查找指定 key 的节点
 */
function findCategoryNode (node, key) {
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

function categoryExistsInTree (tree, category) {
  if (!Array.isArray(tree) || !category) return false
  return tree.some(node => !!findCategoryNode(node, category))
}

async function loadWorkspaceState () {
  try {
    return await DatabaseClient.getAppStates(Object.values(APP_STATE_KEYS))
  } catch (error) {
    console.warn('[workspaceState] Failed to load app state:', error)
    return {}
  }
}

async function saveWorkspaceStateValue (key, value) {
  try {
    await DatabaseClient.setAppState(key, value)
  } catch (error) {
    console.warn(`[workspaceState] Failed to save ${key}:`, error)
  }
}

import { Dark, Dialog, Loading, Notify, QSpinnerGears } from 'quasar'
import helper from 'src/utils/helper'
import { i18n } from 'boot/i18n'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'
import _ from 'lodash'
import {
  exportFile,
  exportMarkdownFile,
  exportMarkdownFiles,
  exportPng,
  saveTempImage,
  uploadImages
} from 'src/ApiInvoker'
import html2canvas from 'html2canvas'
import debugLogger from 'src/utils/debugLogger'

export async function _getContent (kbGuid, docGuid) {
  console.time('FetchNote')
  
  // ✅ 关键改进：先检查 SQLite 是否有本地修改版本（比缓存更新）
  try {
    const localNote = await DatabaseClient.getNoteByDocGuidWithPriority(docGuid)
    if (localNote && localNote.content !== null && localNote.content !== undefined) {
      const localMod = parseInt(localNote.local_modified) || 0
      console.log(`[_getContent] Found in SQLite: id=${localNote.id}, local_mod=${localMod}, dirty=${localNote.dirty}, content_len=${(localNote.content || '').length}`)
      
      // 直接返回 SQLite 数据（本地优先），跳过云端和缓存
      return {
        _isRawMarkdown: true,
        info: { 
          docGuid: localNote.doc_guid || docGuid, 
          kbGuid, 
          title: localNote.title, 
          category: localNote.category || OFFLINE_ROOT_CATEGORY, 
          dataCreated: localNote.data_created, 
          dataModified: localMod || Date.now()
        },
        html: localNote.content,
        resources: []
      }
    }
  } catch (sqliteError) {
    console.warn(`[_content] SQLite check failed (will fallback to cloud/cache):`, sqliteError.message)
  }
  
  // 原有逻辑：从云端/缓存获取
  const { info } = await api.KnowledgeBaseApi.getNoteContent({
    kbGuid,
    docGuid,
    data: {
      downloadInfo: 1
    }
  })
  console.timeEnd('FetchNote')
  const cacheKey = api.KnowledgeBaseApi.getCacheKey(kbGuid, docGuid)
  const note = ClientFileStorage.getCachedNote(info, cacheKey)
  let result
  if (note) {
    console.log(`[_getContent] Using cached note (cacheKey=${cacheKey.substring(0, 50)}...)`)
    result = note
  } else {
    result = await api.KnowledgeBaseApi.getNoteContent({
      kbGuid,
      docGuid,
      data: {
        downloadInfo: 1,
        downloadData: 1
      }
    })
    ClientFileStorage.setCachedNote(result, cacheKey)
    console.log(`[_ContentLoaded] Fetched from cloud and cached`)
  }
  return result
}

function readFileAsync (f) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = event => {
      const base64 = event.target.result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(f)
  })
}

/** 防抖刷新所有标签的笔记数量（500ms 间隔） */
let _debouncedRefreshTagCounts = null

function getDebouncedRefreshTagCounts () {
  if (!_debouncedRefreshTagCounts) {
    _debouncedRefreshTagCounts = _.debounce(async function (store) {
      const { kbGuid, tags } = store.state
      if (!kbGuid || !tags || !tags.length) return
      const countMap = {}
      await Promise.all(
        tags.map(async tag => {
          try {
            const count = await api.KnowledgeBaseApi.getTagNoteCount({
              kbGuid,
              data: { tag: tag.tagGuid }
            })
            countMap[tag.tagGuid] = count
          } catch (err) {
            countMap[tag.tagGuid] = 0
          }
        })
      )
      store.commit(types.UPDATE_TAG_NOTES_COUNT, countMap)
    }, 500)
  }
  return _debouncedRefreshTagCounts
}

export default {
  /**
   * 从本地缓存中读取数据，初始化状态树
   * @param commit
   * @param state
   */
  async initServerStore ({
    commit,
    state
  }) {
    const localStore = ClientFileStorage.getItemsFromStore(state)
    commit(types.INIT, localStore)
    const [
      autoLogin,
      userId,
      password,
      url
    ] = ClientFileStorage.getItemsFromStore([
      'autoLogin',
      'userId',
      'password',
      'url'
    ])
    if (autoLogin) {
      this.dispatch('server/login', {
        userId,
        password,
        url
      })
    } else {
      // 未登录：从 SQLite 加载笔记和目录，统一使用 currentNotes/currentCategory
      await this.dispatch('server/loadLocalData')
    }
  },
  /**
   * 统一加载本地数据（未登录时从 SQLite 加载，已登录时也通过 getCategoryNotes 加载）
   * 统一使用 currentNotes 和 categories，不再区分 online/offline 数据源
   */
  async loadLocalData ({ commit, state, rootState }) {
    try {
      await DatabaseClient.ensureOfflineRoot()
      const workspaceState = await loadWorkspaceState()
      const localNotes = await DatabaseClient.getNotes()
      const localCategories = await DatabaseClient.getCategories({})
      console.log('[loadLocalData] loaded notes:', localNotes.length)
      console.log('[loadLocalData] localCategories:', localCategories)

      const allCategories = [...new Set(localNotes.map(n => n.category).filter(c => c && c !== '/'))]
      console.log('[loadLocalData] unique categories from notes:', allCategories)

      const tree = buildCategoryTreeFromNotes(localNotes, localCategories)
      console.log('[loadLocalData] built tree:', JSON.stringify(tree, null, 2))
      commit(types.SET_CATEGORIES, tree)

      const savedCurrentCategory = workspaceState[APP_STATE_KEYS.currentCategory] || state.currentCategory || OFFLINE_ROOT_CATEGORY
      const restoredCategory = categoryExistsInTree(tree, savedCurrentCategory)
        ? savedCurrentCategory
        : OFFLINE_ROOT_CATEGORY
      commit(types.UPDATE_CURRENT_CATEGORY, restoredCategory)

      if (rootState?.client && workspaceState[APP_STATE_KEYS.sidebarTreeType]) {
        commit('client/TOGGLE_CHANGED', {
          key: 'sidebarTreeType',
          value: workspaceState[APP_STATE_KEYS.sidebarTreeType]
        }, { root: true })
      }

      return localNotes || []
    } catch (err) {
      console.error('[loadLocalData] failed:', err)
      return []
    }
  },
  async getContent (payload, {
    kbGuid,
    docGuid
  }) {
    return await _getContent(kbGuid, docGuid)
  },
  /**
   * 用户登录接口
   * @param commit
   * @param rootState
   * @param payload
   * @returns {Promise<*>}
   */
  async login ({
    commit,
    rootState
  }, payload) {
    const { url } = payload
    api.AccountServerApi.setBaseUrl(url)
    const {
      userId,
      password
    } = payload
    const result = await api.AccountServerApi.Login(payload)

    if (rootState.client.rememberPassword) {
      ClientFileStorage.setItemsInStore({
        userId,
        password,
        url
      })
    } else {
      if (ClientFileStorage.isKeyExistInStore('password')) {
        ClientFileStorage.removeItemFromStore('password')
      }
      ClientFileStorage.setItemsInStore({
        userId,
        url
      })
    }
    if (
      !rootState.client.enableSelfHostServer &&
      ClientFileStorage.isKeyExistInStore('url')
    ) {
      ClientFileStorage.removeItemFromStore('url')
    }

    commit(types.LOGIN, {
      ...result,
      isLogin: true
    })

    // ✅ 永远本地优先：不禁用任何本地笔记
    // 登录时将 kb_guid=null 的离线笔记和文件夹迁移到当前账号，下次同步时推送到云端
    const newKbGuid = result.kbGuid
    if (newKbGuid) {
      try {
        const migratedNotes = await DatabaseClient.migrateOfflineNotes(newKbGuid)
        if (migratedNotes > 0) {
          console.log(`[login] Migrated ${migratedNotes} offline notes to kbGuid=${newKbGuid}`)
        }
        // 同步迁移离线文件夹（kb_guid='' → current kbGuid）
        await DatabaseClient.migrateOfflineCategories(newKbGuid)
        console.log(`[login] Migrated offline categories to kbGuid=${newKbGuid}`)

        const migratedTags = await migrateOfflineTagsToCloud(newKbGuid)
        console.log('[login] Migrated offline tags to cloud:', migratedTags)
      } catch (err) {
        console.warn('[login] Failed to migrate offline data:', err)
      }
    }

    // 检查是否有离线笔记需要同步（local_ 开头的 doc_guid）
    try {
      const pendingNotes = await DatabaseClient.getNotes({ dirty: 1 })
      const offlineNotes = pendingNotes.filter(n => n.doc_guid && n.doc_guid.startsWith('local_'))
      if (offlineNotes.length > 0) {
        console.log('[login] Found', offlineNotes.length, 'offline notes to sync')
        bus.$emit('showOfflineSyncPrompt', offlineNotes)
      }
    } catch (err) {
      console.warn('[login] Failed to check offline notes:', err)
    }

    this.dispatch('server/getAllTags')
    this.dispatch('server/getAllCategories')
    this.dispatch('server/getCategoryNotes')

    return result
  },
  /**
   * 登出（永远本地优先：不清除任何本地 SQLite 数据）
   * - 保留所有本地笔记，下次登录时自动关联到新账号
   * - 切换账号 = 改变同步目标，笔记留在本地
   */
  async logout ({ commit, state, dispatch }) {
    // 保存退出前的 kbGuid，清空前用它来清除笔记关联
    const oldKbGuid = state.kbGuid
    await api.AccountServerApi.Logout()
    SessionStorageService.clearSession()
    commit(types.LOGOUT)
    // 退出登录：清空笔记/目录关联并设 dirty=1（保留本地数据，下次登录可继续同步）
    if (oldKbGuid) {
      await DatabaseClient.clearNotesByKbGuid(oldKbGuid)
      await DatabaseClient.migrateOfflineCategories('')
    }
    await dispatch('loadLocalData')
    await dispatch('getAllTags')
    if (state.currentCategory && state.tags?.map(t => t.tagGuid).includes(state.currentCategory)) {
      await dispatch('updateCurrentCategory', { data: OFFLINE_ROOT_CATEGORY, type: 'category' })
    }
    await dispatch('getCategoryNotes', { category: '' })
  },
  /**
   * 重新登录
   * @param commit
   * @returns {Promise<void>}
   */
  async reLogin ({ commit }) {
    const [userId, password, url] = ClientFileStorage.getItemsFromStore([
      'userId',
      'password',
      'url'
    ])
    const result = await api.AccountServerApi.Login({
      userId,
      password,
      url
    })

    commit(types.LOGIN, {
      ...result,
      isLogin: true
    })
  },
  /**
   * 获取指定文件夹下的笔记
   * @param commit
   * @param state
   * @param payload
   * @returns {Promise<void>}
   */
  /**
   * 日历模式：用官方 list/category 按修改时间倒序分页，按 dataModified 落在所选本地自然日的笔记写入列表。
   * （公开文档无单独「按日」接口，此为等效查询方式。）
   */
  async fetchNotesByCalendarDate ({
    commit,
    state,
    rootState
  }, payload = {}) {
    const { kbGuid, isLogin } = state
    const basis = rootState.client.calendarDateBasis === 'created' ? 'created' : 'modified'
    let ymd = payload.date || rootState.client.calendarSelectedDate
    if (helper.isNullOrEmpty(ymd)) {
      const n = new Date()
      ymd = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
    }
    const parts = ymd.split('-').map(p => parseInt(p, 10))
    const dayStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime()
    const dayEnd = new Date(parts[0], parts[1] - 1, parts[2] + 1, 0, 0, 0, 0).getTime()
    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)

    if (!isLogin || !kbGuid) {
      try {
        const localNotes = await DatabaseClient.getNotes()
        const collected = (localNotes || [])
          .filter(note => note.title && note.title !== 'Untitled')
          .filter(note => {
            const ts = getCalendarNoteTimestamp(note, basis)
            return ts >= dayStart && ts < dayEnd
          })
          .map(note => mapLocalNoteToSummary(note, note.category || OFFLINE_ROOT_CATEGORY))
          .sort((a, b) => (b.dataModified || 0) - (a.dataModified || 0))

        commit(types.UPDATE_CURRENT_NOTES, collected)
      } catch (err) {
        console.error('[fetchNotesByCalendarDate] Offline calendar query failed:', err)
        commit(types.UPDATE_CURRENT_NOTES, [])
      } finally {
        commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
      }
      return
    }

    const orderBy = basis === 'created' ? 'created' : 'modified'
    const collected = []
    let start = 0
    const pageSize = 100
    const maxPages = 120
    try {
      for (let page = 0; page < maxPages; page++) {
        const batch = await api.KnowledgeBaseApi.getCategoryNotes({
          kbGuid,
          data: {
            category: '',
            start,
            count: pageSize,
            withAbstract: true,
            orderBy,
            ascending: 'desc'
          }
        })
        if (!batch || !batch.length) break
        for (const note of batch) {
          const ts = getCalendarNoteTimestamp(note, basis)
          if (ts >= dayEnd) continue
          if (ts >= dayStart && ts < dayEnd) collected.push(note)
          if (ts < dayStart) {
            commit(types.UPDATE_CURRENT_NOTES, collected)
            return
          }
        }
        if (batch.length < pageSize) break
        start += pageSize
      }
      commit(types.UPDATE_CURRENT_NOTES, collected)
    } finally {
      commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
    }
  },
  /**
   * 日历视图：拉取当月有笔记的日期列表，供日历格子高亮使用。
   * @param {number} year  4位年份
   * @param {number} month 1-12
   */
  async fetchCalendarNoteDates ({ commit, state, rootState }, { year, month }) {
    const { kbGuid, isLogin } = state
    const basis = rootState.client.calendarDateBasis === 'created' ? 'created' : 'modified'
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime()
    const monthEnd = new Date(year, month, 1, 0, 0, 0, 0).getTime()
    const dateSet = new Set()

    if (!isLogin || !kbGuid) {
      try {
        const localNotes = await DatabaseClient.getNotes()
        for (const note of (localNotes || [])) {
          const ts = getCalendarNoteTimestamp(note, basis)
          if (ts >= monthStart && ts < monthEnd) {
            dateSet.add(formatYmd(ts))
          }
        }
      } catch (err) {
        console.error('[fetchCalendarNoteDates] Offline calendar dates query failed:', err)
      }
      commit(types.SET_CALENDAR_NOTE_DATES, Array.from(dateSet).sort())
      return
    }

    const orderBy = basis === 'created' ? 'created' : 'modified'
    let start = 0
    const pageSize = 100
    const maxPages = 120
    try {
      for (let page = 0; page < maxPages; page++) {
        const batch = await api.KnowledgeBaseApi.getCategoryNotes({
          kbGuid,
          data: {
            category: '',
            start,
            count: pageSize,
            withAbstract: true,
            orderBy,
            ascending: 'asc'
          }
        })
        if (!batch || !batch.length) break
        let pastMonth = false
        for (const note of batch) {
          const ts = getCalendarNoteTimestamp(note, basis)
          if (ts < monthStart) continue
          if (ts >= monthEnd) {
            pastMonth = true
            break
          }
          const d = new Date(ts)
          const y = d.getFullYear()
          const m = d.getMonth() + 1
          const day = d.getDate()
          if (y === year && m === month) {
            dateSet.add(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
          }
        }
        if (pastMonth) break
        if (batch.length < pageSize) break
        start += pageSize
      }
    } finally {
    }
    commit(types.SET_CALENDAR_NOTE_DATES, Array.from(dateSet).sort())
  },
  async getCategoryNotes ({
    commit,
    state,
    rootState
  }, payload = {}) {
    if (rootState.client.sidebarTreeType === 'calendar') {
      await this.dispatch('server/fetchNotesByCalendarDate', payload)
      return
    }
    const {
      kbGuid,
      currentCategory,
      tags,
      isLogin  // ✅ 添加登录状态检查
    } = state
    const {
      category,
      start,
      count
    } = payload
    const isTagCategory = tags?.map(t => t.tagGuid).includes(helper.isNullOrEmpty(category) ? currentCategory : category)
    if (isTagCategory) {
      this.dispatch('server/getTagNotes', { tag: currentCategory })
      return
    }

    const targetCategory = category || currentCategory

    // ✅ 离线模式：完全从 SQLite 加载（不请求云端）
    if (!isLogin || !kbGuid) {
      console.log('[getCategoryNotes] Offline mode, loading from SQLite only:', targetCategory)
      
      try {
        const localNotes = await DatabaseClient.getNotes({ 
          category: targetCategory || OFFLINE_ROOT_CATEGORY 
        })
        
        // 转换为 UI 格式
        const formattedNotes = (localNotes || [])
          .filter(note => note.title && note.title !== 'Untitled')
          .map(note => mapLocalNoteToSummary(note, targetCategory || OFFLINE_ROOT_CATEGORY))
          .sort((a, b) => (b.dataModified || 0) - (a.dataModified || 0))
        
        console.log(`[getCategoryNotes] ✅ Loaded ${formattedNotes.length} notes from SQLite (offline mode)`)
        commit(types.UPDATE_CURRENT_NOTES, formattedNotes)
        return
      } catch (err) {
        console.error('[getCategoryNotes] Failed to load from SQLite:', err)
        commit(types.UPDATE_CURRENT_NOTES, [])
        return
      }
    }

    // ✅ 在线模式：合并云端和本地数据（本地优先）
    const cloudResult = await api.KnowledgeBaseApi.getCategoryNotes({
      kbGuid,
      data: {
        category: targetCategory,
        start: start || 0,
        count: count || 100,
        withAbstract: true
      }
    })

    // 获取本地 SQLite 中该分类下的所有笔记（包括 dirty=1 的）
    try {
      const localNotes = await DatabaseClient.getNotes({ category: targetCategory })
      
      // ✅ 核心去重原则：按 (category + title + kbGuid) 唯一，本地优先
      // 使用 Map 确保每个 (category, title, kbGuid) 只出现一次
      const dedupeMap = new Map()  // key: "category|title|kbGuid", value: 合并后的笔记对象
      
      // 第一步：添加所有本地笔记（本地优先权最高）
      for (const localNote of (localNotes || [])) {
        if (!localNote.title || localNote.title === 'Untitled') continue
        
        const dedupeKey = `${localNote.category || targetCategory}|${localNote.title}|${kbGuid || ''}`
        
        // 如果这个 (category, title) 还没出现过 → 添加
        if (!dedupeMap.has(dedupeKey)) {
          dedupeMap.set(dedupeKey, {
            docGuid: localNote.doc_guid,
            guid: localNote.doc_guid,
            title: localNote.title,
            abstractText: localNote.content ? localNote.content.substring(0, 200) : '',
            category: localNote.category || targetCategory,
            dataCreated: localNote.data_created || Date.now(),
            dataModified: localNote.data_modified || localNote.local_modified || Date.now(),
            _localId: localNote.id,
            _dirty: localNote.dirty === 1,
            _source: 'local'
          })
        }
        // 如果已存在 → 跳过（保留先添加的本地版本）
      }
      
      // 第二步：添加云端独有的笔记（本地没有的才添加）
      for (const cloudNote of cloudResult) {
        if (!cloudNote.title) continue

        // ✅ 规范化 category 并加上 kbGuid，确保与本地 dedupe key 对称
        const cloudCat = normalizeCategoryForMatch(cloudNote.category || targetCategory || '')
        const dedupeKey = `${cloudCat}|${cloudNote.title}|${kbGuid || ''}`

        // 只有当本地不存在这个 (category, title, kbGuid) 时才添加云端版本
        if (!dedupeMap.has(dedupeKey)) {
          dedupeMap.set(dedupeKey, {
            ...cloudNote,
            _source: 'cloud'
          })
        }
        // 如果本地已有 → 跳过（保持本地优先）
      }

      // 转换为数组（本地笔记在前，云端的在后）
      const mergedNotes = Array.from(dedupeMap.values())
        .sort((a, b) => {
          // 本地笔记优先显示在前
          if (a._source === 'local' && b._source !== 'local') return -1
          if (a._source !== 'local' && b._source === 'local') return 1
          // 同源的按时间倒序
          return (b.dataModified || 0) - (a.dataModified || 0)
        })

      console.log(`[getCategoryNotes] Deduped: ${cloudResult.length} cloud + ${(localNotes||[]).length} local → ${mergedNotes.length} unique (by category+title)`)
      commit(types.UPDATE_CURRENT_NOTES, mergedNotes)
    } catch (err) {
      console.warn('[getCategoryNotes] Failed to merge local notes:', err)
      // 降级：只显示云端数据
      commit(types.UPDATE_CURRENT_NOTES, cloudResult)
    }
  },
  /**
   * 获取指定文件夹下的笔记（用于导出，不修改 currentNotes 状态）
   * @param kbGuid
   * @param category
   * @returns {Promise<*>}
   */
  async getCategoryNotesForExport (_, { kbGuid, category }) {
    const result = await api.KnowledgeBaseApi.getCategoryNotes({
      kbGuid,
      data: {
        category,
        start: 0,
        count: 100,
        withAbstract: true
      }
    })
    return result
  },
  /**
   * 获取所有的笔记
   * @param commit
   * @param state
   * @returns {Promise<void>}
   */
  async getAllCategories ({
    commit,
    state
  }) {
    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
    const { kbGuid } = state
    const res = await api.KnowledgeBaseApi.getCategories({ kbGuid })
    commit(types.UPDATE_ALL_CATEGORIES, res.result)
    commit(types.UPDATE_CATEGORIES_POS, res.pos)
    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
  },
  /**
   * 获取笔记内容
   * 优先从 SQLite 读取本地最新版本（如果有未同步的修改）
   * @param commit
   * @param state
   * @param payload
   * @returns {Promise<void>}
   */
  async getNoteContent ({
    commit,
    state
  }, payload) {
    commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, true)
    const { kbGuid } = state
    const { docGuid } = payload
    
    console.log('\n🔍 [getNoteContent] ========== START ==========')
    console.log(`[getNoteContent] Request: docGuid=${docGuid}, kbGuid=${kbGuid}, isLogin=${state.isLogin}`)
    console.time('GetContent')

    // ✅ 防御：如果 docGuid 为空，立即返回
    if (!docGuid) {
      console.error('[getNoteContent] ❌ ERROR: docGuid is empty!')
      commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
      return
    }

    // 离线笔记（未登录 且 (无 docGuid 或 docGuid 以 local_ 开头））：从 SQLite 加载
    if (!state.isLogin && (!docGuid || docGuid.startsWith('local_'))) {
      console.log('[getNoteContent] Offline mode, loading from SQLite:', docGuid)
      try {
        const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
        if (localNote) {
          console.log(`[getNoteContent] ✅ Offline: Found in SQLite id=${localNote.id}`)
          commit(types.UPDATE_CURRENT_NOTE, {
            _isRawMarkdown: true,
            info: {
              docGuid: localNote.doc_guid,
              kbGuid: '',
              title: localNote.title,
              category: localNote.category || OFFLINE_ROOT_CATEGORY,
              dataCreated: localNote.data_created,
              dataModified: localNote.data_modified || localNote.local_modified
            },
            html: localNote.content || '',
            resources: []
          })
          commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
          console.log('🔍 [getNoteContent] ========== END (Offline) ==========\n')
          return
        }
      } catch (err) {
        console.warn('[getNoteContent] SQLite lookup failed for offline note:', err)
      }
      commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
      console.log('🔍 [getNoteContent] ========== END (Offline - Not Found) ==========\n')
      return
    }

    // ✅ 核心原则：SQLite 本地优先！永远先查本地数据库
    let result = null
    let loadedFrom = 'none'
    
    try {
      // Step 1: 查询本地 SQLite 数据库
      console.log('[getNoteContent] Step 1: Querying SQLite...')
      const localNote = await DatabaseClient.getNoteByDocGuidWithPriority(docGuid)
      
      if (localNote && localNote.id) {
        // ✅ 找到本地记录 → 使用本地版本（本地优先原则）
        console.log(`[getNoteContent] ✅ Step 1 SUCCESS: Found in SQLite!`)
        console.log(`[getNoteContent]   - ID: ${localNote.id}`)
        console.log(`[getNoteContent]   - Title: ${localNote.title}`)
        console.log(`[getNoteContent]   - Content length: ${(localNote.content || '').length}`)
        console.log(`[getNoteContent]   - Dirty: ${localNote.dirty}`)
        console.log(`[getNoteContent]   - Local modified: ${localNote.local_modified}`)
        console.log(`[getNoteContent]   - Doc GUID: ${localNote.doc_guid}`)
        
        loadedFrom = 'sqlite-local'
        
        // 提取内容（确保是字符串）
        const content = (typeof localNote.content === 'string') ? localNote.content : ''
        
        result = {
          _isRawMarkdown: true,
          _loadTimestamp: Date.now(),
          _source: 'sqlite',  // 标记来源
          info: { 
            docGuid: localNote.doc_guid || docGuid, 
            kbGuid: kbGuid || '', 
            title: localNote.title || 'Untitled', 
            category: localNote.category || OFFLINE_ROOT_CATEGORY, 
            dataCreated: localNote.data_created || Date.now(), 
            dataModified: parseInt(localNote.local_modified) || parseInt(localNote.data_modified) || Date.now()
          },
          html: content,
          resources: []
        }
        
        console.log(`[getNoteContent] ✅ Using LOCAL content from SQLite (len=${content.length})`)
        
      } else {
        // ❌ SQLite 没有找到 → 去云端获取
        console.log(`[getNoteContent] ⚠️ Step 1: NOT found in SQLite, will try cloud`)
        loadedFrom = 'cloud-fallback'
        
        try {
          console.log('[getNoteContent] Step 2: Fetching from cloud...')
          result = await _getContent(kbGuid, docGuid)
          
          if (result && result.html) {
            console.log(`[getNoteContent] ✅ Step 2 SUCCESS: Got from cloud (len=${(result.html || '').length})`)
            
            // ✅ 回填到 SQLite（下次就不用再去云端了）
            try {
              const markdown = helper.extractMarkdownFromMDNote(
                result.html, 
                kbGuid, 
                docGuid, 
                result.resources || []
              )
              
              await DatabaseService.createNote({
                doc_guid: docGuid,
                kb_guid: kbGuid,
                title: result.info?.title || 'Untitled',
                content: markdown,
                category: result.info?.category || OFFLINE_ROOT_CATEGORY,
                data_created: result.info?.dataCreated,
                data_modified: result.info?.dataModified,
                server_modified: Date.now(),
                local_modified: Date.now()
              })
              
              console.log(`[getNoteContent] 💾 Saved cloud content to SQLite for future use`)
            } catch (saveError) {
              console.warn('[getNoteContent] Failed to save to SQLite (non-critical):', saveError.message)
            }
          } else {
            console.warn('[getNoteContent] ⚠️ Step 2: Cloud returned empty/invalid result')
          }
        } catch (cloudError) {
          console.error('[getNoteContent] ❌ Step 2 FAILED: Cloud error:', cloudError)
          
          // ✅ 最后的兜底：创建一个空的本地记录（避免用户看到空白）
          result = {
            _isRawMarkdown: true,
            _loadTimestamp: Date.now(),
            _source: 'empty-fallback',
            info: {
              docGuid: docGuid,
              kbGuid: kbGuid || '',
              title: 'Untitled',
              category: OFFLINE_ROOT_CATEGORY,
              dataCreated: Date.now(),
              dataModified: Date.now()
            },
            html: '',
            resources: []
          }
          console.warn('[getNoteContent] ⚠️ Created empty fallback note (both SQLite and cloud failed)')
        }
      }
      
    } catch (sqliteError) {
      console.error('[getNoteContent] ❌ SQLite query error:', sqliteError)
      console.log('[getNoteContent] Falling back to cloud due to SQLite error...')
      
      // SQLite 出错 → 兜底去云端
      try {
        result = await _getContent(kbGuid, docGuid)
        loadedFrom = 'cloud-error-fallback'
      } catch (finalError) {
        console.error('[getNoteContent] ❌ COMPLETE FAILURE: Both SQLite and cloud failed:', finalError)
        
        // 最终兜底
        result = {
          _isRawMarkdown: true,
          _loadTimestamp: Date.now(),
          _source: 'error-fallback',
          info: {
            docGuid: docGuid,
            kbGuid: kbGuid || '',
            title: 'Error Loading Note',
            category: OFFLINE_ROOT_CATEGORY,
            dataCreated: Date.now(),
            dataModified: Date.now()
          },
          html: `# Error\n\nFailed to load note: ${docGuid}\n\nPlease check the console for details.`,
          resources: []
        }
      }
    }

    console.timeEnd('GetContent')
    
    // ✅ 最终检查：确保 result 有效
    if (!result || !result.info) {
      console.error('[getNoteContent] ❌ CRITICAL: result or result.info is null/undefined!')
      console.error('[getNoteContent] Creating emergency fallback...')
      
      result = {
        _isRawMarkdown: true,
        _loadTimestamp: Date.now(),
        _source: 'emergency-fallback',
        info: {
          docGuid: docGuid,
          kbGuid: kbGuid || '',
          title: 'Loading Error',
          category: OFFLINE_ROOT_CATEGORY,
          dataCreated: Date.now(),
          dataModified: Date.now()
        },
        html: '',
        resources: []
      }
    }
    
    console.log(`\n[getNoteContent] 📊 SUMMARY:`)
    console.log(`[getNoteContent]   - Loaded from: ${loadedFrom}`)
    console.log(`[getNoteContent]   - Result keys: ${Object.keys(result).join(', ')}`)
    console.log(`[getNoteContent]   - _isRawMarkdown: ${result._isRawMarkdown}`)
    console.log(`[getNoteContent]   - info.docGuid: ${result.info?.docGuid}`)
    console.log(`[getNoteContent]   - info.title: ${result.info?.title}`)
    console.log(`[getNoteContent]   - html type: ${typeof result.html}, len: ${(result.html || '').length}`)
    console.log(`[getNoteContent]   - html preview: ${JSON.stringify((result.html || '').substring(0, 100))}`)
    
    Loading.hide()
    commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
    commit(types.UPDATE_CURRENT_NOTE, result)
    
    console.log(`[getNoteContent] ✅ COMMITTED to Vuex store`)
    console.log(`🔍 [getNoteContent] ========== END ==========\n`)
  },
  /**
   * 设置当前显示的笔记文件夹，并在显示之前从网络刷新文件夹的内容
   * @param commit
   * @param category
   * @returns {Promise<void>}
   */
  async updateCurrentCategory ({ commit, state }, payload) {
    const {
      type,
      data
    } = payload
    commit(types.UPDATE_CURRENT_CATEGORY, data)
    commit(types.SAVE_TO_LOCAL_STORE_SYNC, ['currentCategory', data])
    await saveWorkspaceStateValue(APP_STATE_KEYS.currentCategory, data)
    if (type) {
      await saveWorkspaceStateValue(APP_STATE_KEYS.sidebarTreeType, type)
    }

    // 统一模式：始终从 SQLite 加载本地笔记（通过 getCategoryNotes 处理格式化）
    if (!state.isLogin || !state.kbGuid) {
      await this.dispatch('server/getCategoryNotes', { category: data })
      return
    }

    if (type === 'category') {
      await this.dispatch('server/getCategoryNotes', { category: data })
    } else if (type === 'tag') {
      await this.dispatch('server/getTagNotes', { tag: data })
    } else {
      await this.dispatch('server/getCategoryNotes', { category: '' })
    }
  },
  /**
   * 更新笔记信息，例如笔记title等
   * @param commit
   * @param state
   * @param payload
   * @returns {Promise<void>}
   */
  async updateNoteInfo ({
    commit,
    state
  }, payload) {
    const {
      docGuid,
      kbGuid,
      title
    } = payload
    
    // ✅ 自动补全 .md 后缀（如果标题没有以 .md 结尾）
    if (title && !title.toLowerCase().endsWith('.md')) {
      payload.title = `${title}.md`
      console.log(`[updateNoteInfo] Auto-append .md suffix: "${title}" → "${payload.title}"`)
    }
    
    await api.KnowledgeBaseApi.updateNoteInfo({
      kbGuid,
      docGuid,
      data: payload
    })
    
    // ✅ 安全更新：只更新 info 部分，不覆盖整个 currentNote（避免丢失本地编辑内容）
    const currentState = state.currentNote
    if (currentState && currentState.info) {
      // 合并更新：保留现有内容和 _isRawMarkdown 标记，只更新 info
      commit(types.UPDATE_CURRENT_NOTE, {
        ...currentState,
        info: {
          ...(currentState.info || {}),
          ...payload
        }
      })
    } else {
      // 首次设置（没有现有状态）
      commit(types.UPDATE_CURRENT_NOTE, payload)
    }
    
    this.dispatch('server/getCategoryNotes')
  },
  /**
   * 更新笔记内容
   * @param commit
   * @param state
   * @param markdown
   * @returns {Promise<void>}
   */
  async updateNote ({
    commit,
    state
  }, markdown) {
    if (!state.currentNote.info) return
    const {
      kbGuid,
      docGuid,
      category
    } = state.currentNote.info

    // 离线笔记（docGuid 以 local_ 开头）：仅保存到 SQLite，不推云端
    // 注意：必须同时检查 !state.isLogin，因为 login 后 kbGuid 被设置了，!kbGuid 会变成 false
    if (!state.isLogin && docGuid && docGuid.startsWith('local_')) {
      const { title } = state.currentNote.info
      try {
        const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
        if (localNote) {
          await DatabaseClient.updateNote(localNote.id, {
            title,
            content: markdown,
            category: OFFLINE_ROOT_CATEGORY,
            local_modified: Date.now()
          })
          console.log(`[updateNote/offline] SQLite updated: docGuid=${docGuid}, content_len=${markdown.length}`)
        } else {
          console.warn('[updateNote/offline] Note not found in SQLite:', docGuid)
        }
      } catch (err) {
        console.error('[updateNote/offline] SQLite write failed:', err)
      }
      // 刷新本地笔记列表
      await this.dispatch('server/getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY })
      commit(types.UPDATE_NOTE_STATE, 'default')
      return
    }
    if (state.noteState === 'default' || state.noteState === 'none') return
    let { title } = state.currentNote.info
    const { resources } = state.currentNote
    const isLite = category.replace(/\//g, '') === 'Lite'
    const html = helper.embedMDNote(markdown, resources, {
      wrapWithPreTag: isLite,
      kbGuid,
      docGuid
    })

    const _updateNote = async title => {
      // Step 1: 写本地 SQLite（本地优先架构 - 只标记为脏，不立即同步）
      let localNoteId = null
      let updatedNote = null
      const now = Date.now()
      try {
        const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
        if (localNote) {
          localNoteId = localNote.id
          updatedNote = await DatabaseClient.updateNote(localNote.id, {
            title,
            content: markdown,
            category,
            local_modified: now
          })
          console.log(`[updateNote] SQLite updated: id=${localNote.id}, content_len=${markdown.length}, dirty=1 (pending manual sync)`)
          
          if (updatedNote) {
            // 数据已写入 SQLite，无需额外操作
          }
        } else {
          // 首次保存：创建本地记录
          const note = await DatabaseClient.createNote({
            doc_guid: docGuid,
            title,
            content: markdown,
            category,
            data_created: now,
            data_modified: now,
            local_modified: now
          })
          localNoteId = note?.id
          updatedNote = note
          if (note) {
            console.log(`[updateNote] SQLite created: id=${note.id}, dirty=1 (pending manual sync)`)
          }
        }
      } catch (err) {
        console.error('[updateNote] SQLite write failed:', err)
      }

      // ✅ 本地优先架构改进：不再立即推送云端
      // 用户编辑只保存到 SQLite 并标记 dirty=1，等待用户点击同步按钮时批量上传
      
      await this.dispatch('server/getCategoryNotes')
    }
    if (!_.endsWith(title, '.md')) {
      Dialog.create({
        title: i18n.t('convertToMarkdownNote'),
        message: i18n.t('convertToMarkdownNoteHint'),
        ok: {
          label: i18n.t('ok')
        },
        cancel: {
          label: i18n.t('cancel')
        }
      }).onOk(async () => {
        title = `${title}.md`
        await _updateNote(title)
      })
    } else {
      await _updateNote(title)
    }
  },
  /**
   * 创建笔记
   * @param commit
   * @param state
   * @param rootState
   * @param title
   * @returns {Promise<void>}
   */
  async createNote ({
    commit,
    state,
    rootState
  }, title) {
    const {
      kbGuid,
      currentCategory = '',
      isLogin
    } = state
    const userId = ClientFileStorage.getItemFromStore('userId')
    const safeCategory = currentCategory || ''
    const isLite = safeCategory.replace(/\//g, '') === 'Lite'
    
    // ✅ 同名检测：如果当前文件夹下已有同名笔记，自动添加编号 (1), (2)...
    let finalTitle = title || i18n.t('untitled')
    try {
      const existingNotes = await DatabaseClient.getNotes({ category: safeCategory || '/' })
      if (existingNotes && existingNotes.length > 0) {
        const titleSet = new Set(existingNotes.map(n => n.title))
        if (titleSet.has(finalTitle)) {
          let counter = 1
          // ✅ 分离文件名和扩展名，确保编号在扩展名之前
          const lastDotIndex = finalTitle.lastIndexOf('.')
          const baseName = lastDotIndex > 0 ? finalTitle.substring(0, lastDotIndex) : finalTitle
          const ext = lastDotIndex > 0 ? finalTitle.substring(lastDotIndex) : ''
          
          while (titleSet.has(`${baseName} (${counter})${ext}`)) {
            counter++
          }
          finalTitle = `${baseName} (${counter})${ext}`
          console.log(`[createNote] Duplicate title detected: "${title}" → "${finalTitle}"`)
        }
      }
    } catch (err) {
      console.warn('[createNote] Failed to check duplicate titles:', err)
    }

    const initialContent = `# ${finalTitle}`
    const now = Date.now()

    // 如果未登录，仅在本地 SQLite 创建，不推云端
    if (!isLogin) {
      // 生成一个本地 GUID（uuid 格式）用于标识离线笔记
      const localDocGuid = `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
      let note = null
      try {
        note = await DatabaseClient.createNote({
          doc_guid: localDocGuid,
          title: finalTitle,
          content: initialContent,
          category: OFFLINE_ROOT_CATEGORY,
          data_created: now,
          data_modified: now,
          local_modified: now
        })
      } catch (err) {
        console.error('[createNote/offline] SQLite create failed:', err)
        Notify.create({
          message: i18n.t('createNoteFailed'),
          type: 'negative',
          icon: 'error'
        })
        return
      }
      if (!note) {
        console.error('[createNote/offline] SQLite create returned null')
        Notify.create({
          message: i18n.t('createNoteFailed'),
          type: 'negative',
          icon: 'error'
        })
        return
      }
      // 刷新本地笔记列表
      await this.dispatch('server/getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY })
      // 显示本地草稿内容
      commit(types.UPDATE_CURRENT_NOTE, {
        _isRawMarkdown: true,
        info: {
          docGuid: localDocGuid,
          kbGuid: '',
          title: finalTitle,
          category: OFFLINE_ROOT_CATEGORY,
          dataCreated: now,
          dataModified: now
        },
        html: initialContent,
        resources: []
      })
      Notify.create({
        message: i18n.t('saveNoteSuccessfully'),
        type: 'positive',
        icon: 'check'
      })
      return
    }

    // 以下为已登录逻辑（原逻辑）

    // Step 1: 先在本地 SQLite 创建草稿（dirty=1，待同步）
    // 生成临时 doc_guid，确保离线创建的笔记也有唯一标识
    const tempDocGuid = `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
    let localNoteId = null
    try {
      const note = await DatabaseClient.createNote({
        doc_guid: tempDocGuid,
        kb_guid: kbGuid,
        title: finalTitle,
        content: initialContent,
        category: currentCategory || OFFLINE_ROOT_CATEGORY,
        data_created: now,
        data_modified: now,
        local_modified: now
      })
      if (note) {
        localNoteId = note.id
      }
    } catch (err) {
      console.warn('[createNote] SQLite create failed, continuing with cloud:', err)
    }

    // Step 2: 推送到云端
    try {
      const result = await api.KnowledgeBaseApi.createNote({
        kbGuid,
        data: {
          category: currentCategory,
          kbGuid,
          title: finalTitle,
          owner: userId,
          html: helper.embedMDNote(initialContent, [], { wrapWithPreTag: isLite }),
          type: isLite ? 'lite/markdown' : 'document'
        }
      })
      // 云端创建成功后，更新本地 doc_guid
      if (localNoteId) {
        try {
          await DatabaseClient.updateNote(localNoteId, {
            doc_guid: result.guid
          })
          await DatabaseClient.createGuidMapping(localNoteId, result.guid, 'wiznote')
        } catch (e2) {
          console.warn('[createNote] Failed to update local doc_guid:', e2)
        }
      }
      // 直接 commit 本地已创建的笔记内容，不走 getNoteContent 重新请求云端
      // 因为 result 是 { guid, returnCode, ... } 对象，字段名与 getNoteContent 期望的 { docGuid } 不匹配
      // 本地已有 initialContent = `# ${finalTitle}`，直接使用本地版本即可
      const docGuid = result.guid
      commit(types.UPDATE_CURRENT_NOTE, {
        _isRawMarkdown: true,
        info: {
          docGuid,
          kbGuid,
          title: finalTitle,
          category: currentCategory || OFFLINE_ROOT_CATEGORY,
          dataCreated: now,
          dataModified: now
        },
        html: initialContent,
        resources: []
      })
      await this.dispatch('server/getCategoryNotes')
    } catch (err) {
      console.error('[createNote] Cloud create failed:', err)
      // 云端失败时保留本地草稿，用户仍可在离线模式下编辑
      if (localNoteId) {
        // 直接显示本地草稿内容，不等待 sync 完成
        commit(types.UPDATE_CURRENT_NOTE, {
          _isRawMarkdown: true,
          info: {
            docGuid: null,
            kbGuid,
            title,
            category: currentCategory || OFFLINE_ROOT_CATEGORY,
            dataCreated: now,
            dataModified: now
          },
          html: initialContent,
          resources: []
        })
        this.dispatch('client/sync', null, { root: true })
      } else {
        Notify.create({
          message: i18n.t('createNoteFailed'),
          type: 'negative',
          icon: 'error'
        })
      }
    }
  },
  /**
   * 保存旧笔记内容（用于切换笔记时保存上一个笔记）
   * 与 updateNote 不同，这里使用传入的 noteInfo 而非 state.currentNote
   * @param commit
   * @param markdown
   * @param noteInfo - 旧笔记的 info 对象，包含 docGuid, kbGuid, title, category, resources 等
   */
  async updateNoteWithInfo ({ commit }, { markdown, noteInfo, resources: incomingResources = [] }) {
    if (!noteInfo) return
    const { kbGuid, docGuid, title, category = '/' } = noteInfo
    // ✅ 优先使用传入的 resources（来自 Muya.vue 的 previousResources），保持与 Ctrl+S 一致
    const resources = incomingResources && incomingResources.length > 0 ? incomingResources : []
    
    // ✅ 区分离线和在线模式，而不是直接 return
    const isOfflineNote = !docGuid || !kbGuid || (docGuid && docGuid.startsWith('local_'))
    
    if (isOfflineNote) {
      // ✅ 离线笔记：只写 SQLite，不推云端
      try {
        const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
        if (localNote) {
          await DatabaseClient.updateNote(localNote.id, {
            title,
            content: markdown,
            category: OFFLINE_ROOT_CATEGORY,
            local_modified: Date.now()
          })
          console.log(`[updateNoteWithInfo/offline] SQLite updated: id=${localNote.id}, docGuid=${docGuid}, content_len=${markdown.length}`)
        } else {
          // 首次保存：创建本地记录
          const now = Date.now()
          const note = await DatabaseClient.createNote({
            doc_guid: docGuid || `local_${now}_${Math.random().toString(36).substring(2, 10)}`,
            title,
            content: markdown,
            category: OFFLINE_ROOT_CATEGORY,
            data_created: now,
            data_modified: now,
            local_modified: now
          })
          if (note) {
            console.log(`[updateNoteWithInfo/offline] SQLite created: id=${note.id}`)
          }
        }
        
        // 刷新本地笔记列表
        await this.dispatch('server/getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY })
      } catch (err) {
        console.error('[updateNoteWithInfo/offline] SQLite write failed:', err)
      }
      
      return  // ✅ 离线笔记到此结束，不执行下面的云端同步逻辑
    }

    // 以下为已登录的在线笔记逻辑
    const isLite = category.replace(/\//g, '') === 'Lite'
    const html = helper.embedMDNote(markdown, resources, {
      wrapWithPreTag: isLite,
      kbGuid,
      docGuid
    })

    // Step 1: 写本地 SQLite（本地优先架构 - 只标记为脏，不立即同步）
    const now = Date.now()
    try {
      const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
      if (localNote) {
        const updatedNote = await DatabaseClient.updateNote(localNote.id, {
          title,
          content: markdown,
          category,
          local_modified: now
        })
        console.log(`[updateNoteWithInfo] SQLite updated: id=${localNote.id}, content_len=${markdown.length}, dirty=1 (pending manual sync)`)
        
        if (updatedNote) {
          // 数据已写入 SQLite，无需额外操作
        }
      } else {
        // 首次保存：创建本地记录
        const note = await DatabaseClient.createNote({
          doc_guid: docGuid,
          title,
          content: markdown,
          category,
          data_created: now,
          data_modified: now,
          local_modified: now
        })
        if (note) {
          // 数据已写入 SQLite
        }
      }
    } catch (err) {
      console.error('[updateNoteWithInfo] SQLite write failed:', err)
    }

    // ✅ 本地优先架构改进：不再立即推送云端
    // 用户编辑只保存到 SQLite 并标记 dirty=1，等待用户点击同步按钮时批量上传
  },
  importNote ({
    commit,
    state
  }, importFile) {
    const {
      kbGuid,
      currentCategory = '',
      isLogin
    } = state
    const title = importFile.name
    const userId = ClientFileStorage.getItemFromStore('userId')
    const isLite = currentCategory.replace(/\//g, '') === 'Lite'
    const reader = new FileReader()
    reader.readAsText(importFile)
    reader.onload = async () => {
      const text = reader.result
      const now = Date.now()

      // 离线导入：仅写入本地 SQLite，不推云端
      if (!isLogin) {
        const localDocGuid = `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
        try {
          const note = await DatabaseClient.createNote({
            doc_guid: localDocGuid,
            title,
            content: text,
            category: OFFLINE_ROOT_CATEGORY,
            data_created: now,
            data_modified: now,
            local_modified: now
          })
          if (note) {
            await this.dispatch('server/getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY })
          }
          commit(types.UPDATE_CURRENT_NOTE, {
            _isRawMarkdown: true,
            info: {
              docGuid: localDocGuid,
              kbGuid: '',
              title,
              category: OFFLINE_ROOT_CATEGORY,
              dataCreated: now,
              dataModified: now
            },
            html: text,
            resources: []
          })
        } catch (err) {
          console.warn('[importNote/offline] SQLite create failed:', err)
        }
        return
      }

      // Step 1: 先写入本地 SQLite（dirty=1，待同步）
      let localNoteId = null
      try {
        const note = await DatabaseClient.createNote({
          title,
          content: text,
          category: currentCategory || OFFLINE_ROOT_CATEGORY,
          data_created: now,
          data_modified: now,
          local_modified: now
        })
        if (note) {
          localNoteId = note.id
        }
      } catch (err) {
        console.warn('[importNote] SQLite create failed:', err)
      }

      // Step 2: 推送到云端
      try {
        const result = await api.KnowledgeBaseApi.createNote({
          kbGuid,
          data: {
            category: currentCategory,
            kbGuid,
            title,
            owner: userId,
            html: helper.embedMDNote(text, [], { wrapWithPreTag: isLite }),
            type: isLite ? 'lite/markdown' : 'document'
          }
        })
        const docGuid = result.guid
        // 云端创建成功后更新本地 doc_guid
        if (localNoteId) {
          try {
            await DatabaseClient.updateNote(localNoteId, {
              doc_guid: docGuid
            })
            await DatabaseClient.createGuidMapping(localNoteId, docGuid, 'wiznote')
          } catch (e2) {
            console.warn('[importNote] Failed to update local doc_guid:', e2)
          }
        }
        // 直接 commit 本地内容，不走 getNoteContent 重新请求云端
        commit(types.UPDATE_CURRENT_NOTE, {
          _isRawMarkdown: true,
          info: {
            docGuid,
            kbGuid,
            title,
            category: currentCategory || OFFLINE_ROOT_CATEGORY,
            dataCreated: now,
            dataModified: now
          },
          html: text,
          resources: []
        })
        await this.dispatch('server/getCategoryNotes')
      } catch (err) {
        console.error('[importNote] Cloud import failed:', err)
        Notify.create({
          message: i18n.t('importNoteFailed'),
          type: 'negative',
          icon: 'error'
        })
      }
    }
  },
  /**
   * 删除笔记
   * @param commit
   * @param state
   * @param payload
   * @returns {Promise<void>}
   */
  async deleteNote ({
    commit,
    state
  }, payload) {
    const {
      kbGuid,
      docGuid
    } = payload

    // 离线笔记删除：直接删除本地记录，不推云端
    if (docGuid && docGuid.startsWith('local_')) {
      try {
        const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
        if (localNote) {
          await DatabaseClient.deleteNote(localNote.id)
        }
        // 刷新本地笔记列表
        await this.dispatch('server/getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY })
      } catch (err) {
        console.warn('[deleteNote/offline] SQLite delete failed:', err)
      }
      if (state.currentNote && state.currentNote.info && state.currentNote.info.docGuid === docGuid) {
        commit(types.CLEAR_CURRENT_NOTE)
      }
      Notify.create({
        color: 'red-10',
        message: i18n.t('deleteNoteSuccessfully'),
        icon: 'delete'
      })
      return
    }

    // Step 1: 先在本地 SQLite 标记删除（软删，本地记录保留但标记为 deleted）
    // 注意：当前 schema 没有 deleted 字段，这里直接物理删除本地记录
    // 同步时检测到本地有删除日志（sync_log）则从云端删除
    try {
      const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
      if (localNote) {
        await DatabaseClient.deleteNote(localNote.id)
      }
    } catch (err) {
      console.warn('[deleteNote] SQLite delete failed:', err)
    }

    // Step 2: 从云端删除（同步进行，不阻塞 UI）
    const _deleteFromCloud = async () => {
      try {
        await api.KnowledgeBaseApi.deleteNote({
          kbGuid,
          docGuid
        })
      } catch (err) {
        console.error('[deleteNote] Cloud delete failed:', err)
      }
    }
    _deleteFromCloud()

    const { currentNote } = state
    if (currentNote && currentNote.info.docGuid === docGuid) {
      commit(types.CLEAR_CURRENT_NOTE)
    }

    // 乐观更新：立即从 UI 移除，云端删除异步进行
    const newNotes = state.currentNotes.filter(n => n.docGuid !== docGuid)
    commit(types.UPDATE_CURRENT_NOTES, newNotes)

    Notify.create({
      color: 'red-10',
      message: i18n.t('deleteNoteSuccessfully'),
      icon: 'delete'
    })
  },
  /**
   * 创建笔记目录
   * @param commit
   * @param state
   * @param childCategoryName
   * @returns {Promise<void>}
   */
  async createCategory ({
    commit,
    state
  }, {
    childCategoryName,
    parentCategory
  }) {
    const { kbGuid, isLogin, categories } = state

    // 计算完整路径（父路径 + 子文件夹名）
    let fullCategoryPath
    // 根目录（空、/、/My Notes/）下创建直接子文件夹
    if (helper.isNullOrEmpty(parentCategory) || parentCategory === OFFLINE_ROOT_CATEGORY || parentCategory === '/') {
      fullCategoryPath = `${OFFLINE_ROOT_CATEGORY}${childCategoryName}/`
    } else {
      // parentCategory 格式为 '/My Notes/Work/'，去掉末尾 / 后找倒数第二个 /
      // '/My Notes/Work/'.slice(0, -1) = '/My Notes/Work' → .lastIndexOf('/') = 11 → parentBase = '/My Notes/'
      const parentBase = parentCategory.slice(0, -1).slice(0, parentCategory.slice(0, -1).lastIndexOf('/') + 1)
      fullCategoryPath = `${parentBase}${childCategoryName}/`
    }

    // 在线模式：同时创建云端目录 + 本地记录
    if (isLogin && kbGuid) {
      if (helper.checkCategoryExistence(categories, parentCategory, childCategoryName)) {
        Notify.create({ color: 'red-10', message: i18n.t('categoryExisted'), icon: 'error' })
        return
      }
      try {
        await api.KnowledgeBaseApi.createCategory({
          kbGuid,
          data: {
            parent: helper.isNullOrEmpty(parentCategory) ? '/' : parentCategory,
            pos: Math.floor(Date.now() / 1000).toFixed(0),
            child: childCategoryName
          }
        })
        // 标记本地目录已同步到云端
        await DatabaseClient.createCategory({
          category: fullCategoryPath,
          parent: helper.isNullOrEmpty(parentCategory) ? OFFLINE_ROOT_CATEGORY : parentCategory,
          kbGuid,
          localOnly: false
        })
        await this.dispatch('server/getAllCategories')
        await this.dispatch('server/updateCurrentCategory', { data: fullCategoryPath, type: 'category' })
      } catch (err) {
        console.error('[createCategory] online failed:', err)
        Notify.create({ color: 'red-10', message: i18n.t('categoryExisted'), icon: 'error' })
      }
      return
    }

    // 离线模式：只创建本地目录
    try {
      const localCategories = await DatabaseClient.getCategories({})
      const exists = localCategories.some(c => c.category === fullCategoryPath)
      if (exists) {
        Notify.create({ color: 'red-10', message: i18n.t('categoryExisted'), icon: 'error' })
        return
      }
      await DatabaseClient.createCategory({
        category: fullCategoryPath,
        parent: helper.isNullOrEmpty(parentCategory) ? OFFLINE_ROOT_CATEGORY : parentCategory,
        kbGuid: kbGuid || '',
        localOnly: true
      })

      // 乐观更新目录树：前端直接修改 state.categories（不查数据库，避免看不到刚创建的临时文件夹）
      const currentTree = state.categories
      if (currentTree && currentTree.length > 0) {
        const root = currentTree[0]
        // 找到父节点
        const parentNode = findCategoryNode(root, parentCategory || OFFLINE_ROOT_CATEGORY)
        if (parentNode) {
          // 避免重复
          if (!parentNode.children.find(c => c.key === fullCategoryPath)) {
            parentNode.children.push({
              label: childCategoryName,
              key: fullCategoryPath,
              children: [],
              selectable: true,
              categoryPath: fullCategoryPath
            })
            // 排序
            parentNode.children.sort((a, b) => a.label.localeCompare(b.label))
          }
        }
        commit(types.SET_CATEGORIES, [...currentTree])
      }
      await this.dispatch('server/updateCurrentCategory', { data: fullCategoryPath, type: 'category' })
      Notify.create({ color: 'positive', message: i18n.t('categoryCreated'), icon: 'folder_open' })
    } catch (err) {
      console.error('[createCategory] offline failed:', err)
      Notify.create({ color: 'red-10', message: '创建文件夹失败', icon: 'error' })
    }
  },
  async deleteCategory ({
    commit,
    state
  }, category) {
    const { kbGuid, isLogin } = state

    // 在线模式：先删云端
    if (isLogin && kbGuid) {
      try {
        await api.KnowledgeBaseApi.deleteCategory({ kbGuid, data: { category } })
      } catch (err) {
        console.warn('[deleteCategory] online delete failed:', err)
      }
    }

    // 再删本地记录
    try {
      await DatabaseClient.deleteCategory(category)
      // 刷新目录树（基于笔记 + local_categories 兜底）
      const updatedNotes = await DatabaseClient.getNotes()
      const updatedCategories = await DatabaseClient.getCategories({})
      const tree = buildCategoryTreeFromNotes(updatedNotes, updatedCategories)
      commit(types.SET_CATEGORIES, tree)
      // 删除该目录下的所有本地笔记（同时删除整个分类）
      await this.dispatch('server/updateCurrentCategory', { data: '', type: '' })
    } catch (err) {
      console.error('[deleteCategory] local delete failed:', err)
    }

    Notify.create({ color: 'red-6', message: i18n.t('deleteCategorySuccessfully'), icon: 'delete' })
  },
  async uploadImage ({
    commit,
    getters,
    state,
    rootState
  }, file) {
    const token = getters.wizNoteToken
    const {
      kbGuid,
      currentNote: {
        info: { docGuid }
      }
    } = state

    const {
      client: {
        imageUploadService
      }
    } = rootState
    // eslint-disable-next-line no-case-declarations
    let base64

    switch (imageUploadService) {
      case 'wizOfficialImageUploadService':
        if (file instanceof File) {
          base64 = await readFileAsync(file)
          file = {
            file: base64,
            ext: file.name
          }
        }
        // eslint-disable-next-line no-case-declarations
        const result = await uploadImages([file], imageUploadService, {
          kbGuid,
          docGuid,
          wizToken: token,
          baseUrl: api.KnowledgeBaseApi.getBaseUrl()
        })
        commit(types.UPDATE_CURRENT_NOTE_RESOURCE, result.result)
        // await saveUploadedImage(buffer, kbGuid, docGuid, result.name)
        if (!result.success) {
          Notify.create({
            message: i18n.t('failToUpload'),
            type: 'negative',
            icon: 'clear'
          })
          return helper.isNullOrEmpty(base64) ? file : base64
        } else {
          return helper.isNullOrEmpty(result.result) ? file : helper.isNullOrEmpty(result.result[0]) ? file : result.result[0].url
        }
      case 'picgoServer':
        if (file instanceof File) {
          base64 = await readFileAsync(file)
          file = {
            file: base64,
            ext: file.name
          }
        }
        // eslint-disable-next-line no-case-declarations
        const res = await uploadImages([file], imageUploadService)
        if (!res.success) {
          Notify.create({
            message: i18n.t('failToUpload'),
            type: 'negative',
            icon: 'clear'
          })
          return helper.isNullOrEmpty(base64) ? file : base64
        } else {
          return helper.isNullOrEmpty(res.result) ? file : helper.isNullOrEmpty(res.result[0]) ? file : res.result[0]
        }
      case 'none':
        if (file instanceof File) {
          const base64 = await readFileAsync(file)
          file = await saveTempImage({
            file: base64,
            kbGuid,
            docGuid
          })
        }
        return file
      default:
        break
    }
  },
  async moveNote ({ commit }, noteInfo) {
    const {
      kbGuid,
      docGuid,
      category,
      type
    } = noteInfo
    const isLite = category === '/Lite/' ? 'lite/markdown' : type
    await api.KnowledgeBaseApi.updateNoteInfo({
      kbGuid,
      docGuid,
      data: {
        ...noteInfo,
        type: isLite ? 'lite/markdown' : type
      }
    })
    await this.dispatch('server/getCategoryNotes')
  },
  async copyNote ({
    commit,
    state
  }, noteInfo) {
    const {
      kbGuid,
      docGuid,
      category
    } = noteInfo
    const { currentCategory } = state
    await api.KnowledgeBaseApi.copyNote({
      kbGuid,
      docGuid,
      data: {
        targetCategory: category
      }
    })
    const isCurrentCategory = category === currentCategory
    if (isCurrentCategory || helper.isNullOrEmpty(currentCategory)) {
      await this.dispatch('server/getCategoryNotes')
    }
  },
  async searchNote ({
    commit,
    state
  }, searchText) {
    const { kbGuid } = state
    // commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
    // commit(types.UPDATE_CURRENT_NOTES, result)
    // commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
    return await api.KnowledgeBaseApi.searchNote({
      data: {
        ss: searchText
      },
      kbGuid
    })
  },
  async updateContentsList ({ commit }, editorRootElement) {
    const list = await helper.updateContentsList(editorRootElement) || []
    commit(types.UPDATE_CONTENTS_LIST, list)
  },
  updateNoteState ({ commit }, noteState) {
    commit(types.UPDATE_NOTE_STATE, noteState)
  },
  async getTagNotes ({
    commit,
    state
  }, payload) {
    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
    const { kbGuid, isLogin } = state
    const {
      tag,
      start,
      count
    } = payload

    if (!isLogin || !kbGuid) {
      const localTagId = parseLocalTagId(tag)
      if (!localTagId) {
        commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
        commit(types.UPDATE_CURRENT_NOTES, [])
        return
      }

      try {
        const taggedLocalNotes = await DatabaseClient.getNotes()
        const localTagNotes = []

        for (const note of (taggedLocalNotes || [])) {
          const noteTags = getNoteTagList(note)
          if (noteTags.includes(tag)) {
            localTagNotes.push(mapLocalNoteToSummary(note, note.category || OFFLINE_ROOT_CATEGORY))
          }
        }

        commit(types.UPDATE_CURRENT_NOTES, localTagNotes.sort((a, b) => (b.dataModified || 0) - (a.dataModified || 0)))
      } catch (err) {
        console.error('[getTagNotes] Offline local tag query failed:', err)
        commit(types.UPDATE_CURRENT_NOTES, [])
      } finally {
        commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
      }
      return
    }

    const result = await api.KnowledgeBaseApi.getTagNotes({
      kbGuid,
      data: {
        tag,
        withAbstract: true,
        start: start || 0,
        count: count || 100,
        orderBy: 'modified'
      }
    })
    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
    commit(types.UPDATE_CURRENT_NOTES, result)
  },
  /**
   * 防抖刷新所有标签的笔记数量。
   * 切换到标签树视图时调用，避免频繁切换触发大量请求。
   */
  refreshTagNotesCount () {
    getDebouncedRefreshTagCounts()(this)
  },
  async getAllTags ({
    commit,
    state
  }) {
    const { kbGuid, isLogin, currentNote } = state
    if (!isLogin || !kbGuid) {
      try {
        const tags = await DatabaseClient.getTags()
        const countMap = {}
        const allNotes = await DatabaseClient.getNotes()

        for (const tag of tags) {
          let count = 0
        for (const note of (allNotes || [])) {
          const noteTags = getNoteTagList(note)
          if (noteTags.includes(tag.tagGuid)) {
            count++
          }
        }
          countMap[tag.tagGuid] = count
        }

        commit(types.UPDATE_ALL_TAGS, tags)
        commit(types.UPDATE_TAG_NOTES_COUNT, countMap)

        if (currentNote?.info?.docGuid && currentNote.info.docGuid.startsWith('local_')) {
          const localNote = await DatabaseClient.getNoteByDocGuid(currentNote.info.docGuid)
          if (localNote) {
            const noteTags = await DatabaseClient.getNoteTags(localNote.id)
            commit(types.UPDATE_CURRENT_NOTE_TAGS, noteTags.map(t => t.tagGuid).join('*'))
          }
        }
      } catch (err) {
        console.error('[getAllTags] Offline tags query failed:', err)
        commit(types.UPDATE_ALL_TAGS, [])
        commit(types.UPDATE_TAG_NOTES_COUNT, {})
      }
      return
    }

    const tags = await api.KnowledgeBaseApi.getAllTags({ kbGuid })

    const countMap = {}
    await Promise.all(
      tags.map(async tag => {
        const count = await api.KnowledgeBaseApi.getTagNoteCount({
          kbGuid,
          data: { tag: tag.tagGuid }
        })
        countMap[tag.tagGuid] = count
      })
    )

    commit(types.UPDATE_ALL_TAGS, tags)
    commit(types.UPDATE_TAG_NOTES_COUNT, countMap)
  },
  /**
   * 创建一个标签，但没有指定哪篇笔记拥有这个标签
   * @param state
   * @param parentTag
   * @param name
   * @returns {Promise<void>}
   */
  async createTag ({ state }, {
    parentTag = {},
    name
  }) {
    const { kbGuid, isLogin } = state
    const { tagGuid: parentTagGuid } = parentTag

    if (!isLogin || !kbGuid) {
      return await DatabaseClient.createTag({ name })
    }

    return await api.KnowledgeBaseApi.createTag({
      kbGuid,
      data: {
        parentTagGuid,
        name
      }
    })
  },
  /**
   * 将指定的标签添加到当前笔记上
   * @param state
   * @param commit
   * @param tagGuid
   * @returns {Promise<void>}
   */
  async attachTag ({
    state,
    commit
  }, { tagGuid }) {
    const {
      currentNote: { info }
    } = state
    const newTagList = info.tags?.split('*').filter(Boolean) || []
    if (!newTagList.includes(tagGuid)) {
      newTagList.push(tagGuid)
    }
    commit(types.UPDATE_CURRENT_NOTE_TAGS, newTagList.join('*'))

    if (!state.isLogin || !state.kbGuid || (info.docGuid && info.docGuid.startsWith('local_'))) {
      const localTagId = parseLocalTagId(tagGuid)
      const localNote = await DatabaseClient.getNoteByDocGuid(info.docGuid)
      if (localNote && localTagId) {
        await DatabaseClient.attachTagToNote(localNote.id, localTagId)
        await DatabaseClient.updateNote(localNote.id, {
          tags: newTagList.join('*'),
          local_modified: Date.now()
        })
      }
      this.dispatch('server/getAllTags')
      return
    }

    this.dispatch('server/updateNoteInfo', {
      ...state.currentNote.info,
      tags: newTagList.join('*')
    })
    this.dispatch('server/getAllTags')
  },
  async renameTag ({ state }, tag) {
    const { kbGuid, isLogin } = state
    if (!isLogin || !kbGuid) {
      return
    }

    const {
      tagGuid,
      name
    } = tag
    await api.KnowledgeBaseApi.renameTag({
      kbGuid,
      data: {
        tagGuid,
        name
      }
    })
    this.dispatch('server/getAllTags')
  },
  async moveTag ({ state }, {
    tag,
    parentTag = {}
  }) {
    const { kbGuid, isLogin } = state
    if (!isLogin || !kbGuid) {
      return
    }

    const { tagGuid } = tag
    const { tagGuid: parentTagGuid } = parentTag
    await api.KnowledgeBaseApi.moveTag({
      kbGuid,
      data: {
        tagGuid,
        parentTagGuid
      }
    })
    this.dispatch('server/getAllTags')
  },
  /**
   * 移除某篇笔记上的tag标记，不会删除这个tag
   * @returns {Promise<void>}
   */
  async removeTag ({
    state,
    commit
  }, { tagGuid }) {
    const {
      currentNote: { info }
    } = state
    const newTagList =
      info.tags?.split('*').filter(t => t && t !== tagGuid) || []
    commit(types.UPDATE_CURRENT_NOTE_TAGS, newTagList.join('*'))

    if (!state.isLogin || !state.kbGuid || (info.docGuid && info.docGuid.startsWith('local_'))) {
      const localTagId = parseLocalTagId(tagGuid)
      const localNote = await DatabaseClient.getNoteByDocGuid(info.docGuid)
      if (localNote && localTagId) {
        await DatabaseClient.removeTagFromNote(localNote.id, localTagId)
        await DatabaseClient.updateNote(localNote.id, {
          tags: newTagList.join('*'),
          local_modified: Date.now()
        })
      }
      this.dispatch('server/getAllTags')
      return
    }

    this.dispatch('server/updateNoteInfo', {
      ...state.currentNote.info,
      tags: newTagList.join('*')
    })
    this.dispatch('server/getAllTags')
  },
  /**
   * 将一个tag永久删除
   * @param state
   * @param tag
   * @returns {Promise<void>}
   */
  async deleteTag ({ state }, tag) {
    const { kbGuid, isLogin } = state
    const { tagGuid } = tag

    if (!isLogin || !kbGuid) {
      const localTagId = parseLocalTagId(tagGuid)
      if (!localTagId) return
      await DatabaseClient.deleteTag(localTagId)
      this.dispatch('server/getAllTags')
      return
    }

    await api.KnowledgeBaseApi.deleteTag({
      kbGuid,
      tagGuid
    })
    this.dispatch('server/getAllTags')
  },
  /**
   * 导出markdown文件到本地
   * @param state
   * @param noteField
   * @param {boolean} current
   * @returns {Promise<void>}
   */
  async exportMarkdownFile ({ state }, {
    noteField,
    current
  }) {
    const {
      kbGuid,
      currentNote
    } = state
    let docGuid
    if (current) {
      docGuid = currentNote.info.docGuid
    } else if (noteField) {
      docGuid = noteField.docGuid
    } else {
      return
    }
    Loading.show({
      spinner: QSpinnerGears,
      message: i18n.t('prepareExportData'),
      delay: 400
    })
    const result = await _getContent(kbGuid, docGuid)
    const title = result.info.title.split('.')[0]
    const isHtml = !_.endsWith(result.info.title, '.md')
    const {
      html,
      resources
    } = result
    let content
    if (isHtml) {
      content = helper.convertHtml2Markdown(html, kbGuid, docGuid, resources)
    } else {
      content = helper.extractMarkdownFromMDNote(
        html,
        kbGuid,
        docGuid,
        resources
      )
    }
    Loading.hide()
    exportMarkdownFile({ content, kbGuid, docGuid, resources, title })
  },
  /**
   * 导出为png
   * @param state
   * @param noteField
   * @param current
   * @param elementId
   * @returns {Promise<void>}
   */
  async exportPng ({ state }, {
    noteField,
    current,
    elementId = 'ag-editor-id'
  }) {
    const {
      kbGuid,
      currentNote
    } = state
    let docGuid
    if (current) {
      docGuid = currentNote.info.docGuid
    } else if (noteField) {
      docGuid = noteField.docGuid
    } else {
      return
    }
    const result = await _getContent(kbGuid, docGuid)
    const title = result.info.title.split('.')[0]
    // const title = _.endsWith(result.info.title, '.md') ? result.info.title.replace('.md') : result.info.title
    if (_.isEmpty(currentNote)) return
    Loading.show({
      spinner: QSpinnerGears,
      message: i18n.t('prepareExportData'),
      delay: 400
    })
    const canvasID = document.getElementById(elementId)
    const color = Dark.isActive
    html2canvas(canvasID, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: color ? '#35373e' : '#ffffff'
    }).then(canvas => {
      const dom = document.body.appendChild(canvas)
      dom.style.display = 'none'
      document.body.removeChild(dom)
      const content = dom.toDataURL('image/png')
      Loading.hide()
      exportPng({ content, title })
    }).catch(e => {
      debugLogger.Error(e)
      Loading.hide()
    })
  },
  async exportFile ({ state }, {
    content,
    fileName,
    fileType
  }) {
    fileName = fileName.split('.')[0]
    // fileName = _.endsWith(fileName, '.md') ? fileName.replace('.md') : fileName
    exportFile({
      content,
      fileName,
      fileType
    }).then()
  },
  /**
   * 批量导出markdown笔记到本地
   * @param state
   * @param noteFields
   * @param category  optional category override for the export folder name
   * @returns {Promise<void>}
   */
  async exportMarkdownFiles ({ state }, noteFields = [], category = '') {
    const {
      kbGuid,
      currentCategory
    } = state
    const results = []
    Loading.show({
      spinner: QSpinnerGears,
      message: i18n.t('prepareExportData'),
      delay: 400
    })
    for (const noteField of noteFields) {
      const { docGuid } = noteField
      const result = await _getContent(kbGuid, docGuid)
      results.push(result)
    }
    const contents = results.map(result => {
      const isHtml = !_.endsWith(result.info.title, '.md')
      const {
        html,
        info: { docGuid },
        resources
      } = result
      let content
      if (isHtml) {
        content = helper.convertHtml2Markdown(html, kbGuid, docGuid, resources)
      } else {
        content = helper.extractMarkdownFromMDNote(
          html,
          kbGuid,
          docGuid,
          resources
        )
      }
      return {
        content,
        title: isHtml ? result.info.title : result.info.title.replace('.md', '')
      }
    })
    Loading.hide()
    const exportCategory = category || currentCategory
    const exportCategoryName = exportCategory.split('/')[1] || 'Export'
    await exportMarkdownFiles({
      contents,
      category: exportCategoryName
    })
  }
}
