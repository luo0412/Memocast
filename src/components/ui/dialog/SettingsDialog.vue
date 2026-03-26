<template>
  <q-dialog transition-show='fade' transition-hide='fade' ref='dialog'>
    <q-card class='settings-dialog-card'>
      <q-toolbar class='settings-dialog-toolbar'>
        <q-toolbar-title class='text-body1 text-weight-medium'>
          {{ $t('settings') }}
        </q-toolbar-title>
        <q-btn flat round dense icon='close' size='sm' v-close-popup />
      </q-toolbar>

      <q-card-section class='scroll hide-scrollbar settings-dialog-body'>
        <div class='settings-dialog-layout'>
          <div class='settings-dialog-nav'>
            <q-tabs v-model='tab' vertical dense class='text-teal no-border settings-dialog-tabs'>
              <q-tab
                name='general'
                icon='tune'
                :label="$t('general')"
                class='text-primary'
              />
              <q-tab
                name='editor'
                icon='edit_attributes'
                :label="$t('editor')"
                class='text-amber-10'
              />
              <q-tab
                name='server'
                icon='storage'
                :label="$t('server')"
                class='text-red-7'
              />
              <q-tab
                name='rune'
                icon='star'
                :label="$t('rune')"
                class='text-purple-5'
              />
            </q-tabs>
          </div>
          <q-separator vertical class='settings-dialog-sep' />
          <div class='settings-dialog-panels hide-scrollbar'>
            <q-tab-panels
              v-model='tab'
              animated
              swipeable
              vertical
              transition-prev='jump-up'
              transition-next='jump-up'
            >
              <q-tab-panel name='general' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-primary' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('general') }}</span>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    {{ $t('language') }}
                  </div>
                  <q-select
                    dense
                    options-dense
                    :value='$t(language)'
                    :options='languageOptions'
                    @input='languageChangeHandler'
                  />
                </div>
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    {{ $t('theme') }}
                  </div>
                  <q-select
                    dense
                    options-dense
                    :value='$t(theme)'
                    :options='themeOptions'
                    @input='themeChangeHandler'
                  >
                    <template v-slot:after>
                      <q-btn round dense flat size="sm" icon="contact_support" @click="themeHelpHandler" />
                      <q-btn round dense flat size="sm" icon="refresh" @click="refreshThemeFolderHandler" />
                      <q-btn round dense flat size="sm" icon="open_in_new" @click="openThemeFolderHandler" />
                    </template>
                  </q-select>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
                    <span>{{ $t('noteListDenseMode') }}</span>
                    <q-toggle
                      :value='noteListDenseMode'
                      color='black'
                      @input="
                        v => toggleChanged({ key: 'noteListDenseMode', value: v })
                      "
                    />
                  </div>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row fa-align-center'>
                    <span>{{ $t('openLogFiles') }}</span>
                    <q-btn
                      class='fab-btn'
                      flat
                      round
                      dense
                      size='sm'
                      color='primary'
                      icon='open_in_new'
                      @click='openLogFilesHandler'
                    />
                  </div>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row fa-align-center'>
                    <span>{{ $t('currentVersion', { version }) }}</span>
                    <q-btn
                      class='fab-btn'
                      flat
                      round
                      dense
                      size='sm'
                      color='primary'
                      icon='cached'
                      @click='checkUpdateHandler'
                    />
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name='editor' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-primary' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('editor') }}</span>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
                    <span>{{ $t('markdownOnly') }}</span>
                    <q-toggle
                      :value='markdownOnly'
                      color='primary'
                      @input="
                        v => toggleChanged({ key: 'markdownOnly', value: v })
                      "
                    />
                  </div>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    <span>{{ $t('noteOrder') }}</span>
                    <q-select
                      dense
                      options-dense
                      :value='$t(noteOrderType)'
                      :options='noteOrderOptions'
                      @input='noteOrderChangeHandler'
                    />
                  </div>
                </div>
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    <span>{{ $t('autoSave') }}</span>
                    <q-item dense class='q-px-none'>
                      <q-item-section avatar>
                        <q-icon style="color: var(--themeColor);" name="timer" size="sm" />
                      </q-item-section>
                      <q-item-section>
                        <q-slider
                          style="color: var(--themeColor);"
                          :step="30"
                          :value="autoSaveGap"
                          @input="autoSaveGapChangeHandler"
                          :min="0"
                          :max="240"
                          label
                          :label-value="autoSaveGapLabel"
                        />
                      </q-item-section>
                    </q-item>
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name='server' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-primary' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('server') }}</span>
                </div>
                <q-separator class='q-my-xs' />
                <div>
                  <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
                    <span>{{ $t('imageUploadService') }}</span>
                    <q-select
                      dense
                      options-dense
                      :value='$t(imageUploadService)'
                      :options='imageUploadServiceOptions'
                      @input='imageUploadServiceChangeHandler'
                    >
                    </q-select>
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name='rune' class='q-pa-sm'>
                <div class='row items-center no-wrap q-mb-xs panel-title'>
                  <div class='panel-title-bar bg-purple-5' />
                  <span class='text-subtitle2 text-weight-medium'>{{ $t('runeManagement') }}</span>
                  <q-space />
                  <q-btn
                    dense flat no-caps
                    :label="$t('runeCardAdd')"
                    color='purple-5'
                    icon='add'
                    size='sm'
                    @click='openAddRune'
                  />
                </div>
                <div class='text-caption text-grey-6 q-mb-sm'>
                  <q-icon name='drag_indicator' size='xs' /> {{ $t('runeDragTip') }}
                </div>
                <q-separator class='q-my-xs' />
                <div class='rune-grid'>
                  <div
                    v-for='(rune, index) in localRuneCards'
                    :key='rune.id'
                    draggable='true'
                    class='rune-card-wrapper'
                    @dragstart='onDragStart($event, index)'
                    @dragover.prevent='onDragOver($event, index)'
                    @drop='onDrop($event, index)'
                    @dragend='onDragEnd'
                  >
                    <RuneCard
                      :rune='rune'
                      @edit='openEditRune'
                      @delete='confirmDeleteRune'
                    />
                  </div>
                </div>
                <div v-if='!localRuneCards || localRuneCards.length === 0' class='text-center text-grey q-pa-xl'>
                  <q-icon name='star' size='3rem' />
                  <div class='q-mt-sm'>{{ $t('runeCardAdd') }}</div>
                </div>
              </q-tab-panel>
            </q-tab-panels>
          </div>
        </div>
      </q-card-section>
    </q-card>
    <ImageUploadServiceDialog ref='imageUploadServiceDialog' />
    <UpdateDialog ref='updateDialog' />
    <RuneFormDialog
      ref='runeFormDialog'
      :rune='editingRune'
      @submit='onRuneSubmit'
    />
  </q-dialog>
