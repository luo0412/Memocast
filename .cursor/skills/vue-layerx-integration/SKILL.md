---
name: vue-layerx-integration
description: Vue 2.7 + Element-UI 项目接入 vue-layerx 命令式弹框（BusDialog）的完整指南。包括依赖安装、组件规范、API调用、App集成、懒加载机制与测试验证。
---

# Vue-Layerx 命令式弹框（BusDialog）接入指南

本指南介绍如何在 Vue 2.7 + Element-UI 项目中接入 **vue-layerx**，实现命令式调用弹框（无需组件引用，支持懒加载、同名多开、Promise API）。

## 1. 技术选型背景

| 方案 | 优点 | 缺点 |
|------|------|------|
| `el-dialog` 直接引用 | 简单直接 | 需要组件引用，无法命令式调用 |
| `$msgbox` / `$confirm` | 命令式 | 仅适合简单确认框 |
| **vue-layerx BusDialog** | 懒加载、多开、Promise、生命周期完整 | 需配合 `App.setup()` 初始化 |

**为什么选 vue-layerx：**
- 业务 SFC **懒加载**（按需 chunk）
- 同类型弹框**支持多开**（session 隔离）
- **Promise API**：支持 `opened.id` / `opened.close()` 控制单次实例
- **Event API**：`this.$busDialog.$emit('XxxBusDialog.open', payload)` 简洁调用
- **容器统一**：`BusLayerContainer` 只透传 props，不维护第二份白名单

---

## 2. 依赖安装

### 2.1 安装 vue-layerx

```bash
yarn add vue-layerx@1.2.1
```

### 2.2 package.json 添加

```json
{
  "dependencies": {
    "vue-layerx": "1.2.1"
  }
}
```

---

## 3. 核心文件结构

```
src/components/common/
├── busDialogBus.js          # 独立的 Vue EventBus（与业务 bus 隔离）
├── busDialogContext.js      # require.context 懒加载扫描
├── busDialogRegistry.js      # 核心 registry（注册/打开/关闭逻辑）
├── BusDialogLayerHost.vue   # vue-layerx portal host（渲染多个 session）
└── BusLayerContainer.vue    # el-dialog/el-drawer 容器封装
```

### 3.1 busDialogBus.js

```js
import Vue from 'vue'

// 专用事件通道，与应用通用 bus 隔离，避免弹框事件与快捷键、网络错误等交叉事件冲突
const busDialog = new Vue()

export default busDialog
```

### 3.2 busDialogContext.js

```js
// 必须是顶层直接调用：webpack 必须静态识别 require.context 才为每个 *BusDialog.vue 单独生成 chunk
const busDialogContext = require.context('src', true, /BusDialog\.vue$/, 'lazy')

export default busDialogContext
```

### 3.3 BusLayerContainer.vue

```vue
<template>
  <el-drawer
    v-if="kind === 'drawer'"
    v-bind="containerProps"
    :visible="visible"
    @update:visible="updateVisible"
  >
    <slot></slot>
  </el-drawer>

  <el-dialog
    v-else
    v-bind="containerProps"
    :visible="visible"
    @update:visible="updateVisible"
  >
    <slot></slot>
  </el-dialog>
</template>

<script>
export default {
  name: 'BusLayerContainer',
  props: {
    visible: { type: Boolean, default: false },
    kind: { type: String, default: 'dialog' },
    busDialogProps: { type: Object, default: () => ({}) }
  },
  computed: {
    // 透传所有 Element UI Dialog/Drawer 支持的 props，不维护第二份白名单
    containerProps () {
      const { container, kind, ...props } = this.busDialogProps
      return props
    }
  },
  methods: {
    updateVisible (visible) {
      this.$emit('update:visible', visible)
    }
  }
}
</script>
```

### 3.4 BusDialogLayerHost.vue

