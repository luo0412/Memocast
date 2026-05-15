/**
 * DatabaseClient - 渲染进程数据库客户端
 * 通过 IPC 与主进程通信，实现数据库操作
 */

import { ipcRenderer } from 'electron'

const DatabaseClient = {
  /**
   * 获取所有笔记
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>}
   */
  async getNotes(options = {}) {
    return await ipcRenderer.invoke('db:getNotes', options)
  },

  /**
   * 获取单个笔记
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getNote(id) {
    return await ipcRenderer.invoke('db:getNote', id)
  },

  /**
   * 根据 doc_guid 获取单个笔记
   * @param {string} docGuid
   * @returns {Promise<Object|null>}
   */
  async getNoteByDocGuid(docGuid) {
    return await ipcRenderer.invoke('db:getNoteByDocGuid', docGuid)
  },

  /**
   * 根据 doc_guid 获取笔记（按 local_modified 时间戳取最新版本）
   * @param {string} docGuid
   * @returns {Promise<Object|null>}
   */
  async getNoteByDocGuidWithPriority(docGuid) {
    return await ipcRenderer.invoke('db:getNoteByDocGuidWithPriority', docGuid)
  },

  /**
   * 获取所有笔记的基本信息（用于去重检查）
   * @returns {Promise<Array>} 返回 [{title, category, kb_guid}, ...]
   */
  async getAllNotesBasic() {
    return await ipcRenderer.invoke('db:getAllNotesBasic')
  },

  /**
   * 创建笔记
   * @param {Object} note
   * @returns {Promise<Object|null>}
   */
  async createNote(note) {
    return await ipcRenderer.invoke('db:createNote', note)
  },

  /**
   * 更新笔记
   * @param {number} id
   * @param {Object} updates
   * @returns {Promise<Object|null>}
   */
  async updateNote(id, updates) {
    return await ipcRenderer.invoke('db:updateNote', { id, updates })
  },

  /**
   * 删除笔记
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async deleteNote(id) {
    return await ipcRenderer.invoke('db:deleteNote', id)
  },

  /**
   * 获取冲突笔记
   * @returns {Promise<Array>}
   */
  async getConflictNotes() {
    return await ipcRenderer.invoke('db:getConflictNotes')
  },

  /**
   * 获取同步状态统计
   * @returns {Promise<Object>}
   */
  async getStats() {
    return await ipcRenderer.invoke('db:getStats')
  },

  /**
   * 获取所有标签
   * @returns {Promise<Array>}
   */
  async getTags() {
    return await ipcRenderer.invoke('db:getTags')
  },

  /**
   * 创建标签
   * @param {Object} tag
   * @returns {Promise<Object|null>}
   */
  async createTag(tag) {
    return await ipcRenderer.invoke('db:createTag', tag)
  },

  /**
   * 创建本地 ID ↔ 云端 doc_guid 映射记录
   * @param {number} localId - 本地笔记 ID
   * @param {string} cloudGuid - 云端 doc_guid
   * @param {string} source - 来源：'wiznote'
   * @returns {Promise<Object|null>}
   */
  async createGuidMapping(localId, cloudGuid, source = 'wiznote') {
    // 主进程 handler 参数名: { localId, serverGuid, service }
    return await ipcRenderer.invoke('db:createGuidMapping', { localId, serverGuid: cloudGuid, service: source })
  },

  /**
   * 重置 SQLite 数据库（清空所有本地笔记，重置同步状态）
   * @returns {Promise<boolean>}
   */
  async resetDatabase() {
    return await ipcRenderer.invoke('db:resetDatabase')
  }
}

export default DatabaseClient
