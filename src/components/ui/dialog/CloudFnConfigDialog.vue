<template>
  <div class='cloudfn-config'>
    <div class='row items-center no-wrap q-mb-xs panel-title'>
      <div class='panel-title-bar bg-blue-7' />
      <span class='text-subtitle2 text-weight-medium'>{{ $t('cloudFunction') }}</span>
      <q-space />
      <q-btn
        flat dense size='sm' icon='help_outline'
        @click='helpHandler'
      >
        <q-tooltip>{{ helpText }}</q-tooltip>
      </q-btn>
    </div>
    <q-separator class='q-my-sm server-section-separator' />

    <div class='cloudfn-form'>
      <div class='text-caption text-grey-6 q-mb-sm'>
        {{ $t('cloudFunctionIntro') }}
      </div>

      <q-input
        dense
        debounce='300'
        v-model='form.baseUrl'
        :label="$t('cloudFunctionBaseUrl')"
        :rules="[val => !val || /^https?:\/\//.test(val) || $t('fieldShouldStartWithHTTP')]"
        spellcheck='false'
        class='q-mb-sm'
        @blur='save'
      >
        <template v-slot:append>
          <q-icon
            v-if='form.baseUrl'
            name='clear'
            class='cursor-pointer'
            @click="form.baseUrl = ''"
          />
        </template>
      </q-input>

      <q-input
        dense
        debounce='300'
        v-model='form.appId'
        :label="$t('cloudFunctionAppId')"
        spellcheck='false'
        class='q-mb-sm'
        @blur='save'
      />

      <q-select
        dense
        options-dense
        v-model='form.platform'
        :options='platformOptions'
        :label="$t('cloudFunctionPlatform')"
        emit-value
        map-options
        class='q-mb-sm'
        @input='save'
      />

      <q-input
        dense
        debounce='300'
        v-model='form.token'
        :type="showToken ? 'text' : 'password'"
        :label="$t('cloudFunctionToken')"
        spellcheck='false'
        class='q-mb-sm'
        @blur='save'
      >
        <template v-slot:append>
          <q-icon
            :name='showToken ? "visibility_off" : "visibility"'
            class='cursor-pointer'
            @click='showToken = !showToken'
          />
        </template>
      </q-input>

      <div class='row items-center q-gutter-sm q-mt-md'>
        <q-btn
          unelevated
          color='primary'
          icon='save'
          :label="$t('save')"
          @click='save'
        />
        <q-btn
          flat
          color='grey-7'
          icon='cloud_done'
          :label="$t('cloudFunctionTest')"
          :loading='testing'
          @click='testConnection'
        />
        <q-btn
          flat
          color='blue-7'
          icon='science'
          :label="$t('cloudFunctionDemo')"
          :disable='testing'
          @click='openDemo'
        />
        <q-btn
          flat
          color='red-7'
          icon='logout'
          :label="$t('cloudFunctionClearToken')"
          @click='clearToken'
        />
        <q-space />
        <q-chip
          v-if='savedAt'
          dense
          color='green-2'
          text-color='green-9'
          icon='check'
        >{{ $t('savedAt', { time: savedAt }) }}</q-chip>
      </div>

      <q-banner
        v-if='testResult'
        :class="testResult.ok ? 'bg-green-1 text-green-10' : 'bg-red-1 text-red-10'"
        rounded
        dense
        class='q-mt-md'
      >
        <template v-slot:avatar>
          <q-icon :name="testResult.ok ? 'cloud_done' : 'cloud_off'" />
        </template>
        {{ testResult.message }}
      </q-banner>
    </div>

    <q-separator class='q-my-sm server-section-separator' />

    <div class='navigation-section'>
      <div class='row items-center no-wrap q-mb-xs panel-title'>
        <div class='panel-title-bar bg-blue-7' />
        <span class='text-subtitle2 text-weight-medium'>{{ $t('navigationCenter') }}</span>
      </div>
      <q-separator class='q-my-sm server-section-separator' />
      <div class='text-caption text-grey-6 q-mb-sm'>
        {{ $t('navigationCenterHint') }}
      </div>
      <q-btn
        unelevated
        class='navigation-open-btn'
        icon='explore'
        :label="$t('openNavigationCenter')"
        @click='openNavigationDialog'
      />
    </div>

    <bsp-app-demo-dialog v-model='demoDialogOpen' />
    <navigation-dialog v-model='navigationDialogVisible' @go-config='onNavigationGoConfig' />
  </div>
