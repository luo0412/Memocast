
<template>
  <div class="full-height column note-list-root">
    <q-pull-to-refresh @refresh="refreshNoteListHandler">
      <q-scroll-area
        :thumb-style="thumbStyle"
        :bar-style="barStyle"
        :class="`exclude-header note-list${$q.dark.isActive ? '-dark' : ''}`"
      >
        <q-list v-if="currentNotes.length > 0">
          <q-item
            clickable
            v-ripple="{ color: '#212121' }"
            v-for="(noteField, index) in currentNotes"
            :key="index"
            :class="`note-item${$q.dark.isActive ? '-dark' : ''} no-padding`"
            :active="activeNote(noteField)"
            :active-class="`active-note-item${$q.dark.isActive ? '-dark' : ''}`"
          >
            <q-item-section>
              <div @contextmenu="(e) => noteItemContextMenuHandler(e, noteField)">
                <NoteItem :data="noteField" :dense="noteListDenseMode"/>
              </div>
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="note-list-empty">
          <a-empty :description="$t('noNotes')" />
        </div>
      </q-scroll-area>
      <q-card
        class="absolute-bottom bg-transparent full-width no-shadow no-padding no-border-radius note-list-bottom text-center"
        v-ripple
        v-if="isLogin"
      >
        <span>{{ category }}</span>
      </q-card>
      <Loading :visible="isCurrentNotesLoading" />
    <CategoryDialog ref='categoryDialog' :note-info='rightClickNoteItem' :label='categoryDialogLabel'
                    :handler='categoryDialogHandler' />
    </q-pull-to-refresh>
  </div>
</template>

