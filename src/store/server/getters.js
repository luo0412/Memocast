import api from 'src/utils/api'
import _ from 'lodash'
import helper from 'src/utils/helper'
import ServerFileStorage from 'src/utils/storage/ServerFileStorage'
import { OFFLINE_ROOT_CATEGORY_KEY } from 'src/store/server/actions'

export default {
  avatarUrl: ({ userGuid }) => {
    return userGuid ? `${api.AccountServerApi.getBaseUrl()}/as/user/avatar/${userGuid}` : null
  },
  imageUrl: ({
    kbGuid,
    currentNote: { info: { docGuid } }
  }) => (url, imageUploadService) => {
    let img = ''
    switch (imageUploadService) {
      case 'wizOfficialImageUploadService':
        img = url.url
        // img = docGuid ? `${api.KnowledgeBaseApi.getBaseUrl()}/ks/note/view/${kbGuid}/${docGuid}/${url.url}` : url
        break
      case 'smmsImageUploadService':
      case 'customWebUploadService':
        img = url
        break
      default:
        break
    }
    return img
  },
  currentNotes: ({ currentNotes }, getters, rootState) => {
    const _currentNotes = _.cloneDeep(currentNotes)
    if (_.isArray(_currentNotes)) {
      const filteredNotes = _currentNotes.map((note) => {
        if (_.endsWith(note.title, '.md')) {
          note.abstractText = helper.removeMarkdownTag(note.abstractText)
        }
        return note
      }).filter(note => {
        if (rootState.client.markdownOnly) {
          return _.endsWith(note.title, '.md')
        }
        return true
      })
      if (rootState.client.noteOrderType === 'orderByNoteTitle') {
        return filteredNotes.sort((n1, n2) => {
          if (n1.title === n2.title) return 0
          return n1.title > n2.title ? 1 : -1
        })
      }
      if (rootState.client.noteOrderType === 'orderByCreatedTime') {
        return filteredNotes.sort((n1, n2) => {
          const t1 = n1.dataCreated || 0
          const t2 = n2.dataCreated || 0
          return t2 - t1
        })
      }
      return filteredNotes
    }
    return []
  },
  currentNote: ({ currentNote }) => {
    // ✅ 防御：如果 currentNote 为空/null/undefined
    if (helper.isNullOrEmpty(currentNote) || Object.keys(currentNote).length === 0) {
      console.log('[currentNote getter] EMPTY: currentNote is', currentNote)
      return ''  // 返回空字符串
    }

    console.log(`[currentNote getter] ⚡ FIRED! keys: ${Object.keys(currentNote)}, _isRawMarkdown: ${currentNote._isRawMarkdown}, title: ${currentNote.info?.title}, timestamp: ${currentNote._loadTimestamp}`)

    // 本地 SQLite 来的原始 markdown，直接返回不做任何处理
    if (currentNote._isRawMarkdown) {
      const raw = currentNote.html || ''
      
      // 防御：如果 html 是整个 API 响应对象而不是 markdown，返回空字符串
      if (typeof raw === 'object' || (typeof raw === 'string' && raw.trim().startsWith('{'))) {
        console.warn('[currentNote getter] REJECTED: malformed content')
        return ''
      }
      
      console.log(`[currentNote getter] ✅ RETURNING _isRawMarkdown, len: ${raw.length}, preview: ${JSON.stringify(raw.substring(0, 100))}`)
      
      // ✅ 关键改进：即使内容为空字符串，也确保触发 watcher
      // 通过拼接时间戳确保每次都是新值（Vue 会检测到变化）
      if (currentNote._loadTimestamp) {
        // 返回特殊格式：内容 + 分隔符 + 时间戳
        // Muya watcher 会解析这个格式并提取真实内容
        return { 
          __markdown: raw, 
          __timestamp: currentNote._loadTimestamp,
          __docGuid: currentNote.info?.docGuid,
          isEmpty: !raw || raw.length === 0
        }
      }
      
      return raw
    }

    if (helper.isNullOrEmpty(currentNote.info?.title)) {
      return ''
    }
    const isHtml = !_.endsWith(currentNote.info.title, '.md')

    const {
      html,
      info: {
        docGuid,
        kbGuid
      },
      resources
    } = currentNote
    let result = ''
    if (isHtml) {
      result = helper.convertHtml2Markdown(currentNote.html, kbGuid, docGuid, resources)
    } else {
      result = helper.extractMarkdownFromMDNote(html, kbGuid, docGuid, resources)
    }

    return helper.isNullOrEmpty(result) ? `# ${currentNote.info.title}` : result
  },
  currentNoteInfo: ({ currentNote }) => {
    return currentNote.info
  },
  currentNoteResources: ({ currentNote }) => {
    const { resources } = currentNote
    return resources
  },
  currentNoteResourceUrl: ({ currentNote }) => {
    const {
      info: {
        docGuid,
        kbGuid
      }
    } = currentNote
    return `${api.KnowledgeBaseApi.getBaseUrl()}/${kbGuid}/${docGuid}`
  },
  categories: ({ categories, categoriesPos, offlineCategories, isLogin }) => {
    if (!isLogin) {
      return offlineCategories.length > 0 ? offlineCategories : []
    }
    return helper.generateCategoryNodeTree(categories, categoriesPos)
  },
  tags: ({ tags }) => {
    return helper.generateTagNodeTree(tags)
  },
  activeNote: ({ currentNote }) => ({ docGuid }) => {
    return currentNote && currentNote.info && currentNote.info.docGuid === docGuid
  },
  uploadImageUrl: ({
    uploadImageUrl,
    kbGuid,
    currentNote
  }) => {
    if (!helper.isNullOrEmpty(uploadImageUrl) || helper.isNullOrEmpty(currentNote.info)) return uploadImageUrl
    const { info: { docGuid } } = currentNote
    return `${api.KnowledgeBaseApi.getBaseUrl()}/ks/resource/upload/${kbGuid}/${docGuid}`
  },
  wizNoteToken: () => {
    return ServerFileStorage.getValueFromLocalStorage('token')
  },
  tagsOfCurrentNote: ({
    currentNote,
    tags
  }) => {
    if (helper.isNullOrEmpty(currentNote?.info?.tags)) return []
    const tagGuids = currentNote.info.tags.split('*')
    return tags.filter(t => tagGuids.includes(t.tagGuid))
  },
  /**
   * Offline-only notes list (used when not logged in).
   * Returns raw notes from SQLite with dirty flag,
   * formatted to match the shape that NoteItem.vue expects.
   */
  offlineNotesList: ({ offlineNotes, offlineCurrentCategory }) => {
    if (!offlineNotes || !offlineNotes.length) return []
    const category = offlineCurrentCategory || ''
    let filtered = offlineNotes
    // offlineCurrentCategory may be a category key (e.g., 'offline_my_notes') or a category path (e.g., '/My Notes/')
    // When it's the offline root key, show all notes
    if (category && category !== OFFLINE_ROOT_CATEGORY_KEY) {
      filtered = offlineNotes.filter(n => n.category === category)
    }
    return filtered.map(note => ({
      docGuid: note.doc_guid,
      title: note.title,
      abstractText: note.content ? note.content.substring(0, 200) : '',
      category: note.category || '/',
      dataCreated: note.data_created,
      dataModified: note.data_modified || note.local_modified || note.data_created,
      dirty: note.dirty,
      // raw id for offline note lookup
      _localId: note.id
    }))
  }
}
