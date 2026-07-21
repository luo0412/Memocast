<template>
  <div class='settings-server-panel-layout'>
    <CategoryTabs
      v-model='subTab'
      :tabs='subTabOptions'
      color-theme='positive'
    />
    <q-separator vertical class='settings-dialog-sep' />
    <div class='settings-server-panel'>
      <!-- 笔记同步 -->
      <SettingsSectionContent v-if='subTab === "sync"' :title="$t('cloudSync')" accent-color='green-7'>
        <!-- 同步方式选择 -->
        <div class='cloud-sync-provider q-mb-md'>
          <div class='text-body2 text-weight-medium q-mb-xs'>{{ $t('cloudSyncProvider') }}</div>
          <div class='text-caption text-grey-6 q-mb-sm'>{{ $t('cloudSyncProviderHint') }}</div>
          <q-option-group
            :value='cloudSyncProvider'
            :options='cloudSyncProviderOptionsResolved'
            color='green-7'
            type='radio' inline
            @input='handleCloudSyncProviderChange'
          />
        </div>
        <q-separator class='q-my-sm' />

        <!-- 未登录状态 -->
        <div v-if='!isLoggedIn' class='text-center q-pa-lg'>
          <q-icon name='cloud_off' size='3rem' color='grey-5' />
          <div class='text-h6 q-mt-sm text-grey-7'>{{ $t('cloudSyncNotLoggedIn') }}</div>
          <div class='text-caption text-grey-5 q-mt-xs'>{{ $t('cloudSyncNotLoggedInHint') }}</div>
          <q-btn class='q-mt-md' color='green-7' :label="$t('cloudSyncLogin')" icon='login' unelevated @click='$emit("open-login-dialog")' />
        </div>

        <!-- 已登录状态 -->
        <div v-else>
          <div class='cloud-sync-summary q-mb-md'>
            <div class='cloud-sync-summary__header row items-start justify-between no-wrap q-col-gutter-md'>
              <div class='col'>
                <div class='text-body2 text-weight-medium'>{{ accountInfo.displayName || accountInfo.nickname || accountInfo.username || accountInfo.email || $t('cloudSync') }}</div>
                <div class='text-caption text-grey-6 q-mt-xs'>{{ lastSyncTimeFormatted }}</div>
              </div>
              <q-btn flat dense no-caps color='grey-7' icon='logout' :label="$t('cloudSyncLogout')" @click='$emit("confirm-logout")' />
            </div>
            <div class='row q-col-gutter-sm q-mt-sm'>
              <div class='col-4'><div class='sync-stat-card'><div class='text-caption text-grey-6'>{{ $t('cloudSyncPending') }}</div><div class='text-subtitle1 text-weight-bold text-green-7'>{{ syncStats.pending || 0 }}</div></div></div>
              <div class='col-4'><div class='sync-stat-card'><div class='text-caption text-grey-6'>{{ $t('syncing') }}</div><div class='text-subtitle1 text-weight-bold'>{{ syncStatusText }}</div></div></div>
              <div class='col-4'><div class='sync-stat-card'><div class='text-caption text-grey-6'>{{ $t('cloudSync') }}</div><div class='text-subtitle1 text-weight-bold'>{{ syncStats.synced || 0 }}</div></div></div>
            </div>
            <div v-if='syncError' class='text-caption text-negative q-mt-sm'>{{ syncError }}</div>
            <div class='row q-gutter-sm q-mt-md'>
              <q-btn unelevated color='green-7' icon='cloud_upload' :label="$t('cloudSyncSyncPushOnly')" :loading='isSyncing' @click='$emit("do-push-only")' />
              <q-btn outline color='green-7' icon='cloud_download' :label="$t('cloudSyncSyncPullOnly')" :loading='isSyncing' @click='$emit("do-pull-only")' />
            </div>
          </div>
        </div>
      </SettingsSectionContent>

      <!-- 图片上传 -->
      <SettingsSectionContent v-if='subTab === "image"' :title="$t('cloudImage')" accent-color='green-7'>
        <div>
          <div class='text-body2 text-weight-medium q-mb-xs setting-item'>
            <span>{{ $t('imageUploadService') }}</span>
            <q-select
              dense options-dense
              :value='$t(imageUploadService)'
              :options='imageUploadServiceOptions'
              @input='imageUploadServiceChangeHandler'
            />
          </div>
        </div>
      </SettingsSectionContent>

      <!-- CDN 依赖 -->
      <SettingsSectionContent v-if='subTab === "cdn"' :title="$t('cdnDepsTitle')" accent-color='green-7'>
        <q-banner rounded dense class='bg-green-1 text-green-10 q-mb-md'>
          <template v-slot:avatar>
            <q-icon name='info_outline' color='green-7' />
          </template>
          {{ $t('cdnDepsHint') }}
        </q-banner>
        <!-- 操作按钮 -->
        <div class='q-mb-md row q-gutter-sm'>
          <q-btn outline color='green-7' icon='add' :label="$t('cdnDepsAdd')" @click='addCdnDep' />
          <q-btn unelevated color='green-7' icon='save' :label="$t('cdnDepsSave')" :loading='cdnDepsSaving' @click='saveCdnDeps' />
        </div>
        <!-- CDN 依赖列表 -->
        <div v-if='cdnDeps.length === 0' class='text-center q-pa-md text-grey-6'>
          <q-icon name='link_off' size='2rem' />
          <div class='q-mt-sm'>{{ $t('noData') }}</div>
        </div>
        <div v-else class='cdn-deps-list'>
          <div v-for='dep in cdnDeps' :key='dep.id' class='cdn-dep-item q-pa-sm q-mb-xs rounded-borders'>
            <div class='row items-start q-col-gutter-sm no-wrap'>
              <div class='col-3'>
                <q-input dense v-model='dep.name' :label="$t('cdnDepsName')" :placeholder="$t('cdnDepsNamePlaceholder')" />
              </div>
              <div class='col-3'>
                <q-input dense v-model='dep.url' :label="$t('cdnDepsUrl')" :placeholder="$t('cdnDepsUrlPlaceholder')" />
              </div>
              <div class='col-2'>
                <div class='text-caption text-grey-6 q-mb-xs'>{{ $t('cdnDepsEnabled') }}</div>
                <q-toggle dense v-model='dep.enabled' color='green-7' />
              </div>
              <div class='col-3'>
                <div class='text-caption text-grey-6 q-mb-xs'>{{ $t('cdnDepsApplyToBlog') }}</div>
                <q-checkbox dense v-model='dep.applyToBlog' color='green-7' />
              </div>
              <div class='col-1 text-right'>
                <q-btn v-if='!dep.isBuiltIn' flat dense round icon='delete' color='negative' size='sm' @click='deleteCdnDep(dep.id)' />
                <q-icon v-else name='lock' color='grey-5' size='sm'>
                  <q-tooltip>{{ $t('cdnDepsBuiltIn') }}</q-tooltip>
                </q-icon>
              </div>
            </div>
          </div>
        </div>
      </SettingsSectionContent>
    </div>
  </div>
