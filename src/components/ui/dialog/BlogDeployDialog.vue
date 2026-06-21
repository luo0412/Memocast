<template>
  <q-dialog ref="dialog" transition-show="fade" transition-hide="fade" persistent>
    <q-card class="blog-deploy-dialog-card">
      <q-card-section class="row items-center q-pb-sm">
        <q-icon name="cloud_upload" class="text-primary q-mr-sm" size="1.5rem" />
        <div class="text-subtitle1 text-weight-medium">{{ $t('blogDeployConfig') }}</div>
        <q-space />
        <q-btn flat round dense icon="close" v-close-popup @click="onCancel" />
      </q-card-section>

      <q-separator />

      <q-card-section class="q-pa-md">
        <!-- 博客目录 -->
        <div class="config-section">
          <div class="text-body2 text-weight-medium q-mb-xs config-label">
            {{ $t('blogDir') }} *
          </div>
          <div class="row items-center no-wrap q-gutter-xs">
            <q-input
              v-model="localConfig.blogDir"
              dense
              outlined
              class="col"
              :placeholder="$t('selectBlogDir')"
            />
            <q-btn
              unelevated
              color="primary"
              icon="folder_open"
              :label="$t('selectBlogDir')"
              @click="selectBlogDir"
            />
          </div>
        </div>

        <!-- 主题选择 -->
        <div class="config-section q-mt-md">
          <div class="text-body2 text-weight-medium q-mb-xs config-label">
            {{ $t('blogTheme') }}
          </div>
          <div class="theme-options">
            <q-btn-toggle
              v-model="localConfig.theme"
              toggle-color="primary"
              :options="[
                { label: $t('blogThemeDefault'), value: 'default' },
                { label: $t('blogThemeVdoing'), value: 'vdoing' }
              ]"
              unelevated
              no-caps
              class="theme-toggle"
            />
            <div class="text-caption text-grey-6 q-mt-xs">
              {{ $t('blogThemeAutoDetectHint') }}
            </div>
          </div>
        </div>

        <q-separator class="q-my-md" />

        <!-- GitHub 部署（可选） -->
        <div class="config-section">
          <div class="text-body2 text-weight-medium q-mb-xs config-label">
            {{ $t('githubDeployOptional') }}
          </div>

          <q-input
            v-model="localConfig.github.owner"
            dense
            outlined
            class="q-mb-sm"
            :label="$t('githubRepo')"
            placeholder="owner/repo"
          />

          <q-input
            v-model="localConfig.github.workflowId"
            dense
            outlined
            class="q-mb-sm"
            :label="$t('githubWorkflowId')"
            placeholder="deploy.yml"
          />

          <q-input
            v-model="localConfig.github.branch"
            dense
            outlined
            class="q-mb-sm"
            :label="$t('githubBranch')"
            placeholder="main"
          />

          <q-input
            v-model="localConfig.github.token"
            dense
            outlined
            class="q-mb-xs"
            :label="$t('githubToken')"
            :type="showToken ? 'text' : 'password'"
          >
            <template v-slot:append>
              <q-btn flat round dense :icon="showToken ? 'visibility_off' : 'visibility'" @click="showToken = !showToken" />
            </template>
          </q-input>
          <div class="text-caption text-grey-6 q-mb-sm">
            {{ $t('githubToken') }}: 需要 <code>workflow</code> 范围。
            <a href="#" @click.prevent="openGithubTokenGuide">生成 Token</a>
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat :label="$t('cancelDeploy')" color="grey" v-close-popup @click="onCancel" />
        <q-btn
          flat
          :label="$t('saveConfig')"
          color="primary"
          :disable="!localConfig.blogDir"
          :loading="savingConfig"
          @click="saveOnly"
        />
        <q-btn
          unelevated
          color="primary"
          icon="rocket_launch"
          :label="$t('saveAndDeploy')"
          :disable="!localConfig.blogDir"
          :loading="savingAndDeploying"
          @click="saveAndDeploy"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { getBlogDeployConfig, saveBlogDeployConfig, selectDirectory } from 'src/ApiInvoker'

export default {
  name: 'BlogDeployDialog',
  data () {
    return {
      localConfig: {
        blogDir: '',
        theme: 'default',
        github: {
          owner: '',
          repo: '',
          workflowId: '',
          branch: 'main',
          token: ''
        }
      },
      showToken: false,
      savingConfig: false,
      savingAndDeploying: false
    }
  },
  async mounted () {
    await this.loadConfig()
  },
  methods: {
    async loadConfig () {
      try {
        const config = await getBlogDeployConfig()
        if (config) {
          this.localConfig = {
            blogDir: config.blogDir || '',
            theme: config.theme || 'default',
            github: {
              owner: config.github?.owner || '',
              repo: config.github?.repo || '',
              workflowId: config.github?.workflowId || '',
              branch: config.github?.branch || 'main',
              token: config.github?.token || ''
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load blog deploy config:', err)
      }
    },
    async selectBlogDir () {
      try {
        const result = await selectDirectory(this.$t('selectBlogDir'))
        if (!result.canceled && result.filePath) {
          this.localConfig.blogDir = result.filePath
        }
      } catch (err) {
        console.error('Failed to select directory:', err)
      }
    },
    openGithubTokenGuide () {
      this.$q.electron.shell.openExternal('https://github.com/settings/tokens/new?scopes=workflow')
    },
    async saveConfigToBackend () {
      await saveBlogDeployConfig(this.localConfig)
    },
    async saveOnly () {
      this.savingConfig = true
      try {
        await this.saveConfigToBackend()
        this.$q.notify({
          message: this.$t('blogDeployConfigSaved'),
          type: 'positive',
          icon: 'check'
        })
        this.$refs.dialog.hide()
      } catch (err) {
        console.error('Failed to save config:', err)
        this.$q.notify({
          message: 'Failed to save config: ' + (err.message || String(err)),
          type: 'negative'
        })
      } finally {
        this.savingConfig = false
      }
    },
    async saveAndDeploy () {
      this.savingAndDeploying = true
      try {
        await this.saveConfigToBackend()
        this.$refs.dialog.hide()
        this.$emit('deploy', { config: this.localConfig })
      } catch (err) {
        console.error('Failed to save config:', err)
        this.$q.notify({
          message: 'Failed to save config: ' + (err.message || String(err)),
          type: 'negative'
        })
      } finally {
        this.savingAndDeploying = false
      }
    },
    onCancel () {
      this.$emit('cancel')
    },
    toggle () {
      return this.$refs.dialog.toggle()
    },
    show () {
      return this.$refs.dialog.show()
    },
    hide () {
      return this.$refs.dialog.hide()
    }
  }
}
</script>

<style scoped>
.blog-deploy-dialog-card {
  width: 520px;
  max-width: 90vw;
}

.config-section {
  margin-bottom: 4px;
}

.config-label {
  color: var(--q-color-primary);
}

.config-label::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 0.9em;
  background: var(--q-color-primary);
  margin-right: 6px;
  vertical-align: middle;
  border-radius: 1px;
}

code {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.85em;
}

.theme-options {
  margin-top: 4px;
}

.theme-toggle {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  overflow: hidden;
}

.body--dark .theme-toggle {
  border-color: rgba(255, 255, 255, 0.12);
}

.body--dark code {
  background: rgba(255, 255, 255, 0.1);
}
</style>
