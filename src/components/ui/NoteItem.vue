/** * @Description: * @Author: TankNee * @Date: 9/8/2020 1:24 PM **/
<template>
  <q-card
    flat
    :class='`note-card${darkTag} bg-transparent`'
    @click='noteItemClickHandler'
  >
    <div :class='`note-item-title${darkTag} ${denseTag}`'>
      <q-icon :name="fileIcon" class="note-file-icon" size="16px" />
      <span v-html='title'></span>
      <!-- 同步状态图标 -->
      <q-icon
        v-if="syncStatus !== 'synced'"
        :name="syncStatusIcon"
        :class="`sync-status-icon ${syncStatusClass}`"
        size="12px"
      />
    </div>

    <div v-if="!dense" :class='`note-item-summary${darkTag}`' v-html='summary'></div>

    <div :class='`note-item-summary${darkTag} flex justify-between no-wrap overflow-hidden fa-align-center`'>
      <span class='text-left note-info-tag'><q-icon name='category' size='17px' /> {{ category }}</span>
      <span class='text-right note-info-tag'><q-icon name='timer' size='17px' /> {{ modifiedDate }}</span>
    </div>
  </q-card>
</template>

<script>
import _ from 'lodash'
import { createNamespacedHelpers } from 'vuex'
import helper from 'src/utils/helper'
import DatabaseClient from 'src/utils/DatabaseClient'

