/**
 * SyncService - 为知笔记同步服务
 * 负责本地数据库与为知笔记云端的双向同步
 */

import DatabaseService from './DatabaseService'
import WizNoteApi from '../utils/api'
import helper from '../utils/helper'

/** 离线根目录 category 值（存入 notes.category 字段） - 统一使用英文，排除国际化影响 */
const OFFLINE_ROOT_CATEGORY = '/My Notes/'

/**
 * 规范化笔记分类：
 * - 离线根目录 ('/My Notes/') → 根目录 '/'
 * - 兼容中文路径 ('/我的笔记/') → 根目录 '/' （处理历史数据）
 * - 其余原样返回
 */
function normalizeCategory (cat) {
  if (!cat || 
      cat === OFFLINE_ROOT_CATEGORY || 
      cat === '/我的笔记/' ||  // 兼容旧数据
      cat === 'OFFLINE_ROOT_CATEGORY') {
    return '/'
  }
  return cat
}

/**
 * 获取当前 kbGuid（从 localStorage 读取）
 */
function getKbGuid() {
  return localStorage.getItem('kbGuid')
}

// 适配层：将现有 API 转换为 SyncService 期望的接口
const api = {
  /**
   * 获取云端笔记列表
   */
  async getDocs(since = null, docGuid = null) {
    const kbGuid = getKbGuid()
    if (!kbGuid || kbGuid === 'null') {
      throw new Error('[SyncService] kbGuid is not available, please login first')
    }

    if (docGuid) {
      const info = await WizNoteApi.KnowledgeBaseApi.getNoteInfo({
        kbGuid,
        docGuid
      })
      // execRequest 已解包，info 直接是笔记对象
      if (info) {
        const content = await WizNoteApi.KnowledgeBaseApi.getNoteContent({
          kbGuid,
          docGuid
        })
        return [{ ...info, content: content || '' }]
      }
      return []
    }

    const docs = []
    let start = 0
    const count = 100

    for (;;) {
      const result = await WizNoteApi.KnowledgeBaseApi.getCategoryNotes({
        kbGuid,
        data: { category: '', start, count }
      })

      // execRequest 已解包，result 直接是数组
      const items = Array.isArray(result) ? result : (result?.result || [])

      if (items.length === 0) break

      for (const doc of items) {
        try {
          const content = await WizNoteApi.KnowledgeBaseApi.getNoteContent({
            kbGuid,
            docGuid: doc.guid || doc.docGuid
          })
          docs.push({ ...doc, content: content || '' })
        } catch (e) {
          docs.push({ ...doc, content: '' })
        }
      }

      if (items.length < count) break
      start += count
    }

    return docs
  },

  /**
   * 创建云端笔记
   * 采用单步创建（带 html 内容），与 actions.js 中已登录 createNote 保持一致
   * 离线笔记合并规则：上传到根目录 '/'
   * @param {Object} note - 笔记对象
   * @param {string} [kbGuid] - 可选的知识库GUID（如果不传则从localStorage获取）
   */
  async createDoc(note, kbGuid = null) {
    const effectiveKbGuid = kbGuid || getKbGuid()
    if (!effectiveKbGuid || effectiveKbGuid === 'null') {
      throw new Error('[SyncService] kbGuid is not available, please login first')
    }

    const userId = localStorage.getItem('userId') || ''
    const isLite = (note.category || '').replace(/\//g, '') === 'Lite'
    
    // ✅ 参考 actions.js 的正常逻辑：直接传 note.category（与用户手动创建笔记一致）
    // actions.js 第 928-936 行：api.KnowledgeBaseApi.createNote({ kbGuid, data: { category: currentCategory, ... } })
    const category = note.category || ''
    
    const html = helper.embedMDNote(note.content || '', [], {
      wrapWithPreTag: isLite,
      kbGuid: effectiveKbGuid,
      docGuid: '' // 单步创建时 docGuid 为空，embedMDNote 内部会跳过资源替换
    })

    // ✅ 与 actions.js 保持一致：直接传 category 参数（包括 kbGuid, owner 等完整字段）
    const createData = {
      category,
      kbGuid: effectiveKbGuid,
      title: note.title || 'Untitled',
      owner: userId,
      html,
      type: isLite ? 'lite/markdown' : 'document'
    }

    const result = await WizNoteApi.KnowledgeBaseApi.createNote({
      kbGuid: effectiveKbGuid,
      data: createData
    })

    console.log('[SyncService] createDoc API response:', JSON.stringify(result))

    if (result && result.guid) {
      return { guid: result.guid }
    }

    // 增强错误日志：输出完整的服务器响应
    const errorMsg = result?.returnMessage || 'Failed to create note'
    console.error('[SyncService] createDoc failed:', {
      error: errorMsg,
      returnCode: result?.returnCode,
      externCode: result?.externCode,
      fullResponse: result,
      noteData: {
        title: note.title,
        category: note.category,
        contentLength: (note.content || '').length,
        kbGuid: effectiveKbGuid
      }
    })
    throw new Error(errorMsg)
  },

  /**
   * 更新云端笔记
   * 将 markdown 内容用 embedMDNote 包装为为知笔记接受的 html 格式
   * 注意：不传 category，避免触发为知笔记的移动/删除文件夹逻辑
   * @param {string} docGuid - 笔记GUID
   * @param {Object} updates - 更新内容
   * @param {string} [kbGuid] - 可选的知识库GUID（如果不传则从localStorage获取）
   */
  async updateDoc(docGuid, updates, kbGuid = null) {
    const effectiveKbGuid = kbGuid || getKbGuid()
    if (!effectiveKbGuid || effectiveKbGuid === 'null') {
      throw new Error('[SyncService] kbGuid is not available, please login first')
    }

    // 将 markdown 包装成 html
    const html = helper.embedMDNote(updates.content || '', [], {
      wrapWithPreTag: false,
      kbGuid: effectiveKbGuid,
      docGuid
    })

    const data = {
      html,
      title: updates.title,
      resources: updates.resources || [],
      type: 'document'
    }

    // 规范化分类：离线根目录 '/My Notes/' 或 '/我的笔记/' 转为根目录 '/'；其余使用原值
    const normCat = normalizeCategory(updates.category || '')
    if (normCat && normCat !== '/') {
      data.category = normCat
    }

    const result = await WizNoteApi.KnowledgeBaseApi.updateNote({
      kbGuid: effectiveKbGuid,
      docGuid,
      data
    })

    return result
  },

  /**
   * 删除云端笔记
   * @param {string} docGuid - 笔记GUID
   * @param {string} [kbGuid] - 可选的知识库GUID（如果不传则从localStorage获取）
   */
  async deleteDoc(docGuid, kbGuid = null) {
    const effectiveKbGuid = kbGuid || getKbGuid()
    if (!effectiveKbGuid || effectiveKbGuid === 'null') {
      throw new Error('[SyncService] kbGuid is not available, please login first')
    }
    return await WizNoteApi.KnowledgeBaseApi.deleteNote({ kbGuid: effectiveKbGuid, docGuid })
  }
}

class SyncService {
  constructor() {
    this.isSyncing = false
    this.syncQueue = []
    this.listeners = []
  }

  addListener(callback) {
    this.listeners.push(callback)
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(cb => cb !== callback)
  }

  notifyListeners(event) {
    this.listeners.forEach(callback => {
      try { callback(event) } catch (e) {
        console.error('[SyncService] Listener error:', e)
      }
    })
  }

  /**
   * 执行全量同步
   */
  async sync(options = {}) {
    if (this.isSyncing) {
      console.info('[SyncService] Sync already in progress, skipping')
      return { success: false, reason: 'already_syncing' }
    }

    const kbGuid = getKbGuid()
    if (!kbGuid || kbGuid === 'null') {
      console.warn('[SyncService] Sync skipped: no kbGuid (not logged in or login pending)')
      return { success: false, reason: 'not_logged_in' }
    }

    this.isSyncing = true
    this.notifyListeners({ type: 'sync_start' })

    try {
      const stats = { pulled: 0, pushed: 0, conflicts: 0, errors: 0 }

      // Step 1: 拉取云端变更
      console.info('[SyncService] Starting pull from cloud...')
      const pullResult = await this.pullFromCloud()
      stats.pulled = pullResult.count
      stats.conflicts += pullResult.conflicts

      // Step 2: 上传本地变更
      console.info('[SyncService] Starting push to cloud...')
      const pushResult = await this.pushToCloud()
      stats.pushed = pushResult.count
      stats.errors += pushResult.errors

      // Step 3: 检测冲突
      console.info('[SyncService] Checking for conflicts...')
      const conflictNotes = await DatabaseService.getConflictNotes()
      if (conflictNotes.length > 0) {
        stats.conflicts += conflictNotes.length
        this.notifyListeners({ type: 'conflicts_found', count: conflictNotes.length })
        
        // ✅ Step 3.5: 自动解决所有冲突（基于时间戳智能合并）
        console.info('[SyncService] Auto-resolving conflicts...')
        try {
          const resolveResult = await this.autoResolveConflicts()
          if (resolveResult) {
            console.log('[SyncService] Auto-resolve result:', resolveResult)
            stats.conflictsResolved = resolveResult.resolved || 0
            stats.conflictsSkipped = resolveResult.skipped || 0
            stats.conflictsErrors = resolveResult.errors || 0
          }
        } catch (resolveError) {
          console.warn('[SyncService] Auto-resolve conflicts failed (non-critical):', resolveError.message)
          // 冲突解决失败不影响同步结果，下次同步时重试
          stats.conflictsErrors = (stats.conflictsErrors || 0) + 1
        }
      }

      // ✅ Step 4: 规范化笔记 GUID（用实际云端 GUID 替换临时 local_xxx）
      console.info('[SyncService] Normalizing note GUIDs after sync...')
      try {
        const normalizeResult = await DatabaseService.normalizeNoteGuids()
        if (normalizeResult && !normalizeResult.error) {
          console.log('[SyncService] GUID normalization result:', normalizeResult)
          stats.normalized = normalizeResult.normalized || 0
          stats.markedAsConflict = normalizeResult.markedAsConflict || 0
        }
      } catch (normalizeError) {
        console.warn('[SyncService] GUID normalization failed (non-critical):', normalizeError.message)
        // 规范化失败不影响同步结果，只是警告
      }

      // ✅ Step 5: 全局去重清理（删除同步后残留的重复笔记）
      console.info('[SyncService] Starting post-sync cleanup...')
      try {
        const cleanupResult = await this._cleanupDuplicateNotesAfterSync()
        if (cleanupResult && cleanupResult.removed > 0) {
          console.log(`[SyncService] Post-sync cleanup result:`, cleanupResult)
          stats.duplicatesRemoved = cleanupResult.removed
          stats.duplicatesKept = cleanupResult.kept
        }
      } catch (cleanupError) {
        console.warn('[SyncService] Post-sync cleanup failed (non-critical):', cleanupError.message)
        // 清理失败不影响同步结果，只是警告
      }

      console.info('[SyncService] Sync completed:', stats)
      this.notifyListeners({ type: 'sync_complete', stats })
      return { success: true, stats }
    } catch (error) {
      console.error('[SyncService] Sync failed:', error)
      this.notifyListeners({ type: 'sync_error', error: error.message })
      return { success: false, error: error.message }
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * 同步后的全局去重清理
   * 删除所有重复的 synced 笔记（保留最新的），避免出现多份同名笔记
   */
  async _cleanupDuplicateNotesAfterSync() {
    console.log('[SyncService] Starting post-sync duplicate cleanup...')
    
    // 获取所有 synced 状态的笔记（排除已删除和重复标记的）
    const allSyncedNotes = await DatabaseService.getAllSyncedNotesForCleanup()
    
    if (!allSyncedNotes || allSyncedNotes.length === 0) {
      console.log('[SyncService] No synced notes to cleanup')
      return { removed: 0, kept: 0 }
    }

    console.log(`[SyncService] Found ${allSyncedNotes.length} synced notes to check for duplicates`)

    // 按 (title + category) 分组
    const noteGroups = {}
    for (const note of allSyncedNotes) {
      const key = `${note.title || ''}::${normalizeCategory(note.category || '')}`
      if (!noteGroups[key]) {
        noteGroups[key] = []
      }
      noteGroups[key].push(note)
    }

    let removed = 0
    let kept = 0

    for (const [key, group] of Object.entries(noteGroups)) {
      if (group.length > 1) {
        // 有重复 → 按 server_modified 降序排序，保留最新的
        console.log(`[SyncService] 🧹 Found ${group.length} duplicate synced notes with key: ${key}`)
        group.sort((a, b) => (b.server_modified || b.local_modified || 0) - (a.server_modified || a.local_modified || 0))
        
        // 保留第一条（最新的），其余软删除
        const [keepNote, ...removeNotes] = group
        kept++
        
        for (const removeNote of removeNotes) {
          console.log(`[SyncService] 🗑️ Soft-deleting duplicate synced note: id=${removeNote.id}, title=${removeNote.title}`)
          try {
            await DatabaseService.updateNote(removeNote.id, {
              sync_status: 'deleted',
              title: `[POST-SYNC-DUP-DELETED] ${removeNote.title || ''}`
            })
            removed++
          } catch (e) {
            console.error(`[SyncService] Failed to delete duplicate during cleanup:`, e)
          }
        }
      } else {
        // 无重复 → 保留
        kept++
      }
    }

    if (removed > 0) {
      console.log(`[SyncService] ✅ Cleanup completed: removed=${removed} duplicates, kept=${kept} unique notes`)
    }

    return { removed, kept }
  }

  /**
   * 从云端拉取数据
   * 基于时间戳的智能合并：
   * - 本地没有 → 下载并创建（sync_status='synced'）
   * - 本地已有 → 比较 local_modified vs server_modified
   *   - 云端更新 → 覆盖本地
   *   - 本地更新 → 标记为 pending_upload（下次 pushToCloud 处理）
   *   - 时间相同 → 跳过
   */
  async pullFromCloud(since = null) {
    try {
      const kbGuid = getKbGuid()
      if (!kbGuid || kbGuid === 'null') {
        console.warn('[SyncService] pullFromCloud skipped: no kbGuid')
        return { count: 0, conflicts: 0 }
      }

      // 只获取笔记列表（不下载内容），确认哪些是本地没有的
      const docs = []
      let start = 0
      const count = 100

      for (;;) {
        const result = await WizNoteApi.KnowledgeBaseApi.getCategoryNotes({
          kbGuid,
          data: { category: '', start, count, withAbstract: false }
        })

        if (Array.isArray(result) && result.length > 0) {
          docs.push(...result)
          if (result.length < count) break
          start += count
        } else {
          break
        }
      }

      let pulledCount = 0
      let conflictsCount = 0

      for (const doc of docs) {
        const docGuid = doc.docGuid || doc.guid
        if (!docGuid) continue

        const existingNote = await DatabaseService.getNoteByDocGuid(docGuid)
        const serverModified = doc.dataModified || doc.data_modified || 0

        if (!existingNote) {
          // 本地没有 → 直接下载创建 ✅
          try {
            await this._downloadAndCreateNote(doc, kbGuid, docGuid)
            pulledCount++
          } catch (e) {
            console.warn('[SyncService] Failed to download note content:', docGuid, e)
          }
        } else {
          // 本地已有 → 比较时间戳，智能合并 ⭐ 核心逻辑
          const localModified = existingNote.local_modified || existingNote.data_modified || 0

          if (!localModified || serverModified > localModified) {
            // 云端更新 → 覆盖本地
            console.log(`[SyncService] Cloud is newer (${new Date(serverModified).toLocaleString()} > ${new Date(localModified).toLocaleString()}), updating local:`, docGuid)
            try {
              await this._downloadAndUpdateNote(doc, kbGuid, docGuid, existingNote.id)
              pulledCount++
            } catch (e) {
              console.warn('[SyncService] Failed to update local note from cloud:', docGuid, e)
            }
          } else if (localModified > serverModified) {
            // 本地更新 → 标记为待上传（下次 pushToCloud 处理）
            console.log(`[SyncService] Local is newer (${new Date(localModified).toLocaleString()} > ${new Date(serverModified).toLocaleString()}), marking for upload:`, docGuid)
            try {
              await DatabaseService.updateNote(existingNote.id, { sync_status: 'pending_upload' })
            } catch (e) {
              console.warn('[SyncService] Failed to mark note as pending_upload:', docGuid, e)
            }
            // 不增加 pulledCount，因为这是上传操作
          } else {
            // 时间相同 → 无需操作
            console.log(`[SyncService] Same timestamp (${new Date(localModified).toLocaleString()}), skipping:`, docGuid)
          }
        }
      }

      return { count: pulledCount, conflicts: conflictsCount }
    } catch (error) {
      console.error('[SyncService] Pull from cloud failed:', error)
      throw error
    }
  }

  /**
   * 从云端下载并创建新笔记
   */
  async _downloadAndCreateNote(doc, kbGuid, docGuid) {
    const content = await WizNoteApi.KnowledgeBaseApi.getNoteContent({
      kbGuid,
      docGuid
    })

    const markdownContent = content && content.html
      ? helper.extractMarkdownFromMDNote(content.html, kbGuid, docGuid, content.resources || [])
      : ''

    const serverModified = doc.dataModified || doc.data_modified || Date.now()

    const note = await DatabaseService.createNote({
      doc_guid: docGuid,
      kb_guid: kbGuid,
      title: doc.title,
      content: markdownContent,
      category: doc.category || '/',
      tags: doc.tags || '',
      data_created: doc.dataCreated || doc.data_created,
      data_modified: serverModified,
      sync_status: 'synced',
      server_modified: serverModified,
      local_modified: serverModified
    })

    if (note) {
      // ✅ 参数验证：确保有有效的 ID 和 GUID 才创建映射
      if (note.id && docGuid) {
        await DatabaseService.createGuidMapping(note.id, docGuid, 'wiznote')
      } else {
        console.warn('[SyncService] _downloadAndCreateNote: Skipping createGuidMapping - invalid params:', {
          noteId: note?.id,
          docGuid
        })
      }
    }

    return note
  }

  /**
   * 从云端下载并更新已有笔记（云端版本更新时调用）
   */
  async _downloadAndUpdateNote(doc, kbGuid, docGuid, localId) {
    const content = await WizNoteApi.KnowledgeBaseApi.getNoteContent({
      kbGuid,
      docGuid
    })

    const markdownContent = content && content.html
      ? helper.extractMarkdownFromMDNote(content.html, kbGuid, docGuid, content.resources || [])
      : ''

    const serverModified = doc.dataModified || doc.data_modified || Date.now()

    await DatabaseService.updateNote(localId, {
      title: doc.title,
      content: markdownContent,
      category: doc.category || '/',
      tags: doc.tags || '',
      data_modified: serverModified,
      sync_status: 'synced',
      kb_guid: kbGuid,
      server_modified: serverModified,
      local_modified: serverModified
    }, { isSystemUpdate: true })
  }

  /**
   * 上传本地变更到云端
   * 只更新内容，不改变笔记所在文件夹（避免触发为知笔记的移动/删除文件夹逻辑）
   *
   * 离线笔记合并规则：
   * - 纯本地笔记（doc_guid 以 local_ 开头）：当作新建推送到云端
   * - 同文件夹路径 + 标题：本地覆盖线上（云端直接更新同名笔记）
   */
  async pushToCloud() {
    const pendingNotes = await DatabaseService.getPendingSyncNotes()
    console.log('[SyncService] pushToCloud: found', pendingNotes?.length || 0, 'pending notes')
    if (pendingNotes.length === 0) {
      console.log('[SyncService] No pending notes to sync')
      return { count: 0, errors: 0 }
    }

    let pushedCount = 0
    let errors = 0

    for (const note of pendingNotes) {
      console.log(`[SyncService] Processing note: id=${note.id}, doc_guid=${note.doc_guid}, title=${note.title}, sync_status=${note.sync_status}`)

      try {
        // ✅ 幂等性保护 1：标记为"正在同步"，防止并发重复同步
        await DatabaseService.updateNote(note.id, { sync_status: 'syncing' })

        // ✅ 幂等性保护 2：检查是否已经通过 guid_mapping 同步过（防止重复创建）
        const existingMapping = await DatabaseService.getGuidMappingByLocalId(note.id)
        if (existingMapping && existingMapping.doc_guid && !existingMapping.doc_guid.startsWith('local_')) {
          console.log('[SyncService] Note already synced (found in guid_mapping), skipping:', existingMapping.doc_guid)
          await DatabaseService.updateNote(note.id, {
            doc_guid: existingMapping.doc_guid,
            sync_status: 'synced',
            server_modified: Date.now()
          }, { isSystemUpdate: true })
          pushedCount++
          continue
        }

        // ✅ 幂等性保护 3：检查是否有相同 (title + category) 的已同步笔记（防止 actions.js 已推送但本地未更新的情况）
        const duplicateSyncedNote = await DatabaseService.findDuplicateSyncedNote(note.title, note.category)
        if (duplicateSyncedNote && duplicateSyncedNote.doc_guid && !duplicateSyncedNote.doc_guid.startsWith('local_')) {
          console.log(`[SyncService] Found duplicate synced note with same title+category: id=${duplicateSyncedNote.id}, doc_guid=${duplicateSyncedNote.doc_guid}`)
          console.log(`[SyncService] Merging current note ${note.id} into existing synced note ${duplicateSyncedNote.id}`)
          
          // 将当前笔记的 doc_guid 更新为已同步笔记的 guid，并标记为 synced
          await DatabaseService.updateNote(note.id, {
            doc_guid: duplicateSyncedNote.doc_guid,
            kb_guid: duplicateSyncedNote.kb_guid || note.kb_guid || getKbGuid(),
            sync_status: 'synced',
            server_modified: Date.now()
          }, { isSystemUpdate: true })
          
          // 创建 GUID 映射
          if (note.id && duplicateSyncedNote.doc_guid) {
            await DatabaseService.createGuidMapping(note.id, duplicateSyncedNote.doc_guid, 'wiznote')
          }
          
          pushedCount++
          continue
        }
        // 离线笔记（doc_guid 以 local_ 开头）：当作新建推送到云端
        // 合并规则：同文件夹路径 + 同标题 → 本地覆盖线上（精确匹配）
        if (note.doc_guid && note.doc_guid.startsWith('local_')) {
          console.log('[SyncService] Processing offline note:', note.title, 'category:', note.category)
          const kbGuid = getKbGuid()
          let targetDocGuid = null

          try {
            // 按标题搜索云端笔记
            const searchResult = await WizNoteApi.KnowledgeBaseApi.searchNote({
              data: { ss: note.title },
              kbGuid
            })
            if (Array.isArray(searchResult) && searchResult.length > 0) {
              // 精确匹配：同标题 + 同文件夹路径（category）
              // 注意：如果搜索结果中有多个同路径同标题的笔记（用户可能离线时在本地创建了重名笔记），
              // 则不走覆盖逻辑，直接创建新笔记，避免互相覆盖
              const sameFolderSameTitle = searchResult.filter(doc => {
                // 关键：对两边 category 都使用 normalizeCategory 规范化
                // 离线笔记 '/My Notes/' 或 '/我的笔记/' 会被规范化为 '/'，与云端根目录笔记匹配
                const docCat = normalizeCategory(doc.category || '')
                const noteCat = normalizeCategory(note.category || '')
                return doc.title === note.title && docCat === noteCat
              })
              if (sameFolderSameTitle.length === 1) {
                targetDocGuid = sameFolderSameTitle[0].guid || sameFolderSameTitle[0].docGuid
                console.log('[SyncService] Found exactly one cloud note with same title+folder, will update:', targetDocGuid)
              } else if (sameFolderSameTitle.length > 1) {
                console.warn('[SyncService] Multiple cloud notes with same title+folder, creating as new to avoid overwrite')
              } else {
                console.log('[SyncService] No cloud note with same title+folder, will create new')
              }
            }
          } catch (e) {
            console.warn('[SyncService] searchNote failed, creating new:', e.message)
          }

          if (targetDocGuid) {
            // 精确匹配到 1 个云端笔记 → 本地覆盖线上
            // 使用笔记自身的 kbGuid（如果有），否则使用当前登录的 kbGuid
            await api.updateDoc(targetDocGuid, {
              title: note.title,
              content: note.content,
              category: note.category || '/'
            }, note.kb_guid || null)
            await DatabaseService.updateNote(note.id, {
              doc_guid: targetDocGuid,
              kb_guid: note.kb_guid || getKbGuid(),
              sync_status: 'synced',
              server_modified: Date.now()
            }, { isSystemUpdate: true })
            // ✅ 参数验证：确保有有效的 ID 和 GUID 才创建映射
            if (note.id && targetDocGuid) {
              await DatabaseService.createGuidMapping(note.id, targetDocGuid, 'wiznote')
            } else {
              console.warn('[SyncService] Skipping createGuidMapping - invalid params:', {
                noteId: note.id,
                targetDocGuid
              })
            }
            pushedCount++
          } else {
            // 没有精确匹配（或匹配到多个）→ 在云端创建新笔记
            // ✅ 参考 actions.js：传 category 参数（与用户手动创建一致）
            let cloudGuid = null
            try {
              const result = await api.createDoc({
                title: note.title,
                content: note.content,
                category: note.category || ''
              }, note.kb_guid || null)
              
              if (result?.guid) {
                cloudGuid = result.guid
                console.log(`[SyncService] ✅ createDoc success, cloudGuid=${cloudGuid}`)
              } else {
                throw new Error('createDoc returned no guid')
              }
            } catch (createError) {
              console.error(`[SyncService] ❌ createDoc failed for note ${note.id}:`, createError)
              throw createError  // 创建失败，抛出外层处理
            }

            // ✅ 关键改进：createDoc 成功后，即使后续本地更新失败，也不要完全回滚
            // 因为云端笔记已经创建了，回滚会导致下次重复创建！
            try {
              await DatabaseService.updateNote(note.id, {
                doc_guid: cloudGuid,
                kb_guid: note.kb_guid || getKbGuid(),
                sync_status: 'synced',
                server_modified: Date.now()
              }, { isSystemUpdate: true })
              
              console.log(`[SyncService] ✅ Local note ${note.id} updated with cloudGuid=${cloudGuid}`)
            } catch (updateError) {
              console.error(`[SyncService] ⚠️ updateNote failed after createDoc success (non-critical):`, updateError)
              // 本地更新失败，但云端已创建 → 标记为 conflict 而不是 pending_upload
              // 避免下次重复创建云端笔记
              try {
                await DatabaseService.updateNote(note.id, { 
                  doc_guid: cloudGuid,
                  sync_status: 'conflict'  // 需要人工确认，但不会重复创建
                })
              } catch (e2) {
                console.error(`[SyncService] ❌ Failed to mark as conflict:`, e2)
              }
            }

            // 尝试创建 GUID 映射（非关键操作）
            try {
              if (note.id && cloudGuid) {
                await DatabaseService.createGuidMapping(note.id, cloudGuid, 'wiznote')
              }
            } catch (mappingError) {
              console.warn(`[SyncService] ⚠️ createGuidMapping failed (non-critical):`, mappingError)
              // 映射创建失败不影响同步状态
            }
            
            pushedCount++
          }
          continue
        }

        // 有 doc_guid 的已同步笔记：更新云端
        if (!note.doc_guid) {
          // 纯本地新建的笔记（无 doc_guid）：尝试在云端创建
          console.log('[SyncService] Creating new note on cloud:', note.title)
          
          let cloudGuid2 = null
          try {
            // ✅ 参考 actions.js：传 category 参数（与用户手动创建一致）
            const result = await api.createDoc({
              title: note.title,
              content: note.content,
              category: note.category || ''
            }, note.kb_guid || null)
            
            if (result?.guid) {
              cloudGuid2 = result.guid
              console.log(`[SyncService] ✅ createDoc success (no doc_guid), cloudGuid=${cloudGuid2}`)
            } else {
              throw new Error('createDoc returned no guid')
            }
          } catch (createError2) {
            console.error(`[SyncService] ❌ createDoc failed for note ${note.id} (no doc_guid):`, createError2)
            throw createError2
          }

          // ✅ 同样改进：createDoc 成功后不完全回滚
          try {
            await DatabaseService.updateNote(note.id, {
              doc_guid: cloudGuid2,
              kb_guid: note.kb_guid || getKbGuid(),
              sync_status: 'synced',
              server_modified: Date.now()
            }, { isSystemUpdate: true })
            
            console.log(`[SyncService] ✅ Local note ${note.id} updated with cloudGuid=${cloudGuid2}`)
          } catch (updateError2) {
            console.error(`[SyncService] ⚠️ updateNote failed after createDoc success (non-critical):`, updateError2)
            try {
              await DatabaseService.updateNote(note.id, { 
                doc_guid: cloudGuid2,
                sync_status: 'conflict'
              })
            } catch (e3) {
              console.error(`[SyncService] ❌ Failed to mark as conflict:`, e3)
            }
          }

          try {
            if (note.id && cloudGuid2) {
              await DatabaseService.createGuidMapping(note.id, cloudGuid2, 'wiznote')
            }
          } catch (mappingError2) {
            console.warn(`[SyncService] ⚠️ createGuidMapping failed (non-critical):`, mappingError2)
          }
          
          pushedCount++
          continue
        }

        console.log('[SyncService] Updating note:', note.doc_guid, 'title:', note.title, 'kb_guid:', note.kb_guid)
        await api.updateDoc(note.doc_guid, {
          title: note.title,
          content: note.content
          // 不传 category — 避免触发为知笔记的移动/删除文件夹逻辑
          // 如果需要移动笔记，应该通过专门的 moveNote 操作
        }, note.kb_guid || null)
        await DatabaseService.updateNote(note.id, {
          sync_status: 'synced',
          server_modified: Date.now()
        }, { isSystemUpdate: true })
        pushedCount++
      } catch (error) {
        console.error(`[SyncService] Push note ${note.id} (${note.doc_guid || 'local_only'}) failed:`, error)
        errors++

        // ✅ 智能错误分类处理
        const errorMessage = error?.message || error?.toString() || 'Unknown error'
        const isRetryableError = this._isRetryableError(errorMessage)

        if (isRetryableError) {
          // 可重试错误（网络问题、临时服务器错误）→ 标记为 pending_upload，下次同步时重试
          console.log(`[SyncService] Retryable error for note ${note.id}, will retry next sync`)
          await DatabaseService.updateNote(note.id, { sync_status: 'pending_upload' })
        } else {
          // 永久性错误（如 kbGuid 不匹配、权限不足等）→ 保持 syncing 状态，需要用户手动处理
          console.error(`[SyncService] Permanent failure for note ${note.id}: ${errorMessage}`)
          console.error(`[SyncService] Note details:`, {
            id: note.id,
            doc_guid: note.doc_guid,
            kb_guid: note.kb_guid,
            title: note.title,
            sync_status_before: note.sync_status
          })
          await DatabaseService.updateNote(note.id, { sync_status: 'conflict' })
        }
      }
    }

    return { count: pushedCount, errors }
  }

  /**
   * 判断是否为可重试的错误类型
   * @param {string} errorMessage - 错误消息
   * @returns {boolean} 是否可以重试
   */
  _isRetryableError(errorMessage) {
    const retryablePatterns = [
      /network/i,
      /timeout/i,
      /ECONNREFUSED/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /socket hang up/i,
      /5\d{2}/,  // 5xx 服务器错误
      /502|503|504/,  // 网关/服务不可用
      /Failed to create note/i,  // 创建笔记失败（可能是临时问题）
      /request failed/i
    ]

    return retryablePatterns.some(pattern => pattern.test(errorMessage))
  }

  /**
   * 自动解决所有冲突笔记
   * 策略：基于时间戳智能合并 - 谁最新就用谁的版本
   * 
   * @returns {Promise<Object>} 解决结果统计
   */
  async autoResolveConflicts() {
    console.log('[SyncService] Starting auto-resolve conflicts...')
    
    let conflictNotes = await DatabaseService.getConflictNotes()
    
    if (!conflictNotes || conflictNotes.length === 0) {
      console.log('[SyncService] No conflicts to resolve')
      return { resolved: 0, skipped: 0, errors: 0, duplicatesRemoved: 0 }
    }

    console.log(`[SyncService] Found ${conflictNotes.length} conflicts to auto-resolve`)
    
    // ✅ 预检步骤 1：按 (title + category) 分组，找出重复的 conflict 笔记
    const conflictGroups = {}
    for (const note of conflictNotes) {
      const key = `${note.title || ''}::${normalizeCategory(note.category || '')}`
      if (!conflictGroups[key]) {
        conflictGroups[key] = []
      }
      conflictGroups[key].push(note)
    }

    // ✅ 预检步骤 2：每组重复的 conflict 笔记只保留最新的，其余标记删除
    let duplicatesRemoved = 0
    const notesToProcess = []  // 最终要处理的笔记列表

    for (const [key, group] of Object.entries(conflictGroups)) {
      if (group.length > 1) {
        // 有重复 → 按 local_modified 降序排序，保留最新的
        console.log(`[SyncService] ⚠️ Found ${group.length} duplicate conflicts with key: ${key}`)
        group.sort((a, b) => (b.local_modified || 0) - (a.local_modified || 0))
        
        // 保留第一条（最新的），其余标记删除
        const [keepNote, ...removeNotes] = group
        notesToProcess.push(keepNote)
        
        for (const removeNote of removeNotes) {
          console.log(`[SyncService] 🗑️ Marking duplicate conflict note for deletion: id=${removeNote.id}`)
          try {
            // 标记为待删除（软删除），避免直接删除导致数据丢失
            await DatabaseService.updateNote(removeNote.id, { 
              sync_status: 'deleted',
              title: `[DUPLICATE-DELETED] ${removeNote.title || ''}`  // 标记为重复删除
            })
            duplicatesRemoved++
          } catch (e) {
            console.error(`[SyncService] Failed to mark duplicate as deleted:`, e)
          }
        }
      } else {
        // 无重复 → 正常处理
        notesToProcess.push(group[0])
      }
    }

    if (duplicatesRemoved > 0) {
      console.log(`[SyncService] ✅ Removed ${duplicatesRemoved} duplicate conflict notes in pre-check`)
    }

    // 更新冲突列表为去重后的列表
    conflictNotes = notesToProcess
    
    // ✅ 关键改进：统一获取有效的 kbGuid，避免传 NULL 导致 "kbGuid is not match" 错误
    const effectiveKbGuid = getKbGuid()
    if (!effectiveKbGuid || effectiveKbGuid === 'null') {
      console.error('[SyncService] No valid kbGuid available, cannot resolve conflicts')
      return { resolved: 0, skipped: conflictNotes.length, errors: conflictNotes.length, duplicatesRemoved }
    }
    
    console.log(`[SyncService] Using effectiveKbGuid: ${effectiveKbGuid}`)
    console.log(`[SyncService] Processing ${conflictNotes.length} unique conflicts after dedup`)
    
    let resolved = 0
    let skipped = 0
    let errors = 0

    for (const note of conflictNotes) {
      try {
        console.log(`[SyncService] Auto-resolving conflict: id=${note.id}, title=${note.title}, category=${note.category}`)
        
        // ✅ 幂等性检查：查找是否已存在相同 (title + category) 的 synced 笔记
        const existingSyncedNote = await DatabaseService.findDuplicateSyncedNote(note.title, note.category)
        if (existingSyncedNote && existingSyncedNote.id !== note.id) {
          console.log(`[SyncService] ⚠️ Found existing synced note with same title+category: id=${existingSyncedNote.id}`)
          
          // 比较时间戳，决定合并策略
          const existingModified = existingSyncedNote.local_modified || existingSyncedNote.server_modified || 0
          const currentModified = note.local_modified || note.data_modified || 0
          
          if (currentModified > existingModified) {
            // 当前冲突笔记更新 → 用当前内容更新已存在的 synced 笔记
            console.log(`[SyncService] Merging into existing synced note (current is newer): ${existingSyncedNote.id}`)
            try {
              await DatabaseService.updateNote(existingSyncedNote.id, {
                title: note.title,
                content: note.content,
                local_modified: currentModified,
                server_modified: Date.now()
              }, { isSystemUpdate: true })
              
              // 如果已有云端 GUID，也更新云端
              if (existingSyncedNote.doc_guid && !existingSyncedNote.doc_guid.startsWith('local_')) {
                try {
                  await api.updateDoc(existingSyncedNote.doc_guid, {
                    title: note.title,
                    content: note.content
                  }, effectiveKbGuid)
                } catch (updateError) {
                  console.warn(`[SyncService] Failed to update cloud during merge (non-critical):`, updateError)
                }
              }
              
              // 标记当前冲突笔记为已合并（删除）
              await DatabaseService.updateNote(note.id, { 
                sync_status: 'deleted',
                title: `[MERGED-INTO-${existingSyncedNote.id}] ${note.title || ''}`
              })
              
              console.log(`[SyncService] ✅ Merged conflict note ${note.id} into synced note ${existingSyncedNote.id}`)
              resolved++
              continue
            } catch (mergeError) {
              console.error(`[SyncService] Failed to merge notes:`, mergeError)
              // 合并失败 → 继续正常处理流程
            }
          } else {
            // 已存在的 synced 笔记更新或相同 → 直接删除当前冲突笔记
            console.log(`[SyncService] Deleting conflict note (existing synced is newer or same): ${note.id}`)
            try {
              await DatabaseService.updateNote(note.id, { 
                sync_status: 'deleted',
                title: `[DUP-OF-${existingSyncedNote.id}] ${note.title || ''}`
              })
              resolved++  // 视为已解决（通过删除）
              continue
            } catch (deleteError) {
              console.error(`[SyncService] Failed to delete duplicate:`, deleteError)
              // 删除失败 → 继续正常处理流程
            }
          }
        }
        
        // ✅ 正常的冲突解决逻辑（时间戳比较）
        const localModified = note.local_modified || note.data_modified || 0
        const serverModified = note.server_modified || 0
        
        console.log(`[SyncService] Timestamp comparison:`, {
          local: new Date(localModified).toLocaleString(),
          server: new Date(serverModified).toLocaleString(),
          diff: localModified - serverModified
        })

        if (localModified > serverModified) {
          // ✅ 本地更新 → 用本地覆盖云端
          console.log(`[SyncService] Local is newer, pushing to cloud: ${note.title}`)
          
          // ✅ 使用统一的有效 kbGuid，避免 "kbGuid is not match" 错误
          const noteKbGuid = note.kb_guid || effectiveKbGuid
          
          if (note.doc_guid && !note.doc_guid.startsWith('local_')) {
            // 有有效的云端 GUID → 更新云端
            await api.updateDoc(note.doc_guid, {
              title: note.title,
              content: note.content
            }, noteKbGuid)
            
            await DatabaseService.updateNote(note.id, {
              sync_status: 'synced',
              server_modified: Date.now()
            }, { isSystemUpdate: true })
            
            console.log(`[SyncService] ✅ Updated cloud with local version: ${note.id}`)
          } else {
            // 没有有效的云端 GUID（local_xxx 或 NULL）→ 在云端创建新笔记
            // ✅ 参考 actions.js：传 category 参数（与用户手动创建一致）
            const result = await api.createDoc({
              title: note.title,
              content: note.content,
              category: note.category || ''
            }, noteKbGuid)
            
            if (result?.guid) {
              // ✅ 更新 doc_guid 为实际的云端 GUID（保持一致！）
              await DatabaseService.updateNote(note.id, {
                doc_guid: result.guid,
                kb_guid: effectiveKbGuid,  // ← 使用有效的 kbGuid
                sync_status: 'synced',
                server_modified: Date.now()
              }, { isSystemUpdate: true })
              
              // ✅ 创建 GUID 映射（确保幂等性）
              if (note.id && result.guid) {
                await DatabaseService.createGuidMapping(note.id, result.guid, 'wiznote')
              }
              
              console.log(`[SyncService] ✅ Created on cloud and updated doc_guid: ${note.doc_guid} → ${result.guid}`)
            } else {
              throw new Error('createDoc returned no guid')
            }
          }
          
        } else if (serverModified > localModified) {
          // ✅ 云端更新 → 用云端覆盖本地
          console.log(`[SyncService] Server is newer, pulling from cloud: ${note.title}`)
          
          if (note.doc_guid && !note.doc_guid.startsWith('local_')) {
            // 有有效的云端 GUID → 从云端下载内容
            try {
              const docs = await api.getDocs(null, note.doc_guid)
              if (docs && docs.length > 0) {
                const serverDoc = docs[0]
                
                // 提取 markdown 内容
                let markdownContent = ''
                if (serverDoc.html) {
                  markdownContent = helper.extractMarkdownFromMDNote(
                    serverDoc.html, 
                    effectiveKbGuid,  // ← 使用统一的有效 kbGuid
                    note.doc_guid, 
                    serverDoc.resources || []
                  )
                } else {
                  markdownContent = serverDoc.content || ''
                }
                
                // ✅ 用云端内容更新本地（包括 doc_guid 确保一致）
                await DatabaseService.updateNote(note.id, {
                  title: serverDoc.title,
                  content: markdownContent,
                  category: serverDoc.category || note.category,
                  data_modified: serverModified,
                  sync_status: 'synced',
                  kb_guid: effectiveKbGuid,  // ← 使用有效的 kbGuid
                  server_modified: serverModified,
                  local_modified: serverModified  // 同步时间戳
                }, { isSystemUpdate: true })
                
                console.log(`[SyncService] ✅ Updated local with cloud version: ${note.id}`)
              } else {
                // 云端找不到该笔记 → 标记为需要上传
                console.warn(`[SyncService] Cloud note not found, marking as pending_upload: ${note.id}`)
                await DatabaseService.updateNote(note.id, { 
                  sync_status: 'pending_upload' 
                })
                skipped++
                continue
              }
            } catch (downloadError) {
              console.error(`[SyncService] Failed to download from cloud: ${downloadError.message}`)
              // 下载失败 → 跳过这条，保持 conflict 状态
              skipped++
              continue
            }
          } else {
            // 没有有效的云端 GUID → 无法从云端拉取
            console.warn(`[SyncService] No valid doc_guid, cannot pull from cloud: ${note.id}`)
            // 尝试当作新笔记创建到云端（使用统一的有效 kbGuid）
            // ✅ 参考 actions.js：传 category 参数（与用户手动创建一致）
            const result = await api.createDoc({
              title: note.title,
              content: note.content,
              category: note.category || ''
            }, effectiveKbGuid)  // ← 使用有效的 kbGuid
            
            if (result?.guid) {
              await DatabaseService.updateNote(note.id, {
                doc_guid: result.guid,
                kb_guid: effectiveKbGuid,  // ← 使用有效的 kbGuid
                sync_status: 'synced',
                server_modified: Date.now()
              }, { isSystemUpdate: true })
              
              if (note.id && result.guid) {
                await DatabaseService.createGuidMapping(note.id, result.guid, 'wiznote')
              }
              
              console.log(`[SyncService] ✅ Created on cloud (fallback): ${note.id}`)
            }
          }
          
        } else {
          // ⏰ 时间戳相同 → 默认保留本地版本（因为用户可能刚编辑过）
          console.log(`[SyncService] Same timestamp, keeping local version: ${note.title}`)
          
          if (note.doc_guid && !note.doc_guid.startsWith('local_')) {
            await api.updateDoc(note.doc_guid, {
              title: note.title,
              content: note.content
            }, effectiveKbGuid)  // ← 使用有效的 kbGuid
            
            await DatabaseService.updateNote(note.id, {
              sync_status: 'synced',
              server_modified: Date.now()
            }, { isSystemUpdate: true })
          } else {
            // ✅ 参考 actions.js：传 category 参数（与用户手动创建一致）
            const result = await api.createDoc({
              title: note.title,
              content: note.content,
              category: note.category || ''
            }, effectiveKbGuid)  // ← 使用有效的 kbGuid
            
            if (result?.guid) {
              await DatabaseService.updateNote(note.id, {
                doc_guid: result.guid,
                kb_guid: effectiveKbGuid,  // ← 使用有效的 kbGuid
                sync_status: 'synced',
                server_modified: Date.now()
              }, { isSystemUpdate: true })
              
              if (note.id && result.guid) {
                await DatabaseService.createGuidMapping(note.id, result.guid, 'wiznote')
              }
            }
          }
        }
        
        resolved++
        console.log(`[SyncService] ✅ Conflict resolved: id=${note.id}, title=${note.title}`)
        
      } catch (error) {
        console.error(`[SyncService] ❌ Failed to resolve conflict for note ${note.id}:`, error)
        errors++
        // 保持 conflict 状态，下次同步时重试
      }
    }

    const result = {
      total: conflictNotes.length,
      resolved,
      skipped,
      errors,
      duplicatesRemoved  // ✅ 新增：预检时删除的重复笔记数
    }

    console.log('[SyncService] Auto-resolve conflicts completed:', result)
    this.notifyListeners({ type: 'conflicts_auto_resolved', ...result })
    
    return result
  }

  /**
   * 手动解决冲突（保留原有功能）
   */
  async resolveConflict(noteId, resolution, mergedContent = null) {
    const note = await DatabaseService.getNoteById(noteId)
    if (!note || note.sync_status !== 'conflict') {
      console.warn('[SyncService] Note not in conflict state:', noteId)
      return false
    }

    try {
      switch (resolution) {
        case 'local':
          if (note.doc_guid) {
            await api.updateDoc(note.doc_guid, {
              title: note.title,
              content: note.content,
              category: note.category
            })
          } else {
            // ✅ 参考 actions.js：传 category 参数（与用户手动创建一致）
            const result = await api.createDoc({
              title: note.title,
              content: note.content,
              category: note.category || ''
            })
            if (result.guid) {
              await DatabaseService.updateNote(noteId, { doc_guid: result.guid })
              await DatabaseService.createGuidMapping(noteId, result.guid, 'wiznote')
            }
          }
          await DatabaseService.updateNote(noteId, { sync_status: 'synced' })
          break

        case 'server': {
          const docs = await api.getDocs(null, note.doc_guid)
          if (docs.length > 0) {
            const serverDoc = docs[0]
            await DatabaseService.updateNote(noteId, {
              title: serverDoc.title,
              content: serverDoc.content,
              category: serverDoc.category,
              sync_status: 'synced',
              server_modified: serverDoc.data_modified
            })
          }
          break
        }

        case 'merge':
          if (mergedContent !== null) {
            await DatabaseService.updateNote(noteId, {
              content: mergedContent,
              sync_status: 'pending_upload'
            })
            await this.pushToCloud()
          }
          break

        default:
          console.error('[SyncService] Unknown resolution:', resolution)
          return false
      }

      console.info(`[SyncService] Conflict resolved for note ${noteId}: ${resolution}`)
      this.notifyListeners({ type: 'conflict_resolved', noteId, resolution })
      return true
    } catch (error) {
      console.error('[SyncService] Failed to resolve conflict:', error)
      throw error
    }
  }

  /**
   * 获取同步状态
   */
  async getStatus() {
    const stats = await DatabaseService.getStats()
    return {
      isSyncing: this.isSyncing,
      ...stats
    }
  }
}

export default new SyncService()
