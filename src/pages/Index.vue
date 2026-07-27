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
          <ImportDialog ref='importDialog' />
          <BlogDeployDialog ref='blogDeployDialog' @deploy='onBlogDeploy' @cancel='onBlogDeployCancel' />
          <BlogDeployProgressDialog ref='blogDeployProgressDialog' @rebuild='onBlogDeployRebuild' />
        </div>
        <!-- Action Bar 底部居中，水平排列，仿 iOS 毛玻璃药丸 -->
        <div class='editor-action-bar-wrapper'>
          <transition name='action-bar-ios'>
            <div
              v-show='actionBarVisible'
              class='editor-action-bar'
              :class="{ 'action-bar--scroll': isActionBarScrolling }"
            >
              <div class='editor-action-bar-inner'>
                <q-btn
                  v-if='showEditorNoteFab'
                  :icon='editorNoteActionsExpanded ? "close" : "post_add"'
                  dense flat round
                  class='fab-icon cursor-pointer material-icons-round editor-note-trigger'
                  @click='toggleEditorNoteActions'
                  size='md' color='#26A69A' v-ripple
                >
                  <q-tooltip v-if='!editorNoteActionsExpanded' anchor='center top' self='center bottom' :offset='[0, 10]'>{{ $t('createNote') }} / {{ $t('import') }}</q-tooltip>
                  <q-tooltip v-else anchor='center top' self='center bottom' :offset='[0, 10]'>{{ $t('cancel') }}</q-tooltip>
                </q-btn>
                <transition name='sub-actions-ios'>
                  <div v-if='showEditorNoteFab && editorNoteActionsExpanded' class='editor-note-sub-actions'>
                    <q-btn v-if='noteFabIsRootCategory' icon='create_new_folder' dense flat round class='fab-icon cursor-pointer material-icons-round' @click='addCategoryFromEditorBar' size='md' color='#26A69A' v-ripple :title='$t("createCategory")' />
                    <template v-else>
                      <q-btn icon='note_add' dense flat round class='fab-icon cursor-pointer material-icons-round' @click='addNoteFromEditorBar' size='md' color='#26A69A' v-ripple :title='$t("createNote")' />
                      <q-btn icon='add' dense flat round class='fab-icon cursor-pointer material-icons-round' @click='openImportFromEditorBar' size='md' color='#26A69A' v-ripple :title='$t("import")' />
                    </template>
                  </div>
                </transition>
                <q-btn :icon='isSourceMode ? "assignment" : "code"' dense flat round class='fab-icon cursor-pointer material-icons-round' @click='isSourceMode = !isSourceMode' size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow' v-ripple :title="!isSourceMode ? $t('sourceMode') : $t('previewMode')" />
                <q-btn :icon='enablePreviewEditor ? "lock_open" : "lock"' dense flat round class='fab-icon cursor-pointer material-icons-round' @click='lockModeHandler' size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow' v-ripple :title="enablePreviewEditor ? $t('lock') : $t('unlock')" />
                <q-btn icon='dashboard' dense flat round class='fab-icon cursor-pointer material-icons-round' size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow && !isSourceMode' v-ripple>
                  <q-tooltip transition-show='fade' transition-hide='fade' anchor='center top' self='center bottom'>
                    <div class='text-body2'>
                      <p>{{ `${$t('word:', wordCount)}` }}</p>
                      <p>{{ `${$t('character:', wordCount)}` }}</p>
                      <p>{{ `${$t('paragraph:', wordCount)}` }}</p>
                    </div>
                  </q-tooltip>
                </q-btn>
                <q-btn icon='format_align_center' dense flat round class='fab-icon cursor-pointer material-icons-round' @click.stop='$refs.outlineDrawer.show' size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && contentsListLoaded && !isOutlineShow && !isSourceMode' v-ripple />
                <q-btn :icon='saveButtonIcon' class='fab-icon cursor-pointer material-icons-round' dense flat round @click='refreshCurrentNote' size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow' v-ripple />
                <q-btn icon='slideshow' class='fab-icon cursor-pointer material-icons-round' dense flat round size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow' v-ripple :title='$t("pptPreview")' @click='openPptPreview' />
                <q-btn icon='link' class='fab-icon cursor-pointer material-icons-round' dense flat round size='md' color='#26A69A' v-show='!editorNoteActionsExpanded && dataLoaded && !isOutlineShow && canCopyNoteLink' v-ripple :title='$t("copyNoteLink")' @click='copyNoteLink' />
              </div>
            </div>
          </transition>
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
import NoteList from '../components/note/NoteList.vue'
import CategoryTreePanel from '../components/category/CategoryTreePanel.vue'
import CalendarPanel from '../components/calendar/CalendarPanel.vue'
import bus from 'components/common/bus'
import { EVENTS as events } from 'src/utils/const/eventsConst'
import helper from 'src/utils/helper'
import { createNamespacedHelpers } from 'vuex'
import NoteOutlineDrawer from 'components/note/NoteOutlineDrawer.vue'
import { initLoadingPageMixins } from '../mixins'
import Loading from 'components/common/Loading.vue'
import Monaco from 'components/monaco/Monaco.vue'
import Muya from 'components/muya/Muya.vue'
import MarkMapDialog from '../components/markmap/MarkMapDialog.vue'
import PptPreviewDialog from '../components/preview/PptPreviewDialog.vue'
import Illustration from 'components/common/Illustration.vue'
import ImportDialog from 'components/import/ImportDialog.vue'
import BlogDeployDialog from 'components/blog/BlogDeployDialog.vue'
import BlogDeployProgressDialog from 'components/blog/BlogDeployProgressDialog.vue'

