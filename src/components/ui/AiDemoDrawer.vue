<template>
  <el-drawer
    :title="$t('aiAssistant')"
    :visible.sync="visible"
    direction="rtl"
    size="420px"
    custom-class="ai-demo-drawer"
    :modal="false"
    append-to-body
    :with-header="true"
  >
    <div class="ai-drawer-demo">
      <div class="ai-demo-chat-shell">
        <div ref="scrollbar" class="ai-demo-scroll">
          <div class="ai-demo-scroll__inner">
            <el-x-welcome
              icon="el-icon-chat-dot-round"
              :title="welcomeTitle"
              :description="welcomeDescription"
              variant="filled"
            />

            <div class="ai-demo-message-list">
              <div
                v-for="message in messages"
                :key="message.id"
                class="ai-demo-message-item"
                :class="`ai-demo-message-item--${message.role}`"
              >
                <div class="ai-demo-message-label">
                  {{ message.role === 'user' ? $t('aiDrawerUserLabel') : $t('aiAssistant') }}
                </div>
                <el-x-bubble
                  :placement="message.role === 'user' ? 'end' : 'start'"
                  :type="message.role === 'user' ? 'primary' : 'default'"
                  :content="message.content"
                />
              </div>

              <div v-if="loading" class="ai-demo-message-item ai-demo-message-item--assistant">
                <div class="ai-demo-message-label">{{ $t('aiAssistant') }}</div>
                <el-x-bubble placement="start" :content="$t('aiDrawerThinking')" />
              </div>
            </div>
          </div>
        </div>

        <div class="ai-demo-composer">
          <div class="ai-demo-composer__hint">{{ composerHint }}</div>
          <el-x-sender
            :value="draftMessage"
            :disabled="loading || !isReady"
            :placeholder="composerPlaceholder"
            @input="draftMessage = $event"
            @submit="handleSubmit"
          />
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script>
import { i18n } from 'boot/i18n'
import PortkeyService from 'src/services/PortkeyService'