<script>
import NoteItem from './ui/NoteItem'
import CategoryDialog from './ui/dialog/CategoryDialog'
import { createNamespacedHelpers } from 'vuex'
import { Loading, QSpinnerGears } from 'quasar'
import LoadingComponent from './ui/Loading'
import helper from '../utils/helper'
import bus from './bus'
import events from 'src/constants/events'
import { showContextMenu as showNoteItemContextMenu } from 'src/contextMenu/noteList'
const { mapGetters: mapServerGetters, mapState: mapServerState, mapActions: mapServerActions } = createNamespacedHelpers('server')
const { mapState: mapClientState, mapActions: mapClientActions } = createNamespacedHelpers('client')
export default {
  name: 'NoteList',
  components: { Loading, NoteItem, CategoryDialog },
  data () {
    return {
      categoryDialogLabel: '',
      categoryDialogHandler: () => {}
    }
  },
  computed: {
    thumbStyle () {
      return {
        background: '#E8ECF1',
        width: '5px',
        opacity: 0.75,
        borderRadius: '10px'
      }
    },

    barStyle () {
      return {
        width: '5px'
      }
    },
    category: function () {
      if (helper.isNullOrEmpty(this.currentCategory)) return ''
      const tagIndex = this.tags.findIndex(
        t => t.tagGuid === this.currentCategory
      )
      if (tagIndex !== -1) {
        return this.tags[tagIndex].name
      } else {
        try {
          if (helper.wizIsPredefinedLocation(this.currentCategory)) return this.$t(this.currentCategory)
          const categoryList = this.currentCategory.split('/')
          return categoryList[categoryList.length - 2]
        } catch (e) {
          return ''
        }
      }
    },
    ...mapServerGetters(['activeNote', 'currentNotes']),
    ...mapServerState(['isCurrentNotesLoading', 'currentCategory', 'isLogin', 'tags', 'currentNote']),
    ...mapClientState(['rightClickCategoryItem', 'rightClickNoteItem', 'noteListDenseMode'])
  },
  methods: {
    deleteCategoryHandler: function () {
      if (helper.isNullOrEmpty(this.rightClickCategoryItem)) return
      this.$q
        .dialog({
          title: this.$t('deleteCategory'),
          ok: this.$t('confirm'),
          cancel: this.$t('cancel')
        })
        .onOk(() => {
          this.deleteCategory(this.rightClickCategoryItem)
        })
    },
    renameCategoryHandler: function () {
      const category = this.rightClickCategoryItem
      if (helper.isNullOrEmpty(category)) return
      const categoryName = helper.getCategoryLeafNameFromPath(category)
      this.$q.dialog({
        title: this.$t('renameCategory'),
        prompt: {
          model: categoryName,
          type: 'text',
          attrs: {
            spellcheck: false
          },
          label: this.$t('categoryName')
        },
        ok: this.$t('confirm'),
        cancel: this.$t('cancel')
      }).onOk(newName => {
        if (newName && newName !== categoryName) {
          this.renameCategory({ category, newName })
        }
      })
    },
    exportCategoryHandler: async function () {
      const categoryToExport = this.rightClickCategoryItem
      if (!categoryToExport) return
      Loading.show({
        spinner: QSpinnerGears,
        message: this.$t('prepareExportData'),
        delay: 400
      })
      const kbGuid = this.$store.state.server.kbGuid
      const notes = await this.getCategoryNotesForExport({ kbGuid, category: categoryToExport })
      Loading.hide()
      this.exportMarkdownFiles(notes, categoryToExport)
    },
    refreshNoteListHandler: async function (done) {
      const tagIndex = this.tags.findIndex(
        t => t.tagGuid === this.currentCategory
      )
      await this.updateCurrentCategory({
        type: tagIndex === -1 ? 'category' : 'tag',
        data: this.currentCategory
      })
      done()
    },
    /** NoteItem Action Following */
    renameNoteHandler: function () {
      this.$q.dialog({
        title: this.$t('renameNote'),
        prompt: {
          model: this.rightClickNoteItem.title,
          type: 'text',
          attrs: {
            spellcheck: false
          },
          label: this.$t('title')
        },
        ok: this.$t('confirm'),
        cancel: this.$t('cancel')
      }).onOk(data => {
        const info = JSON.parse(JSON.stringify(this.rightClickNoteItem))
        info.title = data
        info.infoModified = new Date().getTime()
        this.updateNoteInfo(info)
      })
    },
    deleteNoteHandler: function () {
      this.$q.dialog({
        title: this.$t('deleteNote'),
        ok: this.$t('confirm'),
        cancel: this.$t('cancel')
      }).onOk(() => {
        this.deleteNote(this.rightClickNoteItem)
      })
    },
    copyNoteHandler: function () {
      this.categoryDialogLabel = 'copyToAnotherCategory'
      this.categoryDialogHandler = this.copyNote
      this.$refs.categoryDialog.toggle()
    },
    moveNoteHandler: function () {
      this.categoryDialogLabel = 'moveToAnotherCategory'
      this.categoryDialogHandler = this.moveNote
      this.$refs.categoryDialog.toggle()
    },
    exportNoteAsMdHandler: function (current = false) {
      this.exportMarkdownFile({ noteField: this.rightClickNoteItem, current })
    },
    exportNoteAsPngHandler: function (current = false) {
      this.exportPng({ noteField: this.rightClickNoteItem, current })
    },
    noteItemContextMenuHandler: function (e, noteField) {
      const isCurrentNote = noteField.docGuid === this.currentNote?.info?.docGuid
      this.setRightClickNoteItem(noteField)
      showNoteItemContextMenu(e, isCurrentNote)
    },
    ...mapServerActions([
      'deleteCategory',
      'renameCategory',
      'updateCurrentCategory',
      'exportMarkdownFiles',
      'updateNoteInfo',
      'deleteNote',
      'moveNote',
      'copyNote',
      'exportMarkdownFile',
      'exportPng',
      'getCategoryNotesForExport'
    ]),
    ...mapClientActions(['setRightClickNoteItem'])
  },
  mounted () {
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.exportCategory.markdown, this.exportCategoryHandler)
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.delete, this.deleteCategoryHandler)
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.renameCategory, this.renameCategoryHandler)
    bus.$on(events.NOTE_ITEM_CONTEXT_MENU.rename, this.renameNoteHandler)
    bus.$on(events.NOTE_ITEM_CONTEXT_MENU.copy, this.copyNoteHandler)
    bus.$on(events.NOTE_ITEM_CONTEXT_MENU.move, this.moveNoteHandler)
    bus.$on(events.NOTE_SHORTCUT_CALL.exportNoteAsMarkdown, this.exportNoteAsMdHandler)
    bus.$on(events.NOTE_SHORTCUT_CALL.exportNoteAsPNG, this.exportNoteAsPngHandler)
    bus.$on(events.NOTE_ITEM_CONTEXT_MENU.delete, this.deleteNoteHandler)
  }
}
</script>

<style scoped>
.note-list-root {
  min-height: 0;
  position: relative;
}

.note-list-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
}

.note-list-bottom {
  max-height: 3vh;
  padding: 2px !important;
  color: #9b9b9b;
  user-select: none;
  font-size: 11px;
  font-weight: bold;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif, 黑体;
}

/* 减少笔记项之间的间距 */
.note-item,
.note-item-dark {
  min-height: 0 !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

/* 移除分割线（如果有的话） */
.note-item::after,
.note-item-dark::after {
  display: none !important;
}
</style>