</template>

<script>
import { createNamespacedHelpers } from 'vuex'
import ImageUploadServiceDialog from './ImageUploadServiceDialog'
import UpdateDialog from 'components/ui/dialog/UpdateDialog'
import RuneCard from 'components/ui/dialog/RuneCard'
import RuneFormDialog from 'components/ui/dialog/RuneFormDialog'
import { i18n } from 'boot/i18n'
import bus from 'components/bus'
import events from 'src/constants/events'
import { version } from '../../../../package.json'
import { checkUpdate, needUpdate, openLogFiles, openThemeFolder, refreshThemeFolder } from 'src/ApiInvoker'
import helper from 'src/utils/helper'

const {
  mapState,
  mapActions
} = createNamespacedHelpers('client')

export default {
  name: 'SettingsDialog',
  components: {
    ImageUploadServiceDialog,
    UpdateDialog,
    RuneCard,
    RuneFormDialog
  },
  data () {
    return {
      tab: 'general',
      imageUploadServiceOptionsPlain: [
        'wizOfficialImageUploadService',
        'picgoServer',
        'none'
      ],
      noteOrderOptionsPlain: [
        'orderByModifiedTime',
        'orderByNoteTitle'
      ],
      version: version,
      checkingNotify: null,
      editingRune: null,
      dragFromIndex: null
    }
  },
  computed: {
    languageOptions: function () {
      return i18n.availableLocales.map(l => i18n.t(l))
    },
    themeOptions: function () {
      return this.themes.map(t => i18n.t(t.name))
    },
    imageUploadServiceOptions: function () {
      return [
        this.$t('wizOfficialImageUploadService'),
        this.$t('picgoServer'),
        this.$t('none')
      ]
    },
    noteOrderOptions: function () {
      return [
        this.$t('orderByModifiedTime'),
        this.$t('orderByNoteTitle')
      ]
    },
    autoSaveGapLabel: function () {
      if (this.autoSaveGap === 0) return this.$t('never')
      return this.autoSaveGap + this.$t('seconds')
    },
    localRuneCards: {
      get () {
        return this.runeCards
      },
      set (val) {
        this.updateStateAndStore({ runeCards: val })
      }
    },
    ...mapState([
      'language',
      'darkMode',
      'noteListDenseMode',
      'markdownOnly',
      'imageUploadService',
      'noteOrderType',
      'theme',
      'themes',
      'autoSaveGap',
      'runeCards'
    ])
  },
  methods: {
    toggle: function () {
      return this.$refs.dialog.toggle()
    },
    languageChangeHandler: function (lan) {
      lan = i18n.availableLocales.find(l => {
        return i18n.t(l) === lan
      })
      this.updateStateAndStore({ language: lan })
      i18n.locale = lan
      this.$q.notify({
        message: this.$t('switchLanguageHint'),
        color: 'primary',
        icon: 'info'
      })
    },
    themeChangeHandler: function (theme) {
      theme = this.themes.find(t => {
        return i18n.t(t.name) === theme
      })
      this.updateStateAndStore({ theme: theme.name })
      this.$q.dark.set(theme.dark)
      this.toggleChanged({ key: 'darkMode', value: theme.dark })
    },
    imageUploadServiceChangeHandler: function (service) {
      const servicePlain = this.imageUploadServiceOptionsPlain.find(
        i => this.$t(i) === service
      )
      this.updateStateAndStore({ imageUploadService: servicePlain })
    },
    noteOrderChangeHandler: function (type) {
      const typePlain = this.noteOrderOptionsPlain.find(
        i => this.$t(i) === type
      )
      this.updateStateAndStore({ noteOrderType: typePlain })
    },
    autoSaveGapChangeHandler: function (value) {
      if (isNaN(value)) return
      this.toggleChanged({ key: 'autoSaveGap', value: value })
    },
    checkUpdateHandler: function () {
      checkUpdate().then(() => {
        this.checkingNotify = this.$q.notify({
          message: this.$t('checking'),
          timeout: 0,
          spinner: true,
          color: 'primary',
          actions: [{
            icon: 'clear',
            color: 'white',
            handler: () => {}
          }]
        })
      })
    },
    openThemeFolderHandler: function () {
      openThemeFolder()
    },
    refreshThemeFolderHandler: async function () {
      const themes = await refreshThemeFolder()
      this.toggleChanged({ key: 'themes', value: themes })
    },
    themeHelpHandler: function () {
      this.$q.electron.shell.openExternal('https://www.tanknee.cn/Memocast/docs/tutorial-development/create-theme')
    },
    updateAvailableHandler: function (info) {
      console.log(info)
      if (this.checkingNotify && this.checkingNotify instanceof Function) {
        this.checkingNotify()
        this.checkingNotify = null
      }
      this.$q.notify({
        caption: this.$t('getNewerVersion', { version: info.version }),
        message: info.releaseNotes,
        html: true,
        color: 'positive',
        icon: 'system_update_alt',
        actions: [
          {
            label: this.$t('update'),
            color: 'white',
            handler: () => {
              if (this.$q.platform.is.mac) {
                window.open('https://github.com/TankNee/Memocast')
              } else {
                needUpdate(true)
                if (this.$refs.updateDialog) {
                  this.$refs.updateDialog.toggle()
                }
              }
            }
          }
        ]
      })
    },
    updateUnavailableHandler: function (info) {
      if (this.checkingNotify && this.checkingNotify instanceof Function) {
        this.checkingNotify()
        this.checkingNotify = null
      }
      // this.$q.notify({
      //   message: this.$t('noNewerVersion'),
      //   color: 'green',
      //   icon: 'check'
      // })
    },
    updateErrorHandler: function (err) {
      console.log(err)
      if (this.checkingNotify && this.checkingNotify instanceof Function) {
        this.checkingNotify()
        this.checkingNotify = null
      }
      if (err && !helper.isNullOrEmpty(err)) {
        this.$q.notify({
          caption: this.$t('updateError'),
          color: 'red-10',
          icon: 'error',
          message: err
        })
      }
    },
    openLogFilesHandler: function () {
      openLogFiles()
    },
    onRuneSortEnd: function () {
      this.updateStateAndStore({ runeCards: this.localRuneCards })
    },
    onDragStart: function (e, index) {
      this.dragFromIndex = index
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', index)
      e.target.closest('.rune-card-wrapper').classList.add('rune-dragging')
    },
    onDragOver: function (e, index) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const wrapper = e.target.closest('.rune-card-wrapper')
      if (wrapper && this.dragFromIndex !== index) {
        document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
        wrapper.classList.add('rune-dragover')
      }
    },
    onDrop: function (e, toIndex) {
      e.preventDefault()
      document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
      const fromIndex = this.dragFromIndex
      if (fromIndex === null || fromIndex === toIndex) return
      const cards = [...this.localRuneCards]
      const [moved] = cards.splice(fromIndex, 1)
      cards.splice(toIndex, 0, moved)
      this.updateStateAndStore({ runeCards: cards })
    },
    onDragEnd: function (e) {
      const wrapper = e.target.closest('.rune-card-wrapper')
      if (wrapper) {
        wrapper.classList.remove('rune-dragging')
      }
      document.querySelectorAll('.rune-card-wrapper').forEach(el => el.classList.remove('rune-dragover'))
      this.dragFromIndex = null
    },
    openEditRune: function (rune) {
      this.editingRune = { ...rune }
      this.$nextTick(() => {
        this.$refs.runeFormDialog.$refs.dialog.show()
      })
    },
    openAddRune: function () {
      this.editingRune = null
      this.$nextTick(() => {
        this.$refs.runeFormDialog.$refs.dialog.show()
      })
    },
    confirmDeleteRune: function (rune) {
      this.$q.dialog({
        title: this.$t('runeCardDelete'),
        message: this.$t('runeCardDeleteConfirm'),
        cancel: true,
        persistent: true
      }).onOk(() => {
        const filtered = this.localRuneCards.filter(r => r.id !== rune.id)
        this.updateStateAndStore({ runeCards: filtered })
      })
    },
    onRuneSubmit: function (data) {
      const cards = [...this.localRuneCards]
      const idx = cards.findIndex(r => r.id === data.id)
      if (idx >= 0) {
        cards.splice(idx, 1, data)
      } else {
        cards.push(data)
      }
      this.updateStateAndStore({ runeCards: cards })
      this.editingRune = null
    },
    ...mapActions([
      'toggleChanged',
      'updateStateAndStore'
    ])
  },
  mounted () {
    bus.$on(events.UPDATE_EVENTS.updateAvailable, this.updateAvailableHandler)
    bus.$on(events.UPDATE_EVENTS.updateNotAvailable, this.updateUnavailableHandler)
    bus.$on(events.UPDATE_EVENTS.updateError, this.updateErrorHandler)
  },
  beforeDestroy () {
    bus.$off(events.UPDATE_EVENTS.updateAvailable)
    bus.$off(events.UPDATE_EVENTS.updateNotAvailable)
    bus.$off(events.UPDATE_EVENTS.updateError)
  }
}
</script>

