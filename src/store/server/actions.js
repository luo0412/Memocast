import types from 'src/store/server/types'
import clientTypes from 'src/store/client/types'
import api from 'src/utils/api'
import DatabaseClient from 'src/utils/DatabaseClient'
import bus from 'src/components/bus'
import { OFFLINE_ROOT_CATEGORY, OFFLINE_ROOT_CATEGORY_KEY, normalizeCategoryForMatch } from 'src/utils/constants'
import SessionStorageService from 'src/services/SessionStorageService'
import { APP_STATE_KEYS, loadWorkspaceState, saveWorkspaceStateValue } from 'src/store/server/workspaceState'
import {
  buildCategoryTreeFromNotes,
  categoryExistsInTree,
  findCategoryNode,
  formatYmd,
  getCalendarNoteTimestamp,
  mapLocalNoteToSummary
} from 'src/store/server/noteTree'
import {
  ensureUniqueNoteTitleInCategory,
  generateUniqueNoteTitleInCategory
} from 'src/store/server/noteUniquenessService'

function mergeCategoryCollections ({ localCategories = [], remoteCategories = [], localNotes = [], remoteCategoryPos = {} }) {
  const normalizedMap = new Map()

  const appendCategory = (rawCategory, source = {}, options = {}) => {
    const shouldNormalizeRoot = options.normalizeRoot !== false
    const category = shouldNormalizeRoot ? normalizeCategoryForMatch(rawCategory) : rawCategory
    if (!category || category === '/') return

    const defaultParent = shouldNormalizeRoot ? OFFLINE_ROOT_CATEGORY : (source.parent || '/')
    const existing = normalizedMap.get(category) || {
      category,
      parent: source.parent || defaultParent,
      kbGuid: source.kbGuid || source.kb_guid || '',
      local_only: source.local_only || 0
    }

    normalizedMap.set(category, {
      ...existing,
      ...source,
      category,
      parent: source.parent || existing.parent || defaultParent,
      kbGuid: source.kbGuid ?? source.kb_guid ?? existing.kbGuid ?? '',
      local_only: source.local_only ?? existing.local_only ?? 0
    })
  }

  for (const category of localCategories) {
    appendCategory(category?.category, category)
  }

  for (const note of localNotes) {
    appendCategory(note?.category, {
      parent: OFFLINE_ROOT_CATEGORY,
      kbGuid: note?.kb_guid || '',
      local_only: 1
    })
  }

  for (const category of remoteCategories) {
    appendCategory(category?.category, category, { normalizeRoot: false })
  }

  const mergedCategories = Array.from(normalizedMap.values())
  const tree = remoteCategories.length > 0
    ? buildCategoryTreeFromNotes([], mergedCategories)
    : buildCategoryTreeFromNotes(localNotes, mergedCategories)

  return {
    categories: mergedCategories,
    tree,
    pos: remoteCategoryPos || {}
  }
}
import {
  createLocalDraftNote,
  promoteLocalDraftToCloudGuid,
  saveOfflineImportedNote,
  upsertLocalNoteByDocGuid
} from 'src/store/server/notePersistenceService'
import {
  getOfflineCalendarDates,
  getOfflineCalendarNotes,
  getOfflineNotesByCategory,
  getOfflineTagNotes,
  getOfflineTagsWithCounts,
  loadLocalWorkspaceData
} from 'src/store/server/localDataService'
import {
  getNoteTagList,
  migrateOfflineTagsToCloud,
  parseLocalTagId
} from 'src/store/server/localSyncMigration'

/** @deprecated 请从 src/utils/constants 导入，保持单点定义 */
export { OFFLINE_ROOT_CATEGORY_KEY } from 'src/utils/constants'
/** @deprecated 请从 src/utils/constants 导入，保持单点定义 */
export { OFFLINE_ROOT_CATEGORY } from 'src/utils/constants'

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

function getDefaultCategoryForMode (state, category = '') {
  if (state?.isLogin && state?.kbGuid) {
    if (!category || category === OFFLINE_ROOT_CATEGORY) return ''
    return category
  }
  return category || OFFLINE_ROOT_CATEGORY
}