```vue
<template>
  <div class="bus-dialog-layer-host">
    <busLayerContainer
      v-for="session in sessions"
      :key="session.id"
      :visible="true"
      :kind="session.busDialogProps.kind"
      :bus-dialog-props="session.busDialogProps"
      @update:visible="onVisibleChange(session, $event)"
    >
      <component
        :is="session.component"
        :key="session.id"
        v-bind="session.contentProps"
        @close="closeSession(session)"
      />
    </busLayerContainer>
  </div>
</template>

<script>
import BusLayerContainer from './BusLayerContainer.vue'

export default {
  name: 'BusDialogLayerHost',
  components: { busLayerContainer: BusLayerContainer },
  props: {
    sessions: { type: Array, required: true }
  },
  methods: {
    closeSession (session) {
      if (typeof session.close === 'function') {
        session.close()
      }
    },
    onVisibleChange (session, visible) {
      if (!visible) this.closeSession(session)
    }
  }
}
</script>
```

### 3.5 busDialogRegistry.js

完整实现见源文件 `src/components/common/busDialogRegistry.js`，核心逻辑：

- `registerBusDialog(component, path)` / `registerLazyBusDialog(path, loader)` — 注册弹框
- `bindBusDialogHost()` — 在 App.setup() 中调用，绑定 vue-layerx portal host
- `openBusDialog(name, payload)` — Promise API 打开弹框
- `closeBusDialog(name, id)` — 关闭指定 session
- `closeAllBusDialogs(name)` — 关闭同名所有 session
- `startBusDialogs()` — 监听事件（App.mounted 中调用）
- `stopBusDialogs()` — 清理监听（App.beforeDestroy 中调用）

---

## 4. 业务组件编写规范

业务弹框组件必须命名为 `XxxBusDialog.vue`，放在 `src/` 任意目录下。

### 4.1 命名规则

```
✅ AiHelperBusDialog.vue    # 小驼峰 + BusDialog 后缀
✅ UserEditorBusDialog.vue
✅ ConfirmBusDialog.vue
❌ ai-helper-dialog.vue     # kebab-case
❌ AiHelper.vue             # 缺少 BusDialog 后缀
```

### 4.2 必须声明 `busDialogProps`

`busDialogProps` 定义容器（el-dialog/el-drawer）的默认配置，由 registry 自动消费：

```vue
<template>
  <div class="my-dialog-content">
    <p>业务内容：{{ recordId }}</p>
    <el-button @click="$emit('close')">取消</el-button>
    <el-button type="primary" @click="handleConfirm">确定</el-button>
  </div>
</template>

<script>
export default {
  name: 'UserEditorBusDialog',
  props: {
    // 容器默认配置（Dialog 或 Drawer）
    busDialogProps: {
      type: Object,
      default: () => ({
        title: '编辑用户',
        width: '520px',
        appendToBody: true,
        closeOnClickModal: false
      })
    },
    // 业务 payload（由调用方传入）
    recordId: { type: String, required: true },
    userName: { type: String, default: '' }
  },
  methods: {
    handleConfirm () {
      // 执行业务逻辑...
      this.$emit('close')
    }
  }
}
</script>
```

### 4.3 Dialog vs Drawer 配置

**Drawer 配置**（侧边抽屉）：

```js
busDialogProps: {
  type: Object,
  default: () => ({
    container: 'drawer',    // 关键：指定为 drawer
    direction: 'rtl',
    size: '420px',
    customClass: 'my-drawer',
    modal: false,
    appendToBody: true,
    wrapperClosable: false,
    closeOnPressEscape: false,
    zIndex: 9999,
    title: 'AI 助手'
  })
}
```

**Dialog 配置**（居中弹框）：

```js
busDialogProps: {
  type: Object,
  default: () => ({
    container: 'dialog',    // 关键：指定为 dialog
    title: '确认操作',
    width: '400px',
    appendToBody: true,
    closeOnClickModal: false
  })
}
```

---

## 5. API 调用方式

### 5.1 Event API（推荐，简洁）

**打开弹框：**