</template>

<script>
import cloud from 'src/services/cloud/CloudFunctionProvider'
import BspAppDemoDialog from 'components/ui/dialog/BspAppDemoDialog'
import NavigationDialog from 'components/ui/dialog/NavigationDialog'

export default {
  name: 'CloudFnConfigDialog',
  components: {
    BspAppDemoDialog,
    NavigationDialog
  },
  data () {
    return {
      form: {
        baseUrl: '',
        appId: '',
        platform: 'h5',
        token: ''
      },
      showToken: false,
      savedAt: '',
      testing: false,
      testResult: null,
      platformOptions: [
        { label: 'h5', value: 'h5' },
        { label: 'electron', value: 'electron' },
        { label: 'app-plus', value: 'app-plus' },
        { label: 'mp-weixin', value: 'mp-weixin' }
      ],
      helpText: '云函数（vk-router url 化）的 baseUrl 形如 https://xxx.bspapp.com/http/router',
      demoDialogOpen: false,
      navigationDialogVisible: false
    }
  },
  created () {
    const cfg = cloud.getConfig()
    this.form = {
      baseUrl: cfg.baseUrl,
      appId: cfg.appId,
      platform: cfg.platform || 'h5',
      token: cfg.token
    }
  },
  methods: {
    save () {
      cloud.setConfig({
        baseUrl: this.form.baseUrl,
        appId: this.form.appId,
        platform: this.form.platform
      })
      cloud.setToken(this.form.token)
      const d = new Date()
      const pad = n => String(n).padStart(2, '0')
      this.savedAt = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    },
    clearToken () {
      this.form.token = ''
      cloud.clearToken()
      this.savedAt = ''
      this.$message && this.$message.success(this.$t('cloudFunctionTokenCleared'))
    },
    async testConnection () {
      this.save()
      this.testResult = null
      this.testing = true
      try {
        const cfg = cloud.getConfig()
        if (!cfg.baseUrl) {
          this.testResult = { ok: false, message: this.$t('cloudFunctionNoBaseUrl') }
          return
        }
        await cloud.invoke('system/ping', { ts: Date.now() })
        this.testResult = { ok: true, message: this.$t('cloudFunctionPingOk') }
      } catch (e) {
        this.testResult = { ok: false, message: `${e.code || ''} ${e.message || ''}` }
      } finally {
        this.testing = false
      }
    },
    helpHandler () {
      window.open('https://vkdoc.fsq.pub/client/pages/callFunctionForUrl.html', '_blank')
    },
    openDemo () {
      this.demoDialogOpen = true
    },
    openNavigationDialog () {
      this.navigationDialogVisible = true
    },
    onNavigationGoConfig () {
      this.navigationDialogVisible = false
      this.$emit('go-config')
    }
  }
}
</script>

<style lang='scss' scoped>
.cloudfn-config {
  padding: 4px 2px;
}
.cloudfn-form {
  max-width: 560px;
}

/* 与 SettingsDialog 中其他 tab 的 section 标题保持一致尺寸 */
.panel-title-bar {
  width: 3px;
  min-height: 1rem;
  border-radius: 1px;
  margin-right: 8px;
  flex-shrink: 0;
}

/* 与 .server-section-separator 保持一致间距 */
.server-section-separator {
  margin-top: 8px;
  margin-bottom: 14px;
}

.navigation-section {
  margin-top: 8px;
  padding: 4px 2px 8px;
}

.navigation-open-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
  width: 100%;
  max-width: 360px;
}

.navigation-open-btn:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
}

.bg-blue-7 {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
}
</style>