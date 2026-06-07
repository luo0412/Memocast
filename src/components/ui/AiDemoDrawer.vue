<template>
  <el-drawer
    title="AI 助手"
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
        <perfect-scrollbar ref="scrollbar" class="ai-demo-scroll" :options="scrollOptions">
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
                  {{ message.role === 'user' ? '你' : 'AI 助手' }}
                </div>
                <el-x-bubble
                  :placement="message.role === 'user' ? 'end' : 'start'"
                  :type="message.role === 'user' ? 'primary' : 'default'"
                  :content="message.content"
                />
              </div>

              <div v-if="loading" class="ai-demo-message-item ai-demo-message-item--assistant">
                <div class="ai-demo-message-label">AI 助手</div>
                <el-x-bubble placement="start" content="正在思考中..." />
              </div>
            </div>
          </div>
        </perfect-scrollbar>

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
import PerfectScrollbar from 'vue2-perfect-scrollbar'
import PortkeyService from 'src/services/PortkeyService'

export default {
  name: 'AiDemoDrawer',
  components: {
    PerfectScrollbar
  },
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
          content: '这里会直接读取默认 Portkey 模型配置。配置好后，发送消息即可得到真实回复。'
        }
      ],
      scrollOptions: {
        suppressScrollX: true,
        wheelPropagation: false
      }
    }
  },
  computed: {
    isReady () {
      return Boolean(this.defaultConfig && this.defaultConfig.provider_type === 'portkey')
    },
    welcomeTitle () {
      return this.isReady ? 'Portkey AI 助手' : '尚未配置默认 Portkey 模型'
    },
    welcomeDescription () {
      if (!this.isReady) {
        return '请先到设置中添加一个 Portkey provider 的模型配置，并将其设为默认。'
      }

      return `当前默认模型：${this.defaultConfig.name} · ${this.defaultConfig.model}`
    },
    composerHint () {
      if (!this.isReady) {
        return '当前不可发送：缺少默认 Portkey 模型配置。'
      }

      return '输入内容后回车，消息会通过默认 Portkey 模型发送。'
    },
    composerPlaceholder () {
      return this.isReady ? '输入一句话，开始真实 AI 对话' : '请先在设置里完成默认 Portkey 配置'
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
          title: '尚未配置 AI Provider',
          message: '当前没有可用的默认 AI Provider 配置。现在去设置里新增一个默认配置吗？',
          cancel: { label: '取消' },
          ok: { label: '去配置', color: 'green-7' },
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
      return response?.choices?.[0]?.message?.content || '模型返回了空响应。'
    },
    scrollToBottom () {
      this.$nextTick(() => {
        const root = this.$refs.scrollbar && this.$refs.scrollbar.$el
        const scrollEl = root && root.querySelector('.ps')
        if (scrollEl) {
          scrollEl.scrollTop = scrollEl.scrollHeight
        }
      })
    },
    async handleSubmit (value) {
      const message = typeof value === 'string' ? value : this.draftMessage
      const content = message && message.trim()

      if (!content || this.loading) return

      if (!this.isReady) {
        this.$q.notify({
          type: 'warning',
          message: '请先在设置中配置默认 Portkey 模型。',
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
        this.pushMessage('assistant', `调用失败：${error.message || '未知错误'}`)
        this.$q.notify({
          type: 'negative',
          message: error.message || 'Portkey 请求失败',
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

.ai-demo-message-item--assistant {
  align-items: flex-start;
}

.ai-demo-message-label {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
}

.ai-demo-composer {
  flex-shrink: 0;
  padding: 12px 16px 16px;
  border-top: 1px solid rgba(235, 238, 245, 0.9);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -8px 24px rgba(31, 35, 41, 0.05);
}

.ai-demo-composer__hint {
  margin-bottom: 10px;
  font-size: 12px;
  color: #909399;
}
</style>
