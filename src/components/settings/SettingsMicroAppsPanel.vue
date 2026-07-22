<template>
  <div class="settings-micro-apps-panel">
    <SettingsSectionContent :title="$t('microApps')" accent-color="green-7">
      <q-banner rounded dense class="bg-green-1 text-green-10 q-mb-md">
        <template v-slot:avatar>
          <q-icon name="info_outline" color="green-7" />
        </template>
        {{ $t('microAppsHint') }}
      </q-banner>

      <div class="q-mb-md row q-gutter-sm items-center">
        <q-btn outline color="green-7" icon="add" :label="$t('microAppsAdd')" @click="openAdd" />
        <q-space />
        <q-btn unelevated color="green-7" icon="save" :label="$t('save')" :loading="saving" @click="saveAll" />
      </div>

      <div v-if="apps.length === 0" class="text-center q-pa-md text-grey-6">
        <q-icon name="apps" size="2rem" />
        <div class="q-mt-sm">{{ $t('noData') }}</div>
      </div>

      <div v-else class="micro-apps-list">
        <div
          v-for="app in apps"
          :key="app.id"
          class="micro-app-row q-py-sm q-px-sm q-mb-xs rounded-borders"
        >
          <div class="micro-app-row__main">
            <i
              v-if="isElementIcon(app.icon)"
              :class="[app.icon, 'micro-app-row__icon']"
            />
            <q-icon v-else :name="app.icon || 'apps'" class="micro-app-row__icon" size="20px" />

            <div class="micro-app-row__name">
              <span :class="{ 'text-grey-5': !app.enabled }">{{ app.name || app.id }}</span>
              <q-badge v-if="app.isDefault" color="green-7" :label="$t('microAppsDefault')" class="q-ml-sm" />
              <q-icon
                v-if="!app.enabled"
                name="block"
                size="14px"
                color="grey-5"
                class="q-ml-sm"
              >
                <q-tooltip>{{ $t('microAppsDisabled') }}</q-tooltip>
              </q-icon>
            </div>

            <div class="micro-app-row__url text-caption text-grey-7 ellipsis">
              <q-icon
                :name="isDevEnv() ? 'code' : 'cloud'"
                size="14px"
                class="q-mr-xs"
              />
              {{ isDevEnv() ? (app.devUrl || app.url) : (app.url || app.devUrl) }}
            </div>
          </div>

          <div class="micro-app-row__actions">
            <q-btn
              flat
              dense
              round
              icon="edit"
              color="green-7"
              size="sm"
              @click="openEdit(app)"
            >
              <q-tooltip>{{ $t('edit') }}</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              round
              icon="delete"
              color="negative"
              size="sm"
              @click="confirmDelete(app)"
            >
              <q-tooltip>{{ $t('delete') }}</q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>
    </SettingsSectionContent>

    <microAppEditDialog
      v-model="editDialogVisible"
      :source="editingApp"
      @submit="onEditSubmit"
    />
  </div>
</template>

<script>
import DatabaseClient from 'src/utils/DatabaseClient'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import bus from 'components/common/bus'
import {
  buildDefaultMicroApps,
  diffMicroAppsForReload,
  isDevEnv,
  normalizeMicroApps
} from 'components/microApp/microAppService'
import microAppEditDialog from 'components/microApp/microAppEditDialog.vue'

