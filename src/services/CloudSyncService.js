/**
 * CloudSyncService - 云同步服务
 * 挂载在 Settings 弹框的云同步面板中
 * 永远本地优先：同步只是将本地数据推送到云端，拉取只在本地不存在时发生
 */

import SyncService from './SyncService'
import DatabaseClient from '../utils/DatabaseClient'
import SessionStorageService from './SessionStorageService'

class CloudSyncService {
  constructor() {
    this._status = {
      isSyncing: false,
      lastSyncTime: null,
      total: 0,
      synced: 0,
      pending: 0,
      conflict: 0,
      account: null,
      error: null
    }
    this._listeners = []
  }

  get status() {
    return { ...this._status }
  }

  get isLoggedIn() {
    return SessionStorageService.isLoggedIn()
  }

  get accountInfo() {
    return SessionStorageService.getAccountInfo()
  }

  addListener(callback) {
    this._listeners.push(callback)
  }

  removeListener(callback) {
    this._listeners = this._listeners.filter(cb => cb !== callback)
  }

  _notify(event) {
    this._listeners.forEach(cb => {
      try { cb(event) } catch (e) { console.error('[CloudSyncService] Listener error:', e) }
    })
  }

  async _refreshStats() {
    try {
      const stats = await DatabaseClient.sync.getStats()
      this._status.total = stats.total || 0
      this._status.synced = stats.synced || 0
      this._status.pending = stats.pending || 0
      this._status.conflict = stats.conflict || 0
    } catch (e) {
      console.warn('[CloudSyncService] Failed to refresh stats:', e)
    }
  }

  async _refreshAccount() {
    this._status.account = this.accountInfo
  }

  /**
   * 完整同步：pull 新笔记 + push dirty 笔记
   */
  async sync() {
    if (this._status.isSyncing) {
      return { success: false, reason: 'already_syncing' }
    }
    if (!this.isLoggedIn) {
      return { success: false, reason: 'not_logged_in' }
    }

    this._status.isSyncing = true
    this._status.error = null
    this._notify({ type: 'sync_start' })

    try {
      const result = await SyncService.sync()
      this._status.lastSyncTime = Date.now()
      await this._refreshStats()
      await this._refreshAccount()

      this._notify({ type: 'sync_complete', result })
      return result
    } catch (error) {
      this._status.error = error.message
      this._notify({ type: 'sync_error', error: error.message })
      return { success: false, error: error.message }
    } finally {
      this._status.isSyncing = false
    }
  }

  /**
   * 仅拉取：只从云端下载本地不存在的笔记，不推送
   */
  async pullOnly() {
    if (!this.isLoggedIn) {
      return { success: false, reason: 'not_logged_in' }
    }
    this._status.isSyncing = true
    this._status.error = null
    this._notify({ type: 'sync_start' })

    try {
      const result = await SyncService.pullFromCloud()
      this._status.lastSyncTime = Date.now()
      await this._refreshStats()
      this._notify({ type: 'sync_complete', result })
      return { success: true, pulled: result.count, skipped: result.skipped }
    } catch (error) {
      this._status.error = error.message
      this._notify({ type: 'sync_error', error: error.message })
      return { success: false, error: error.message }
    } finally {
      this._status.isSyncing = false
    }
  }

  /**
   * 仅推送：只把本地 dirty 笔记推送到云端，不拉取
   */
  async pushOnly() {
    if (!this.isLoggedIn) {
      return { success: false, reason: 'not_logged_in' }
    }
    this._status.isSyncing = true
    this._status.error = null
    this._notify({ type: 'sync_start' })

    try {
      const result = await SyncService.pushToCloud()
      this._status.lastSyncTime = Date.now()
      await this._refreshStats()
      this._notify({ type: 'sync_complete', result })
      return result
    } catch (error) {
      this._status.error = error.message
      this._notify({ type: 'sync_error', error: error.message })
      return { success: false, error: error.message }
    } finally {
      this._status.isSyncing = false
    }
  }

  /**
   * 初始化：加载同步状态
   */
  async init() {
    await this._refreshStats()
    await this._refreshAccount()
  }

  /**
   * 格式化最后同步时间
   */
  formatLastSyncTime() {
    if (!this._status.lastSyncTime) return null
    const d = new Date(this._status.lastSyncTime)
    return d.toLocaleString()
  }
}

export default new CloudSyncService()