const {
  mapGetters: mapServerGetters,
  mapState: mapServerState,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')
const { mapState: mapClientState, mapActions: mapClientActions } = createNamespacedHelpers('client')
// import Sidebar from '../components/layout'
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
      editorNoteActionsExpanded: false,
      // Action bar 贴边隐藏相关
      actionBarVisible: false,
      isActionBarHovered: false,
      actionBarHideTimer: null,
      actionBarEdgeThreshold: 30, // 距离边缘多少像素时触发显示
      // Action Bar 拖拽状态
      isActionBarDragging: false,
      dragStartX: 0,
      dragStartY: 0
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
    // Action bar 贴边隐藏相关方法
    onMouseMove: function (e) {
      // 大纲显示时隐藏工具栏
      if (this.isOutlineShow) {
        this.actionBarVisible = false
        return
      }
      // 鼠标进入编辑器滚动条区域 → 强制隐藏 action bar，避免遮挡滚动操作
      // 用 .editor-stage 的实际右边界定位（而非 window.innerWidth），让 splitter / 窗口装饰等都不影响判断
      const editorStage = document.querySelector('.editor-stage')
      if (editorStage) {
        const stageRect = editorStage.getBoundingClientRect()
        // 14px 跨平台兜底：项目显式 12px、Win/Linux 默认 17px、macOS overlay 0px（macOS 不会触发该分支）
        const SCROLLBAR_WIDTH = 14
        if (e.clientX > stageRect.right - SCROLLBAR_WIDTH && e.clientX <= stageRect.right) {
          this.actionBarVisible = false
          return
        }
      }
      // 检查鼠标是否靠近右侧边缘或底部边缘
      const distanceFromRight = window.innerWidth - e.clientX
      const distanceFromBottom = window.innerHeight - e.clientY
      // 贴近边缘时显示
      this.actionBarVisible = distanceFromRight < this.actionBarEdgeThreshold || distanceFromBottom < this.actionBarEdgeThreshold
    },
    onActionBarMouseEnter: function () {
      this.isActionBarHovered = true
      if (this.actionBarHideTimer) {
        clearTimeout(this.actionBarHideTimer)
        this.actionBarHideTimer = null
      }
      // 监听工具栏内的鼠标移动
      this.$nextTick(() => {
        const actionBar = document.querySelector('.editor-action-bar-inner')
        if (actionBar) {
          actionBar.addEventListener('mousemove', this.onActionBarMouseMove)
        }
      })
    },
    onActionBarMouseLeave: function () {
      this.isActionBarHovered = false
      this.clearIconHoverState()
      // 移除监听
      const actionBar = document.querySelector('.editor-action-bar-inner')
      if (actionBar) {
        actionBar.removeEventListener('mousemove', this.onActionBarMouseMove)
      }
    },
    onActionBarMouseMove: function (e) {
      // 获取所有 fab-icon 按钮
      const buttons = document.querySelectorAll('.editor-action-bar-inner .fab-icon')
      if (!buttons.length) return

      buttons.forEach(btn => {
        btn.classList.remove('is-near', 'is-near-left', 'is-near-right', 'is-far-left', 'is-far-right')
      })

      // 找到鼠标下的按钮
      const hoveredBtn = document.elementFromPoint(e.clientX, e.clientY)
      if (!hoveredBtn) return

      const btn = hoveredBtn.closest('.fab-icon')
      if (!btn) return

      const btnRect = btn.getBoundingClientRect()
      const btnCenterY = btnRect.top + btnRect.height / 2
      const mouseY = e.clientY

      // 计算鼠标距离按钮中心的偏移
      const offsetY = Math.abs(mouseY - btnCenterY)
      const maxOffset = btnRect.height * 0.8

      // 根据偏移计算放大级别
      if (offsetY < maxOffset * 0.3) {
        btn.classList.add('is-near')
      } else if (offsetY < maxOffset) {
        btn.classList.add('is-near-left')
        // 找相邻按钮
        const index = Array.from(buttons).indexOf(btn)
        if (index > 0) {
          buttons[index - 1].classList.add('is-far-right')
        }
        if (index < buttons.length - 1) {
          buttons[index + 1].classList.add('is-far-left')
        }
      } else {
        // 更远的按钮
        const index = Array.from(buttons).indexOf(btn)
        if (index > 0) {
          buttons[index - 1].classList.add('is-near-left')
        }
        if (index < buttons.length - 1) {
          buttons[index + 1].classList.add('is-near-right')
        }
      }
    },
    clearIconHoverState: function () {
      const buttons = document.querySelectorAll('.editor-action-bar-inner .fab-icon')
      buttons.forEach(btn => {
        btn.classList.remove('is-near', 'is-near-left', 'is-near-right', 'is-far-left', 'is-far-right')
      })
    },
    // Action Bar 拖拽（仅限右侧区域上下拖动）
    onDragHandleMouseDown: function (e) {
      e.preventDefault()
      // 仅在右侧区域允许拖动
      const threshold = window.innerWidth - 150
      if (e.clientX > threshold) {
        this.isActionBarDragging = true
        this.isActionBarHovered = true
        // 清除可能存在的隐藏定时器
        if (this.actionBarHideTimer) {
          clearTimeout(this.actionBarHideTimer)
          this.actionBarHideTimer = null
        }
        this.dragStartX = e.clientX
        this.dragStartY = e.clientY
        document.querySelector('.action-bar-drag-handle')?.classList.add('dragging')
        document.addEventListener('mousemove', this.onDragMouseMove)
        document.addEventListener('mouseup', this.onDragMouseUp)
      }
    },
    onDragMouseMove: function (e) {
      if (!this.isActionBarDragging) return
      this.isActionBarHovered = true  // 拖拽过程中保持 hover 状态
      const wrapper = document.querySelector('.editor-action-bar-wrapper')
      if (!wrapper) return
      // 以底部为锚点，根据鼠标 Y 位置计算 bottom
      const newBottom = window.innerHeight - e.clientY
      wrapper.style.bottom = Math.max(8, Math.min(newBottom, window.innerHeight - 8)) + 'px'
    },
    onDragMouseUp: function () {
      this.isActionBarDragging = false
      document.querySelector('.action-bar-drag-handle')?.classList.remove('dragging')
      document.removeEventListener('mousemove', this.onDragMouseMove)
      document.removeEventListener('mouseup', this.onDragMouseUp)
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
    async onBlogDeployRebuild () {
      const config = await this.getBlogDeployConfig()
      if (config) {
        this.$refs.blogDeployProgressDialog.show()
        await this.$store.dispatch('server/blogDeploy', { config })
      }
    },
    async getBlogDeployConfig () {
      try {
        const { getBlogDeployConfig } = require('src/ApiInvoker')
        return await getBlogDeployConfig()
      } catch (err) {
        console.warn('Failed to get blog deploy config:', err)
        return null
      }
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
    // Action bar 贴边隐藏：监听鼠标移动
    window.addEventListener('mousemove', this.onMouseMove)
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
    if (this.actionBarHideTimer) {
      clearTimeout(this.actionBarHideTimer)
    }
    window.removeEventListener('mousemove', this.onMouseMove)
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
    },
    dataLoaded: function (val) {
      if (!val) {
        this.actionBarVisible = false
      }
    },
    isOutlineShow: function (val) {
      if (val) {
        this.actionBarVisible = false
      }
    }
  }
}
</script>
<style lang="scss">
.editor-wrapper {
  position: relative;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 将 Muya/Monaco 限制在右侧面板可视区域内 */
.editor-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

/* 加粗 Muya 编辑器滚动条 - 全局样式 */
#muya,
.muya,
.muya-wrapper {
  &::-webkit-scrollbar {
    width: 12px !important;
  }
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05) !important;
    border-radius: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.25) !important;
    border-radius: 6px !important;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.4) !important;
    background-clip: padding-box;
  }
}

