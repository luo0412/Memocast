<template>
  <div class='settings-general-panel-layout'>
    <CategoryTabs
      v-model='subTab'
      :tabs='subTabOptions'
      color-theme='red'
    />
    <q-separator vertical class='settings-dialog-sep' />
    <div class='settings-general-panel'>
      <!-- 语言 -->
      <SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Language" :title="$t('generalLanguage')" accent-color='red-7'>
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
            {{ $t('language') }}
          </div>
          <q-select
            dense options-dense
            :value='$t(language)'
            :options='languageOptions'
            @input='languageChangeHandler'
          />
        </div>
      </SettingsSectionContent>

      <!-- 主题 -->
      <SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Theme" :title="$t('generalTheme')" accent-color='red-7'>
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
            {{ $t('theme') }}
          </div>
          <q-select
            dense options-dense
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
      </SettingsSectionContent>

      <!-- 日志 -->
      <SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Log" :title="$t('generalLog')" accent-color='red-7'>
        <div class='setting-item--row fa-align-center'>
          <span>{{ $t('openLogFiles') }}</span>
          <q-btn
            class='fab-btn' flat round dense size='sm'
            color='red-7' icon='open_in_new'
            @click='$emit("open-log-files")'
          />
        </div>
      </SettingsSectionContent>

      <!-- 数据库 -->
      <SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Database" :title="$t('generalDatabase')" accent-color='red-7'>
        <div class='setting-item--row fa-align-center'>
          <span>{{ $t('openSqliteFile') }}</span>
          <q-btn
            class='fab-btn' flat round dense size='sm'
            color='red-7' icon='open_in_new'
            @click='$emit("open-sqlite-file")'
          />
        </div>
        <q-separator class='q-my-md' />
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
            <span>{{ $t('resetSqlite') }}</span>
            <q-btn
              class='fab-btn reset-sqlite-btn'
              flat no-caps color='negative'
              icon='delete_forever'
              :label="$t('resetSqlite')"
              @click='$emit("reset-sqlite")'
            />
          </div>
          <div class='text-caption text-grey-6'>
            {{ $t('resetSqliteHint') }}
          </div>
        </div>
        <q-separator class='q-my-md' />
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
            <span>{{ $t('resetRunes') }}</span>
            <q-btn
              class='fab-btn'
              flat no-caps color='purple-7'
              icon='auto_fix_high'
              :label="$t('resetRunes')"
              @click='$emit("reset-runes")'
            />
          </div>
          <div class='text-caption text-grey-6'>
            {{ $t('resetRunesHint') }}
          </div>
        </div>
        <div class='q-mt-md'>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item setting-item--row'>
            <span>{{ $t('resetEchoes') }}</span>
            <q-btn
              class='fab-btn'
              flat no-caps color='cyan-7'
              icon='graphic_eq'
              :label="$t('resetEchoes')"
              @click='$emit("reset-echoes")'
            />
          </div>
          <div class='text-caption text-grey-6'>
            {{ $t('resetEchoesHint') }}
          </div>
        </div>
      </SettingsSectionContent>

      <!-- 版本 -->
      <SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Version" :title="$t('generalVersion')" accent-color='red-7'>
        <div class='setting-item--row fa-align-center'>
          <span>{{ $t('currentVersion', { version }) }}</span>
          <q-btn
            class='fab-btn' flat round dense size='sm'
            color='red-7' icon='cached'
            @click='$emit("check-update")'
          />
        </div>
      </SettingsSectionContent>
    </div>
  </div>
</template>

<script>
import CategoryTabs from 'components/category/CategoryTabs'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import { i18n, updateDialogDefaults } from 'boot/i18n'
import { openThemeFolder, refreshThemeFolder } from 'src/ApiInvoker'

export default {
  name: 'SettingsGeneralPanel',
  components: {
    CategoryTabs,
    SettingsSectionContent
  },
  props: {
    language: {
      type: String,
      required: true
    },
    theme: {
      type: String,
      required: true
    },
    themes: {
      type: Array,
      required: true
    },
    version: {
      type: String,
      required: true
    }
  },
  data () {
    return {
      subTab: this.$enums.GeneralSubEnum.Language
    }
  },
  computed: {
    languageOptions: function () {
      return i18n.availableLocales.map(l => i18n.t(l))
    },
    themeOptions: function () {
      return this.themes.map(t => i18n.t(t.name))
    },
    subTabOptions () {
      return this.$enums.GeneralSubEnum.items.map(c => ({
        value: c.value,
        label: c.label,
        icon: c.icon
      }))
    }
  },
  methods: {
    languageChangeHandler: function (lan) {
      lan = i18n.availableLocales.find(l => {
        return i18n.t(l) === lan
      })
      this.$emit('update-language', lan)
      i18n.locale = lan
      updateDialogDefaults()
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
      this.$emit('update-theme', theme.name)
      this.$q.dark.set(theme.dark)
      this.$emit('update-dark-mode', theme.dark)
    },
    themeHelpHandler: function () {
      this.$q.electron.shell.openExternal('https://www.tanknee.cn/Memocast/docs/tutorial-development/create-theme')
    },
    openThemeFolderHandler: function () {
      openThemeFolder()
    },
    refreshThemeFolderHandler: async function () {
      const themes = await refreshThemeFolder()
      this.$emit('update-themes', themes)
    }
  }
}
</script>

<style scoped>
.settings-general-panel-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-general-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 0 6px 4px 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.45) transparent;
}

.settings-general-panel::-webkit-scrollbar {
  width: 6px;
}

.settings-general-panel::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.settings-general-panel::-webkit-scrollbar-track {
  background: transparent;
}

.settings-dialog-sep {
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
</style>
