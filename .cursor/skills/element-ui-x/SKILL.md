---
name: element-ui-x
description: 为 Vue2 + Element-UI 项目接入和使用 Element-UI-X AI 组件库的项目技能。用于在本仓库中创建、调整或扩展 AI 抽屉、聊天面板、打字机效果、欢迎区、消息气泡、输入区等界面。遇到 `vue-element-ui-x`、Element-UI-X、AI 侧边栏、Bubble、Typewriter、Sender、Welcome、Conversations、Prompts、ThoughtChain 等关键词时应使用。
---

# Element-UI-X for coolma

## 目标

在本项目中安全、快速地接入和扩展 `vue-element-ui-x`，优先复用现有 Electron + Quasar + Vue2 + Element-UI 架构，不破坏现有头部、抽屉、笔记编辑区和通知交互。

## 何时使用

当用户提出以下需求时应自动使用本技能：

- 安装或调整 `vue-element-ui-x`
- 在 Vue2 老项目中加入 AI UI 组件
- 新增或修改 AI 抽屉、聊天侧边栏、对话面板
- 使用 `Welcome`、`Typewriter`、`Bubble`、`BubbleList`、`Sender`、`Conversations`、`Prompts`、`Thinking`、`ThoughtChain`
- 参考 Element-UI-X 官方文档或仓库示例实现界面

## 项目内接入约束

- 本仓库使用 `yarn`，不要使用 `npm` 或 `pnpm`。
- 本项目是 Vue2 + Element-UI + Quasar 混合栈，Element-UI-X 必须沿用现有 boot 注册方式。
- 现有通知体系优先使用 `this.$q.notify(...)`，不要默认使用 `this.$message(...)`。
- 新 UI 应尽量挂在已有头部按钮、抽屉或面板体系上，避免引入新的全局入口模式。
- 需要兼顾桌面端布局，避免挤压顶部栏和主编辑区。

## 推荐接入方式

### 1. 依赖管理

- 默认将 `vue-element-ui-x` 放在 `devDependencies`。
- 安装后确认 `package.json` 位置正确，并执行一次安装更新锁文件。

### 2. 全局注册

优先在现有 boot 文件中注册：

- `src/boot/element-ui.js`
- 保持：先 `Vue.use(ElementUI)`，再 `Vue.use(ElementUIX)`

### 3. 入口挂载

本项目优先把 AI 能力挂到：

- `src/components/Header.vue` 的右侧按钮区
- 独立抽屉组件建议放在 `src/components/ui/`

命名建议：

- `AiDemoDrawer.vue`
- `AiChatDrawer.vue`
- `AiAssistantPanel.vue`

## 组件选型建议

### 快速示例

适合首版演示：

- `Welcome`：顶部说明
- `Typewriter`：展示打字效果
- `Bubble` / `BubbleList`：展示消息
- `Sender`：输入区

### 完整对话面板

适合真实聊天：

- `Conversations`：会话管理
- `Prompts`：提示词快捷入口
- `BubbleList`：消息流
- `Sender`：输入
- `Thinking` / `ThoughtChain`：思考中与链路展示

## 布局与样式准则

### 抽屉布局

- 抽屉内容容器应设置明确内边距。
- 推荐内容区使用纵向 flex 布局。
- 输入框通常固定在顶部或底部，先看用户要求；若用户要求“输入框放上面 top”，则把输入模块放在首屏区域。
- 示例区与消息区之间保持 12px 到 16px 间距。
- 不要让内容贴边；桌面抽屉常用 16px 到 20px 内边距。

### 与现有 UI 协同

- 颜色、圆角、边框优先复用现有浮层视觉，如 `var(--floatBorderColor)`。
- 按钮高亮态延续 `Header.vue` 既有 `is-highlight` / `is-active` 风格。
- 若使用 Element-UI-X 组件回调，需要桥接到 Quasar 通知、现有 store 或本地状态。

## 常见坑

### 1. ���知 API 混用

在本项目中，以下写法可能报错：

```js
this.$message({ message: '...' })
```

优先改为：

```js
this.$q.notify({
  type: 'positive',
  message: '...',
  position: 'top'
})
```

### 2. 依赖位置

如果用户明确要求项目运行时依赖保持精简，可将 `vue-element-ui-x` 移到 `devDependencies`。

### 3. 组件顺序

如果用户要求“输入框放上面”，不要沿用常见聊天 UI 的底部输入区默认顺序，应显式把 `Sender` 放在模板顶部。

## 实施流程

1. 先确认依赖是否已安装、位置是否正确。
2. 检查 `src/boot/element-ui.js` 是否已注册。
3. 找到 AI 入口组件，通常是 `src/components/Header.vue`。
4. 读取目标 drawer 组件，按用户要求调整布局与组件顺序。
5. 若需要聊天能力升级，再补 `BubbleList` / `Conversations` / `Prompts`。
6. 修改后对相关 `.vue` 文件做诊断检查。

## 参考来源

实现时优先参考：

- 官方文档首页与组件文档：[https://element-ui-x.com/](https://element-ui-x.com/)
- 官方 docs 仓库目录：[https://github.com/worryzyy/element-ui-x/tree/master/docs](https://github.com/worryzyy/element-ui-x/tree/master/docs)
- 官方仓库 README 与组件列表：[https://github.com/worryzyy/element-ui-x](https://github.com/worryzyy/element-ui-x)

## 输出要求

对用户汇报时：

- 先说依赖与界面是否已完成
- 再说改了哪些文件
- 若参考了官方资料，附上链接
- 若仍是基础示例，明确后续可扩展方向，如会话管理、流式输出、Prompt 面板
