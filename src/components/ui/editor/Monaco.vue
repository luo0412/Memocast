<template>
  <div class='monaco-root flex justify-center full-width' style="height: calc(100vh - 45px);">
    <div
      id='monaco'
      class='full-height full-width'
      v-show='!isCurrentNoteLoading && dataLoaded'
      v-close-popup
    ></div>
  </div>
</template>

<script>
import * as monaco from 'monaco-editor'
import { createNamespacedHelpers } from 'vuex'
import debugLogger from 'src/utils/debugLogger'
import helper from 'src/utils/helper'
import bus from 'components/bus'
import events from 'src/constants/events'

const {
  mapGetters: mapServerGetters,
  mapState: mapServerState,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')

const { mapState: mapClientState } = createNamespacedHelpers('client')
export default {
  name: 'Monaco',
  props: {
    data: {
      type: Object,
      default: () => ({
        markdown: '',
        cursor: {
          lineNumber: 0,
          column: 0
        }
      })
    },
    active: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      contentEditor: {}
    }
  },
  computed: {
    dataLoaded: function () {
      return !helper.isNullOrEmpty(this.currentNote)
    },
    ...mapServerState(['isCurrentNoteLoading', 'contentsList']),
    ...mapServerGetters(['currentNote', 'uploadImageUrl', 'currentNoteResources', 'currentNoteResourceUrl']),
    ...mapClientState(['darkMode'])
  },
  methods: {
    initMonaco: function () {
      monaco.editor.defineTheme('Memocast-Dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#34383e',
          'editorCursor.foreground': '#FFCC00'
        }
      })
      monaco.editor.defineTheme('Memocast-Light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#ffffff',
          'editorCursor.foreground': '#FFCC00'
        }
      })
      this.contentEditor = monaco.editor.create(document.getElementById('monaco'), {
        value: this.data.markdown,
        language: 'markdown',
        automaticLayout: true,
        theme: this.darkMode ? 'Memocast-Dark' : 'Memocast-Light',
        fontSize: 17,
        scrollBeyondLastLine: false,
        fontLigatures: true,
        fontFamily: 'JetBrains Mono, Fira Code, Monaco, PingFang SC, Hiragino Sans GB, 微软雅黑, Arial, sans-serif, Microsoft YaHei',
        accessibilitySupport: 'on',
        // Ensure Monaco uses the correct clipboard operations in Electron
        automaticClipboardScrollMode: 'toCursor',
        multiCursorPaste: 'all'
      })

      // Track note change state via content change (replaces onKeyDown)
      this.contentEditor.onDidChangeModelContent(() => {
        if (!this.active) return
        const curData = this.contentEditor.getValue()
        if (curData !== this.currentNote) {
          this.updateNoteState('changed')
        } else {
          this.updateNoteState('default')
        }
      })

      // Register custom shortcuts
      this.contentEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.US_COMMA, () => bus.$emit(events.VIEW_SHORTCUT_CALL.switchView, 'switchView'))
      this.contentEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.US_DOT, () => bus.$emit(events.VIEW_SHORTCUT_CALL.sourceMode, 'sourceMode'))
      this.contentEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S, this.saveHandler)

      // Override Monaco's built-in clipboard to use Electron clipboard
      // This ensures copy/paste works correctly in Electron environment
      const self = this
      const monacoContainer = document.getElementById('monaco')

      // Use Monaco's built-in clipboard service override for better Electron integration
      if (window.__electronClipboard) {
        // Override copy command
        this.contentEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {
          const selection = self.contentEditor.getSelection()
          const selectedText = self.contentEditor.getModel().getValueInRange(selection)
          if (selectedText) {
            window.__electronClipboard.writeText(selectedText)
            // Let Monaco handle the visual selection update
          }
        })

        // Override paste command
        this.contentEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
          const text = window.__electronClipboard.readText()
          if (text) {
            const selection = self.contentEditor.getSelection()
            self.contentEditor.executeEdits('paste', [{
              range: selection,
              text: text,
              forceMoveMarkers: true
            }])
          }
        })

        // Override cut command
        this.contentEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => {
          const selection = self.contentEditor.getSelection()
          const selectedText = self.contentEditor.getModel().getValueInRange(selection)
          if (selectedText) {
            window.__electronClipboard.writeText(selectedText)
            self.contentEditor.executeEdits('cut', [{
              range: selection,
              text: '',
              forceMoveMarkers: true
            }])
          }
        })
      }

      // Fallback: intercept events at container level for text operations
      monacoContainer.addEventListener('paste', (e) => {
        if (!window.__electronClipboard) {
          // Use browser clipboard API as fallback
          navigator.clipboard.readText().then(text => {
            if (text) {
              const selection = self.contentEditor.getSelection()
              self.contentEditor.executeEdits('paste', [{
                range: selection,
                text: text,
                forceMoveMarkers: true
              }])
            }
          }).catch(() => {})
        }
      }, false)

      // Register copyAsMarkdown, copyAsHtml, pasteAsPlainText actions consumed by the app
      this.contentEditor.addAction({
        id: 'copyAsMarkdown',
        label: 'Copy As Markdown',
        keybindings: [],
        run: () => bus.$emit(events.EDIT_SHORTCUT_CALL.copyAsMarkdown, 'copyAsMarkdown')
      })
      this.contentEditor.addAction({
        id: 'copyAsHtml',
        label: 'Copy As HTML',
        keybindings: [],
        run: () => bus.$emit(events.EDIT_SHORTCUT_CALL.copyAsHtml, 'copyAsHtml')
      })
      this.contentEditor.addAction({
        id: 'pasteAsPlainText',
        label: 'Paste As Plain Text',
        keybindings: [],
        run: () => bus.$emit(events.EDIT_SHORTCUT_CALL.pasteAsPlainText, 'pasteAsPlainText')
      })
    },
    editCopyPasteHandler: function (type) {
      if (!this.active || !this.contentEditor) return
      const editor = this.contentEditor

      if (type === 'copyAsMarkdown') {
        // Copy selected text to clipboard as plain text
        const selection = editor.getSelection()
        const selectedText = editor.getModel().getValueInRange(selection)
        if (window.__electronClipboard) {
          window.__electronClipboard.writeText(selectedText)
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(selectedText)
        }
      } else if (type === 'copyAsHtml') {
        const selection = editor.getSelection()
        const selectedText = editor.getModel().getValueInRange(selection)
        const html = `<pre>${selectedText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
        if (window.__electronClipboard) {
          window.__electronClipboard.writeHTML(html)
          window.__electronClipboard.writeText(selectedText)
        }
      } else if (type === 'pasteAsPlainText') {
        // Read plain text from Electron clipboard and insert directly
        const text = window.__electronClipboard && window.__electronClipboard.readText()
        if (text !== undefined) {
          const selection = editor.getSelection()
          editor.executeEdits('pasteAsPlainText', [{
            range: selection,
            text: text,
            forceMoveMarkers: true
          }])
        }
      } else if (type === 'undo') {
        editor.trigger('source', 'undo')
      } else if (type === 'redo') {
        editor.trigger('source', 'redo')
      }
    },
    saveHandler: function () {
      if (this.active && this.contentEditor) {
        this.updateNote(this.contentEditor.getValue())
      }
    },
    getValue: function () {
      return this.contentEditor?.getValue()
    },
    getCursorPosition: function () {
      return this.contentEditor?.getPosition()
    },
    setCursorPosition: function (position) {
      if (this.contentEditor) {
        this.contentEditor.setPosition(position)
        this.contentEditor.revealPositionInCenter(position, 0)
      }
    },
    getWordCount: function (markdown) {
      return this.contentEditor.getWordCount(markdown)
    },
    ...mapServerActions(['updateNote', 'updateNoteState'])
  },
  mounted () {
    this.initMonaco()
    bus.$on(events.EDIT_SHORTCUT_CALL.save, this.saveHandler)
    bus.$on(events.EDIT_SHORTCUT_CALL.copyAsMarkdown, this.editCopyPasteHandler)
    bus.$on(events.EDIT_SHORTCUT_CALL.copyAsHtml, this.editCopyPasteHandler)
    bus.$on(events.EDIT_SHORTCUT_CALL.pasteAsPlainText, this.editCopyPasteHandler)
    bus.$on(events.EDIT_SHORTCUT_CALL.undo, this.editCopyPasteHandler)
    bus.$on(events.EDIT_SHORTCUT_CALL.redo, this.editCopyPasteHandler)
  },
  beforeDestroy () {
    bus.$off(events.EDIT_SHORTCUT_CALL.save, this.saveHandler)
    bus.$off(events.EDIT_SHORTCUT_CALL.copyAsMarkdown, this.editCopyPasteHandler)
    bus.$off(events.EDIT_SHORTCUT_CALL.copyAsHtml, this.editCopyPasteHandler)
    bus.$off(events.EDIT_SHORTCUT_CALL.pasteAsPlainText, this.editCopyPasteHandler)
    bus.$off(events.EDIT_SHORTCUT_CALL.undo, this.editCopyPasteHandler)
    bus.$off(events.EDIT_SHORTCUT_CALL.redo, this.editCopyPasteHandler)
    if (this.contentEditor) {
      this.contentEditor.dispose()
    }
  },
  watch: {
    currentNote: function (currentData) {
      try {
        this.contentEditor.setValue(currentData)
      } catch (e) {
        if (e.message.indexOf('Md2V') !== -1) return
        debugLogger.Error(e.message)
      }
    },
    darkMode: function (darkMode) {
      const currentTheme = darkMode ? 'Memocast-Dark' : 'Memocast-Light'
      monaco.editor.setTheme(currentTheme)
    },
    data: function ({ markdown, cursor }) {
      this.contentEditor.setValue(markdown)
      this.setCursorPosition(cursor)
      this.contentEditor.focus()
    }
  }
}
</script>

<style scoped>
.monaco-root {
  min-height: 0;
  min-width: 0;
}
</style>