<style scoped>
.settings-dialog-card {
  height: 70vh;
  min-width: 70vw;
  user-select: none;
}

.settings-dialog-toolbar {
  min-height: 40px;
  padding: 4px 8px;
}

.settings-dialog-body {
  padding-top: 4px;
  padding-bottom: 8px;
}

.settings-dialog-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-dialog-nav {
  flex: 0 0 auto;
  width: 4.75rem;
  min-width: 4.75rem;
  max-width: 4.75rem;
  padding: 2px 0 4px;
}

.settings-dialog-sep {
  flex-shrink: 0;
}

.settings-dialog-panels {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
}

.settings-dialog-tabs {
  width: 100%;
}

.settings-dialog-tabs ::v-deep(.q-tabs__content) {
  padding: 0;
}

.settings-dialog-tabs ::v-deep(.q-tab) {
  min-height: 32px;
  padding: 2px 4px;
}

.settings-dialog-tabs ::v-deep(.q-tab__icon) {
  font-size: 1.15rem;
}

.settings-dialog-tabs ::v-deep(.q-tab__label) {
  font-size: 0.7rem;
  line-height: 1.1;
  margin-top: 1px;
}

.panel-title {
  padding-left: 2px;
}

.panel-title-bar {
  width: 3px;
  min-height: 1rem;
  margin-right: 8px;
  border-radius: 1px;
  flex-shrink: 0;
}

.setting-item {
  margin-top: 0.45rem;
}

.setting-item--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.setting-item--row .q-toggle {
  flex-shrink: 0;
}

.rune-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 4px;
  min-height: 80px;
}

.rune-card-wrapper {
  display: inline-block;
}

.rune-card-wrapper.rune-dragging {
  opacity: 0.4;
  transform: scale(0.95);
}

.rune-card-wrapper.rune-dragover .rune-card {
  box-shadow: 0 0 0 3px #7E57C2;
  transform: translateY(-2px);
}

.rune-ghost {
  opacity: 0.4;
  transform: scale(0.95);
}

.rune-chosen {
  box-shadow: 0 4px 20px rgba(156, 39, 176, 0.4);
}
</style>
