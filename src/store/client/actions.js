import types from 'src/store/client/types'
import { Dark, Notify } from 'quasar'
import api from 'src/utils/api'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'
import helper from 'src/utils/helper'
import { i18n } from 'boot/i18n'
import _ from 'lodash'
import { importImage, uploadImages } from 'src/ApiInvoker'
import DatabaseClient from 'src/utils/DatabaseClient'

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
    Dark.set(state.darkMode)
  },
  toggleChanged ({ commit }, { key, value }) {
    commit(types.TOGGLE_CHANGED, { key, value })
    commit(types.SAVE_TO_LOCAL_STORE_SYNC, [key, value])
  },
  updateStateAndStore ({ commit }, options) {
    commit(types.UPDATE_STATES, options)
    commit(types.SAVE_ITEMS_TO_LOCAL_STORE_SYNC, options)
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
      if (runes && runes.length > 0) {
        commit(types.TOGGLE_CHANGED, { key: 'runeCards', value: runes })
      }
    } catch (err) {
      console.error('[Runes] loadRunes error:', err)
    }
  },
  async saveRune (_, rune) {
    return await DatabaseClient.runes.save(rune)
  },
  async deleteRune (_, id) {
    return await DatabaseClient.runes.remove(id)
  },
  async saveRunes (_, runes) {
    return await DatabaseClient.runes.saveMany(runes)
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