export default {
  name: 'AiDemoDrawer',
  data () {
    return {
      visible: false,
      draftMessage: '',
      messageId: 2,
      loading: false,
      defaultConfig: null,
      messages: [
        {
          id: 1,
          role: 'assistant',
          content: i18n.t('aiDrawerIntroMessage')
        }
      ]
    }
  },
  computed: {
    providerLabel () {
      if (!this.defaultConfig) {
        return this.$t('aiProviderLabelGeneric')
      }

      return PortkeyService.getProviderLabel(this.defaultConfig.provider_type)
    },
    isReady () {
      return PortkeyService.isConfigUsable(this.defaultConfig)
    },
    welcomeTitle () {
      return this.isReady
        ? this.$t('aiDrawerWelcomeReadyTitle', { provider: this.providerLabel })
        : this.$t('aiDrawerWelcomeNotReadyTitle')
    },
    welcomeDescription () {
      if (!this.defaultConfig) {
        return this.$t('aiDrawerWelcomeNoDefaultDescription')
      }

      if (!this.isReady) {
        return this.$t('aiDrawerWelcomeIncompleteDescription', {
          name: this.defaultConfig.name,
          provider: this.providerLabel
        })
      }

      return this.$t('aiDrawerWelcomeReadyDescription', {
        name: this.defaultConfig.name,
        model: this.defaultConfig.model
      })
    },
    composerHint () {
      if (!this.defaultConfig) {
        return this.$t('aiDrawerComposerHintNoDefault')
      }

      if (!this.isReady) {
        return this.$t('aiDrawerComposerHintIncomplete', {
          provider: this.providerLabel
        })
      }

      return this.$t('aiDrawerComposerHintReady', {
        provider: this.providerLabel
      })
    },
    composerPlaceholder () {
      if (!this.defaultConfig) {
        return this.$t('aiDrawerComposerPlaceholderNoDefault')
      }

      return this.isReady
        ? this.$t('aiDrawerComposerPlaceholderReady')
        : this.$t('aiDrawerComposerPlaceholderIncomplete', {
          provider: this.providerLabel
        })
    }
  },
  methods: {
    async refreshDefaultConfig () {
      this.defaultConfig = await PortkeyService.getDefaultConfig()
    },
    async show (options = {}) {
      await this.refreshDefaultConfig()

      if (!this.isReady && options.redirectToSettings !== false) {
        this.$q.dialog({
          title: this.defaultConfig
            ? this.$t('aiDrawerDialogIncompleteTitle')
            : this.$t('aiDrawerDialogNoDefaultTitle'),
          message: this.defaultConfig
            ? this.$t('aiDrawerDialogIncompleteMessage', { name: this.defaultConfig.name })
            : this.$t('aiDrawerDialogNoDefaultMessage'),
          cancel: { label: this.$t('cancel') },
          ok: { label: this.$t('aiDrawerDialogGoConfigure'), color: 'green-7' },
          persistent: true
        }).onOk(() => {
          this.$emit('request-ai-provider-config')
        })
        return
      }

      this.visible = true
      this.scrollToBottom()
    },
    hide () {
      this.visible = false
    },
    async toggle () {
      if (!this.visible) {
        await this.show()
        return
      }

      this.visible = false
    },
    pushMessage (role, content) {
      this.messages.push({
        id: this.messageId,
        role,
        content
      })
      this.messageId += 1
    },
    extractAssistantContent (response) {
      return response?.choices?.[0]?.message?.content || this.$t('aiDrawerEmptyResponse')
    },
    scrollToBottom () {
      this.$nextTick(() => {
        const scrollEl = this.$refs.scrollbar
        if (scrollEl) {
          scrollEl.scrollTop = scrollEl.scrollHeight
        }
      })
    },
    async handleSubmit (value) {
      const message = typeof value === 'string' ? value : this.draftMessage
      const content = message && message.trim()

      if (!content || this.loading) return

      await this.refreshDefaultConfig()

      if (!this.isReady) {
        this.$q.notify({
          type: 'warning',
          message: this.defaultConfig
            ? this.$t('aiDrawerNotifyIncompleteConfig', { provider: this.providerLabel })
            : this.$t('aiDrawerNotifyNoDefaultConfig'),
          position: 'top'
        })
        return
      }

      this.pushMessage('user', content)
      this.draftMessage = ''
      this.loading = true
      this.scrollToBottom()

      try {
        const response = await PortkeyService.chat([
          ...this.messages.map(item => ({ role: item.role, content: item.content })),
          { role: 'user', content }
        ])
        this.pushMessage('assistant', this.extractAssistantContent(response))
      } catch (error) {
        this.pushMessage('assistant', this.$t('aiDrawerRequestFailedMessage', { message: error.message || this.$t('loading') }))
        this.$q.notify({
          type: 'negative',
          message: error.message || this.$t('aiDrawerRequestFailedNotify'),
          position: 'top'
        })
      } finally {
        this.loading = false
        this.scrollToBottom()
      }
    }
  }
}
</script>

<style scoped>
.ai-drawer-demo {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.ai-demo-chat-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--floatBorderColor, #ebeef5);
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 48%, #ffffff 100%);
  overflow: hidden;
}

.ai-demo-scroll {
  flex: 1;
  min-height: 0;
  padding: 16px 16px 0;
  overflow-y: auto;
}

.ai-demo-scroll__inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.ai-demo-message-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 12px;
}

.ai-demo-message-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-demo-message-item--user {
  align-items: flex-end;
}

.ai-demo-message-label {
  font-size: 12px;
  color: #909399;
}

.ai-demo-composer {
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(255, 255, 255, 0.92);
}

.ai-demo-composer__hint {
  font-size: 12px;
  color: #909399;
}
</style>
