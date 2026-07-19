<template>
  <div class='cloudfn-config'>
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

    <bsp-app-demo-dialog v-model='demoDialogOpen' />
  </div>
</template>

<script>
import cloud from 'src/services/cloud/CloudFunctionProvider'
import BspAppDemoDialog from 'components/ui/dialog/BspAppDemoDialog'

export default {
  name: 'CloudFnConfigDialog',
  components: {
    BspAppDemoDialog
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
      demoDialogOpen: false
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
    openDemo () {
      this.demoDialogOpen = true
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

</style>
