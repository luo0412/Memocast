import types from 'src/store/server/types'
import api from 'src/utils/api'
import DatabaseClient from 'src/utils/DatabaseClient'
import bus from 'src/components/bus'

/** 离线根目录的 category key */
export const OFFLINE_ROOT_CATEGORY_KEY = 'offline_my_notes'

/** 离线根目录 category 值（存入 notes.category 字段） - 统一使用英文，排除国际化影响 */
export const OFFLINE_ROOT_CATEGORY = '/My Notes/'

/** 日历列表/打点用时间戳；创建日优先 dataCreated（与 Wiz 列表字段一致），缺省回退修改日 */
function getCalendarNoteTimestamp (note, basis) {
  if (basis === 'created') {
    const c = note.dataCreated
    if (c != null && !Number.isNaN(Number(c))) return Number(c)
  }
  return note.dataModified
}
import { Dark, Dialog, Loading, Notify, QSpinnerGears } from 'quasar'
import helper from 'src/utils/helper'
import { i18n } from 'boot/i18n'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'
import ServerFileStorage from 'src/utils/storage/ServerFileStorage'
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
      console.log(`[_getContent] Found in SQLite: id=${localNote.id}, local_mod=${localMod}, sync=${localNote.sync_status}, content_len=${(localNote.content || '').length}`)
      
      // 直接返回 SQLite 数据（本地优先），跳过云端和缓存
      return {
        _isRawMarkdown: true,
        info: { 
          docGuid: localNote.doc_guid || docGuid, 
          kbGuid, 
          title: localNote.title, 
          category: localNote.category || '/', 
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
    ServerFileStorage.removeItemFromLocalStorage('token')
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
      this.dispatch('server/initOfflineMode')
    }
  },
  /**
   * Initialize offline mode: load local-only notes from SQLite and build
   * the offline category tree (single root node "我的笔记").
   * Called after skip-login so the user can create/view notes without account.
   */
  async initOfflineMode ({ commit, state }) {
    try {
      const localNotes = await DatabaseClient.getNotes({ syncStatus: 'local_only' })
      console.log('[initOfflineMode] loaded local_only notes:', localNotes.length)

      commit(types.SET_OFFLINE_NOTES, localNotes || [])

      const offlineRoot = {
        label: '我的笔记',
        key: OFFLINE_ROOT_CATEGORY_KEY,
        children: [],
        selectable: true,
        isOfflineRoot: true
      }
      commit(types.SET_OFFLINE_CATEGORIES, [offlineRoot])
      commit(types.UPDATE_CURRENT_CATEGORY, OFFLINE_ROOT_CATEGORY_KEY)
      commit(types.SET_OFFLINE_CURRENT_CATEGORY, OFFLINE_ROOT_CATEGORY_KEY)

      return localNotes || []
    } catch (err) {
      console.error('[initOfflineMode] failed:', err)
      return []
    }
  },
  /**
   * Update offline current category and refresh offline notes list.
   */
  async updateOfflineCurrentCategory ({ commit, state }, payload) {
    const { data } = payload
    commit(types.SET_OFFLINE_CURRENT_CATEGORY, data)
    // Re-fetch offline notes to ensure we have the latest
    try {
      const localNotes = await DatabaseClient.getNotes({ syncStatus: 'local_only' })
      commit(types.SET_OFFLINE_NOTES, localNotes || [])
    } catch (err) {
      console.warn('[updateOfflineCurrentCategory] failed to refresh notes:', err)
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

    // 检查是否有离线笔记需要同步
    try {
      const pendingNotes = await DatabaseClient.getNotes({ syncStatus: 'local_only' })
      const offlineNotes = pendingNotes.filter(n => n.doc_guid && n.doc_guid.startsWith('local_'))
      if (offlineNotes.length > 0) {
        console.log('[login] Found', offlineNotes.length, 'offline notes to sync')
        commit(types.SET_OFFLINE_NOTES, offlineNotes)
        // 通过 bus 事件通知 App.vue 显示同步提示弹窗
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
   * 登出
   * @param commit
   * @returns {Promise<void>}
   */
  async logout ({ commit }) {
    await api.AccountServerApi.Logout()
    ServerFileStorage.removeItemFromLocalStorage('token')
    commit(types.LOGOUT)
    // 重置离线同步状态（右上角待同步数量）
    commit('offline/UPDATE_SYNC_STATUS', {
      isSyncing: false,
      lastSyncTime: null,
      total: 0,
      synced: 0,
      pending: 0,
      conflict: 0
    }, { root: true })
    commit('offline/SET_INITIALIZED', false, { root: true })
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
    const { kbGuid } = state
    if (!kbGuid) return
    const basis = rootState.client.calendarDateBasis === 'created' ? 'created' : 'modified'
    const orderBy = basis === 'created' ? 'created' : 'modified'
    let ymd = payload.date || rootState.client.calendarSelectedDate
    if (helper.isNullOrEmpty(ymd)) {
      const n = new Date()
      ymd = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
    }
    const parts = ymd.split('-').map(p => parseInt(p, 10))
    const dayStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime()
    const dayEnd = new Date(parts[0], parts[1] - 1, parts[2] + 1, 0, 0, 0, 0).getTime()
    commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
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
    const { kbGuid } = state
    if (!kbGuid) return
    const basis = rootState.client.calendarDateBasis === 'created' ? 'created' : 'modified'
    const orderBy = basis === 'created' ? 'created' : 'modified'
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime()
    const monthEnd = new Date(year, month, 1, 0, 0, 0, 0).getTime()
    const dateSet = new Set()
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
      tags
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
    // commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, true)
    const result = await api.KnowledgeBaseApi.getCategoryNotes({
      kbGuid,
      data: {
        category: category || currentCategory,
        start: start || 0,
        count: count || 100,
        withAbstract: true
      }
    })
    // commit(types.UPDATE_CURRENT_NOTES_LOADING_STATE, false)
    commit(types.UPDATE_CURRENT_NOTES, result)
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
    console.time('GetContent')

    // 离线笔记（未登录 且 (无 docGuid 或 docGuid 以 local_ 开头））：从 SQLite 加载
    if (!state.isLogin && (!docGuid || docGuid.startsWith('local_'))) {
      console.log('[getNoteContent] Offline mode, loading from SQLite:', docGuid)
      try {
        const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
        if (localNote) {
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
          return
        }
      } catch (err) {
        console.warn('[getNoteContent] SQLite lookup failed for offline note:', err)
      }
      commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
      return
    }

    // ✅ 本地优先原则：SQLite 有就用本地，按 local_modified 时间戳取最新版本
    let result
    try {
      // ✅ 查询该 docGuid 的所有记录，按 local_modified 排序后取最新的
      const localNote = await DatabaseClient.getNoteByDocGuidWithPriority(docGuid)
      console.log('[getNoteContent] SQLite lookup:', docGuid, localNote ? `found id=${localNote.id} content_len=${(localNote.content || '').length} sync=${localNote.sync_status} (latest by local_mod=${localNote.local_modified})` : 'NOT FOUND')
      
      if (localNote) {
        // ✅ 核心原则：SQLite 有记录 → 直接用本地版本，绝不主动去云端拉取覆盖！
        console.log(`[getNoteContent] ✅ LOCAL FIRST: Found in SQLite (id=${localNote.id}), using local version directly`)
        
        const localMod = parseInt(localNote.local_modified) || 0
        const serverMod = parseInt(localNote.server_modified) || 0
        console.log(`[getNoteContent] Timestamp info: local_modified=${localMod}, server_modified=${serverMod}`)
        
        if (localNote.content !== null && localNote.content !== undefined) {
          // ✅ 本地有内容（包括空字符串 ''）→ 直接使用，这是用户的真实数据
          result = {
            _isRawMarkdown: true,
            info: { 
              docGuid: localNote.doc_guid || docGuid, 
              kbGuid, 
              title: localNote.title, 
              category: localNote.category || '/', 
              dataCreated: localNote.data_created, 
              dataModified: localMod || localNote.data_modified || Date.now()
            },
            html: localNote.content,  // ✅ 使用本地内容，不管云端有什么
            resources: []
          }
          console.log(`[getNoteContent] ✅ Using local content (len=${(localNote.content || '').length}), will NOT fetch from cloud`)
        } else {
          // ⚠️ 本地记录存在但 content 为 null/undefined（数据异常）
          // 这种情况才考虑从云端恢复，但仅作为 fallback
          console.warn('[getNoteContent] ⚠️ Local record exists but content is null/undefined (data anomaly), trying cloud as fallback:', docGuid)
          
          try {
            const cloudResult = await _getContent(kbGuid, docGuid)
            if (cloudResult?.html) {
              const markdown = helper.extractMarkdownFromMDNote(cloudResult.html, kbGuid, docGuid, cloudResult.resources || [])
              // 回填到 SQLite（仅当本地确实没内容时）
              await DatabaseService.updateNote(localNote.id, { 
                content: markdown, 
                sync_status: 'synced',
                server_modified: Date.now()
              })
              result = cloudResult
              console.log('[getNoteContent] ⚠️ Filled null content from cloud (emergency recovery)')
            } else {
              // 云端也没有 → 返回空笔记
              result = {
                _isRawMarkdown: true,
                info: { docGuid: localNote.doc_guid || docGuid, kbGuid, title: localNote.title, category: localNote.category || '/', dataCreated: localNote.data_created, dataModified: localMod },
                html: '',
                resources: []
              }
              console.warn('[getNoteContent] Both local and cloud are empty/missing')
            }
          } catch (cloudError) {
            console.error('[getNoteContent] Cloud fallback failed:', cloudError)
            // 云端也失败 → 返回空笔记，不崩溃
            result = {
              _isRawMarkdown: true,
              info: { docGuid: localNote.doc_guid || docGuid, kbGuid, title: localNote.title, category: localNote.category || '/', dataCreated: localNote.data_created, dataModified: localMod },
              html: '',
              resources: []
            }
          }
        }
      } else {
        // ✅ SQLite 里完全没有这条记录 → 才去云端获取
        console.log('[getNoteContent] Not in SQLite, fetching from cloud:', docGuid)
        result = await _getContent(kbGuid, docGuid)
      }
    } catch (error) {
      console.warn('[getNoteContent] SQLite error, fallback to server:', error)
      result = await _getContent(kbGuid, docGuid)
    }

    console.timeEnd('GetContent')
    console.log(`[getNoteContent] about to commit UPDATE_CURRENT_NOTE, result keys:`, Object.keys(result))
    console.log(`[getNoteContent] Result content preview: ${JSON.stringify((result.html || '').substring(0, 150))}`)
    console.log(`[getNoteContent] Result _isRawMarkdown: ${result._isRawMarkdown}, info.docGuid: ${result.info?.docGuid}`)
    Loading.hide()
    commit(types.UPDATE_CURRENT_NOTE_LOADING_STATE, false)
    commit(types.UPDATE_CURRENT_NOTE, result)
    console.log(`🔍 [getNoteContent] ========== END ========== Committed to Vuex\n`)
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

    // 离线模式：从 SQLite 过滤本地笔记
    if (!state.isLogin || !state.kbGuid) {
      commit(types.UPDATE_CURRENT_NOTES, [])
      // offlineNotes 已经在 initOfflineMode 时加载到 state.offlineNotes
      // 组件通过 offlineNotesList getter 获取过滤后的列表
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
            sync_status: 'local_only',
            local_modified: Date.now()  // ✅ 即时更新时间戳！
          })
          console.log(`[updateNote/offline] SQLite updated: docGuid=${docGuid}, content_len=${markdown.length}, local_modified=${Date.now()}`)
        } else {
          console.warn('[updateNote/offline] Note not found in SQLite:', docGuid)
        }
      } catch (err) {
        console.error('[updateNote/offline] SQLite write failed:', err)
      }
      // 离线笔记保存在 SQLite，增量更新 offlineNotes 中该笔记的内容
      const localNotes = await DatabaseClient.getNotes({ syncStatus: 'local_only' })
      commit(types.SET_OFFLINE_NOTES, localNotes || [])
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
      // Step 1: 先写本地 SQLite（同步优先，用户操作不阻塞）
      let localNoteId = null
      const now = Date.now()  // ✅ 统一时间戳，确保一致性
      try {
        const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
        if (localNote) {
          localNoteId = localNote.id
          await DatabaseClient.updateNote(localNote.id, {
            title,
            content: markdown,
            category,
            sync_status: 'pending_upload',
            local_modified: now  // ✅ 即时更新时间戳！
          })
          console.log(`[updateNote] SQLite updated: id=${localNote.id}, content_len=${markdown.length}, local_modified=${now}`)
          
          this.dispatch('offline/updateNote', {
            id: localNote.id,
            updates: { title, content: markdown, category, sync_status: 'pending_upload', local_modified: now }
          }, { root: true })
        } else {
          // 首次保存：创建本地记录
          const note = await DatabaseClient.createNote({
            doc_guid: docGuid,
            title,
            content: markdown,
            category,
            data_created: now,
            data_modified: now,
            local_modified: now,  // ✅ 创建时也设置！
            sync_status: 'pending_upload'
          })
          localNoteId = note?.id
          if (note) {
            this.dispatch('offline/createNote', {
              title, content: markdown, category, sync_status: 'pending_upload'
            }, { root: true })
          }
        }
      } catch (err) {
        console.warn('[updateNote] SQLite write failed, continuing with cloud sync:', err)
      }

      // Step 2: 异步推送到云端（fire-and-forget，不阻塞 UI）
      const _pushToCloud = async () => {
        try {
          const result = await api.KnowledgeBaseApi.updateNote({
            kbGuid,
            docGuid,
            data: {
              html,
              title,
              kbGuid,
              docGuid,
              category,
              resources: resources.map(r => r.name),
              type: isLite ? 'lite/markdown' : 'document'
            }
          })
          // 推送成功后更新本地 sync_status（直接用 Step 1 捕获的 localNoteId，不再重复查库）
          if (localNoteId) {
            await DatabaseClient.updateNote(localNoteId, { sync_status: 'synced' })
            this.dispatch('offline/updateNote', {
              id: localNoteId,
              updates: { sync_status: 'synced' }
            }, { root: true })
          }

          ClientFileStorage.setCachedNote(
            {
              info: result,
              html
            },
            api.KnowledgeBaseApi.getCacheKey(kbGuid, docGuid),
            null
          )
          // ✅ 移除这行：不要用云端返回的数据覆盖 Vuex state
          // 原因：此时用户可能已经在编辑新内容，云端数据可能是旧的
          // SQLite 才是唯一真实的数据源
          // commit(types.UPDATE_CURRENT_NOTE, result)
        } catch (err) {
          console.error('[updateNote] Cloud sync failed:', err)
        }
      }

      // 不等待推送完成，立即更新 UI
      _pushToCloud()
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
          local_modified: now,
          sync_status: 'local_only'
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
      // 重新加载离线笔记列表
      const localNotes = await DatabaseClient.getNotes({ syncStatus: 'local_only' })
      commit(types.SET_OFFLINE_NOTES, localNotes || [])
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

    // Step 1: 先在本地 SQLite 创建草稿（sync_status=local_only）
    // 生成临时 doc_guid，确保离线创建的笔记也有唯一标识
    const tempDocGuid = `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
    let localNoteId = null
    try {
      const note = await DatabaseClient.createNote({
        doc_guid: tempDocGuid,
        kb_guid: kbGuid,
        title: finalTitle,
        content: initialContent,
        category: currentCategory || '/',
        data_created: now,
        data_modified: now,
        local_modified: now,
        sync_status: 'local_only'
      })
      if (note) {
        localNoteId = note.id
        this.dispatch('offline/createNote', { title: finalTitle, content: initialContent, category: currentCategory || '/' }, { root: true })
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
      // 云端创建成功后，更新本地 doc_guid 和 sync_status
      if (localNoteId) {
        try {
          await DatabaseClient.updateNote(localNoteId, {
            doc_guid: result.guid,
            sync_status: 'synced'
          })
          await DatabaseClient.createGuidMapping(localNoteId, result.guid, 'wiznote')
          this.dispatch('offline/updateNote', {
            id: localNoteId,
            updates: { doc_guid: result.guid, sync_status: 'synced' }
          }, { root: true })
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
          category: currentCategory || '/',
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
            category: currentCategory || '/',
            dataCreated: now,
            dataModified: now
          },
          html: initialContent,
          resources: []
        })
        this.dispatch('offline/sync', null, { root: true })
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
            sync_status: 'local_only',
            local_modified: Date.now()
          })
          console.log(`[updateNoteWithInfo/offline] SQLite updated: id=${localNote.id}, docGuid=${docGuid}, content_len=${markdown.length}`)
          
          this.dispatch('offline/updateNote', {
            id: localNote.id,
            updates: { title, content: markdown, category: OFFLINE_ROOT_CATEGORY, sync_status: 'local_only', local_modified: Date.now() }
          }, { root: true })
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
            local_modified: now,
            sync_status: 'local_only'
          })
          if (note) {
            console.log(`[updateNoteWithInfo/offline] SQLite created: id=${note.id}`)
            this.dispatch('offline/createNote', {
              title, content: markdown, category: OFFLINE_ROOT_CATEGORY, sync_status: 'local_only'
            }, { root: true })
          }
        }
        
        // 刷新离线笔记列表
        const localNotes = await DatabaseClient.getNotes({ syncStatus: 'local_only' })
        commit(types.SET_OFFLINE_NOTES, localNotes || [])
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

    // Step 1: 写本地 SQLite（与 Ctrl+S 保存逻辑完全一致）
    const now = Date.now()  // ✅ 统一时间戳
    try {
      const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
      if (localNote) {
        await DatabaseClient.updateNote(localNote.id, {
          title,
          content: markdown,
          category,
          sync_status: 'pending_upload',
          local_modified: now  // ✅ 与 Ctrl+S 一致：即时更新时间戳！
        })
        console.log(`[updateNoteWithInfo] SQLite updated: id=${localNote.id}, content_len=${markdown.length}, local_modified=${now}`)
        
        this.dispatch('offline/updateNote', {
          id: localNote.id,
          updates: { title, content: markdown, category, sync_status: 'pending_upload', local_modified: now }
        }, { root: true })
      } else {
        // 首次保存：创建本地记录（与 Ctrl+S 一致）
        const note = await DatabaseClient.createNote({
          doc_guid: docGuid,
          title,
          content: markdown,
          category,
          data_created: now,
          data_modified: now,
          local_modified: now,  // ✅ 创建时也设置
          sync_status: 'pending_upload'
        })
        if (note) {
          this.dispatch('offline/createNote', {
            title, content: markdown, category, sync_status: 'pending_upload'
          }, { root: true })
        }
      }
    } catch (err) {
      console.warn('[updateNoteWithInfo] SQLite write failed:', err)
    }

    // Step 2: 异步推送到云端
    const _pushToCloud = async () => {
      try {
        await api.KnowledgeBaseApi.updateNote({
          kbGuid,
          docGuid,
          data: {
            html,
            title,
            kbGuid,
            docGuid,
            category,
            resources: resources.map(r => r.name),
            type: isLite ? 'lite/markdown' : 'document'
          }
        })
        // 推送成功后更新 sync_status
        const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
        if (localNote) {
          await DatabaseClient.updateNote(localNote.id, { sync_status: 'synced' })
          this.dispatch('offline/updateNote', {
            id: localNote.id,
            updates: { sync_status: 'synced' }
          }, { root: true })
        }
      } catch (err) {
        console.error('[updateNoteWithInfo] Cloud sync failed:', err)
      }
    }
    _pushToCloud()
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
            local_modified: now,
            sync_status: 'local_only'
          })
          if (note) {
            const localNotes = await DatabaseClient.getNotes({ syncStatus: 'local_only' })
            commit(types.SET_OFFLINE_NOTES, localNotes || [])
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

      // Step 1: 先写入本地 SQLite（sync_status=local_only）
      let localNoteId = null
      try {
        const note = await DatabaseClient.createNote({
          title,
          content: text,
          category: currentCategory || '/',
          data_created: now,
          data_modified: now,
          local_modified: now,
          sync_status: 'local_only'
        })
        if (note) {
          localNoteId = note.id
          this.dispatch('offline/createNote', { title, content: text, category: currentCategory || '/' }, { root: true })
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
        // 云端创建成功后更新本地 doc_guid 和 sync_status
        if (localNoteId) {
          try {
            await DatabaseClient.updateNote(localNoteId, {
              doc_guid: docGuid,
              sync_status: 'synced'
            })
            await DatabaseClient.createGuidMapping(localNoteId, docGuid, 'wiznote')
            this.dispatch('offline/updateNote', {
              id: localNoteId,
              updates: { doc_guid: docGuid, sync_status: 'synced' }
            }, { root: true })
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
            category: currentCategory || '/',
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
          this.dispatch('offline/deleteNote', localNote.id, { root: true })
        }
        // 刷新离线笔记列表
        const localNotes = await DatabaseClient.getNotes({ syncStatus: 'local_only' })
        commit(types.SET_OFFLINE_NOTES, localNotes || [])
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
        this.dispatch('offline/deleteNote', localNote.id, { root: true })
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
    const {
      kbGuid,
      // currentCategory,
      categories
    } = state
    if (helper.checkCategoryExistence(categories, parentCategory, childCategoryName)) {
      Notify.create({
        color: 'red-10',
        message: i18n.t('categoryExisted'),
        icon: 'error'
      })
      return
    }
    await api.KnowledgeBaseApi.createCategory({
      kbGuid,
      data: {
        parent: helper.isNullOrEmpty(parentCategory) ? '/' : parentCategory,
        pos: Math.floor(Date.now() / 1000).toFixed(0),
        child: childCategoryName
      }
    })
    await this.dispatch('server/getAllCategories')
    await this.dispatch(
      'server/updateCurrentCategory', {
        data:
          helper
            .isNullOrEmpty(parentCategory)
            ? `/${childCategoryName}/`
            : `${parentCategory}${childCategoryName}/`,
        type: 'category'
      }
    )
  },
  async deleteCategory ({
    commit,
    state
  }, category) {
    const { kbGuid } = state
    await api.KnowledgeBaseApi.deleteCategory({
      kbGuid,
      data: { category }
    })
    await this.dispatch('server/getAllCategories')
    await this.dispatch('server/updateCurrentCategory', {
      type: 'category',
      data: ''
    })
    Notify.create({
      color: 'red-6',
      message: i18n.t('deleteCategorySuccessfully'),
      icon: 'delete'
    })
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
    const { kbGuid } = state
    const {
      tag,
      start,
      count
    } = payload
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
    const { kbGuid } = state
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
    const { kbGuid } = state
    const { tagGuid: parentTagGuid } = parentTag
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
    const newTagList = info.tags?.split('*') || []
    newTagList.push(tagGuid)
    commit(types.UPDATE_CURRENT_NOTE_TAGS, newTagList.join('*'))
    this.dispatch('server/updateNoteInfo', {
      ...state.currentNote.info,
      tags: newTagList.join('*')
    })
    this.dispatch('server/getAllTags')
  },
  async renameTag ({ state }, tag) {
    const { kbGuid } = state
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
    const { kbGuid } = state
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
      info.tags?.split('*').filter(t => t !== tagGuid) || []
    commit(types.UPDATE_CURRENT_NOTE_TAGS, newTagList.join('*'))
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
    const { kbGuid } = state
    const { tagGuid } = tag
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
