import types from 'src/store/client/types'
import { Dark, Notify } from 'quasar'
import api from 'src/utils/api'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'
import helper from 'src/utils/helper'
import { i18n } from 'boot/i18n'
import _ from 'lodash'
import { importImage, uploadImages } from 'src/ApiInvoker'
import DatabaseClient from 'src/utils/DatabaseClient'
import { BUILTIN_ECHO_CARDS, isBuiltinEcho } from 'components/ui/editor/echo/builtinEchoes'

const applyQuickInsertColumns = (value) => {
  if (typeof document === 'undefined') return
  const numericValue = Number(value)
  const normalizedValue = Number.isFinite(numericValue)
    ? Math.min(8, Math.max(4, numericValue))
    : 6
  document.documentElement.style.setProperty('--quick-insert-columns', String(normalizedValue))
}

export default {
  initClientStore ({ commit, state }) {
    const localStore = ClientFileStorage.getItemsFromStore(state)
    const hadPaneLayoutMode = Object.prototype.hasOwnProperty.call(localStore, 'paneLayoutMode')
    commit(types.INIT, localStore)
    if (!hadPaneLayoutMode && state.noteListVisible === false) {
      const patch = { paneLayoutMode: 2, categoryTreeVisible: false }
      commit(types.UPDATE_STATES, patch)
      commit(types.SAVE_ITEMS_TO_LOCAL_STORE_SYNC, patch)
    }
    applyQuickInsertColumns(state.quickInsertColumns)
    Dark.set(state.darkMode)
  },
  toggleChanged ({ commit }, { key, value }) {
    commit(types.TOGGLE_CHANGED, { key, value })
    commit(types.SAVE_TO_LOCAL_STORE_SYNC, [key, value])
    if (key === 'quickInsertColumns') {
      applyQuickInsertColumns(value)
    }
  },
  updateStateAndStore ({ commit }, options) {
    commit(types.UPDATE_STATES, options)
    commit(types.SAVE_ITEMS_TO_LOCAL_STORE_SYNC, options)
    if (Object.prototype.hasOwnProperty.call(options, 'quickInsertColumns')) {
      applyQuickInsertColumns(options.quickInsertColumns)
    }
  },
  cyclePaneLayout ({ state, dispatch }) {
    const next = (state.paneLayoutMode + 1) % 3
    dispatch('updateStateAndStore', {
      paneLayoutMode: next,
      noteListVisible: next !== 2,
      categoryTreeVisible: next === 0
    })
  },
  expandFullPaneLayout ({ dispatch }) {
    dispatch('updateStateAndStore', {
      paneLayoutMode: 0,
      noteListVisible: true,
      categoryTreeVisible: true
    })
  },
  async sendToFlomo ({ state, rootState }, docGuid) {
    const { flomoApiUrl } = state
    if (helper.isNullOrEmpty(flomoApiUrl)) {
      Notify.create({
        message: i18n.t('flomoApiUrlIsEmpty'),
        color: 'red-10',
        caption: i18n.t('requestError')
      })
      return
    }
    const { kbGuid } = rootState.server
    const note = await this.dispatch('server/getContent', {
      kbGuid,
      docGuid
    })
    const isHtml = !_.endsWith(note.info.title, '.md')
    let content
    const { html, resources } = note
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
    await api.ThirdPartApi.sendToFlomo(content, flomoApiUrl)
    Notify.create({
      message: i18n.t('sendToFlomoSuccessfully'),
      color: 'green-10',
      icon: 'check'
    })
  },
  async importImageFromLocal () {
    return importImage()
  },
  async uploadImages ({ state }, imagePaths) {
    return uploadImages(imagePaths)
  },
  setRightClickNoteItem ({ commit }, docGuid) {
    commit(types.TOGGLE_CHANGED, { key: 'rightClickNoteItem', value: docGuid })
  },
  setRightClickCategoryItem ({ commit }, categoryPath) {
    commit(types.TOGGLE_CHANGED, { key: 'rightClickCategoryItem', value: categoryPath })
  },
  async loadRunes ({ commit }) {
    try {
      const runes = await DatabaseClient.runes.getAll()
      if (Array.isArray(runes)) {
        commit(types.TOGGLE_CHANGED, { key: 'runeCards', value: runes })
      }
    } catch (err) {
      console.error('[Runes] loadRunes error:', err)
    }
  },
  async loadEchoes ({ commit, state }) {
    try {
      const storedFromDb = await DatabaseClient.echoes.getAll()
      const dbCards = Array.isArray(storedFromDb) ? storedFromDb : []

      // === 内置回响以代码版 BUILTIN_ECHO_CARDS 为权威 ===
      // 1) 先用 DB 中已存在的 builtin 行（可能是 sync seed 写入的）作为基准
      // 2) 用代码版 BUILTIN_ECHO_CARDS 补全缺失项（保证 16 个总在场）
      // 3) 附加非 builtin 的 dbCards
      // 这样既能看到"DB 工具里查到的内置回响"也能在代码升级时自动补全新内置
      // DB schema 没有 isBuiltin 列；按 id 前缀约定补标记，供 UI 区分显示
      const builtinIds = new Set(BUILTIN_ECHO_CARDS.map(echo => echo.id))
      const dbBuiltins = dbCards
        .filter(echo => builtinIds.has(echo.id))
        .map(echo => ({ ...echo, isBuiltin: true }))
      const missingBuiltins = BUILTIN_ECHO_CARDS
        .filter(template => !dbBuiltins.some(echo => echo.id === template.id))
        .map(template => ({ ...template, isBuiltin: true }))
      const builtinEchoes = [
        ...dbBuiltins,
        ...missingBuiltins
      ]
      const nonBuiltinDbCards = dbCards.filter(echo => !builtinIds.has(echo.id))

      // 保留 store 中已有 builtin 的覆盖（向后兼容旧逻辑中可能存在的"用户编辑过的内置拷贝"）。
      // 关键：isBuiltin 永远是 true，store override 不能把它覆盖成 false（安全护栏）。
      const stateBuiltins = (state.echoCards || []).filter(echo => isBuiltinEcho(echo))
      const mergedBuiltins = builtinEchoes.map(builtinEcho => {
        const override = stateBuiltins.find(s => s && s.id === builtinEcho.id)
        return override ? { ...builtinEcho, ...override, isBuiltin: true } : builtinEcho
      })

      const mergedEchoes = [
        ...mergedBuiltins,
        ...nonBuiltinDbCards
      ]

      commit(types.TOGGLE_CHANGED, { key: 'echoCards', value: mergedEchoes })
    } catch (err) {
      console.error('[Echoes] loadEchoes error:', err)
    }
  },
  async saveRune (_, rune) {
    return await DatabaseClient.runes.save(rune)
  },
  async saveEcho (_, echo) {
    return await DatabaseClient.echoes.save(echo)
  },
  async deleteRune (_, id) {
    return await DatabaseClient.runes.remove(id)
  },
  async deleteEcho (_, id) {
    return await DatabaseClient.echoes.remove(id)
  },
  async saveRunes (_, runes) {
    return await DatabaseClient.runes.saveMany(runes)
  },
  async saveEchoes (_, echoes) {
    // 内置回响不入库，避免被持久化为普通卡片导致下次丢失 isBuiltin 标记
    const persistable = (Array.isArray(echoes) ? echoes : []).filter(echo => !isBuiltinEcho(echo))
    if (persistable.length === 0) return persistable
    return await DatabaseClient.echoes.saveMany(persistable)
  },
  /**
   * 执行同步（调用 SyncService）
   */
  async sync ({ commit }) {
    const SyncService = (await import('src/services/SyncService')).default

    commit(types.UPDATE_SYNC_STATUS, { isSyncing: true })

    try {
      const result = await SyncService.backupToCloud()

      const stats = await DatabaseClient.sync.getStats()
      commit(types.UPDATE_SYNC_STATUS, {
        isSyncing: false,
        lastSyncTime: Date.now(),
        ...stats
      })

      return result
    } catch (error) {
      console.error('[sync] Sync failed:', error)
      commit(types.UPDATE_SYNC_STATUS, { isSyncing: false })
      throw error
    }
  },
  async refreshSyncStatus ({ commit }) {
    const stats = await DatabaseClient.sync.getStats()
    commit(types.UPDATE_SYNC_STATUS, { ...stats })
  }
}
