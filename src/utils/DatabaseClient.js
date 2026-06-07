/**
 * DatabaseClient - 渲染进程数据库客户端
 * 通过 IPC 与主进程通信，实现数据库操作。
 *
 * 按领域暴露分组接口，便于业务代码按 notes/tags/categories/
 * sync/appState/runes 组织调用。
 */

import { ipcRenderer } from 'electron'

const invoke = (channel, payload) => {
  if (typeof payload === 'undefined') {
    return ipcRenderer.invoke(channel)
  }
  return ipcRenderer.invoke(channel, payload)
}

const notes = {
  /**
   * 获取所有笔记
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>}
   */
  async getAll(options = {}) {
    return await invoke('db:getNotes', options)
  },

  /**
   * 获取单个笔记
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    return await invoke('db:getNote', id)
  },

  /**
   * 根据 doc_guid 获取单个笔记
   * @param {string} docGuid
   * @returns {Promise<Object|null>}
   */
  async getByDocGuid(docGuid) {
    return await invoke('db:getNoteByDocGuid', docGuid)
  },

  /**
   * 根据 doc_guid 获取笔记（按 local_modified 时间戳取最新版本）
   * @param {string} docGuid
   * @returns {Promise<Object|null>}
   */
  async getByDocGuidWithPriority(docGuid) {
    return await invoke('db:getNoteByDocGuidWithPriority', docGuid)
  },

  /**
   * 获取所有笔记的基本信息（用于去重检查）
   * @returns {Promise<Array>} 返回 [{title, category, kb_guid}, ...]
   */
  async getAllBasic() {
    return await invoke('db:getAllNotesBasic')
  },

  /**
   * 创建笔记
   * @param {Object} note
   * @returns {Promise<Object|null>}
   */
  async create(note) {
    return await invoke('db:createNote', note)
  },

  /**
   * 更新笔记
   * @param {number} id
   * @param {Object} updates
   * @returns {Promise<Object|null>}
   */
  async update(id, updates) {
    return await invoke('db:updateNote', { id, updates })
  },

  /**
   * 删除笔记
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async remove(id) {
    return await invoke('db:deleteNote', id)
  },

  /**
   * 按 kb_guid 删除所有笔记（logout 时清理旧账号数据）
   * @param {string} kbGuid
   * @returns {Promise<number>}
   */
  async deleteByKbGuid(kbGuid) {
    return await invoke('db:deleteNotesByKbGuid', kbGuid)
  },

  /**
   * logout 时清理旧账号数据
   * @param {string} kbGuid
   * @returns {Promise<number>}
   */
  async clearByKbGuid(kbGuid) {
    return await invoke('db:clearNotesByKbGuid', kbGuid)
  },

  /**
   * 清理不属于当前账号的所有笔记（login 时隔离旧账号数据）
   * @param {string} currentKbGuid
   * @returns {Promise<number>}
   */
  async clearOtherAccounts(currentKbGuid) {
    return await invoke('db:clearOtherAccountNotes', currentKbGuid)
  },

  /**
   * 获取指定账号的待同步笔记
   * @param {string} kbGuid
   * @returns {Promise<Array>}
   */
  async getPendingByKbGuid(kbGuid) {
    return await invoke('db:getPendingSyncNotesByKbGuid', kbGuid)
  },

  /**
   * 将 kb_guid=null 的离线笔记迁移到当前账号
   * @param {string} currentKbGuid
   * @returns {Promise<number>}
   */
  async migrateOffline(currentKbGuid) {
    return await invoke('db:migrateOfflineNotes', currentKbGuid)
  }
}

const tags = {
  /**
   * 获取所有标签
   * @returns {Promise<Array>}
   */
  async getAll(options = {}) {
    return await invoke('db:getTags', options)
  },

  /**
   * 创建标签
   * @param {Object} tag
   * @returns {Promise<Object|null>}
   */
  async create(tag) {
    return await invoke('db:createTag', tag)
  },

  async getByName(name) {
    return await invoke('db:getTagByName', { name })
  },

  async getNoteTags(noteId) {
    return await invoke('db:getNoteTags', { noteId })
  },

  async attachToNote(noteId, tagId) {
    return await invoke('db:attachTagToNote', { noteId, tagId })
  },

  async remove(id) {
    return await invoke('db:deleteTag', id)
  }
}