```js
this.$busDialog.$emit('UserEditorBusDialog.open', { recordId: '42' })
```

**覆盖容器配置（可选）：**

```js
this.$busDialog.$emit('UserEditorBusDialog.open', {
  recordId: '42',
  busDialogProps: { title: '新建用户', width: '640px' }
})
```

**关闭弹框：**

```js
// 无 id → 关闭该类型所有 session
this.$busDialog.$emit('UserEditorBusDialog.close')

// 有 id → 关闭指定 session
this.$busDialog.$emit('UserEditorBusDialog.close', { id: 'UserEditorBusDialog:1' })
```

### 5.2 Promise API（需要控制单次实例时）

```js
const opened = await this.$busDialog.open('UserEditorBusDialog', { recordId: '42' })

if (opened.status === 'opened') {
  console.log('session id:', opened.id)   // 'UserEditorBusDialog:1'
  console.log('close fn:', opened.close) // 关闭函数

  // 延迟关闭示例
  setTimeout(() => opened.close(), 3000)
}
```

**返回值说明：**

| status | 含义 |
|--------|------|
| `opened` | 成功打开，包含 `id` 和 `close()` |
| `unknown` | 弹框未注册 |
| `not-ready` | host 未初始化（需检查 `App.setup()`） |
| `failed` | 加载失败，包含 `error` |
| `cancelled` | 加载中被取消 |

**关闭指定 session：**

```js
this.$busDialog.close('UserEditorBusDialog', 'UserEditorBusDialog:1')
```

**关闭所有同名 session：**

```js
this.$busDialog.closeAll('UserEditorBusDialog')
```

---

## 6. App.vue 集成

### 6.1 必须项：setup() 中初始化

```vue
<template>
  <div id="q-app">
    <router-view />
  </div>
</template>

<script>
import { bindBusDialogHost, startBusDialogs, stopBusDialogs } from './components/common/busDialogRegistry'

export default {
  name: 'App',
  // ⚠️ 必须：vue-layerx 要求 setup() 同步阶段初始化
  setup () {
    bindBusDialogHost()
    return {}
  },
  async mounted () {
    startBusDialogs()
  },
  beforeDestroy () {
    stopBusDialogs()
  }
}
</script>
```

### 6.2 为什么需要 setup() 初始化

vue-layerx 需要在 `setup()` 同步阶段捕获 host parent chain，使 LayerApp 子树能通过 `$root` / `parent chain` 访问主 Vue app 的 `$store` / `$i18n`。setup 外 `clone()` 不会继承 host。

---

## 7. 从零新增一个 BusDialog

### 步骤 1：创建业务组件

`src/components/user/UserEditorBusDialog.vue`：

```vue
<template>
  <div class="user-editor-dialog">
    <el-form :model="form" label-width="80px">
      <el-form-item label="用户名">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="邮箱">
        <el-input v-model="form.email" />
      </el-form-item>
    </el-form>
    <div class="dialog-footer">
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'UserEditorBusDialog',
  props: {
    busDialogProps: {
      type: Object,
      default: () => ({
        title: '编辑用户',
        width: '520px',
        appendToBody: true
      })
    },
    userId: { type: String, default: null }
  },
  data () {
    return {
      form: { name: '', email: '' }
    }
  },
  async mounted () {
    if (this.userId) {
      const user = await fetchUser(this.userId)
      this.form = { name: user.name, email: user.email }
    }
  },
  methods: {
    async handleSave () {
      await saveUser(this.form)
      this.$emit('close')
    }
  }
}
</script>

<style scoped>
.user-editor-dialog {
  padding: 20px;
}
.dialog-footer {
  text-align: right;
  margin-top: 20px;
}
</style>
```

### 步骤 2：在业务代码中调用

```js
// 方式 1：Event API（推荐）
this.$busDialog.$emit('UserEditorBusDialog.open', { userId: '123' })

// 方式 2：Promise API
const opened = await this.$busDialog.open('UserEditorBusDialog', { userId: '123' })
```

