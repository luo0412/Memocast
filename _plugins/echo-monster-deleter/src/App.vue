<!--
  App.vue —— 演示页：
    - 顶部一行 hero：标题 + 「召唤怪兽」按钮
    - 模拟"桌面文件"tiles（点击 → 召唤怪兽 → 询问 → 踹爆 → 文件标记为已摧毁）
    - 底部面板：当前阶段 + 状态字符串
-->

<template>
  <div class="app-root">
    <header class="app-header">
      <h1>🐲 大将怪兽摧毁 · Web 复刻</h1>
      <p class="subtitle">从 <a href="https://github.com/531149627/MonsterDeleter" target="_blank">531149627/MonsterDeleter</a> 移植到 Web</p>
      <div class="header-actions">
        <button
          class="trigger-btn"
          :disabled="!hasAliveFiles"
          @click="summonOnRandomFile"
        >🎯 召唤怪兽随机摧毁一个文件</button>
        <button
          class="reset-btn"
          :disabled="!hasDestroyedFiles"
          @click="resetAllFiles"
        >🔄 重置所有文件</button>
        <span class="stats">
          已摧毁 <strong>{{ destroyedCount }}</strong> / {{ fakeFiles.length }}
        </span>
      </div>
    </header>

    <main class="desktop">
      <div
        v-for="file in fakeFiles"
        :key="file.name"
        class="file-tile"
        :class="{
          'file-tile-evil': file.corrupt && !file.destroyed,
          'file-tile-destroyed': file.destroyed,
          'file-tile-targeted': file === targetFile
        }"
        @click="summonOnFile(file)"
      >
        <div class="file-icon">{{ file.destroyed ? '💥' : file.icon }}</div>
        <div class="file-name">
          <s v-if="file.destroyed">{{ file.name }}</s>
          <span v-else>{{ file.name }}</span>
        </div>
        <div class="file-meta">
          <span v-if="file.destroyed" class="meta-destroyed">已摧毁</span>
          <span v-else>{{ file.size }}</span>
        </div>
      </div>
    </main>

    <MonsterStage
      ref="stage"
      :visible="stageVisible"
      :target-pos="targetPos"
      :on-finished="onFinished"
      @target-selected="onTargetSelected"
      @choice="onChoice"
    />

    <footer class="app-footer">
      <div class="stage-log">
        <span class="stage-log-label">当前阶段：</span>
        <code>{{ currentStage }}</code>
      </div>
      <div class="stage-log">
        <span class="stage-log-label">状态：</span>
        <code>{{ lastLog }}</code>
      </div>
    </footer>
  </div>
</template>

<script>
import MonsterStage from './components/monsterStage.vue'
import { STAGE } from './utils/monsterSequence.js'

const FAKE_FILES = [
  { name: '毕业论文.docx', icon: '📄', size: '2.1 MB', corrupt: false },
  { name: '需求文档.pdf', icon: '📕', size: '5.8 MB', corrupt: false },
  { name: 'demo.mp4', icon: '🎬', size: '128 MB', corrupt: false },
  { name: 'err.log', icon: '🐛', size: '12 KB', corrupt: true },
  { name: 'intern-report.xlsx', icon: '📊', size: '768 KB', corrupt: false },
  { name: 'unused-app.exe', icon: '⚙️', size: '44 MB', corrupt: true },
  { name: 'old-photo.jpg', icon: '🖼️', size: '3.2 MB', corrupt: false },
  { name: 'tempfile.tmp', icon: '🗑️', size: '128 KB', corrupt: false }
]