/* Dark mode */
.body--dark #muya,
.body--dark .muya,
.body--dark .muya-wrapper {
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05) !important;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.25) !important;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.4) !important;
  }
}

/* 编辑器操作栏 - 贴边隐藏
 * right 偏移：让出 12px 滚动条 + 12px 视觉间距，避免与编辑器最右侧滚动条重叠 */
.editor-action-bar-wrapper {
  position: fixed;
  bottom: 12px;
  right: 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  z-index: 6000;
}

/* 工具栏主体 */
.editor-action-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: fit-content;
  padding: 4px 2px;
  margin-right: 8px;
  background: rgba(240, 240, 240, 0.92);
  border-radius: 10px 0 0 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
  overflow: visible !important;
}

/* macOS Dock 风格的图标悬浮放大效果 */
.editor-action-bar-inner .fab-icon {
  transition: transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.5),
              box-shadow 0.2s ease,
              background-color 0.2s ease;
  transform-origin: center center;
  border-radius: 50%;
  position: relative;
  z-index: 1;
}

/* 默认尺寸 */
.editor-action-bar-inner .fab-icon {
  transform: scale(0.85);
}

/* 悬浮时的放大效果 - 当前按钮 */
.editor-action-bar-inner .fab-icon:hover,
.editor-action-bar-inner .fab-icon.is-near {
  transform: scale(1.25);
  box-shadow: 0 4px 16px rgba(38, 166, 154, 0.35);
  z-index: 10;
}

