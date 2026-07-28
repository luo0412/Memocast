import types from 'src/store/client/types'
import { Dark, Notify } from 'quasar'
import api from 'src/utils/api'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'
import helper from 'src/utils/helper'
import { i18n } from 'boot/i18n'
import _ from 'lodash'
import { importImage, uploadImages } from 'src/ApiInvoker'
import DatabaseClient from 'src/utils/DatabaseClient'
import { BUILTIN_ECHO_CARDS } from 'components/echo/echoCore'

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
  async loadNoteTemplates ({ commit }) {
    try {
      const templates = await DatabaseClient.noteTemplates.getAll()
      if (Array.isArray(templates)) {
        // 读取路径防御：丢弃缺 id/name 的脏数据
        const sanitized = templates
          .filter(t => t && t.id && String(t.name || '').trim())
          .map(t => ({
            id: String(t.id),
            name: String(t.name || ''),
            desc: String(t.desc || ''),
            content: String(t.content || ''),
            is_builtin: t.is_builtin ? 1 : 0,
            sort_order: Number(t.sort_order) || 0,
            created_at: Number(t.created_at) || 0,
            updated_at: Number(t.updated_at) || 0
          }))
        commit(types.TOGGLE_CHANGED, { key: 'noteTemplates', value: sanitized })
      }
    } catch (err) {
      console.error('[NoteTemplates] loadNoteTemplates error:', err)
    }
  },
  async loadEchoes ({ commit }) {
    try {
      const storedFromDb = await DatabaseClient.echoes.getAll()
      const dbCards = Array.isArray(storedFromDb) ? storedFromDb : []

      // === 内置回响装配策略（v2026-07 调整后） ===
      // DB 中存的 builtin 行（来自本地 dev 模式编辑内置回响）优先覆盖代码版默认模板，
      // DB 没有的 builtin 用 BUILTIN_ECHO_CARDS 兜底，保证 16 个总在场。
      // DB schema 没有 isBuiltin 列；按 id 前缀约定补标记，仅用于 UI 区分显示。
      // 生产 (isProd) 也允许读取 DB 里的 builtin 行（同样的覆盖语义），但
      // saveEcho / saveEchoes 在 isProd 时已经过滤掉 builtin 写入，
      // 所以生产时 DB 里的 builtin 行通常为空，本策略实际上不会改变默认模板。
      const builtinIds = new Set(BUILTIN_ECHO_CARDS.map(echo => echo.id))
      const dbBuiltins = dbCards.filter(echo => builtinIds.has(echo.id))
      const dbBuiltinsById = new Map(dbBuiltins.map(echo => [echo.id, echo]))
      const builtinEchoes = BUILTIN_ECHO_CARDS.map(template => {
        const override = dbBuiltinsById.get(template.id)
        if (!override) return { ...template, isBuiltin: true }
        // DB 行覆盖代码版默认模板；保留代码版里 DB 没存的元数据
        return { ...template, ...override, id: template.id, isBuiltin: true }
      })
      const nonBuiltinDbCards = dbCards.filter(echo => !builtinIds.has(echo.id))

      const mergedEchoes = [
        ...builtinEchoes,
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
  async saveNoteTemplate (_, template) {
    return await DatabaseClient.noteTemplates.save(template)
  },
  async saveEcho (_, echo) {
    // 内置回响在本地 dev 模式 (!isProd) 下允许入库（覆盖代码版默认模板），
    // 生产模式 (isProd) 仍只写非 builtin 行，避免污染云端默认模板。
    // 注：Quasar 用 webpack DefinePlugin 注入 process.env.PROD，dev 下是字符串 'true'，prod 下是 false，
    // 所以用 Boolean(...) 而非 === true，与项目其它 isProd computed 风格一致。
    if (echo && echo.isBuiltin && Boolean(process.env.PROD)) {
      return { success: true, data: echo, skipped: 'builtin-in-prod' }
    }
    return await DatabaseClient.echoes.save(echo)
  },
  async deleteRune (_, id) {
    return await DatabaseClient.runes.remove(id)
  },
  async deleteNoteTemplate (_, id) {
    return await DatabaseClient.noteTemplates.remove(id)
  },
  async deleteEcho (_, id) {
    return await DatabaseClient.echoes.remove(id)
  },
  async saveRunes (_, runes) {
    return await DatabaseClient.runes.saveMany(runes)
  },
  async saveNoteTemplates (_, templates) {
    return await DatabaseClient.noteTemplates.saveMany(templates)
  },
  async saveEchoes (_, echoes) {
    // 内置回响在本地 dev 模式 (!isProd) 下允许入库（覆盖代码版默认模板），
    // 生产模式 (isProd) 过滤掉 isBuiltin 行，避免污染云端默认模板。
    const isProd = Boolean(process.env.PROD)
    const persistable = (Array.isArray(echoes) ? echoes : [])
      .filter(echo => !(echo && echo.isBuiltin && isProd))
    if (persistable.length === 0) return []
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
