/**
 * SyncService - 为知笔记同步服务
 * 纯本地优先架构：只 push，不 pull
 * 用 dirty 字段(0/1)跟踪待同步状态
 */

import DatabaseClient from 'src/utils/DatabaseClient'
import WizNoteApi from '../utils/api'
import helper from '../utils/helper'
import SessionStorageService from './SessionStorageService'
import { OFFLINE_ROOT_CATEGORY, normalizeCategoryForMatch } from '../utils/constants'

function getKbGuid() {
  return SessionStorageService.getKbGuid()
}

const api = {
  async getDocs(since = null, docGuid = null) {
    const kbGuid = getKbGuid()
    if (!kbGuid || kbGuid === 'null') {
      throw new Error('[SyncService] kbGuid is not available, please login first')
    }

    if (docGuid) {
      const info = await WizNoteApi.KnowledgeBaseApi.getNoteInfo({ kbGuid, docGuid })
      if (info) {
        const content = await WizNoteApi.KnowledgeBaseApi.getNoteContent({ kbGuid, docGuid })
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

  async createDoc(note, kbGuid = null) {
    const effectiveKbGuid = kbGuid || getKbGuid()
    if (!effectiveKbGuid || effectiveKbGuid === 'null') {
      throw new Error('[SyncService] kbGuid is not available, please login first')
    }

    const userId = SessionStorageService.getUserId() || ''
    const isLite = (note.category || '').replace(/\//g, '') === 'Lite'
    const category = note.category || ''

    const html = helper.embedMDNote(note.content || '', [], {
      wrapWithPreTag: isLite,
      kbGuid: effectiveKbGuid,
      docGuid: ''
    })

    const createData = {
      category,
      kbGuid: effectiveKbGuid,
      title: note.title || 'Untitled',
      owner: userId,
      html,
      type: isLite ? 'lite/markdown' : 'document',
      tags: note.tags || ''
    }

    const result = await WizNoteApi.KnowledgeBaseApi.createNote({
      kbGuid: effectiveKbGuid,
      data: createData
    })

    console.log('[SyncService] createDoc API response:', JSON.stringify(result))

    if (result && result.guid) {
      return { guid: result.guid }
    }

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

  async updateDoc(docGuid, updates, kbGuid = null) {
    const effectiveKbGuid = kbGuid || getKbGuid()
    if (!effectiveKbGuid || effectiveKbGuid === 'null') {
      throw new Error('[SyncService] kbGuid is not available, please login first')
    }

    const html = helper.embedMDNote(updates.content || '', [], {
      wrapWithPreTag: false,
      kbGuid: effectiveKbGuid,
      docGuid
    })

    const data = {
      html,
      title: updates.title,
      kbGuid: effectiveKbGuid,
      docGuid,
      resources: updates.resources || [],
      type: 'document',
      tags: updates.tags || ''
    }

    // ✅ 保持原始 category 不做 normalize，确保上传路径与本地存储一致
    // normalizeCategory 仅用于去重/search 匹配逻辑，不用于 API 上传
    if (updates.category != null) {
      data.category = updates.category
    }

    const result = await WizNoteApi.KnowledgeBaseApi.updateNote({
      kbGuid: effectiveKbGuid,
      docGuid,
      data
    })

    return result
  },

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
   * 执行同步（本地优先架构：先 pull 新文件，再 push dirty 文件）
   * - Step 1: 从云端拉取本地不存在的笔记
   * - Step 2: 将所有 dirty=1 的笔记推送到云端
   */
  async sync(options = {}) {
    if (this.isSyncing) {
      console.info('[SyncService] Sync already in progress, skipping')
      return { success: false, reason: 'already_syncing' }
    }

    const kbGuid = getKbGuid()
    if (!kbGuid || kbGuid === 'null') {
      console.warn('[SyncService] Sync skipped: no kbGuid (not logged in)')
      return { success: false, reason: 'not_logged_in' }
    }

    this.isSyncing = true
    this.notifyListeners({ type: 'sync_start' })

    try {
      const stats = { pulled: 0, pushed: 0, errors: 0, skipped: 0 }

      // Step 1: 从云端拉取本地不存在的笔记（不覆盖已有内容）
      console.info('[SyncService] Starting pull from cloud (new files only)...')
      const pullResult = await this.pullFromCloud()
      stats.pulled = pullResult.count
      stats.skipped = pullResult.skipped || 0  // ✅ 添加跳过计数

      // Step 2: 推送本地变更到云端
      console.info('[SyncService] Starting push to cloud...')
      const pushResult = await this.pushToCloud()
      stats.pushed = pushResult.count
      stats.errors += pushResult.errors

      console.info(`[SyncService] ✅ Sync completed: ↓${stats.pulled} pulled, ↑${stats.pushed} pushed, ⏭️${stats.skipped} skipped (local exists), ${stats.errors} errors`)
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
   * 从云端拉取本地不存在的笔记（不覆盖已有内容）
   * - 获取云端所有笔记列表
   * - 只下载本地 SQLite 中不存在的笔记
   * - 如果 title + category + kbGuid 都相同，直接跳过（永不覆盖本地）
   */
  async pullFromCloud() {
    try {
      const kbGuid = getKbGuid()
      if (!kbGuid || kbGuid === 'null') {
        console.warn('[SyncService] pullFromCloud skipped: no kbGuid')
        return { count: 0, skipped: 0 }
      }

      // 获取云端所有笔记列表（不下载内容，只获取元数据）
      console.log('[SyncService] Fetching cloud note list...')
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

      console.log(`[SyncService] Found ${docs.length} notes on cloud`)

      let pulledCount = 0
      let skippedCount = 0

      // ✅ 预加载所有本地笔记的 (title, category, kbGuid) 用于快速去重检查
      const localNotes = await DatabaseClient.notes.getAllBasic() || []

      // 构建 Set 用于 O(1) 查找：key = "title|category(kbGuid normalized)|kbGuid"
      // category 需要与 pullFromCloud 中的 normalizeCategoryForMatch 保持一致
      const localNoteSet = new Set(
        localNotes.map(note => {
          const localCat = normalizeCategoryForMatch(note.category || '')
          return `${note.title || ''}|${localCat}|${note.kb_guid || ''}`.toLowerCase()
        })
      )

      console.log(`[SyncService] Loaded ${localNoteSet.size} local notes for dedup check`)

      for (const doc of docs) {
        const docGuid = doc.docGuid || doc.guid
        if (!docGuid) continue

        // ✅ 核心去重逻辑：使用 normalizeCategoryForMatch 确保与本地 Set 对称
        const cloudCategory = normalizeCategoryForMatch(doc.category || '')

        const dedupeKey = `${doc.title || 'Untitled'}|${cloudCategory}|${kbGuid}`.toLowerCase()

        if (localNoteSet.has(dedupeKey)) {
          // ✅ 本地已存在相同 (title, category, kbGuid) 的笔记 → 直接跳过！
          skippedCount++
          console.log(`[SyncService] ⏭️ SKIPPED: "${doc.title}" already exists locally (title+category+kbGuid match)`)
          continue  // 跳过这条笔记，不下载不覆盖
        }

        // 本地不存在 → 下载并创建
        try {
          const result = await this._downloadAndCreateNote(doc, kbGuid, docGuid)

          if (result) {
            pulledCount++
            console.log(`[SyncService] ↓ Pulled NEW note: "${doc.title}" (${docGuid}) id=${result.id}`)

            // ✅ 将新下载的笔记添加到本地集合中（避免重复下载）
            localNoteSet.add(dedupeKey)
          }
        } catch (e) {
          console.warn(`[SyncService] Failed to download note ${docGuid}:`, e.message)
        }
      }

      console.log(`[SyncService] ✅ pullFromCloud completed: ${pulledCount} pulled, ${skippedCount} skipped (already exist locally)`)
      return { count: pulledCount, skipped: skippedCount }
    } catch (error) {
      console.error('[SyncService] pullFromCloud failed:', error)
      return { count: 0, skipped: 0 }
    }
  }

  /**
   * 从云端下载并创建新笔记到本地
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

    // ✅ 修复 category 处理：使用真实根目录 OFFLINE_ROOT_CATEGORY，而不是 "/"
    let cloudCategory = doc.category

    // 校验并规范化 category
    if (!cloudCategory || cloudCategory === '/' || cloudCategory.trim() === '' || cloudCategory === '/My Notes' || cloudCategory === '/My Notes/') {
      console.warn(`[SyncService] ⚠️ Note "${doc.title}" has empty/root category (raw: "${cloudCategory}"), using "${OFFLINE_ROOT_CATEGORY}" as default`)
      cloudCategory = OFFLINE_ROOT_CATEGORY
    } else {
      // 确保 category 以 / 开头
      if (!cloudCategory.startsWith('/')) {
        cloudCategory = '/' + cloudCategory
      }
      // 确保以 / 结尾（符合 WizNote 规范）
      if (!cloudCategory.endsWith('/')) {
        cloudCategory = cloudCategory + '/'
      }
    }

    console.log(`[SyncService] ↓ Downloading: "${doc.title}" → category="${cloudCategory}" (original: "${doc.category}")`)

    const note = await DatabaseClient.notes.create({
      doc_guid: docGuid,
      kb_guid: kbGuid,
      title: doc.title,
      content: markdownContent,
      category: cloudCategory,
      tags: doc.tags || '',
      data_created: doc.dataCreated || doc.data_created,
      data_modified: serverModified,
      server_modified: serverModified,
      local_modified: serverModified
    })

    // 创建 GUID 映射
    if (note && note.id && docGuid) {
      try {
        await DatabaseClient.sync.createGuidMapping(note.id, docGuid, 'wiznote')
      } catch (e) {
        console.warn('[SyncService] GUID mapping failed (non-critical):', e.message)
      }
    }

    return note
  }

  /**
   * 上传本地变更到云端（纯本地优先架构）
   * - 遍历当前账号所有 dirty=1 的笔记（按 kb_guid 过滤，防止跨账号污染）
   * - 直接用本地内容覆盖/创建云端笔记
   * - 不检查冲突、不比较时间戳，永远本地优先
   */
  async pushToCloud() {
    const kbGuid = getKbGuid()
    if (!kbGuid || kbGuid === 'null') {
      console.warn('[SyncService] pushToCloud skipped: no kbGuid')
      return { count: 0, errors: 0 }
    }

    const pendingNotes = await DatabaseClient.notes.getPendingByKbGuid(kbGuid)
    console.log(`[SyncService] 📤 pushToCloud: found ${pendingNotes?.length || 0} dirty notes for kbGuid=${kbGuid}`)

    // ✅ 先把本地独有的目录同步到云端（离线创建的文件夹）
    await this.syncLocalCategoriesToCloud(kbGuid)

    if (pendingNotes.length === 0) {
      console.log('[SyncService] No dirty notes to sync')
      return { count: 0, errors: 0 }
    }

    let pushedCount = 0
    let errors = 0

    for (const note of pendingNotes) {
      console.log(`[SyncService] Processing: id=${note.id}, title=${note.title}, doc_guid=${note.doc_guid || 'none'}`)

      try {
        // 1. 从 SQLite 获取最新内容（确保使用用户最后编辑的版本）
        const latestNote = await DatabaseClient.notes.getById(note.id)
        if (latestNote) {
          note.content = latestNote.content
          note.title = latestNote.title || note.title
          note.category = latestNote.category || note.category
        }

        let cloudDocGuid = null

        // 2. 判断是否已有云端 GUID（非 local_ 开头）
        const hasCloudGuid = note.doc_guid && !note.doc_guid.startsWith('local_')

        if (hasCloudGuid) {
          // ✅ 已有云端 GUID → 直接更新覆盖
          cloudDocGuid = note.doc_guid
          console.log(`[SyncService] Updating cloud note: ${cloudDocGuid}`)

          await api.updateDoc(cloudDocGuid, {
            title: note.title,
            content: note.content,
            category: note.category || OFFLINE_ROOT_CATEGORY,  // ✅ 空 category 用 OFFLINE_ROOT_CATEGORY 而非 /
            tags: note.tags || ''
          }, note.kb_guid || kbGuid)
        } else {
          // ❌ 无云端 GUID 或 local_ 开头 → 搜索或创建
          console.log(`[SyncService] New/offline note, searching cloud...`)

          try {
            const searchResult = await WizNoteApi.KnowledgeBaseApi.searchNote({
              kbGuid: getKbGuid(),
              data: { ss: note.title }
            })

            if (Array.isArray(searchResult) && searchResult.length > 0) {
              const exactMatch = searchResult.filter(doc => {
                // ✅ 规范化到 OFFLINE_ROOT_CATEGORY，确保 /My Notes/ 和 / 统一为 OFFLINE_ROOT_CATEGORY
                const docCat = normalizeCategoryForMatch(doc.category || '')
                const noteCat = normalizeCategoryForMatch(note.category || '')
                return doc.title === note.title && docCat === noteCat
              })

              if (exactMatch.length === 1) {
                cloudDocGuid = exactMatch[0].guid || exactMatch[0].docGuid
                console.log(`[SyncService] Found match, updating: ${cloudDocGuid}`)

                await api.updateDoc(cloudDocGuid, {
                  title: note.title,
                  content: note.content,
                  category: note.category || OFFLINE_ROOT_CATEGORY,  // ✅ 空 category 用 OFFLINE_ROOT_CATEGORY
                  tags: note.tags || ''
                }, kbGuid)
              }
            }
          } catch (searchError) {
            console.warn('[SyncService] Search failed, will create new:', searchError.message)
          }

          if (!cloudDocGuid) {
            // 没有找到匹配 → 创建新笔记
            console.log(`[SyncService] Creating new cloud note: ${note.title}`)
            const result = await api.createDoc({
              title: note.title,
              content: note.content,
              category: note.category || OFFLINE_ROOT_CATEGORY,  // ✅ 空 category 用 OFFLINE_ROOT_CATEGORY
              tags: note.tags || ''
            }, note.kb_guid || kbGuid)  // ✅ 无 kb_guid 时用当前账号

            if (result?.guid) {
              cloudDocGuid = result.guid
              console.log(`[SyncService] ✅ Created: ${cloudDocGuid}`)
            } else {
              throw new Error('createDoc returned no guid')
            }
          }
        }

        // 3. 同步成功 → 更新本地记录（dirty=0）
        await DatabaseClient.notes.update(note.id, {
          doc_guid: cloudDocGuid,
          kb_guid: note.kb_guid || kbGuid,
          server_modified: Date.now()
        }, { isSystemUpdate: true })

        // 创建 GUID 映射（如果还没有）
        if (note.id && cloudDocGuid) {
          try {
            await DatabaseClient.sync.createGuidMapping(note.id, cloudDocGuid, 'wiznote')
          } catch (e) {
            console.warn('[SyncService] GUID mapping failed (non-critical):', e.message)
          }
        }

        pushedCount++
        console.log(`[SyncService] ✅ Synced: ${note.title} (id=${note.id})`)

      } catch (error) {
        console.error(`[SyncService] ❌ Failed: ${note.title} (id=${note.id}):`, error)
        errors++
      }
    }

    console.log(`[SyncService] 📊 pushToCloud completed: ${pushedCount} synced, ${errors} errors`)
    return { count: pushedCount, errors }
  }

  /**
   * 将本地独有的目录同步到云端
   * - 读取 local_only=1 的目录（离线创建的目录）
   * - 按父子顺序（广度优先）依次在云端创建
   * - 创建成功后更新 local_only=0
   * - 幂等：已存在的目录跳过
   */
  async syncLocalCategoriesToCloud(kbGuid) {
    try {
      const localCats = await DatabaseClient.categories.getAll({ kbGuid })
      const unsynced = localCats.filter(c => c.local_only === 1)

      if (unsynced.length === 0) {
        return { synced: 0, skipped: 0 }
      }

      console.log(`[SyncService] syncLocalCategoriesToCloud: ${unsynced.length} local-only categories to sync`)

      // 按路径深度排序（先创建父目录，再创建子目录）
      const sorted = [...unsynced].sort((a, b) => {
        const depthA = (a.category.match(/\//g) || []).length
        const depthB = (b.category.match(/\//g) || []).length
        return depthA - depthB
      })

      let synced = 0
      for (const cat of sorted) {
        try {
          // 构造 API 需要的 parent 和 child
          const parent = cat.parent || OFFLINE_ROOT_CATEGORY
          const child = cat.category
            .replace(parent, '')
            .replace(/^\//, '')
            .replace(/\/$/, '')

          await WizNoteApi.KnowledgeBaseApi.createCategory({
            kbGuid,
            data: {
              parent: parent,
              pos: Math.floor(Date.now() / 1000).toFixed(0),
              child: child
            }
          })

          // 标记为已同步
          await DatabaseClient.categories.syncToCloud({ category: cat.category })
          synced++
          console.log(`[SyncService] ✅ Category synced: ${cat.category}`)
        } catch (err) {
          // 幂等：云端已存在该目录（错误码 400/409），标记为已同步
          if (err?.response?.status === 400 || err?.response?.status === 409 || err?.message?.includes('exists')) {
            await DatabaseClient.categories.syncToCloud({ category: cat.category })
            console.warn(`[SyncService] Category already exists on cloud, marked synced: ${cat.category}`)
            synced++
          } else {
            console.warn(`[SyncService] Failed to sync category ${cat.category}:`, err?.message || err)
          }
        }
      }

      console.log(`[SyncService] syncLocalCategoriesToCloud: ${synced}/${unsynced.length} categories synced`)
      return { synced, total: unsynced.length }
    } catch (err) {
      console.error('[SyncService] syncLocalCategoriesToCloud error:', err)
      return { synced: 0, total: 0 }
    }
  }

  /**
   * 获取同步状态
   */
  async getStatus() {
    const stats = await DatabaseClient.sync.getStats()
    return {
      isSyncing: this.isSyncing,
      ...stats
    }
  }
}

export default new SyncService()
