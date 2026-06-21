<template>
  <q-page class='flex'>
    <q-splitter
      v-model='splitterWidthValue'
      :limits='splitterLimits'
      class='full-width'
      unit='px'
      separator-class='custom-splitter'
      before-class='overflow-hidden'
      after-class='hide-scrollbar editor-splitter-after'
      :min="300"
    >
      <template v-slot:before>
        <div class='left-panel-wrapper'>
          <q-splitter
            v-model='leftInnerSplitterValue'
            :limits='leftInnerSplitterLimits'
            class='full-width full-height index-left-inner-splitter'
            unit='px'
            horizontal
            separator-class='custom-splitter'
            before-class='overflow-hidden'
            after-class='overflow-hidden'
            :disable="!categoryTreeVisible"
          >
            <template v-slot:before>
              <CategoryTreePanel v-if="sidebarTreeType !== 'calendar'" class='full-height' />
              <CalendarPanel v-else class='full-height' />
            </template>
            <template v-slot:after>
              <transition
                appear
                enter-active-class='animated fadeIn'
                leave-active-class='animated fadeOut'
              >
                <NoteList v-show='noteListVisible' class='full-height' />
              </transition>
            </template>
          </q-splitter>
        </div>
      </template>
      <template v-slot:after>
        <div class='full-height editor-wrapper'>
          <div class='editor-stage'>
            <div v-show='!isSourceMode && dataLoaded'>
              <Muya ref='muya' :active='!isSourceMode && dataLoaded' :data='tempNoteData' />
            </div>
            <Monaco ref='monaco' v-if='dataLoaded' :active='isSourceMode' :data='tempNoteData' v-show='isSourceMode' />
            <transition-group
              appear
              enter-active-class='animated fadeIn'
              leave-active-class='animated fadeOut'
            >
              <Illustration :mode='illustrationMode' key='illustration' />
            </transition-group>
          </div>
          <div v-show='!isOutlineShow' class='editor-action-bar'>
            <div class='editor-action-bar-inner editor-action-bar-inner--reversed'>
              <q-btn
                v-if='showEditorNoteFab'
                :icon='editorNoteActionsExpanded ? "close" : "post_add"'
                dense
                flat
                round
                class='fab-icon cursor-pointer material-icons-round editor-note-trigger'
                @click='toggleEditorNoteActions'
                size='md'
                color='#26A69A'
                v-ripple
              >
                <q-tooltip
                  v-if='!editorNoteActionsExpanded'
                  anchor='center left'
                  self='center right'
                  :offset='[10, 10]'
                >{{ $t('createNote') }} / {{ $t('import') }}</q-tooltip>
                <q-tooltip
                  v-else
                  anchor='center left'
                  self='center right'
                  :offset='[10, 10]'
                >{{ $t('cancel') }}</q-tooltip>
              </q-btn>
              <div
                v-if='showEditorNoteFab && editorNoteActionsExpanded'
                class='editor-note-sub-actions'
              >
                <q-btn
                  v-if='noteFabIsRootCategory'
                  icon='create_new_folder'
                  dense
                  flat
                  round
                  class='fab-icon cursor-pointer material-icons-round'
                  @click='addCategoryFromEditorBar'
                  size='md'
                  color='#26A69A'
                  v-ripple
                  :title='$t("createCategory")'
                />
                <template v-else>
                  <q-btn
                    icon='note_add'
                    dense
                    flat
                    round
                    class='fab-icon cursor-pointer material-icons-round'
                    @click='addNoteFromEditorBar'
                    size='md'
                    color='#26A69A'
                    v-ripple
                    :title='$t("createNote")'
                  />
                  <q-btn
                    icon='add'
                    dense
                    flat
                    round
                    class='fab-icon cursor-pointer material-icons-round'
                    @click='openImportFromEditorBar'
                    size='md'
                    color='#26A69A'
                    v-ripple
                    :title='$t("import")'
                  />
                </template>
              </div>
              <q-btn
                :icon='isSourceMode ? "assignment" : "code"'
                dense
                flat
                round
                class='fab-icon cursor-pointer material-icons-round'
                @click='isSourceMode = !isSourceMode'
                size='md'
                color='#26A69A'
                v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow'
                v-ripple
                :title="!isSourceMode ? $t('sourceMode') : $t('previewMode')"
              />
              <q-btn
                :icon='enablePreviewEditor ? "lock_open" : "lock"'
                dense
                flat
                round
                class='fab-icon cursor-pointer material-icons-round'
                @click='lockModeHandler'
                size='md'
                color='#26A69A'
                v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow'
                v-ripple
                :title="enablePreviewEditor ? $t('lock') : $t('unlock')"
              />
              <q-btn
                icon='dashboard'
                dense
                flat
                round
                class='fab-icon cursor-pointer material-icons-round'
                size='md'
                color='#26A69A'
                v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow && !isSourceMode'
                v-ripple
              >
                <q-tooltip
                  transition-show="fade"
                  transition-hide="fade"
                  anchor="center left" self="center right"
                >
                  <div class="text-body2">
                    <p>{{ `${$t('word:', wordCount)}` }}</p>
                    <p>{{ `${$t('character:', wordCount)}` }}</p>
                    <p>{{ `${$t('paragraph:', wordCount)}` }}</p>
                  </div>
                </q-tooltip>
              </q-btn>
              <q-btn
                icon='format_align_center'
                dense
                flat
                round
                class='fab-icon cursor-pointer material-icons-round'
                @click.stop='$refs.outlineDrawer.show'
                size='md'
                color='#26A69A'
                v-show='!editorNoteActionsExpanded && dataLoaded && contentsListLoaded && !isOutlineShow && !isSourceMode'
                v-ripple
              />
              <q-btn
                :icon='saveButtonIcon'
                class='fab-icon cursor-pointer material-icons-round'
                dense
                flat
                round
                @click='refreshCurrentNote'
                size='md'
                color='#26A69A'
                v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow'
                v-ripple
              />
              <q-btn
                icon='slideshow'
                class='fab-icon cursor-pointer material-icons-round'
                dense
                flat
                round
                size='md'
                color='#26A69A'
                v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow'
                v-ripple
                :title="$t('pptPreview')"
                @click='openPptPreview'
              />
              <q-btn
                icon='link'
                class='fab-icon cursor-pointer material-icons-round'
                dense
                flat
                round
                size='md'
                color='#26A69A'
                v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow && canCopyNoteLink'
                v-ripple
                :title="$t('copyNoteLink')"
                @click='copyNoteLink'
              />
              <ImportDialog ref='importDialog' />
              <BlogDeployDialog ref='blogDeployDialog' @deploy='onBlogDeploy' @cancel='onBlogDeployCancel' />
              <BlogDeployProgressDialog ref='blogDeployProgressDialog' @cancel='onBlogDeployProgressCancel' />
            </div>
          </div>
        </div>
        <NoteOutlineDrawer ref='outlineDrawer' :change='outlineDrawerChangeHandler' />
        <Loading :visible='isCurrentNoteLoading' />
        <MarkMapDialog ref="markMapDialog" />
        <PptPreviewDialog ref='pptPreviewDialog' />
      </template>
    </q-splitter>
  </q-page>