const {
  mapActions: mapServerActions,
  mapState: mapServerState
} = createNamespacedHelpers('server')
export default {
  name: 'NoteItem',
  props: {
    data: {
      type: Object,
      default () {
        return {
          abstractText: '',
          docGuid: '',
          category: ''
        }
      }
    },
    maxSummaryLength: {
      type: Number,
      default: 40
    },
    markdown: Boolean,
    contextmenuHandler: {
      type: Function,
      default: () => {}
    },
    dense: {
      type: Boolean,
      default: true
    },
    titleWrap: {
      type: Boolean,
      default: false
    },
    maxTitleLength: {
      type: Number,
      default: 25
    }
  },
  data () {
    return {
      categoryDialogLabel: '',
      categoryDialogHandler: () => {},
      count: 0,
      capturedSaveData: null  // ✅ 新增：预捕获的保存数据
    }
  },
  computed: {
    fileIcon () {
      const title = this.data.title || ''
      if (_.endsWith(title, '.md')) return 'description'
      if (_.endsWith(title, '.txt')) return 'text_snippet'
      if (_.endsWith(title, '.html') || _.endsWith(title, '.htm')) return 'html'
      if (_.endsWith(title, '.pdf')) return 'pdf'
      return 'note'
    },
    summary () {
      if (helper.isNullOrEmpty(this.data.abstractText) && !helper.isNullOrEmpty(this.data.highlight)) {
        const { highlight: { text = [] } } = this.data
        const summary = text.join('')
        return summary.length > this.maxSummaryLength
          ? summary.substring(0, this.maxSummaryLength) + '...'
          : summary
      }
      return this.data.abstractText &&
      this.data.abstractText.length > this.maxSummaryLength
        ? this.data.abstractText.substring(0, this.maxSummaryLength) + '...'
        : this.data.abstractText
    },
    title () {
      if (!helper.isNullOrEmpty(this.data.highlight)) {
        const { highlight: { title = [] } } = this.data
        const tempTitle = title.join('')
        if (this.titleWrap) {
          return tempTitle &&
          tempTitle.length > this.maxTitleLength
            ? tempTitle.substring(0, this.maxTitleLength) + '...'
            : tempTitle
        }
        return title.join('')
      }
      return this.data.title
    },
    docGuid () {
      return this.data.docGuid
    },
    darkMode () {
      return this.$q.dark.isActive
    },
    darkTag () {
      return this.darkMode ? '-dark' : ''
    },
    denseTag () {
      return this.dense ? 'dense' : ''
    },
    modifiedDate () {
      return helper.displayDateElegantly(this.data.dataModified)
    },
    // 同步状态
    syncStatus () {
      return this.data.sync_status || 'synced'
    },
    syncStatusIcon () {
      switch (this.syncStatus) {
        case 'local_only': return 'cloud_off'
        case 'pending_upload': return 'cloud_upload'
        case 'pending_download': return 'cloud_download'
        case 'conflict': return 'warning'
        default: return 'cloud_done'
      }
    },
    syncStatusClass () {
      switch (this.syncStatus) {
        case 'local_only': return 'sync-local'
        case 'pending_upload': return 'sync-pending'
        case 'pending_download': return 'sync-download'
        case 'conflict': return 'sync-conflict'
        default: return 'sync-synced'
      }
    },
    category () {
      if (helper.isNullOrEmpty(this.data.category)) return ''
      try {
        if (helper.wizIsPredefinedLocation(this.data.category)) return this.$t(this.data.category)
        const categoryList = this.data.category.split('/')
        return categoryList[categoryList.length - 2]
      } catch (e) {
        return ''
      }
    },
    ...mapServerState(['noteState', 'currentCategory'])
  },
  methods: {
    noteItemClickHandler: async function () {
      // ✅ 核心原则：先确保当前笔记A完全保存，再切换到笔记B
      
      if (this.noteState !== 'default') {
        // 有未保存的修改
        console.log('[NoteItem] Has unsaved changes, saving before switch...')
        
        try {
          // Step 1: 捕获编辑器当前内容（此时还是稳定的笔记A）
          const capturedData = this.captureEditorContent()
          
          if (capturedData) {
            // Step 2: 同步等待保存完成（阻塞直到SQLite写入成功）
            const saveSuccess = await this.saveWithCapturedData(capturedData)
            
            if (saveSuccess) {
              console.log(`[NoteItem] ✅ Note A saved successfully, now switching to B`)
            } else {
              console.warn('[NoteItem] ⚠️ Save failed, but continuing to switch')
            }
          } else {
            // fallback：捕获失败，尝试原有逻辑
            await this.saveToSQLite()
          }
        } catch (error) {
          console.error('[NoteItem] Error during pre-switch save:', error)
          // 即使保存失败也继续切换（避免卡死）
        }
        
        // 后台异步同步云端（不阻塞）
        this.asyncSyncToCloud()
      }
      
      // Step 3: 保存完成（或无需保存）→ 现在安全地切换到新笔记
      console.time('NoteLoadTime')
      await this.getNoteContent({ docGuid: this.docGuid })
      console.timeEnd('NoteLoadTime')
    },
    
    // ✅ 新增：捕获编辑器当前内容（调用 Muya 组件的方法）
    captureEditorContent: function () {
      try {
        const findMuyaComponent = (root) => {
          const queue = [...root.$children]
          while (queue.length) {
            const child = queue.shift()
            if (child.captureCurrentContent && typeof child.captureCurrentContent === 'function') {
              return child
            }
            queue.push(...child.$children)
          }
          return null
        }
        
        const muya = findMuyaComponent(this.$root)
        if (muya) {
          this.capturedSaveData = muya.captureCurrentContent()
          console.log('[NoteItem] Editor content captured:', this.capturedSaveData ? `docGuid=${this.capturedSaveData.docGuid}` : 'null')
        } else {
          console.warn('[NoteItem] Muya component not found, cannot pre-capture')
          this.capturedSaveData = null
        }
      } catch (error) {
        console.error('[NoteItem] Failed to capture editor content:', error)
        this.capturedSaveData = null
      }
    },
    
    // ✅ 新增：使用预捕获的数据保存
    saveWithCapturedData: async function (capturedData) {
      try {
        if (!capturedData || !capturedData.docGuid) {
          console.warn('[NoteItem] saveWithCapturedData: no valid data')
          return false
        }
        
        const { markdown, docGuid, title, resources } = capturedData
        
        const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
        console.log(`[NoteItem] 💾 Saving captured data: docGuid=${docGuid}, len=${markdown?.length}, title=${title}`)
        
        if (localNote) {
          console.log(`[NoteItem] 📝 Updating existing note: id=${localNote.id}, current_content_len=${(localNote.content || '').length}`)
          await DatabaseClient.updateNote(localNote.id, {
            content: markdown,
            title: title || localNote.title,
            sync_status: 'pending_upload',
            local_modified: Date.now()
          })
          console.log(`[NoteItem] ✅ Updated SQLite: id=${localNote.id}, new_status=pending_upload`)
        } else {
          console.log(`[NoteItem] 🆕 Creating new note: docGuid=${docGuid}`)
          await DatabaseClient.createNote({
            doc_guid: docGuid,
            title: title || 'Untitled',
            content: markdown,
            sync_status: 'pending_upload',
            local_modified: Date.now(),
            data_created: Date.now(),
            data_modified: Date.now()
          })
          console.log(`[NoteItem] ✅ Created in SQLite: docGuid=${docGuid}, status=pending_upload`)
        }
        
        // ✅ 验证：保存后立即读取确认
        const verifyNote = await DatabaseClient.getNoteByDocGuidWithPriority(docGuid)
        if (verifyNote) {
          console.log(`[NoteItem] ✅ Verified saved content: id=${verifyNote.id}, content_len=${(verifyNote.content || '').length}, sync=${verifyNote.sync_status}, local_mod=${verifyNote.local_modified}`)
        } else {
          console.error(`[NoteItem] ❌ Verification failed: cannot find note after save: ${docGuid}`)
        }
        
        return true
      } catch (err) {
        console.error('[NoteItem] saveWithCapturedData failed:', err)
        return false
      }
    },
    // 获取当前编辑器的 markdown 内容
    getCurrentMarkdown () {
      // 优先尝试通过 $root 找到 Index 页面组件
      const findIndexPage = (root) => {
        const queue = [...root.$children]
        while (queue.length) {
          const child = queue.shift()
          if (child.$refs?.muya && typeof child.$refs.muya.getValue === 'function') {
            return child
          }
          if (child.$refs?.monaco && typeof child.$refs.monaco.getValue === 'function') {
            return child
          }
          queue.push(...child.$children)
        }
        return null
      }

      const page = findIndexPage(this.$root)
      if (!page) {
        console.warn('[NoteItem] Cannot find editor page')
        return ''
      }

      // Muya 编辑器
      const muya = page.$refs.muya
      if (muya && typeof muya.getValue === 'function') {
        return muya.getValue()
      }
      // Monaco 编辑器
      const monaco = page.$refs.monaco
      if (monaco && typeof monaco.getValue === 'function') {
        return monaco.getValue()
      }
      return ''
    },
    // 保存当前笔记到本地 SQLite（切换时调用，保存编辑器最新内容）
    async saveToSQLite () {
      try {
        const state = this.$store.state.server
        const currentNote = state.currentNote
        const docGuid = currentNote?.info?.docGuid
        const info = currentNote?.info
        console.log('[NoteItem] saveToSQLite called, docGuid:', docGuid, 'hasInfo:', !!info)
        if (!docGuid || !info) {
          console.warn('[NoteItem] saveToSQLite skipped: no docGuid or info')
          return false
        }

        const markdown = this.getCurrentMarkdown()
        console.log('[NoteItem] getCurrentMarkdown returned length:', markdown?.length || 0)
        if (!markdown) {
          console.warn('[NoteItem] saveToSQLite skipped: empty markdown')
          return false
        }

        const localNote = await DatabaseClient.getNoteByDocGuid(docGuid)
        console.log('[NoteItem] SQLite lookup result:', localNote ? `id=${localNote.id}` : 'null')
        if (localNote) {
          await DatabaseClient.updateNote(localNote.id, {
            content: markdown,
            title: info.title,
            category: info.category || '/',
            sync_status: 'pending_upload'
          })
          console.log('[NoteItem] SQLite updated:', docGuid, 'content length:', markdown.length)
        } else {
          await DatabaseClient.createNote({
            doc_guid: docGuid,
            title: info.title,
            content: markdown,
            category: info.category || '/',
            sync_status: 'pending_upload'
          })
          console.log('[NoteItem] SQLite created:', docGuid, 'content length:', markdown.length)
        }
        return true
      } catch (err) {
        console.error('[NoteItem] saveToSQLite failed:', err)
        return false
      }
    },
    // 保存当前笔记（云端）
    async saveCurrentNote (markdown) {
      if (markdown && typeof this.$store.dispatch === 'function') {
        await this.$store.dispatch('server/updateNote', markdown)
      }
    },
    // 后台异步同步到云端（不等待）
    asyncSyncToCloud () {
      console.log('[NoteItem] 🚀 Starting async sync to cloud (background)...')
      
      // ✅ 异步执行，不阻塞 UI
      this.$nextTick(async () => {
        try {
          if (this.$store && this.$store.hasModule('offline')) {
            const result = await this.$store.dispatch('offline/sync')
            console.log('[NoteItem] ✅ Background sync completed:', result)
          } else {
            console.warn('[NoteItem] ⚠️ offline module not found, skipping sync')
          }
        } catch (error) {
          console.error('[NoteItem] ❌ Background sync failed:', error)
        }
      })
    },
    ...mapServerActions(['getNoteContent', 'updateNoteInfo'])
  }
}
</script>

<style scoped>
.sync-status-icon {
  margin-left: 4px;
  vertical-align: middle;
}
.sync-local { color: #999; }
.sync-pending { color: #e6a23c; }
.sync-download { color: #409eff; }
.sync-conflict { color: #f56c6c; }
.sync-synced { color: #67c23a; }
</style>