export async function _getContent (kbGuid, docGuid) {
  
  // ✅ 关键改进：先检查 SQLite 是否有本地修改版本（比缓存更新）
  try {
      const localNote = await DatabaseClient.notes.getByDocGuidWithPriority(docGuid)
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
      const workspaceState = await loadWorkspaceState()
      const {
        notes: localNotes,
        categories: localCategories,
        tree
      } = await loadLocalWorkspaceData()
      console.log('[loadLocalData] loaded notes:', localNotes.length)
      console.log('[loadLocalData] localCategories:', localCategories)

      const allCategories = [...new Set(localNotes.map(n => n.category).filter(c => c && c !== '/'))]
      console.log('[loadLocalData] unique categories from notes:', allCategories)

      console.log('[loadLocalData] built tree:', JSON.stringify(tree, null, 2))
      commit(types.SET_CATEGORIES, tree)

      const savedCurrentCategory = workspaceState[APP_STATE_KEYS.currentCategory] || state.currentCategory || OFFLINE_ROOT_CATEGORY
      const restoredCategory = categoryExistsInTree(tree, savedCurrentCategory)
        ? savedCurrentCategory
        : OFFLINE_ROOT_CATEGORY
      commit(types.UPDATE_CURRENT_CATEGORY, restoredCategory)

      if (rootState?.client && workspaceState[APP_STATE_KEYS.sidebarTreeType]) {
        commit(`client/${clientTypes.TOGGLE_CHANGED}`, {
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
    rootState,
    state,
    dispatch
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
        const migratedNotes = await DatabaseClient.notes.migrateOffline(newKbGuid)
        if (migratedNotes > 0) {
          console.log(`[login] Migrated ${migratedNotes} offline notes to kbGuid=${newKbGuid}`)
        }
        // 同步迁移离线文件夹（kb_guid='' → current kbGuid）
        await DatabaseClient.categories.migrateOffline(newKbGuid)
        console.log(`[login] Migrated offline categories to kbGuid=${newKbGuid}`)

        const migratedTags = await migrateOfflineTagsToCloud(newKbGuid)
        console.log('[login] Migrated offline tags to cloud:', migratedTags)
      } catch (err) {
        console.warn('[login] Failed to migrate offline data:', err)
      }
    }

    // 检查是否有离线笔记需要同步（local_ 开头的 doc_guid）
    try {
      const pendingNotes = await DatabaseClient.notes.getAll({ dirty: 1 })
      const offlineNotes = pendingNotes.filter(n => n.doc_guid && n.doc_guid.startsWith('local_'))
      if (offlineNotes.length > 0) {
        console.log('[login] Found', offlineNotes.length, 'offline notes to sync')
        bus.$emit('showOfflineSyncPrompt', offlineNotes)
      }
    } catch (err) {
      console.warn('[login] Failed to check offline notes:', err)
    }

    await this.dispatch('server/getAllTags')
    await this.dispatch('server/getAllCategories')

    const nextCategory = getDefaultCategoryForMode(state, state.currentCategory)
    if (state.currentCategory) {
      await dispatch('updateCurrentCategory', {
        data: nextCategory,
        type: 'category'
      })
    } else {
      await this.dispatch('server/getCategoryNotes', { category: nextCategory })
    }

    return result
  },
  /**
   * 登出（永远本地优先：不清除任何本地 SQLite 数据）
   * - 保留所有本地笔记，下次登录时自动关联到新账号
   * - 切换账号 = 改变同步目标，笔记留在本地
   */
  async logout ({ commit, state, dispatch }) {
    // 保存退出前的状态，避免 commit(LOGOUT) 后读取到被清空的数据
    const oldKbGuid = state.kbGuid
    const wasTagSelection = !!(state.currentCategory && state.tags?.map(t => t.tagGuid).includes(state.currentCategory))

    await api.AccountServerApi.Logout()

    if (oldKbGuid) {
      await DatabaseClient.notes.clearByKbGuid(oldKbGuid)
      const accountCategories = await DatabaseClient.categories.getAll({ kbGuid: oldKbGuid })
      const uniqueCategories = new Map()
      for (const category of (accountCategories || [])) {
        if (!category?.category) continue
        uniqueCategories.set(category.category, category)
      }

      for (const category of uniqueCategories.values()) {
        await DatabaseClient.categories.create({
          category: category.category,
          parent: category.parent,
          kbGuid: '',
          localOnly: category.local_only === 1
        })
      }
    }

    SessionStorageService.clearSession()
    commit(types.LOGOUT)

    await dispatch('loadLocalData')
    await dispatch('getAllTags')
    await dispatch('getAllCategories')
    commit(types.UPDATE_CATEGORIES_POS, {})
    if (wasTagSelection) {
      await dispatch('updateCurrentCategory', { data: OFFLINE_ROOT_CATEGORY, type: 'category' })
    }
    await dispatch('getCategoryNotes', { category: '' })
  },
  /**
   * 重新登录
   * @param commit
   * @returns {Promise<void>}
   */
  async reLogin ({ commit, dispatch, state }) {
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

    if (result.kbGuid) {
      try {
        const migratedNotes = await DatabaseClient.notes.migrateOffline(result.kbGuid)
        if (migratedNotes > 0) {
          console.log(`[reLogin] Migrated ${migratedNotes} offline notes to kbGuid=${result.kbGuid}`)
        }
        await DatabaseClient.categories.migrateOffline(result.kbGuid)
        console.log(`[reLogin] Migrated offline categories to kbGuid=${result.kbGuid}`)

        const migratedTags = await migrateOfflineTagsToCloud(result.kbGuid)
        console.log('[reLogin] Migrated offline tags to cloud:', migratedTags)
      } catch (err) {
        console.warn('[reLogin] Failed to migrate offline data:', err)
      }
    }

    await dispatch('getAllTags')
    await dispatch('getAllCategories')

    if (state.currentCategory) {
      await dispatch('updateCurrentCategory', {
        data: state.currentCategory,
        type: 'category'
      })
    } else {
      await dispatch('getCategoryNotes')
    }
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
        const collected = await getOfflineCalendarNotes({ basis, dayStart, dayEnd })
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
        const offlineDates = await getOfflineCalendarDates({ basis, monthStart, monthEnd })
        commit(types.SET_CALENDAR_NOTE_DATES, offlineDates)
      } catch (err) {
        console.error('[fetchCalendarNoteDates] Offline calendar dates query failed:', err)
      }
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
      isLogin
    } = state
    const {
      category,
      start,
      count
    } = payload
    const resolvedCategory = helper.isNullOrEmpty(category) ? currentCategory : category
    const isTagCategory = tags?.map(t => t.tagGuid).includes(resolvedCategory)
    if (isTagCategory) {
      this.dispatch('server/getTagNotes', { tag: currentCategory })
      return
    }

    const targetCategory = getDefaultCategoryForMode(state, resolvedCategory)

    if (!isLogin || !kbGuid) {
      try {
        const formattedNotes = await getOfflineNotesByCategory(targetCategory)
        console.log(`[getCategoryNotes] Loaded ${formattedNotes.length} notes from SQLite:`, targetCategory)
        commit(types.UPDATE_CURRENT_NOTES, formattedNotes)
        return
      } catch (err) {
        console.error('[getCategoryNotes] Failed to load from SQLite:', err)
        commit(types.UPDATE_CURRENT_NOTES, [])
        return
      }
    }

    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
    try {
      const result = await api.KnowledgeBaseApi.getCategoryNotes({
        kbGuid,
        data: {
          category: targetCategory,
          start: start || 0,
          count: count || 100,
          withAbstract: true
        }
      })
      console.log('[getCategoryNotes] Loaded remote notes:', {
        category: targetCategory || '/',
        count: Array.isArray(result) ? result.length : 0
      })
      commit(types.UPDATE_CURRENT_NOTES, Array.isArray(result) ? result : [])
    } catch (err) {
      console.error('[getCategoryNotes] Failed to load remote notes:', err)
      commit(types.UPDATE_CURRENT_NOTES, [])
    } finally {
      commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
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
    const { kbGuid, isLogin, currentCategory } = state

    try {
      const { categories: localCategories, notes: localNotes } = await loadLocalWorkspaceData()

      if (!isLogin || !kbGuid) {
        const mergedOffline = mergeCategoryCollections({
          localCategories,
          localNotes
        })
        commit(types.SET_CATEGORIES, mergedOffline.tree)
        commit(types.UPDATE_ALL_CATEGORIES, mergedOffline.categories)
        commit(types.UPDATE_CATEGORIES_POS, mergedOffline.pos)
        return
      }

      const res = await api.KnowledgeBaseApi.getCategories({ kbGuid })
      console.log('[getAllCategories] Raw remote categories response:', res)
      const rawRemoteCategories = Array.isArray(res?.result)
        ? res.result
        : Array.isArray(res)
          ? res
          : Array.isArray(res?.categories)
            ? res.categories
            : []
      const remoteCategories = rawRemoteCategories
        .map(item => {
          if (typeof item === 'string') {
            const category = item
            const trimmed = category.replace(/\/$/, '')
            const lastSlashIndex = trimmed.lastIndexOf('/')
            const parent = lastSlashIndex > 0
              ? `${trimmed.slice(0, lastSlashIndex + 1)}`
              : '/'
            return {
              category,
              parent: parent === category ? '/' : parent,
              kbGuid: kbGuid || ''
            }
          }

          const category = item?.category || item?.name || item?.path || item?.categoryName || ''
          const trimmed = category.replace(/\/$/, '')
          const inferredParent = trimmed && trimmed !== '/My Notes'
            ? `${trimmed.slice(0, trimmed.lastIndexOf('/') + 1)}`
            : '/'

          return {
            ...item,
            category,
            parent: item?.parent || item?.parentCategory || item?.parentPath || inferredParent || '/',
            kbGuid: item?.kbGuid || item?.kb_guid || item?.bizGuid || kbGuid || ''
          }
        })
        .filter(item => !!item.category)
      console.log('[getAllCategories] Remote category list:', remoteCategories.map(item => ({
        category: item.category,
        parent: item.parent,
        kbGuid: item.kbGuid
      })))
      console.log('[getAllCategories] Merge inputs summary:', {
        localCategoryCount: localCategories?.length || 0,
        localNoteCount: localNotes?.length || 0,
        remoteCategoryCount: remoteCategories.length,
        remotePosKeys: Object.keys(res?.pos || res?.resultPos || {}).length
      })
      const mergedOnline = mergeCategoryCollections({
        localCategories,
        localNotes,
        remoteCategories,
        remoteCategoryPos: res?.pos || res?.resultPos || {}
      })
      console.log('[getAllCategories] mergedOnline categories count:', mergedOnline.categories?.length || 0)
      console.log('[getAllCategories] mergedOnline pos keys:', Object.keys(mergedOnline.pos || {}).length)
      console.log('[getAllCategories] mergedOnline tree root keys:', (mergedOnline.tree || []).map(node => node.key))
      console.log('[getAllCategories] mergedOnline tree snapshot:', JSON.stringify(mergedOnline.tree || [], null, 2))

      const workspaceState = await loadWorkspaceState()
      const savedCurrentCategory = workspaceState[APP_STATE_KEYS.currentCategory] || currentCategory || OFFLINE_ROOT_CATEGORY
      const restoredCategory = categoryExistsInTree(mergedOnline.tree, savedCurrentCategory)
        ? savedCurrentCategory
        : OFFLINE_ROOT_CATEGORY
      console.log('[getAllCategories] restoring currentCategory:', {
        savedCurrentCategory,
        currentCategory,
        restoredCategory
      })

      commit(types.SET_CATEGORIES, mergedOnline.tree)
      commit(types.UPDATE_ALL_CATEGORIES, mergedOnline.categories)
      commit(types.UPDATE_CATEGORIES_POS, mergedOnline.pos)
      commit(types.UPDATE_CURRENT_CATEGORY, restoredCategory)
      console.log('[getAllCategories] committed category tree:', {
        treeRootCount: mergedOnline.tree?.length || 0,
        categoryCount: mergedOnline.categories?.length || 0,
        restoredCategory
      })
    } catch (err) {
      console.error('[getAllCategories] failed:', err)
      commit(types.SET_CATEGORIES, [])
      commit(types.UPDATE_ALL_CATEGORIES, [])
      commit(types.UPDATE_CATEGORIES_POS, {})
    } finally {
      commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
    }
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
        const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
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
      const localNote = await DatabaseClient.notes.getByDocGuidWithPriority(docGuid)
      
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
              
              await DatabaseClient.notes.create({
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
      title,
      category
    } = payload
    const nextCategory = category || state.currentNote?.info?.category || state.currentCategory

    if (title && !title.toLowerCase().endsWith('.md')) {
      payload.title = `${title}.md`
      console.log(`[updateNoteInfo] Auto-append .md suffix: "${title}" → "${payload.title}"`)
    }

    const duplicateCheck = await ensureUniqueNoteTitleInCategory({
      category: nextCategory,
      title: payload.title,
      excludeDocGuid: docGuid
    })

    if (duplicateCheck.exists) {
      Notify.create({
        message: i18n.t('noteTitleAlreadyExists'),
        caption: i18n.t('noteTitleAlreadyExistsHint', {
          category: duplicateCheck.normalizedCategory,
          title: duplicateCheck.normalizedTitle
        }),
        type: 'warning',
        icon: 'warning'
      })
      return
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
      const { title, tags } = state.currentNote.info
      try {
        const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
        if (localNote) {
          await DatabaseClient.notes.update(localNote.id, {
            title,
            content: markdown,
            category,
            tags: tags || '',
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
        const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
        if (localNote) {
          localNoteId = localNote.id
          updatedNote = await DatabaseClient.notes.update(localNote.id, {
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
          const note = await DatabaseClient.notes.create({
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
    
    let finalTitle = title || i18n.t('untitled')
    try {
      finalTitle = await generateUniqueNoteTitleInCategory({
        category: safeCategory || OFFLINE_ROOT_CATEGORY,
        title: finalTitle
      })
    } catch (err) {
      console.warn('[createNote] Failed to check duplicate titles:', err)
    }

    const initialContent = `# ${finalTitle}`
    const now = Date.now()

    // 如果未登录，仅在本地 SQLite 创建，不推云端
    if (!isLogin) {
      let draft
      try {
        draft = await createLocalDraftNote({
          title: finalTitle,
          content: initialContent,
          category: OFFLINE_ROOT_CATEGORY,
          now
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
      if (!draft?.note) {
        console.error('[createNote/offline] SQLite create returned null')
        Notify.create({
          message: i18n.t('createNoteFailed'),
          type: 'negative',
          icon: 'error'
        })
        return
      }
      await this.dispatch('server/getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY })
      commit(types.UPDATE_CURRENT_NOTE, {
        _isRawMarkdown: true,
        info: {
          docGuid: draft.docGuid,
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
    let localNoteId = null
    try {
      const draft = await createLocalDraftNote({
        docGuid: undefined,
        kbGuid,
        title: finalTitle,
        content: initialContent,
        category: currentCategory || OFFLINE_ROOT_CATEGORY,
        now
      })
      localNoteId = draft.localNoteId
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
          await promoteLocalDraftToCloudGuid({
            localNoteId,
            docGuid: result.guid,
            source: 'wiznote'
          })
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
      try {
        const now = Date.now()
        const result = await upsertLocalNoteByDocGuid({
          docGuid,
          title,
          content: markdown,
          category: OFFLINE_ROOT_CATEGORY,
          now
        })

        if (result.action === 'updated') {
          console.log(`[updateNoteWithInfo/offline] SQLite updated: id=${result.localNoteId}, docGuid=${result.docGuid}, content_len=${markdown.length}`)
        } else if (result.note) {
          console.log(`[updateNoteWithInfo/offline] SQLite created: id=${result.localNoteId}`)
        }

        await this.dispatch('server/getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY })
      } catch (err) {
        console.error('[updateNoteWithInfo/offline] SQLite write failed:', err)
      }

      return
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
      const result = await upsertLocalNoteByDocGuid({
        docGuid,
        title,
        content: markdown,
        category,
        now
      })
      if (result.action === 'updated') {
        console.log(`[updateNoteWithInfo] SQLite updated: id=${result.localNoteId}, content_len=${markdown.length}, dirty=1 (pending manual sync)`)
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
        try {
          const { note, currentNote } = await saveOfflineImportedNote({ title, text, now })
          if (note) {
            await this.dispatch('server/getCategoryNotes', { category: state.currentCategory || OFFLINE_ROOT_CATEGORY })
          }
          commit(types.UPDATE_CURRENT_NOTE, currentNote)
        } catch (err) {
          console.warn('[importNote/offline] SQLite create failed:', err)
        }
        return
      }

      // Step 1: 先写入本地 SQLite（dirty=1，待同步）
      let localNoteId = null
      try {
        const draft = await createLocalDraftNote({
          kbGuid,
          title,
          content: text,
          category: currentCategory || OFFLINE_ROOT_CATEGORY,
          now
        })
        localNoteId = draft.localNoteId
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
            await promoteLocalDraftToCloudGuid({
              localNoteId,
              docGuid,
              source: 'wiznote'
            })
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
    const isOfflineDelete = !state.isLogin || !kbGuid || (docGuid && docGuid.startsWith('local_'))

    // 离线笔记/未登录删除：只删除本地记录，不调用云端接口
    if (isOfflineDelete) {
      try {
        const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
        if (localNote) {
          await DatabaseClient.notes.remove(localNote.id)
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
      const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
      if (localNote) {
        await DatabaseClient.notes.remove(localNote.id)
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
        await DatabaseClient.categories.create({
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
      const localCategories = await DatabaseClient.categories.getAll({})
      const exists = localCategories.some(c => c.category === fullCategoryPath)
      if (exists) {
        Notify.create({ color: 'red-10', message: i18n.t('categoryExisted'), icon: 'error' })
        return
      }
      await DatabaseClient.categories.create({
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
      await DatabaseClient.categories.remove(category)
      const { tree } = await loadLocalWorkspaceData()
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
      type,
      title
    } = noteInfo

    const duplicateCheck = await ensureUniqueNoteTitleInCategory({
      category,
      title,
      excludeDocGuid: docGuid
    })

    if (duplicateCheck.exists) {
      Notify.create({
        message: i18n.t('noteTitleAlreadyExists'),
        caption: i18n.t('noteTitleAlreadyExistsHint', {
          category: duplicateCheck.normalizedCategory,
          title: duplicateCheck.normalizedTitle
        }),
        type: 'warning',
        icon: 'warning'
      })
      return
    }

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
      try {
        const localTagNotes = await getOfflineTagNotes(tag)
        commit(types.UPDATE_CURRENT_NOTES, localTagNotes)
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
        const { tags, countMap, currentNoteTags } = await getOfflineTagsWithCounts(currentNote?.info?.docGuid)

        commit(types.UPDATE_ALL_TAGS, tags)
        commit(types.UPDATE_TAG_NOTES_COUNT, countMap)

        if (currentNoteTags) {
          commit(types.UPDATE_CURRENT_NOTE_TAGS, currentNoteTags)
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
      return await DatabaseClient.tags.create({ name })
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
      const localNote = await DatabaseClient.notes.getByDocGuid(info.docGuid)
      if (localNote && localTagId) {
        await DatabaseClient.tags.attachToNote(localNote.id, localTagId)
        await DatabaseClient.notes.update(localNote.id, {
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
      const localNote = await DatabaseClient.notes.getByDocGuid(info.docGuid)
      if (localNote && localTagId) {
        await DatabaseClient.tags.removeFromNote(localNote.id, localTagId)
        await DatabaseClient.notes.update(localNote.id, {
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
      await DatabaseClient.tags.remove(localTagId)
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