/* 相邻按钮被挤开的效果 */
.editor-action-bar-inner .fab-icon.is-near-left,
.editor-action-bar-inner .fab-icon.is-near-right {
  transform: scale(1.05);
}

/* 更远的按钮 */
.editor-action-bar-inner .fab-icon.is-far-left,
.editor-action-bar-inner .fab-icon.is-far-right {
  transform: scale(0.9);
}

.editor-action-bar.action-bar--hovered {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
}

.action-bar-drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 20px;
  color: #9e9e9e;
  font-size: 12px;
  cursor: grab;
  margin-bottom: 4px;
}

.action-bar-drag-handle:active,
.action-bar-drag-handle.dragging {
  cursor: grabbing;
}

/* 工具栏滑入/滑出动画 */
.action-bar-slide-enter-active,
.action-bar-slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.action-bar-slide-enter,
.action-bar-slide-leave-to {
  transform: translateX(60px);
  opacity: 0;
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

.body--dark .action-bar-drag-handle {
  color: #757575;
}

.editor-splitter-after {
  min-height: 0;
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
  box-shadow: 0 0 0 1px var(--themeColor30, rgba(64, 158, 255, 0.35));
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
  box-shadow: 0 0 0 1px var(--themeColor30, rgba(64, 158, 255, 0.35));
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