### 步骤 3：无需任何导入

由于 `require.context` 自动扫描，调用方**无需导入**组件文件。

---

## 8. 多开 session 隔离

同名弹框支持多开，每个 session 独立运行：

```js
// 打开两个用户编辑弹框
const opened1 = await this.$busDialog.open('UserEditorBusDialog', { userId: '1' })
const opened2 = await this.$busDialog.open('UserEditorBusDialog', { userId: '2' })

// 关闭指定的一个
this.$busDialog.close('UserEditorBusDialog', opened1.id)

// 关闭所有同名弹框
this.$busDialog.closeAll('UserEditorBusDialog')
```

---

## 9. 懒加载机制

`busDialogContext.js` 使用 `require.context` 静态扫描：

```js
const busDialogContext = require.context('src', true, /BusDialog\.vue$/, 'lazy')
```

- **构建时**：webpack 识别到 `require.context`，为每个 `*BusDialog.vue` 生成独立 chunk
- **运行时**：首次调用 `open()` 时才加载对应 chunk
- **注册时机**：registry 在模块加载时自动注册，无需手动维护列表

---

## 10. 测试验证

### 10.1 运行测试

```bash
yarn verify:bus-dialog
```

### 10.2 Jest Mock 配置

测试中需要 mock `vue-layerx` 和 `busDialogContext`：

```js
jest.mock('vue-layerx', () => {
  const layers = []
  const createLayer = jest.fn(() => () => {
    const layer = {
      bindHost: jest.fn(),
      visible: false,
      open: jest.fn(() => { layer.visible = true }),
      close: jest.fn(() => { layer.visible = false })
    }
    layers.push(layer)
    return layer
  })
  return { createLayer, LayerNoContainer: {}, _layers: layers }
})

jest.mock('src/components/common/busDialogContext', () => {
  const context = jest.fn()
  context.keys = () => []
  return { __esModule: true, default: context }
})
```

### 10.3 测试覆盖场景

- ✅ 默认与覆盖容器配置
- ✅ 同名并发多开
- ✅ 内容 `$emit('close')`
- ✅ 原生容器关闭（点击 X / 点击遮罩）
- ✅ 指定 session 关闭
- ✅ 显式 closeAll
- ✅ 加载中取消
- ✅ 加载失败处理
- ✅ `$on/$off` 清理

---

## 11. 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| `status: 'not-ready'` | host 未初始化 | 确保 `App.setup()` 调用了 `bindBusDialogHost()` |
| `status: 'unknown'` | 组件未被发现 | 确认文件名以 `BusDialog.vue` 结尾 |
| 多开失效 | 误用了 `.toggle` | 使用 `$emit('open')` 而非 `.toggle` |
| 样式错乱 | `appendToBody: false` | 设置 `appendToBody: true` 避免 z-index 问题 |
| i18n 失效 | vue-layerx host 不在 parent chain | 使用 `bindBusDialogHost()` 而非手动 `layer.bindHost()` |

---

## 12. 基础设施约束

- 只使用独立的 `this.$busDialog`，不要使用应用通用 bus。
- `bindBusDialogHost()` 必须在 `App.vue` 同步 `setup()` 中调用。vue-layerx 会自动绑定 host，不要手动调用 `layer.bindHost()`。
- vue-layerx 的 setup 外 `clone()` 不会继承 host。registry 因而为每种弹框建立一个轻量 portal host；host 内渲染多个独立 session。
- `BusLayerContainer.vue` 只负责将 `busDialogProps` 透传给 Element UI。不要维护第二份 Dialog/Drawer props 白名单，也不要用 `.sync` 修改 `visible` prop；通过 `update:visible` 回传给 host。
- 业务组件的销毁必须只释放自身资源。不要在可多开的 `XxxBusDialog` 中调用会影响其他实例的全局 `disposeAll()`；需要时使用引用计数或实例级 dispose。
