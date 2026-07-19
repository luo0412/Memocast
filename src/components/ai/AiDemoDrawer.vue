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
                :class="[
                  `ai-demo-message-item--${message.role}`,
                  message.status ? `ai-demo-message-item--${message.status}` : ''
                ]"
              >
                <div class="ai-demo-message-label">
                  {{ message.role === 'user' ? $t('aiDrawerUserLabel') : $t('aiAssistant') }}
                </div>
                <div class="ai-demo-message-bubble">
                  <template v-if="message.role === 'assistant'">
                    <div
                      v-if="message.status === 'streaming' && !message.content"
                      class="ai-demo-thinking"
                    >
                      {{ $t('aiDrawerThinking') }}
                    </div>
                    <div
                      v-else-if="getRenderedContent(message)"
                      class="ai-demo-rendered-content"
                      v-html="getRenderedContent(message)"
                    />
                    <div
                      v-else
                      class="ai-demo-plain-content"
                    >
                      {{ message.content || '' }}
                    </div>
                  </template>
                  <template v-else>
                    <div class="ai-demo-plain-content">
                      {{ message.content }}
                    </div>
                  </template>
                </div>
                <div
                  v-if="message.role === 'assistant' && message.status && message.status !== 'done'"
                  class="ai-demo-message-status"
                >
                  {{ getMessageStatusText(message) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="ai-demo-composer">
          <div class="ai-demo-composer__hint">{{ composerHint }}</div>
          <div v-if="activeResponseMeta" class="ai-demo-composer__meta">
            {{ activeResponseMeta }}
          </div>
          <div v-if="loading" class="ai-demo-composer__actions">
            <el-button size="mini" type="warning" plain @click="stopStreaming">
              {{ $t('aiDrawerStopGenerating') }}
            </el-button>
          </div>
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
import MarkdownRenderer from 'src/services/MarkdownRenderer'

function createMessage(id, role, content, status = 'done', meta = null) {
  return {
    id,
    role,
    content,
    status,
    meta,
    renderedContent: null
  }
}

export default {
  name: 'AiDemoDrawer',
  data () {
    return {
      visible: false,
      draftMessage: '',
      messageId: 2,
      loading: false,
      defaultConfig: null,
      streamAbortController: null,
      activeResponseMeta: '',
      rendererReady: false,
      messages: [
        createMessage(1, 'assistant', i18n.t('aiDrawerIntroMessage'))
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
  async mounted () {
    try {
      await MarkdownRenderer.initMarkdownRenderer()
      this.rendererReady = true
    } catch (err) {
      console.warn('[AiDemoDrawer] Failed to initialize MarkdownRenderer:', err)
    }
  },
  beforeDestroy () {
    MarkdownRenderer.disposeAll()
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
      this.stopStreaming({ silent: true })
      this.visible = false
    },
    async toggle () {
      if (!this.visible) {
        await this.show()
        return
      }

      this.hide()
    },
    nextMessageId () {
      const id = this.messageId
      this.messageId += 1
      return id
    },
    pushMessage (role, content, status = 'done', meta = null) {
      const message = createMessage(this.nextMessageId(), role, content, status, meta)
      this.messages.push(message)
      return message
    },
    updateMessageById (id, updater) {
      const message = this.messages.find(item => item.id === id)
      if (!message) return null
      updater(message)
      return message
    },
    extractAssistantContent (response) {
      return response?.choices?.[0]?.message?.content || this.$t('aiDrawerEmptyResponse')
    },
    buildHistoryMessages () {
      return this.messages
        .filter(item => item.role === 'user' || item.role === 'assistant')
        .filter(item => item.status !== 'error')
        .map(item => ({
          role: item.role,
          content: item.content
        }))
    },
    updateActiveResponseMeta (meta = {}) {
      const maxTokens = meta.effectiveMaxTokens || meta.maxTokens
      if (meta.finishReason && maxTokens) {
        this.activeResponseMeta = this.$t('aiDrawerMetaWithFinishReason', {
          finishReason: meta.finishReason,
          maxTokens
        })
        return
      }

      if (meta.finishReason) {
        this.activeResponseMeta = this.$t('aiDrawerMetaFinishReasonOnly', {
          finishReason: meta.finishReason
        })
        return
      }

      if (maxTokens) {
        this.activeResponseMeta = this.$t('aiDrawerMetaMaxTokensOnly', {
          maxTokens
        })
        return
      }

      this.activeResponseMeta = ''
    },
    getMessageStatusText (message) {
      if (message.status === 'streaming') return this.$t('aiDrawerStreamingStatus')
      if (message.status === 'stopped') return this.$t('aiDrawerStoppedStatus')
      if (message.status === 'truncated') return this.$t('aiDrawerTruncatedStatus')
      if (message.status === 'error') return this.$t('aiDrawerErrorStatus')
      return ''
    },
    getRenderedContent (message) {
      if (!message.content) {
        return message.status === 'streaming' ? this.$t('aiDrawerThinking') : ''
      }
      if (!this.rendererReady) {
        return message.content
      }
      if (!message.renderedContent || message.rawContent !== message.content) {
        message.rawContent = message.content
        message.renderedContent = MarkdownRenderer.renderMarkdown(message.content)
      }
      return message.renderedContent
    },
    scrollToBottom () {
      this.$nextTick(() => {
        const scrollEl = this.$refs.scrollbar
        if (scrollEl) {
          scrollEl.scrollTop = scrollEl.scrollHeight
        }
      })
    },
    stopStreaming ({ silent = false } = {}) {
      if (this.streamAbortController) {
        this.streamAbortController.abort()
        this.streamAbortController = null
      }

      const streamingMessage = [...this.messages].reverse().find(item => item.role === 'assistant' && item.status === 'streaming')
      if (streamingMessage) {
        this.updateMessageById(streamingMessage.id, item => {
          item.status = 'stopped'
          if (!item.content) {
            item.content = this.$t('aiDrawerStoppedEmptyMessage')
          }
        })
      }

      this.loading = false

      if (!silent) {
        this.$q.notify({
          type: 'warning',
          message: this.$t('aiDrawerStoppedNotify'),
          position: 'top'
        })
      }
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

      this.stopStreaming({ silent: true })
      this.activeResponseMeta = ''

      this.pushMessage('user', content)
      this.draftMessage = ''
      this.loading = true

      const assistantMessage = this.pushMessage('assistant', '', 'streaming', {
        finishReason: null,
        truncated: false,
        effectiveMaxTokens: PortkeyService.resolveEffectiveMaxTokens(this.defaultConfig, {})
      })
      const historyMessages = this.buildHistoryMessages()

      this.streamAbortController = new AbortController()
      this.scrollToBottom()

      try {
        await PortkeyService.chatStream(historyMessages, {
          signal: this.streamAbortController.signal,
          onToken: (token) => {
            this.updateMessageById(assistantMessage.id, item => {
              item.content += token
            })
            this.scrollToBottom()
          },
          onComplete: ({ finishReason, truncated }) => {
            this.updateMessageById(assistantMessage.id, item => {
              item.status = truncated ? 'truncated' : 'done'
              item.meta = {
                ...(item.meta || {}),
                finishReason,
                truncated
              }
              if (!item.content) {
                item.content = this.$t('aiDrawerEmptyResponse')
              }
            })
            this.updateActiveResponseMeta({
              finishReason,
              truncated,
              effectiveMaxTokens: PortkeyService.resolveEffectiveMaxTokens(this.defaultConfig, {})
            })
            if (truncated) {
              this.$q.notify({
                type: 'warning',
                message: this.$t('aiDrawerTruncatedNotify'),
                position: 'top'
              })
            }
          },
          onError: (error) => {
            if (error && error.name === 'AbortError') {
              return
            }

            this.updateMessageById(assistantMessage.id, item => {
              item.status = 'error'
              item.content = item.content || this.$t('aiDrawerRequestFailedMessage', {
                message: error.message || this.$t('loading')
              })
            })
            this.$q.notify({
              type: 'negative',
              message: error.message || this.$t('aiDrawerRequestFailedNotify'),
              position: 'top'
            })
          }
        }, {
          signal: this.streamAbortController.signal
        })
      } catch (error) {
        if (!error || error.name !== 'AbortError') {
          this.updateMessageById(assistantMessage.id, item => {
            item.status = 'error'
            item.content = item.content || this.$t('aiDrawerRequestFailedMessage', {
              message: error.message || this.$t('loading')
            })
          })
          this.$q.notify({
            type: 'negative',
            message: error.message || this.$t('aiDrawerRequestFailedNotify'),
            position: 'top'
          })
        }
      } finally {
        this.loading = false
        this.streamAbortController = null
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

.ai-demo-message-status {
  font-size: 12px;
  color: #c0c4cc;
}

.ai-demo-message-bubble {
  background: #ffffff;
  border-radius: 12px;
  padding: 10px 14px;
  max-width: 85%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.ai-demo-message-item--user .ai-demo-message-bubble {
  background: #409eff;
  color: #ffffff;
  border-color: #409eff;
}

.ai-demo-message-item--assistant .ai-demo-message-bubble {
  background: #ffffff;
  border-color: #ebeef5;
}

.ai-demo-plain-content {
  word-break: break-word;
  white-space: pre-wrap;
}

.ai-demo-thinking {
  color: #909399;
  font-style: italic;
}

.ai-demo-rendered-content {
  line-height: 1.6;
  word-break: break-word;
}

.ai-demo-rendered-content h1,
.ai-demo-rendered-content h2,
.ai-demo-rendered-content h3,
.ai-demo-rendered-content h4,
.ai-demo-rendered-content h5,
.ai-demo-rendered-content h6 {
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: 600;
  line-height: 1.25;
}

.ai-demo-rendered-content h1 { font-size: 1.5em; }
.ai-demo-rendered-content h2 { font-size: 1.25em; }
.ai-demo-rendered-content h3 { font-size: 1.1em; }

.ai-demo-rendered-content p {
  margin: 0.5em 0;
}

.ai-demo-rendered-content ul,
.ai-demo-rendered-content ol {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.ai-demo-rendered-content li {
  margin: 0.25em 0;
}

.ai-demo-rendered-content code {
  background: rgba(0, 0, 0, 0.06);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.9em;
}

.ai-demo-message-item--user .ai-demo-rendered-content code {
  background: rgba(255, 255, 255, 0.2);
}

.ai-demo-rendered-content pre {
  margin: 0.75em 0;
  border-radius: 8px;
  overflow: hidden;
}

.ai-demo-rendered-content pre code {
  background: transparent;
  padding: 0;
  font-size: 0.85em;
}

.ai-demo-rendered-content blockquote {
  margin: 0.5em 0;
  padding-left: 1em;
  border-left: 3px solid #dcdfe6;
  color: #909399;
}

.ai-demo-message-item--user .ai-demo-rendered-content blockquote {
  border-left-color: rgba(255, 255, 255, 0.5);
  color: rgba(255, 255, 255, 0.8);
}

.ai-demo-rendered-content a {
  color: #409eff;
  text-decoration: none;
}

.ai-demo-message-item--user .ai-demo-rendered-content a {
  color: #ffffff;
  text-decoration: underline;
}

.ai-demo-rendered-content table {
  border-collapse: collapse;
  margin: 0.5em 0;
  width: 100%;
}

.ai-demo-rendered-content th,
.ai-demo-rendered-content td {
  border: 1px solid #ebeef5;
  padding: 0.5em;
  text-align: left;
}

.ai-demo-rendered-content th {
  background: #fafafa;
  font-weight: 600;
}

.ai-demo-rendered-content hr {
  margin: 1em 0;
  border: none;
  border-top: 1px solid #ebeef5;
}

.ai-demo-composer {
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(255, 255, 255, 0.92);
}

.ai-demo-composer__hint,
.ai-demo-composer__meta {
  font-size: 12px;
  color: #909399;
}

.ai-demo-composer__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