export default {
  name: 'app',
  components: { MonsterStage },
  data () {
    return {
      fakeFiles: FAKE_FILES.map(f => ({ ...f, destroyed: false })),
      stageVisible: false,
      targetFile: null,
      targetPos: { x: 0, y: 0 },
      currentStage: STAGE.IDLE,
      lastLog: '点击文件 → 召唤怪兽'
    }
  },
  computed: {
    destroyedCount () {
      return this.fakeFiles.filter(f => f.destroyed).length
    },
    hasAliveFiles () {
      return this.fakeFiles.some(f => !f.destroyed)
    },
    hasDestroyedFiles () {
      return this.fakeFiles.some(f => f.destroyed)
    }
  },
  methods: {
    summonOnFile (file) {
      if (this.stageVisible) {
        this.lastLog = '怪兽正在出没，请等本轮结束'
        return
      }
      if (file.destroyed) {
        this.lastLog = `${file.name} 已被摧毁，换一个吧`
        return
      }
      // 先把上一轮的残留选定 / 锚点状态清掉（避免重生后还能看到上轮的高亮）
      this.targetFile = null
      this.currentStage = STAGE.IDLE
      this.targetFile = file
      // 找 tile DOM 中心，作为默认瞄准点（PyQt 原版要求用户用红色十字再点）
      // 这里是 Web 体验优化：自动把瞄准点放在文件中心，等用户再次点击可微调
      this.$nextTick(() => {
        const tiles = document.querySelectorAll('.file-tile')
        let targetTile = null
        for (const t of tiles) {
          if (t.textContent.trim().startsWith(file.icon)) {
            targetTile = t
            break
          }
        }
        const rect = targetTile
          ? targetTile.getBoundingClientRect()
          : { left: 0, top: 0, width: 0, height: 0 }
        const targetPos = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        }
        this.targetPos = targetPos
        // 只打开 overlay + 狙击光标，怪兽还没召来
        this.stageVisible = true
        this.lastLog = `瞄准 ${file.name}（点击 overlay 微调瞄准点，或直接看怪兽走来）`
      })
    },
    summonOnRandomFile () {
      const candidates = this.fakeFiles.filter(f => !f.destroyed)
      if (!candidates.length) {
        this.lastLog = '无可摧毁文件，点"重置"恢复'
        return
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)]
      this.summonOnFile(pick)
    },
    onTargetSelected (target) {
      // monsterStage 内部已经直接调 performSequence() 启动怪兽走；
      // 这里只更新文案，让底部状态栏反映瞄准点
      this.lastLog = `狙击定位到 (${Math.round(target.x)}, ${Math.round(target.y)})，怪兽正在赶来`
    },
    onChoice (label) {
      this.lastLog = `用户选择：${label}`
    },
    onStageChange (stage) {
      this.currentStage = stage
    },
    onFinished () {
      // 整个 5 阶段剧本结束：标记目标文件被摧毁 + 隐藏舞台 + 彻底清理锚点状态
      if (this.targetFile) {
        const ix = this.fakeFiles.findIndex(f => f === this.targetFile)
        if (ix !== -1) {
          // 重新赋值以触发响应式（Vue 2.7 替换对象即可）
          this.$set(this.fakeFiles, ix, { ...this.fakeFiles[ix], destroyed: true })
        }
      }
      // 彻底重置状态机（避免上轮 AWAIT_AIM / WALK 等残留影响下一轮召唤）
      this.targetFile = null
      this.stageVisible = false
      this.currentStage = STAGE.IDLE
      this.lastLog = this.destroyedCount === this.fakeFiles.length
        ? '全部文件都已被摧毁 ✓ 点"重置"恢复'
        : `本轮结束，已摧毁 ${this.destroyedCount} 个文件`
    },
    resetAllFiles () {
      this.fakeFiles = FAKE_FILES.map(f => ({ ...f, destroyed: false }))
      this.targetFile = null
      this.stageVisible = false
      this.currentStage = STAGE.IDLE
      this.lastLog = '已重置所有文件'
    }
  }
}
</script>

<style scoped>
.app-root {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #fff;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  display: flex;
  flex-direction: column;
}
.app-header {
  padding: 24px 32px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.app-header h1 {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 700;
}
.subtitle {
  margin: 0 0 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}
.subtitle a {
  color: #80d8ff;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.trigger-btn,
.reset-btn {
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.trigger-btn {
  background: #ff5252;
  box-shadow: 0 4px 12px rgba(255, 82, 82, 0.4);
}
.trigger-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 82, 82, 0.6);
}
.trigger-btn:disabled,
.reset-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.reset-btn {
  background: #448aff;
  box-shadow: 0 4px 12px rgba(68, 138, 255, 0.4);
}
.reset-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(68, 138, 255, 0.6);
}
.stats {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  margin-left: auto;
}
.stats strong {
  color: #ff8a80;
  font-weight: 700;
}
.desktop {
  flex: 1;
  padding: 32px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 18px;
  align-content: start;
}
.file-tile {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 16px 12px;
  cursor: pointer;
  text-align: center;
  transition: transform 0.15s, background 0.15s, border-color 0.15s, opacity 0.3s;
  user-select: none;
}
.file-tile:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.25);
}
.file-tile.file-tile-evil {
  border-color: rgba(255, 82, 82, 0.4);
  background: rgba(255, 82, 82, 0.08);
}
.file-tile.file-tile-targeted {
  outline: 2px solid #ffeb3b;
  outline-offset: 2px;
  box-shadow: 0 0 0 6px rgba(255, 235, 59, 0.2);
  animation: target-pulse 0.8s ease-in-out infinite alternate;
}
@keyframes target-pulse {
  from { box-shadow: 0 0 0 6px rgba(255, 235, 59, 0.2); }
  to   { box-shadow: 0 0 0 10px rgba(255, 235, 59, 0.05); }
}
.file-tile.file-tile-destroyed {
  opacity: 0.55;
  background: rgba(80, 0, 0, 0.25);
  border-color: rgba(255, 82, 82, 0.5);
  cursor: not-allowed;
  filter: grayscale(0.6);
}
.file-tile.file-tile-destroyed:hover {
  transform: none;
  background: rgba(80, 0, 0, 0.25);
}
.file-tile.file-tile-destroyed::before {
  content: '💥';
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 16px;
  opacity: 0.8;
}
.file-icon {
  font-size: 36px;
  margin-bottom: 8px;
}
.file-tile-destroyed .file-icon {
  font-size: 36px;
  filter: hue-rotate(15deg) brightness(0.8);
}
.file-name {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
  word-break: break-all;
}
.file-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}
.meta-destroyed {
  color: #ff8a80;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.app-footer {
  padding: 16px 32px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}
.stage-log code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  color: #80d8ff;
}
</style>
