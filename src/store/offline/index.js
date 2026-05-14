/**
 * Offline Store - 离线数据状态管理
 * 纯 dirty 架构：只跟踪待同步状态，不处理冲突
 */

export default {
  namespaced: true,

  state: () => ({
    notes: [],
    currentNote: null,
    tags: [],
    categories: [],
    syncStatus: {
      isSyncing: false,
      lastSyncTime: null,
      total: 0,
      synced: 0,
      pending: 0
    },
    isInitialized: false
  }),

  getters: {
    allNotes: state => state.notes,
    currentNote: state => state.currentNote,
    noteCount: state => state.notes.length,
    allTags: state => state.tags,
    allCategories: state => state.categories,
    syncStatus: state => state.syncStatus,
    isInitialized: state => state.isInitialized,

    notesByCategory: state => category => {
      if (!category || category === '/') return state.notes
      return state.notes.filter(note => note.category === category)
    },

    notesByTag: state => tagName => {
      return state.notes.filter(note => {
        const tags = note.tags ? note.tags.split(',') : []
        return tags.includes(tagName)
      })
    },

    searchNotes: state => query => {
      if (!query) return state.notes
      const lowerQuery = query.toLowerCase()
      return state.notes.filter(note =>
        note.title.toLowerCase().includes(lowerQuery) ||
        note.content.toLowerCase().includes(lowerQuery)
      )
    },

    pendingCount: state => state.syncStatus.pending
  },

  mutations: {
    SET_NOTES(state, notes) { state.notes = notes },
    
    ADD_NOTE(state, note) { state.notes.unshift(note) },
    
    UPDATE_NOTE(state, updatedNote) {
      const index = state.notes.findIndex(n => n.id === updatedNote.id)
      if (index !== -1) state.notes.splice(index, 1, updatedNote)
      if (state.currentNote && state.currentNote.id === updatedNote.id) {
        state.currentNote = updatedNote
      }
    },
    
    DELETE_NOTE(state, noteId) {
      state.notes = state.notes.filter(n => n.id !== noteId)
      if (state.currentNote && state.currentNote.id === noteId) state.currentNote = null
    },
    
    SET_CURRENT_NOTE(state, note) { state.currentNote = note },
    CLEAR_CURRENT_NOTE(state) { state.currentNote = null },
    
    SET_TAGS(state, tags) { state.tags = tags },
    ADD_TAG(state, tag) { state.tags.push(tag) },
    REMOVE_TAG(state, tagId) { state.tags = state.tags.filter(t => t.id !== tagId) },
    
    SET_CATEGORIES(state, categories) { state.categories = categories },
    
    UPDATE_SYNC_STATUS(state, status) { state.syncStatus = { ...state.syncStatus, ...status } },
    
    SET_INITIALIZED(state, value) { state.isInitialized = value }
  },

  actions: {
    async initOfflineStore({ commit }) {
      const DatabaseClient = (await import('../../utils/DatabaseClient')).default

      try {
        const notes = await DatabaseClient.getNotes()
        const tags = await DatabaseClient.getTags()
        const stats = await DatabaseClient.getStats()

        commit('SET_NOTES', notes)
        commit('SET_TAGS', tags)
        commit('UPDATE_SYNC_STATUS', {
          total: stats.total,
          synced: stats.synced,
          pending: stats.pending
        })
        commit('SET_INITIALIZED', true)

        return true
      } catch (error) {
        console.error('[offline] initOfflineStore error:', error)
        return false
      }
    },

    async init({ commit }) {
      return await this.initOfflineStore({ commit })
    },

    async createNote({ commit }, { note }) {
      const DatabaseClient = (await import('../../utils/DatabaseClient')).default
      
      if (note) {
        commit('ADD_NOTE', note)
        const stats = await DatabaseClient.getStats()
        commit('UPDATE_SYNC_STATUS', { pending: stats.pending })
      }
      return note
    },

    async updateNote({ commit }, { id, note: noteData, updates } = {}) {
      const DatabaseClient = (await import('../../utils/DatabaseClient')).default
      
      let note = null
      if (noteData && noteData.id) {
        note = noteData
      } else if (updates) {
        note = await DatabaseClient.updateNote(id, updates)
      }
      
      if (note) {
        commit('UPDATE_NOTE', note)
        const stats = await DatabaseClient.getStats()
        commit('UPDATE_SYNC_STATUS', { pending: stats.pending })
      }
      return note
    },

    async deleteNote({ commit }, id) {
      const DatabaseClient = (await import('../../utils/DatabaseClient')).default
      
      await DatabaseClient.deleteNote(id)
      commit('DELETE_NOTE', id)
      
      const stats = await DatabaseClient.getStats()
      commit('UPDATE_SYNC_STATUS', { total: stats.total, pending: stats.pending })
    },

    setCurrentNote({ commit }, note) {
      commit('SET_CURRENT_NOTE', note)
    },

    clearCurrentNote({ commit }) {
      commit('CLEAR_CURRENT_NOTE')
    },

    async refresh({ commit }) {
      const DatabaseClient = (await import('../../utils/DatabaseClient')).default
      const notes = await DatabaseClient.getNotes()
      const tags = await DatabaseClient.getTags()
      const stats = await DatabaseClient.getStats()

      commit('SET_NOTES', notes)
      commit('SET_TAGS', tags)
      commit('UPDATE_SYNC_STATUS', { ...stats })

      return true
    },

    /**
     * 执行同步（调用 SyncService）
     * - 先 pull 新文件到本地
     * - 再 push dirty 文件到云端
     */
    async sync({ commit }, options = {}) {
      const SyncService = (await import('../../services/SyncService')).default
      const DatabaseClient = (await import('../../utils/DatabaseClient')).default

      // 标记同步开始
      commit('UPDATE_SYNC_STATUS', { isSyncing: true })

      try {
        const result = await SyncService.sync(options)

        // 刷新统计数据
        const stats = await DatabaseClient.getStats()
        commit('UPDATE_SYNC_STATUS', {
          isSyncing: false,
          lastSyncTime: Date.now(),
          ...stats
        })

        return result
      } catch (error) {
        console.error('[offline/sync] Sync failed:', error)
        commit('UPDATE_SYNC_STATUS', { isSyncing: false })
        throw error
      }
    }
  }
}
