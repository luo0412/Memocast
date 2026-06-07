<template>
  <el-drawer
    title="AI 助手示例"
    :visible.sync="visible"
    direction="rtl"
    size="420px"
    custom-class="ai-demo-drawer"
    :modal="false"
    append-to-body
    :with-header="true"
  >
    <div class="ai-drawer-demo">
      <div class="ai-demo-input-section ai-demo-section">
        <div class="ai-demo-section__title">输入框示例</div>
        <el-x-sender
          :value="draftMessage"
          placeholder="输入内容体验 Sender 组件"
          @input="draftMessage = $event"
          @submit="handleSubmit"
        />
      </div>

      <el-x-welcome
        icon="el-icon-chat-dot-round"
        title="开始你的 AI 对话"
        description="这里先接入 Element-UI-X 的基础示例，后续可以继续扩展会话、提示词和消息流。"
        variant="filled"
      />

      <div class="ai-demo-scroll">
        <div class="ai-demo-section">
          <div class="ai-demo-section__title">基础打字效果</div>
          <el-x-typewriter
            :content="typewriterContent"
            :typing="visible"
            class="ai-demo-typewriter"
          />
        </div>

        <div class="ai-demo-section">
          <div class="ai-demo-section__title">基础消息示例</div>
          <div class="ai-demo-bubbles">
            <el-x-bubble
              placement="start"
              content="你好，我已经把 Element-UI-X 接进来了。"
            />
            <el-x-bubble
              placement="end"
              type="primary"
              content="很好，接下来展示一个可扩展的 AI 侧边栏。"
            />
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script>
export default {
  name: 'AiDemoDrawer',
  data () {
    return {
      visible: false,
      draftMessage: '',
      typewriterContent: '欢迎使用 AI 抽屉示例，这里演示了 Welcome、Typewriter、Bubble 和 Sender 组件的基础组合。'
    }
  },
  methods: {
    show () {
      this.visible = true
    },
    hide () {
      this.visible = false
    },
    toggle () {
      this.visible = !this.visible
    },
    handleSubmit (value) {
      const message = typeof value === 'string' ? value : this.draftMessage
      if (!message || !message.trim()) return
      this.$q.notify({
        type: 'positive',
        message: `示例消息：${message.trim()}`,
        position: 'top'
      })
      this.draftMessage = ''
    }
  }
}
</script>

<style scoped>
.ai-drawer-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.ai-demo-scroll {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.ai-demo-input-section {
  flex-shrink: 0;
}

.ai-demo-section {
  padding: 16px;
  border: 1px solid var(--floatBorderColor, #ebeef5);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
}

.ai-demo-section__title {
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #909399;
}

.ai-demo-typewriter {
  min-height: 72px;
}

.ai-demo-bubbles {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
