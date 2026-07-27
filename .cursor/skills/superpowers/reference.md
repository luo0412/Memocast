# Superpowers 详细参考

本文档是 [SKILL.md](SKILL.md) 的详细参考补充，用于在处理 coolma / Memocast 复杂任务时快速定位常见入口、关键模块和跨子系统调用链。

## 常看路径

```text
src/
├── components/              # 通用组件、编辑器相关组件、列表与面板组件
├── pages/                   # 页面入口，通常能看到布局主结构
├── layouts/                 # App 主布局、Header 等框架层
├── store/                   # Vuex 状态、部分服务动作与数据流入口
├── libs/muya/               # Muya 编辑器核心
├── utils/                   # API、helper、工具方法
├── css/                     # 全局样式、主题变量
├── i18n/                    # 国际化文案
└── boot/                    # 启动注入与初始化

src-electron/
├── electron-main.js         # Electron 主进程入口
├── electron-preload.js      # preload / IPC 桥接相关入口
└── ...                      # 其余桌面端生命周期与能力封装
```

## 关键模块清单

### 1. 页面与布局入口

优先查看这些位置来判断 UI、布局和组件装配关系：

- `src/pages/Index.vue`：页面级入口，常能看到编辑区、列表区、左侧分类/标签/日历区域如何拼装
- `src/layouts/`：主布局、Header、窗口级结构与全局交互入口
- `src/components/`：分类树、笔记列表、编辑器包装组件、抽屉、浮动操作栏

适用问题：

- 三栏 / 双栏 / 单栏布局切换
- 顶部工具栏、右下操作栏、抽屉联动
- 编辑器和列表、树、面板之间的交互

### 2. Muya 编辑器核心

当任务涉及 Markdown 编辑行为、快捷键、Block 渲染、内容变更时，优先关注：

- `src/libs/muya/lib/contentState/`：Block 树、输入处理、回车/退格/删除、格式化
- `src/libs/muya/lib/parser/`：Markdown 解析规则、tokenizer、block/inline 规则
- `src/libs/muya/lib/parser/render/`：虚拟 DOM 渲染、block 与 inline 渲染分发
- `src/libs/muya/lib/eventHandler/`：键盘、鼠标、拖拽、剪贴板事件
- `src/libs/muya/lib/index.js`：编辑器主入口与公开 API

优先配合技能：`muya-design`

### 3. 笔记布局与交互

当任务涉及分栏、面板显隐、切换源码模式、编辑区稳定性时，优先关注：

- `src/pages/Index.vue`：主分割器、内部分割器、Muya / Monaco、浮动操作栏、大纲抽屉
- `src/components/Header.vue`：左侧 category / tag / calendar 切换，右侧 push / pull / layout 交互
- `src/components/CategoryTreePanel.vue`：分类树与标签 treemap 共享承载组件
- `src/components/CalendarPanel.vue`：日历筛选、日期依据、排序联动
- `src/components/NoteList.vue`：列表查询语义如何受 `sidebarTreeType` / `calendarSelectedDate` 影响
- `src/css/` 中的主题变量、布局样式、编辑器容器样式

优先配合技能：`note-layout-design`

### 4. 同步、本地数据与服务端能力

当任务涉及笔记保存、同步、离线逻辑、GUID 映射、本地/云端关系时，优先关注：

- `src/services/SyncService.js`：同步核心逻辑，默认备份到云端，支持手动恢复与恢复预览
- `src/services/CloudSyncService.js`：同步 UI 状态层，区分 push / pull 入口
- `src/utils/DatabaseClient.js`：渲染进程数据库访问入口，封装 notes / sync / categories IPC
- `src/store/server/`：服务端业务动作、落库辅助、标签迁移
- `src/utils/api.js`：WizNote HTTP API 封装层
- `src-electron/main-process/electron-main.js`：主进程数据库 schema、迁移与 IPC handlers

补充判断要点：

- 登录成功后，`AccountServerApi.Login()` 会自动更新知识库 baseUrl，不要重复假设必须手动同步设置
- `updateNoteInfo()` 在当前项目里不只是“改标题”，也可能承担分类移动、标签更新等路径语义
- 当前同步模型以 `dirty` + 本地优先为核心，不要把传统 conflict 状态机当作默认前提

