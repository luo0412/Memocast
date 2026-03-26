import types from 'src/store/client/types'
import { Dark, Notify } from 'quasar'
import api from 'src/utils/api'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'
import helper from 'src/utils/helper'
import { i18n } from 'boot/i18n'
import _ from 'lodash'
import { importImage, uploadImages } from 'src/ApiInvoker'

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
  }
}