function generateId () {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function makeBlankApp () {
  return {
    id: generateId(),
    name: '',
    icon: 'el-icon-chat-dot-round',
    url: '',
    devUrl: '',
    isDefault: false,
    enabled: true
  }
}

export default {
  name: 'SettingsMicroAppsPanel',
  components: {
    SettingsSectionContent,
    microAppEditDialog
  },
  data () {
    return {
      apps: [],
      lastSavedApps: [],
      saving: false,
      loaded: false,
      editDialogVisible: false,
      editingApp: null
    }
  },
  methods: {
    isDevEnv,
    isElementIcon (icon) {
      return typeof icon === 'string' && icon.startsWith('el-icon-')
    },
    async load () {
      if (this.loaded) return
      const stored = await DatabaseClient.microApps.getAll()
      let list = normalizeMicroApps(stored)
      if (!list.length) {
        list = normalizeMicroApps(buildDefaultMicroApps())
      }
      this.apps = list
      this.lastSavedApps = list
      this.loaded = true
    },
    openAdd () {
      this.editingApp = null
      this.editDialogVisible = true
    },
    openEdit (app) {
      // 把现有记录克隆一份给弹框，编辑完成再回写到 this.apps
      this.editingApp = { ...app }
      this.editDialogVisible = true
    },
    onEditSubmit (form) {
      const idx = this.apps.findIndex(a => a.id === form.id)
      if (idx === -1) {
        // 新增
        this.apps = [...this.apps, { ...form }]
      } else {
        // 更新
        const newList = this.apps.slice()
        newList.splice(idx, 1, { ...form })
        this.apps = newList
      }
      // isDefault 唯一性
      if (form.isDefault) {
        this.apps = this.apps.map(a => ({ ...a, isDefault: a.id === form.id }))
      }
      this.editDialogVisible = false
      this.editingApp = null
    },
    confirmDelete (app) {
      this.$q.dialog({
        title: this.$t('microAppsDelete'),
        message: this.$t('microAppsDeleteConfirm', { name: app.name || app.id }),
        cancel: { label: this.$t('cancel'), flat: true },
        ok: { label: this.$t('confirm'), color: 'negative' },
        persistent: true
      }).onOk(async () => {
        const next = this.apps.filter(a => a.id !== app.id)
        // 删完保存
        const normalized = normalizeMicroApps(next)
        if (!normalized.length) {
          this.$q.notify({ message: this.$t('microAppsEmptySave'), type: 'warning', position: 'top' })
          return
        }
        this.saving = true
        try {
          const ok = await DatabaseClient.microApps.saveAll(normalized)
          if (ok) {
            const dirtyIds = diffMicroAppsForReload(this.lastSavedApps, normalized)
            this.apps = normalized
            this.lastSavedApps = normalized
            bus.$emit('microAppsChanged', { list: normalized, dirtyIds })
            this.$q.notify({
              message: this.$t('microAppsSaved'),
              type: 'positive',
              position: 'top',
              timeout: 1200
            })
          } else {
            this.$q.notify({ message: this.$t('saveFailed'), type: 'negative', position: 'top' })
          }
        } catch (err) {
          console.error('[Settings] deleteMicroApp error:', err)
          this.$q.notify({ message: this.$t('saveFailed'), type: 'negative', position: 'top' })
        } finally {
          this.saving = false
        }
      })
    },
    async saveAll () {
      const normalized = normalizeMicroApps(this.apps)
      if (!normalized.length) {
        this.$q.notify({ message: this.$t('microAppsEmptySave'), type: 'warning', position: 'top' })
        return
      }
      this.saving = true
      try {
        const ok = await DatabaseClient.microApps.saveAll(normalized)
        if (ok) {
          // 计算本次落库相对上次的差异，通知 chat 弹框销毁已被改/删的子应用
          const dirtyIds = diffMicroAppsForReload(this.lastSavedApps, normalized)
          this.apps = normalized
          this.lastSavedApps = normalized
          bus.$emit('microAppsChanged', { list: normalized, dirtyIds })
          this.$q.notify({
            message: this.$t('microAppsSaved'),
            type: 'positive',
            position: 'top',
            timeout: 1200
          })
        } else {
          this.$q.notify({ message: this.$t('saveFailed'), type: 'negative', position: 'top' })
        }
      } catch (err) {
        console.error('[Settings] saveMicroApps error:', err)
        this.$q.notify({ message: this.$t('saveFailed'), type: 'negative', position: 'top' })
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style scoped>
.micro-apps-list {
  /* 内容自然流出 */
}

.micro-app-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.micro-app-row__main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.micro-app-row__icon {
  font-size: 18px;
  color: var(--iconColor, #6b7280);
  flex-shrink: 0;
}

.micro-app-row__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--editorColor, #333);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  max-width: 30%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.micro-app-row__url {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.micro-app-row__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.body--dark .micro-app-row {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.body--dark .micro-app-row__name {
  color: var(--editorColor, #ddd);
}
</style>