const sync = {
  /**
   * 获取同步状态统计
   * @returns {Promise<Object>}
   */
  async getStats() {
    return await invoke('db:getStats')
  },

  /**
   * 创建本地 ID ↔ 云端 doc_guid 映射记录
   * @param {number} localId
   * @param {string} cloudGuid
   * @param {string} source
   * @returns {Promise<Object|null>}
   */
  async createGuidMapping(localId, cloudGuid, source = 'wiznote') {
    return await invoke('db:createGuidMapping', { localId, serverGuid: cloudGuid, service: source })
  },

  /**
   * 记录删除待同步日志
   * @param {Object} payload
   * @param {number} payload.noteId
   * @param {string} payload.docGuid
   * @param {string} payload.kbGuid
   * @returns {Promise<boolean>}
   */
  async logPendingDelete({ noteId, docGuid, kbGuid }) {
    return await invoke('db:logPendingDelete', {
      noteId,
      docGuid,
      kbGuid
    })
  },

  async getPendingDeleteLogs() {
    return await invoke('db:getPendingDeleteLogs')
  },

  async markSyncLogSynced(id) {
    return await invoke('db:markSyncLogSynced', { id })
  },

  async cleanupSyncedDeleteLogs() {
    return await invoke('db:cleanupSyncedDeleteLogs')
  },

  /**
   * 重置 SQLite 数据库（清空所有本地笔记，重置同步状态）
   * @returns {Promise<boolean>}
   */
  async resetDatabase() {
    return await invoke('db:resetDatabase')
  }
}

const categories = {
  async getAll(options = {}) {
    return await invoke('db:getCategories', options)
  },

  async create(params) {
    return await invoke('db:createCategory', params)
  },

  async remove(category) {
    return await invoke('db:deleteCategory', { category })
  },

  async ensureOfflineRoot() {
    return await invoke('db:ensureOfflineRoot')
  },

  async syncToCloud(params) {
    return await invoke('db:syncCategoryToCloud', params)
  },

  async migrateOffline(currentKbGuid) {
    return await invoke('db:migrateOfflineCategories', currentKbGuid)
  }
}

const appState = {
  async get(key) {
    return await invoke('db:getAppState', key)
  },

  async getMany(keys = []) {
    return await invoke('db:getAppStates', keys)
  },

  async set(key, value) {
    return await invoke('db:setAppState', { key, value })
  },

  async remove(key) {
    return await invoke('db:removeAppState', key)
  }
}

const aiModels = {
  async getAll() {
    return await invoke('db:getAiModelConfigs')
  },

  async getById(id) {
    return await invoke('db:getAiModelConfig', id)
  },

  async save(config) {
    return await invoke('db:saveAiModelConfig', config)
  },

  async remove(id) {
    return await invoke('db:deleteAiModelConfig', id)
  },

  async setDefault(id) {
    return await invoke('db:setDefaultAiModelConfig', id)
  }
}

const runes = {
  async getAll() {
    return await invoke('db:getRunes')
  },

  async save(rune) {
    return await invoke('db:saveRune', rune)
  },

  async saveMany(items) {
    return await invoke('db:saveRunes', items)
  },

  async remove(id) {
    return await invoke('db:deleteRune', id)
  }
}

const echoes = {
  async getAll() {
    return await invoke('db:getEchoes')
  },

  async save(echo) {
    return await invoke('db:saveEcho', echo)
  },

  async saveMany(items) {
    return await invoke('db:saveEchoes', items)
  },

  async remove(id) {
    return await invoke('db:deleteEcho', id)
  }
}

const DatabaseClient = {
  notes,
  tags,
  sync,
  categories,
  appState,
  aiModels,
  runes,
  echoes
}

export default DatabaseClient
