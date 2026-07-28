---
name: note-templates-feature
overview: 在 Settings → 编辑器 增加"模板"子标签，提供模板 CRUD；新建笔记弹框支持选择模板；默认模板为空，标题规则 `# 标题` 始终在最前，模板内容追加到正文区。
todos: []
isProject: false
---

# 笔记模板（CRUD + 新建笔记套用）

## 1. 目标与边界

- **新增能力**：在 Settings → 编辑器 → 模板 标签下，维护一份"笔记模板"（名称、描述、Markdown 正文），可在新建笔记弹框中下拉选择，套用后把模板正文追加到新笔记正文里。
- **保留不变**：笔记标题生成规则（`# 标题` 永远在最前）。`noteMethod` / `noteMethodPrefix` / rune / echo / 同步 / 设置 等不动。
- **默认模板 = 空**：用户没选模板时，新笔记正文仍是 `# {标题}`，与现状 100% 等价。
- **不污染稳定功能**：所有改动只在 §2 列出文件范围；只有 `createNote` 在拼初始正文时多读一个模板字段，标题规则路径不变。

## 2. 已有上下文回顾

- 模板数据源 = SQLite `note_templates` 表（与 `rune_templates` 同库，便于后续纳入同步链路）。
- 主进程 service / IPC 模式严格对齐 `rune-template-service.js` + `electron-main.js` 已有的 `db:getRuneTemplates` 等 handler。
- 前端 panel 渲染对齐 `SettingsRunePanel.vue` / `SettingsEchoPanel.vue`（卡片网格 + 增删改按钮 + 状态过滤）。
- 新建笔记弹框入口在 `src/pages/Index.vue` 的 `addNoteHandler`，最终走 `dispatch('server/createNote', payload)`。

## 3. 落地步骤（按依赖顺序）

### 3.1 已落地（主进程层）

- [新增] `src-electron/main-process/service/note-template-service.js`：schema + CRUD（`ensureSchema / listAll / saveOne / saveMany / remove`），防御性 `normalizeRow`。
- [改] `src-electron/main-process/electron-main.js`：
  - 顶部 `require('./service/note-template-service')` + 模块级 `noteTemplateService` 变量。
  - `initSchema` 末尾调用 `noteTemplateService.ensureSchema()`（不内置 seed，全靠用户录入）。
  - `registerDatabaseHandlers` 注册 4 条 IPC：`db:getNoteTemplates / db:saveNoteTemplate / db:saveNoteTemplates / db:deleteNoteTemplate`。

### 3.2 渲染端 DatabaseClient（在 `src/utils/DatabaseClient.js` 末尾追加）

```javascript
const noteTemplates = {
  async getAll()       { return await invoke('db:getNoteTemplates') },
  async save(item)     { return await invoke('db:saveNoteTemplate', item) },
  async saveMany(list) { return await invoke('db:saveNoteTemplates', list) },
  async remove(id)     { return await invoke('db:deleteNoteTemplate', id) }
}
DatabaseClient.noteTemplates = noteTemplates
```

### 3.3 业务枚举 EditorSubEnum 增加 Template

`src/utils/enum/settingsTabEnum.js`：

```javascript
const EditorSubEnum = Enum({
  Note:     { value: 'note',     label: 'editorNote',     icon: 'article' },
  Panel:    { value: 'panel',    label: 'editorPanel',    icon: 'dashboard' },
  Template: { value: 'template', label: 'editorTemplate', icon: 'description' }  // 新增
})
```

`src/utils/enum/index.js` 内 `EditorSubEnum` 已经透出，无需调整。

### 3.4 新增 SettingsNoteTemplatePanel

`src/components/settings/SettingsNoteTemplatePanel.vue`（参照 `SettingsRunePanel.vue` 风格但更轻量）：

- 接收 props `noteTemplates: Array`，emit `update-note-templates / add-template / edit-template / delete-template / batch-delete`。
- 顶部一行 toolbar：左标题"笔记模板"+ 计数 badge，右侧按钮（无选中态=新增 / 有选中态=批量删除）。
- 主体：卡片网格（每张 280px），显示名称、描述预览、前 100 字模板内容预览、编辑/删除按钮、checkbox 选中。
- 空状态：引导"暂无模板，点击右上角新增"。
- 排序：内置（`is_builtin=1`）排最前；同组内按 `sort_order` 升序。

### 3.5 新增 NoteTemplateFormDialog（独立组件，遵循 vue-dialog-component 规则）

`src/components/settings/NoteTemplateFormDialog.vue`：

- 接收 `value`(visible) / `template`(编辑对象，可空) / `onSubmit` event。
- 字段：name（必填）、desc（可选）、content（q-input type="textarea"，行高 16，支持粘贴 Markdown）。
- 提交时若 name 为空 / 已有同名，返回明确的 i18n 提示。
- 关闭