</template>

<script>
import CategoryTabs from 'components/category/CategoryTabs'
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import SessionStorageService from 'src/services/SessionStorageService'
import CloudSyncService from 'src/services/CloudSyncService'
import DatabaseClient from 'src/utils/DatabaseClient'
import bus from 'components/common/bus'

export default {
  name: 'SettingsServerPanel',
  components: {
    CategoryTabs,
    SettingsSectionContent
  },
  props: {
    cloudSyncProvider: {
      type: String,
      required: true
    },
    syncStatus: {
      type: Object,
      required: true
    },
    imageUploadService: {
      type: String,
      required: true
    },
    cdnDeps: {
      type: Array,
      required: true
    }
  },
  data () {
    return {
      subTab: 'sync',
      cloudSyncLoginState: {
        isLoggedIn: SessionStorageService.isLoggedIn(),
        accountInfo: SessionStorageService.getAccountInfo()
      },
      syncStats: { total: 0, synced: 0, pending: 0 },
      lastSyncTimeDisplay: null,
      isSyncing: false,
      syncError: null,
      cdnDepsSaving: false,
      cloudSyncProviderOptions: [
        { label: 'cloudSyncProviderWizNote', labelKey: true, value: 'wiznote' },
        { label: 'cloudSyncProviderCustomFn', labelKey: true, value: 'customFn' }
      ],
      imageUploadServiceOptionsPlain: [
        'wizOfficialImageUploadService',
        'picgoServer',
        'none'
      ]
    }
  },
  computed: {
    isLoggedIn () {
      return this.cloudSyncLoginState.isLoggedIn
    },
    accountInfo () {
      return this.cloudSyncLoginState.accountInfo || {}
    },
    cloudSyncProviderOptionsResolved () {
      return this.cloudSyncProviderOptions.map(opt => ({
        ...opt,
        label: opt.labelKey ? this.$t(opt.label) : opt.label
      }))
    },
    imageUploadServiceOptions: function () {
      return [
        this.$t('wizOfficialImageUploadService'),
        this.$t('picgoServer'),
        this.$t('none')
      ]
    },
    lastSyncTimeFormatted () {
      if (!this.syncStatus?.lastSyncTime) return this.$t('never')
      return this.formatSyncTime(this.syncStatus.lastSyncTime)
    },
    syncStatusText () {
      const s = this.syncStatus
      if (s?.isSyncing) return this.$t('syncing')
      if (!s) return this.$t('never')
      return `${s.synced || 0}/${s.total || 0}`
    },
    subTabOptions () {
      return [
        { value: 'sync', label: this.$t('cloudSync'), icon: 'cloud_sync' },
        { value: 'image', label: this.$t('cloudImage'), icon: 'image' },
        { value: 'cdn', label: this.$t('cloudCdnDeps'), icon: 'link' }
      ]
    }
  },
  watch: {
    syncStatus: {
      handler (newVal) {
        if (newVal) {
          this.syncStats = {
            total: newVal.total || 0,
            synced: newVal.synced || 0,
            pending: newVal.pending || 0
          }
          this.isSyncing = newVal.isSyncing || false
        }
      },
      deep: true
    }
  },
  methods: {
    formatSyncTime (timestamp) {
      if (!timestamp) return this.$t('never')
      const date = new Date(timestamp)
      const now = new Date()
      const diff = now - date
      if (diff < 60000) return this.$t('justNow') || '刚刚'
      if (diff < 3600000) return `${Math.floor(diff / 60000)}${this.$t('minutesAgo') || '分钟前'}`
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}${this.$t('hoursAgo') || '小时前'}`
      return date.toLocaleDateString()
    },
    refreshCloudSyncLoginState () {
      this.cloudSyncLoginState = {
        isLoggedIn: SessionStorageService.isLoggedIn(),
        accountInfo: SessionStorageService.getAccountInfo()
      }
    },
    handleCloudSyncProviderChange (value) {
      this.$emit('update-cloud-sync-provider', value)
      const name = this.cloudSyncProviderOptions.find(opt => opt.value === value)?.labelKey
        ? this.$t(this.cloudSyncProviderOptions.find(opt => opt.value === value).label)
        : ''
      this.$q.notify({
        message: this.$t('cloudSyncProviderChanged', { name }),
        type: 'info',
        icon: 'cloud_circle'
      })
    },
    imageUploadServiceChangeHandler: function (service) {
      const servicePlain = this.imageUploadServiceOptionsPlain.find(
        i => this.$t(i) === service
      )
      this.$emit('update-image-upload-service', servicePlain)
    },
    addCdnDep: function () {
      const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
      this.cdnDeps.push({
        id,
        name: '',
        url: '',
        enabled: true,
        applyToBlog: false
      })
    },
    deleteCdnDep: function (id) {
      const dep = this.cdnDeps.find(d => d.id === id)
      if (dep && dep.isBuiltIn) {
        this.$q.notify({
          message: this.$t('cdnDepsBuiltInCannotDelete'),
          type: 'warning',
          position: 'top'
        })
        return
      }
      this.$q.dialog({
        title: this.$t('confirm'),
        message: this.$t('cdnDepsDeleteConfirm'),
        ok: { label: this.$t('confirm'), color: 'negative' },
        cancel: { label: this.$t('cancel'), flat: true }
      }).onOk(() => {
        const idx = this.cdnDeps.findIndex(d => d.id === id)
        if (idx !== -1) {
          this.cdnDeps.splice(idx, 1)
        }
      })
    },
    saveCdnDeps: async function () {
      this.cdnDepsSaving = true
      try {
        await DatabaseClient.cdnDeps.saveAll(this.cdnDeps)
        localStorage.setItem('v__2_client_cdnDeps', JSON.stringify(this.cdnDeps))
        bus.$emit('cdnDepsChanged')
        this.$q.notify({
          message: this.$t('cdnDepsSaveSuccess'),
          type: 'positive',
          position: 'top',
          timeout: 1500
        })
      } catch (err) {
        console.error('[Settings] saveCdnDeps error:', err)
        this.$q.notify({
          message: this.$t('cdnDepsSaveFailed') || '保存失败',
          type: 'negative',
          position: 'top'
        })
      } finally {
        this.cdnDepsSaving = false
      }
    }
  },
  mounted () {
    this.refreshCloudSyncLoginState()
  }
}
</script>

<style scoped>
.settings-server-panel-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  height: calc(70vh - 52px);
}

.settings-server-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 0 6px 4px 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.45) transparent;
}

.settings-server-panel::-webkit-scrollbar {
  width: 6px;
}

.settings-server-panel::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.35);
  border-radius: 999px;
}

.settings-server-panel::-webkit-scrollbar-track {
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

.cloud-sync-summary {
  padding: 12px;
  border: 1px solid rgba(76, 175, 80, 0.16);
  border-radius: 10px;
  background: rgba(76, 175, 80, 0.04);
}

.cloud-sync-summary__header {
  min-width: 0;
}

.sync-stat-card {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 8px 12px;
  text-align: center;
}

.body--dark .sync-stat-card {
  background: #2a2a2a;
}

.cdn-deps-list {
  /* 内容自然流出，由父容器 settings-server-panel 统一滚动 */
}

.cdn-dep-item {
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.body--dark .cdn-dep-item {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}
</style>