优先配合技能：`sync-design`、`wiznote-api`

### 5. 国际化与文案

当任务新增按钮、提示、错误信息或菜单项时，别忘了检查：

- `src/i18n/zh-cn/`
- `src/i18n/en-us/`

尤其是：

- 新增 UI 字段
- 同步状态说明
- 冲突或重名提示
- 笔记管理操作文案

## 典型问题到模块的映射

### 编辑器输入异常 / Markdown 渲染异常

优先顺序：

1. `src/libs/muya/lib/eventHandler/`
2. `src/libs/muya/lib/contentState/`
3. `src/libs/muya/lib/parser/`
4. `src/libs/muya/lib/parser/render/`

### 切换源码模式 / 所见即所得模式后状态不一致

优先顺序：

1. 编辑器包装组件（通常在 `src/components/` 或 `src/pages/`）
2. 页面级状态字段（如 `isSourceMode`、`dataLoaded`）
3. Muya / Monaco 的数据传递与保存回写逻辑

### 三栏布局、分割器、面板显隐问题

优先顺序：

1. 页面级布局组件
2. `src/layouts/` 中的全局操作入口
3. `src/css/` 样式与 splitter 相关状态

### 新建 / 复制 / 移动 / 重命名笔记行为异常

优先顺序：

1. `src/store/` 或 `src/store/server/` 相关 actions
2. 笔记列表、分类树触发操作的组件
3. 同路径唯一性检查逻辑
4. i18n 文案与用户提示

### 同步逻辑或 WizNote API 相关问题

优先顺序：

1. `src/store/server/`
2. `src/utils/api*`
3. 本地数据库封装与同步状态流转
4. `src-electron/` 中的主进程桥接逻辑

## 跨子系统修改时的检查顺序

如果一个改动同时影响 UI、编辑器、同步或笔记管理，建议按这个顺序检查：

1. 页面入口：谁触发了行为
2. 组件状态：谁持有当前显示或编辑状态
3. 数据入口：谁写入了 store / 本地数据库 / IPC
4. 远端能力：是否进一步调用 WizNote API
5. 收尾文案：是否需要同步更新 i18n

## 与其他技能的配合建议

- 遇到 Muya 内核问题：先看 `muya-design`
- 遇到布局、分栏、显隐和样式问题：先看 `note-layout-design`
- 遇到 WizNote 接口调用、Token、资源上传问题：先看 `wiznote-api`
- 遇到同步策略、本地优先、GUID 映射、状态流转问题：先看 `sync-design`
- 遇到跨多个子系统的复杂任务：先用 `superpowers` 建立执行框架，再进入专项技能

## 工作时的默认提醒

- 优先保持本地优先模型，不轻易引入双向 merge 思维
- 优先保持同路径唯一性，不允许产生不可解释的重名实体
- 优先小步修改，不轻易整体重写成熟模块
- 修改 UI 时同时检查状态、文案和布局联动
- 修改同步逻辑时同时检查本地、云端、映射和提示文案

## 业务枚举与字典

新增 / 修改任何业务枚举时，按 `SKILL.md` 的"业务枚举与字典（enum-plus）"章节强制执行。重点自检项：

- [ ] enum 定义文件位置正确（`src/utils/enum/` 单文件 or `src/utils/const/<Feature>Const.js`）
- [ ] barrel `src/utils/enum/index.js` 顶部 **先** `import './enumSetup.js'` 再 re-export 业务 enum
- [ ] 组件消费用 `enum.items.map(...)` / `enum.findBy('value', v).raw.<field>`，没有写第三方 helper
- [ ] 没有 `this.$enum` 全局原型链访问器（也禁止 `Vue.prototype.$enum = {...}` + `require.context` 自动扫描）
- [ ] 没有再发明 alias 字段（`subLanguage: SubEnum.X`）、computed 别名（`tabGeneral: () => Enum.X`）、wrapper 文件（`runeCategoryEnum.js`）
- [ ] `label` 字段就是 i18n key，调用 `this.$t(enumInst.label(value))`
- [ ] 业务归一化逻辑（"非法 → 默认值"）走独立 `xxxLogic.js`，**不是 enum**
- [ ] 已有 enum 的 `value` 字段不能改字符串，要改就在数据层一次性迁移