</template>

<script>
import NoteList from '../components/NoteList.vue'
import CategoryTreePanel from '../components/CategoryTreePanel.vue'
import CalendarPanel from '../components/CalendarPanel.vue'
import bus from 'components/bus'
import events from 'src/constants/events'
import helper from 'src/utils/helper'
import { createNamespacedHelpers } from 'vuex'
import NoteOutlineDrawer from 'components/ui/NoteOutlineDrawer.vue'
import { initLoadingPageMixins } from '../mixins'
import Loading from 'components/ui/Loading.vue'
import Monaco from 'components/ui/editor/Monaco.vue'
import Muya from 'components/ui/editor/Muya.vue'
import MarkMapDialog from '../components/ui/dialog/MarkMapDialog.vue'
import PptPreviewDialog from '../components/ui/dialog/PptPreviewDialog.vue'
import Illustration from 'src/components/ui/Illustration.vue'
import ImportDialog from 'components/ui/dialog/ImportDialog.vue'
import BlogDeployDialog from 'components/ui/dialog/BlogDeployDialog.vue'
import BlogDeployProgressDialog from 'components/ui/dialog/BlogDeployProgressDialog.vue'

const {
  mapGetters: mapServerGetters,
  mapState: mapServerState,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')
const { mapState: mapClientState, mapActions: mapClientActions } = createNamespacedHelpers('client')
// import Sidebar from '../components/Sidebar'
export default {
  name: 'PageIndex',
  mixins: [initLoadingPageMixins],
  components: {
    MarkMapDialog,
    PptPreviewDialog,
    Muya,
    Monaco,
    Loading,
    NoteOutlineDrawer,
    NoteList,
    CategoryTreePanel,
    CalendarPanel,
    Illustration,
    ImportDialog,
    BlogDeployDialog,
    BlogDeployProgressDialog
  },
  computed: {
    thumbStyle () {
      return {
        backgroundColor: '#E8ECF1',
        width: '5px',
        opacity: 0.75
      }
    },

    barStyle () {
      return {
        width: '5px'
      }
    },
    dataLoaded: function () {
      return !helper.isNullOrEmpty(this.currentNote) && this.currentNoteInfo?.type !== 'collaboration'
    },
    illustrationMode: function () {
      if (this.isCurrentNoteLoading) return 'loading-background'
      if (this.currentNoteInfo?.type === 'collaboration') return 'collaboration'
      if (this.dataLoaded) return 'none'
      return 'memocast'
    },
    contentsListLoaded: function () {
      return this.contentsList && !!this.contentsList.length
    },
    noteFabIsRootCategory: function () {
      return helper.isNullOrEmpty(this.currentCategory)
    },
    noteFabIsTagCategory: function () {
      return this.tags?.map(t => t.tagGuid).includes(this.currentCategory)
    },
    showEditorNoteFab: function () {
      return (this.isLogin || !this.isLogin) && !this.noteFabIsTagCategory
    },
    canCopyNoteLink: function () {
      return !!this.currentNoteInfo?.docGuid && !!this.currentNoteInfo?.kbGuid
    },
    ...mapServerGetters(['currentNote', 'currentNoteInfo']),
    ...mapServerState([
      'contentsList',
      'isCurrentNoteLoading',
      'noteState',
      'isLogin',
      'currentCategory',
      'tags'
    ]),
    ...mapClientState([
      'noteListVisible',
      'categoryTreeVisible',
      'enablePreviewEditor',
      'splitterWidth',
      'leftInnerSplitterRatio',
      'rightClickCategoryItem',
      'sidebarTreeType',
      'noteMethod',
      'noteMethodPrefix'
    ])
  },
  data () {
    return {
      isOutlineShow: false,
      isSourceMode: false,
      isMindmapMode: false,
      splitterWidthValue: 580,
      splitterLimits: [300, Infinity],
      leftInnerSplitterValue: 240,
      leftInnerSplitterLimits: [120, Infinity],
      leftInnerSplitterSaveTimer: null,
      splitterWidthSaveTimer: null,
      tempNoteData: {},
      wordCount: {
        word: '0',
        paragraph: '0',
        character: '0'
      },
      saveButtonIcon: 'save',
      editorNoteActionsExpanded: false
    }
  },
  methods: {
    refreshCurrentNote: function () {
      bus.$emit(events.NOTE_SHORTCUT_CALL.save)
    },
    outlineDrawerChangeHandler: function (state) {
      this.isOutlineShow = state
    },
    sourceModeHandler: function () {
      this.isSourceMode = !this.isSourceMode
    },
    getTempValue: function () {
      let markdown
      if (this.isSourceMode) {
        markdown = this.$refs.monaco?.getValue()
      } else {
        markdown = this.$refs.muya?.getValue()
      }
      return markdown
    },
    generateMindmapHandler: function () {
      const markdown = this.getTempValue()
      this.$refs.markMapDialog.toggle(markdown)
    },
    openPptPreview: function () {
      const markdown = this.getTempValue()
      this.$refs.pptPreviewDialog.show(markdown)
    },
    copyNoteLink: function () {
      const { docGuid, kbGuid } = this.currentNoteInfo || {}
      if (!docGuid || !kbGuid) return
      const baseUrl = (this.$store.state.server.kbServer || this.$store.getters.noteViewUrl || '').replace(/\/ks\/note\/view\/.*/, '')
      if (!baseUrl) return
      const noteViewUrl = `${baseUrl}/ks/note/view/${kbGuid}/${docGuid}/`
      const clipboard = window.__electronClipboard
      if (clipboard?.writeText) {
        clipboard.writeText(noteViewUrl)
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(noteViewUrl)
      }
      this.$q.notify({
        color: 'primary',
        icon: 'link',
        message: this.$t('noteLinkCopied')
      })
    },
    wordCountUpdateHandler: function (wordCount) {
      this.wordCount = Object.assign({
        word: '',
        paragraph: '',
        character: ''
      }, wordCount)
    },
    editorScrollHandler: function (e) {
      bus.$emit(events.EDITOR_SCROLL, e)
    },
    lockModeHandler: function () {
      this.toggleChanged({
        key: 'enablePreviewEditor',
        value: !this.enablePreviewEditor
      })
      this.$q.notify({
        color: 'primary',
        icon: 'info',
        message: this.enablePreviewEditor ? this.$t('lockModeOff') : this.$t('lockModeOn')
      })
    },
    persistLeftInnerSplitter () {
      if (!this.categoryTreeVisible) return
      this.updateStateAndStore({ leftInnerSplitterRatio: this.leftInnerSplitterValue })
    },
    persistSplitterWidth () {
      this.updateStateAndStore({ splitterWidth: this.splitterWidthValue })
    },
    addNoteHandler: function () {
      const isSixDaoMode = this.noteMethod === 'notesSixDaoLun'
      const now = new Date()
      const yyyy = now.getFullYear()
      const category = this.currentCategory || ''
      const categoryName = category.split('/').filter(Boolean).pop() || ''
      const noteBaseName = this.$t('noteTitleBase')
      const prefixOptions = ['Course', 'Book', 'Export', 'Model', 'Project', 'Trend']
      const selectedPrefix = prefixOptions.includes(this.noteMethodPrefix) ? this.noteMethodPrefix : 'Course'
      const defaultTitle = isSixDaoMode
        ? `【${selectedPrefix}】${noteBaseName}-${yyyy}.md`
        : this.$t('defaultNoteTitle', {
            category: categoryName,
            date: `${yyyy}${String(now.getMonth() + 1).padStart(2, '0')}`
          })

      if (!isSixDaoMode) {
        this.$q
          .dialog({
            title: this.$t('createNote'),
            prompt: {
              model: defaultTitle,
              type: 'text',
              attrs: {
                spellcheck: false
              },
              label: this.$t('title')
            },
            ok: this.$t('confirm'),
            cancel: this.$t('cancel')
          })
          .onOk(data => {
            this.createNote(data)
          })
        return
      }

      const prefixFieldClass = 'memocast-prefix-select-field'
      const noteTitleInputClass = 'memocast-note-title-input'
      const container = document.createElement('div')
      container.className = 'six-dao-create-note-dialog'
      container.innerHTML = `
        <div class="q-mb-md">
          <div class="text-caption text-grey-7 q-mb-xs">${this.$t('notePrefix')}</div>
          <select class="q-field__native q-placeholder ${prefixFieldClass}">
            ${prefixOptions.map(option => `<option value="${option}" ${option === selectedPrefix ? 'selected' : ''}>${option}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="text-caption text-grey-7 q-mb-xs">${this.$t('title')}</div>
          <input class="q-input-target q-field__native ${noteTitleInputClass}" type="text" spellcheck="false" value="${defaultTitle.replace(/"/g, '&quot;')}">
        </div>
      `

      const syncTitleByPrefix = () => {
        const prefixEl = container.querySelector(`.${prefixFieldClass}`)
        const titleEl = container.querySelector(`.${noteTitleInputClass}`)
        if (!prefixEl || !titleEl) return
        titleEl.value = `【${prefixEl.value}】${noteBaseName}-${yyyy}.md`
      }

      const dialog = this.$q.dialog({
        title: this.$t('createNote'),
        message: '<div class="six-dao-create-note-dialog-mount"></div>',
        html: true,
        ok: this.$t('confirm'),
        cancel: this.$t('cancel'),
        focus: 'ok'
      })

      dialog.onOk(() => {
        const prefixEl = container.querySelector(`.${prefixFieldClass}`)
        const titleEl = container.querySelector(`.${noteTitleInputClass}`)
        const prefix = prefixEl ? prefixEl.value : selectedPrefix
        const title = titleEl ? titleEl.value : defaultTitle
        this.toggleChanged({ key: 'noteMethodPrefix', value: prefix })
        this.createNote({ title, prefix, noteMethod: this.noteMethod })
      })

      dialog.onDismiss(() => {
        if (container.parentNode) {
          container.parentNode.removeChild(container)
        }
      })

      this.$nextTick(() => {
        const mountPoint = document.querySelector('.six-dao-create-note-dialog-mount')
        if (!mountPoint) return
        mountPoint.appendChild(container)
        const prefixEl = container.querySelector(`.${prefixFieldClass}`)
        const titleEl = container.querySelector(`.${noteTitleInputClass}`)
        if (prefixEl) {
          prefixEl.addEventListener('change', syncTitleByPrefix)
        }
        if (titleEl) {
          titleEl.focus()
          titleEl.select()
        }
      })
    },
    addCategoryHandler: function () {
      this.$q
        .dialog({
          title: this.$t('createCategory'),
          prompt: {
            model: this.$t('categoryName'),
            type: 'text',
            attrs: {
              spellcheck: false
            }
          },
          ok: this.$t('confirm'),
          cancel: this.$t('cancel')
        })
        .onOk(data => {
          this.createCategory({
            childCategoryName: data,
            parentCategory: helper.isNullOrEmpty(this.currentCategory) ? '' : this.rightClickCategoryItem
          })
        })
    },
    toggleEditorNoteActions: function () {
      this.editorNoteActionsExpanded = !this.editorNoteActionsExpanded
    },
    addCategoryFromEditorBar: function () {
      this.addCategoryHandler()
      this.editorNoteActionsExpanded = false
    },
    addNoteFromEditorBar: function () {
      this.addNoteHandler()
      this.editorNoteActionsExpanded = false
    },
    openImportFromEditorBar: function () {
      this.$refs.importDialog.toggle()
      this.editorNoteActionsExpanded = false
    },
    openImportHandler: function () {
      this.$refs.importDialog.toggle()
    },
    async exportToBlogHandler () {
      const category = this.$store.state.client.rightClickCategoryItem
      if (!category) return
      this.$store.dispatch('server/blogDeploy', { category })
    },
    async copyMarkdownHandler () {
      const category = this.$store.state.client.rightClickCategoryItem
      if (!category) return
      const kbGuid = this.$store.state.server.kbGuid
      const notes = await this.$store.dispatch('server/getCategoryNotesForExport', { kbGuid, category })
      if (!notes || notes.length === 0) {
        this.$q.notify({ message: 'No notes found', type: 'warning' })
        return
      }
      const text = notes.map(n => `## ${n.title}\n\n${n.content || ''}`).join('\n\n---\n\n')
      this.$q.electron.clipboard.writeText(text)
      this.$q.notify({ message: `Copied ${notes.length} notes`, type: 'positive', icon: 'check' })
    },
    async onBlogDeploy ({ config }) {
      this.$refs.blogDeployProgressDialog.show()
      await this.$store.dispatch('server/blogDeploy', { config })
    },
    onBlogDeployCancel () {
      this.$refs.blogDeployProgressDialog.onCancel()
      this.$store.dispatch('server/cancelBlogDeploy')
    },
    onBlogDeployProgressCancel () {
      this.$refs.blogDeployProgressDialog.onCancel()
      this.$store.dispatch('server/cancelBlogDeploy')
    },
    onShowBlogDeployDialog ({ category }) {
      this.$refs.blogDeployDialog.show()
    },
    ...mapServerActions(['createNote', 'createCategory']),
    ...mapClientActions(['toggleChanged', 'updateStateAndStore'])
  },
  mounted () {
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.createCategory, this.addCategoryHandler)
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.createNote, this.addNoteFromEditorBar)
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.openImport, this.openImportHandler)
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.exportToBlog, this.exportToBlogHandler)
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.copyMarkdown, this.copyMarkdownHandler)
    bus.$on('showBlogDeployDialog', this.onShowBlogDeployDialog)
    bus.$on(events.VIEW_SHORTCUT_CALL.lockMode, this.lockModeHandler)
    bus.$on(events.VIEW_SHORTCUT_CALL.sourceMode, this.sourceModeHandler)
    bus.$on(events.GENERATE_MINDMAP, this.generateMindmapHandler)
    bus.$on(events.UPDATE_WORD_COUNT, this.wordCountUpdateHandler)
    this.$nextTick(this.hideInitLoadingPage)
    if (!this.noteListVisible) {
      this.splitterLimits = [0, Infinity]
      this.splitterWidthValue = 0
    } else {
      this.splitterLimits = [300, Infinity]
      this.splitterWidthValue = Number.isFinite(this.splitterWidth) ? this.splitterWidth : 580
    }
    if (!this.categoryTreeVisible) {
      this.leftInnerSplitterLimits = [0, Infinity]
      this.leftInnerSplitterValue = 0
    } else {
      this.leftInnerSplitterLimits = [120, Infinity]
      this.leftInnerSplitterValue = Number.isFinite(this.leftInnerSplitterRatio) ? this.leftInnerSplitterRatio : 240
    }
  },
  beforeDestroy () {
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.createCategory, this.addCategoryHandler)
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.createNote, this.addNoteFromEditorBar)
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.openImport, this.openImportHandler)
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.exportToBlog, this.exportToBlogHandler)
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.copyMarkdown, this.copyMarkdownHandler)
    bus.$off('showBlogDeployDialog', this.onShowBlogDeployDialog)
    if (this.leftInnerSplitterSaveTimer) {
      clearTimeout(this.leftInnerSplitterSaveTimer)
    }
    if (this.splitterWidthSaveTimer) {
      clearTimeout(this.splitterWidthSaveTimer)
    }
  },
  watch: {
    splitterWidthValue (val) {
      if (this.splitterWidthSaveTimer) {
        clearTimeout(this.splitterWidthSaveTimer)
      }
      this.splitterWidthSaveTimer = setTimeout(() => {
        this.persistSplitterWidth()
        this.splitterWidthSaveTimer = null
        bus.$emit(events.TAG_TREEMAP_RESIZE)
      }, 350)
    },
    leftInnerSplitterValue (val) {
      if (this.leftInnerSplitterSaveTimer) {
        clearTimeout(this.leftInnerSplitterSaveTimer)
      }
      this.leftInnerSplitterSaveTimer = setTimeout(() => {
        this.persistLeftInnerSplitter()
        this.leftInnerSplitterSaveTimer = null
        bus.$emit(events.TAG_TREEMAP_RESIZE)
      }, 350)
    },
    isSourceMode: function (val) {
      if (!val) {
        this.tempNoteData = {
          markdown: this.$refs.monaco.getValue(),
          cursor: this.$refs.monaco.getCursorPosition()
        }
      } else {
        this.tempNoteData = {
          markdown: this.$refs.muya.getValue(),
          cursor: this.$refs.muya.getCursorPosition()
        }
      }
    },
    noteState: function (val, oldVal) {
      if (val === 'default' && oldVal === 'changed') {
        this.saveButtonIcon = 'check'
        setTimeout(() => {
          this.saveButtonIcon = 'save'
        }, 3000)
      }
    },
    noteListVisible: function (val) {
      if (!val) {
        this.persistSplitterWidth()
        this.persistLeftInnerSplitter()
        this.splitterLimits = [0, Infinity]
        this.splitterWidthValue = 0
      } else {
        this.splitterLimits = [300, Infinity]
        this.splitterWidthValue = Number.isFinite(this.splitterWidth) ? this.splitterWidth : 580
        if (this.categoryTreeVisible) {
          this.leftInnerSplitterLimits = [120, Infinity]
          this.leftInnerSplitterValue = Number.isFinite(this.leftInnerSplitterRatio) ? this.leftInnerSplitterRatio : 240
        } else {
          this.leftInnerSplitterLimits = [0, Infinity]
          this.leftInnerSplitterValue = 0
        }
      }
    },
    categoryTreeVisible: function (val) {
      if (!val) {
        this.leftInnerSplitterLimits = [0, Infinity]
        this.leftInnerSplitterValue = 0
      } else {
        this.leftInnerSplitterLimits = [120, Infinity]
        this.leftInnerSplitterValue = Number.isFinite(this.leftInnerSplitterRatio) ? this.leftInnerSplitterRatio : 240
      }
    },
    showEditorNoteFab: function (val) {
      if (!val) this.editorNoteActionsExpanded = false
    }
  }
}
</script>
<style lang="scss">
.editor-wrapper {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

/* 将 Muya/Monaco 限制在右侧面板可视区域内，避免 Monaco 撑高父级导致 action-bar 的 bottom 落在视口外 */
.editor-stage {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

.editor-splitter-after {
  min-height: 0;
}

.editor-action-bar {
  position: fixed;
  bottom: 12px;
  right: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: fit-content;
  z-index: 6000;
  padding: 4px 2px;
  background: rgba(240, 240, 240, 0.88);
  border-radius: 10px;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.1);
}

/* 按钮组内反向排列，最常用按钮在最下 */
.editor-action-bar-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.editor-action-bar-inner--reversed {
  flex-direction: column-reverse;
}

.editor-note-sub-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.editor-action-bar-inner--reversed {
  gap: 2px;
}

/* 全局 .fab-icon { margin: 40px } 在纵向堆叠时会叠成巨大间距，此处恢复为原独立浮动时的紧凑感 */
.editor-action-bar .fab-icon {
  margin: 0 !important;
}

.body--dark .editor-action-bar {
  background: rgba(55, 55, 55, 0.88);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
}

.index-left-inner-splitter {
  min-height: 0;
}

.left-panel-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-component {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
}

/* QSplitter：separatorClass 加在 .q-splitter__separator 自身，勿写子选择器 */
.q-splitter.q-splitter--vertical > .q-splitter__separator.custom-splitter {
  background-color: #dfe3ea !important;
  transition: background-color 0.15s ease, width 0.15s ease, box-shadow 0.15s ease;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}

.q-splitter.q-splitter--vertical > .q-splitter__separator.custom-splitter:hover,
.q-splitter.q-splitter--vertical.q-splitter--active > .q-splitter__separator.custom-splitter {
  background-color: var(--themeColor) !important;
  width: 3px !important;
  box-shadow: 0 0 0 1px var(--themeColor30, rgba(33, 181, 111, 0.35));
}

.q-splitter.q-splitter--dark.q-splitter--vertical > .q-splitter__separator.custom-splitter {
  background-color: rgba(255, 255, 255, 0.14) !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.q-splitter.q-splitter--dark.q-splitter--vertical > .q-splitter__separator.custom-splitter:hover,
.q-splitter.q-splitter--dark.q-splitter--vertical.q-splitter--active > .q-splitter__separator.custom-splitter {
  background-color: var(--themeColor) !important;
}

.q-splitter.q-splitter--horizontal > .q-splitter__separator.custom-splitter {
  background-color: #dfe3ea !important;
  transition: background-color 0.15s ease, height 0.15s ease, box-shadow 0.15s ease;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}

.q-splitter.q-splitter--horizontal > .q-splitter__separator.custom-splitter:hover,
.q-splitter.q-splitter--horizontal.q-splitter--active > .q-splitter__separator.custom-splitter {
  background-color: var(--themeColor) !important;
  height: 3px !important;
  box-shadow: 0 0 0 1px var(--themeColor30, rgba(33, 181, 111, 0.35));
}

.q-splitter.q-splitter--dark.q-splitter--horizontal > .q-splitter__separator.custom-splitter {
  background-color: rgba(255, 255, 255, 0.14) !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.q-splitter.q-splitter--dark.q-splitter--horizontal > .q-splitter__separator.custom-splitter:hover,
.q-splitter.q-splitter--dark.q-splitter--horizontal.q-splitter--active > .q-splitter__separator.custom-splitter {
  background-color: var(--themeColor) !important;
}
</style>
