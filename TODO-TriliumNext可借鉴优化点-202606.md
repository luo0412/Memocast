# TriliumNext 可借鉴优化点 — Memocast 对照分析

> 参考：[TriliumNext/Trilium](https://github.com/TriliumNext/Trilium) — v0.103.0 (2026-05-13) · 36.5k Stars
> 日期：2026-06-21

---

## 零、背景

TriliumNext 是当前最成熟的开源层级笔记应用之一，Trilium 为 Memocast 的架构演进提供了大量可直接参照的设计思路。本文档从**架构层、前端工程、数据层、搜索、同步、安全、性能、编辑器、多视图、自动保存**等维度，梳理可借鉴的优化点，按优先级与可行性分类。

---

## 一、架构与工程

### 1.1 TypeScript Monorepo 结构

**现状：** Memocast 使用 JavaScript 主进程 + Vue2，缺少分层的包结构，代码组织较扁平。

**Trilium 方案：**

```
trilium/
├── apps/
│   ├── client/      # 前端（Preact）
│   ├── server/      # Node.js 后端（Express）
│   ├── desktop/     # Electron 包装
│   └── ...
├── packages/
│   ├── trilium-core/       # 核心共享逻辑（数据库、实体、搜索）
│   ├── ckeditor5/          # 编辑器定制
│   ├── codemirror/         # 代码编辑器定制
│   └── ...
```

- 所有内部依赖使用 `workspace:*` 协议
- 前端代码在桌面和服务器模式间**完全共享**
- `packages/trilium-core` 封装了实体（BNote、BBranch）、SQL、搜索等核心逻辑

**Memocast 可借鉴：**

- [ ] 逐步将主进程代码迁移到 TypeScript（Electron 主进程和 preload 已具备条件）
- [ ] 提取 `packages/memo-core`：封装数据库操作、实体模型、同步协议等核心逻辑
- [ ] 前端（Quasar/Vue2）通过 IPC 与 core 包通信，实现前后端类型共享
- [ ] 使用 workspace 协议管理内部包依赖

**优先级：高 | 难度：中 | 收益：长期可维护性大幅提升**

---

### 1.2 客户端-服务端统一架构

**现状：** Memocast 是纯桌面应用，后端逻辑嵌入在 Electron 主进程中，缺少独立的 API 层。

**Trilium 方案：** 即使在桌面模式下，Trilium 依然运行一套完整的 Express 后端，前端通过内部 HTTP/WebSocket 与后端通信。这使得桌面和服务器模式共享同一套代码。

**Memocast 可借鉴：**

- [ ] 在 Electron 主进程中运行精简的 Express 服务，封装所有数据操作 API
- [ ] 前端通过 fetch/axios 调用本地 API，而非直接调用 Node 模块
- [ ] 为未来服务器部署模式打下基础（移动端 Web 访问、多设备同步）
- [ ] API 路由统一管理，便于权限控制、日志记录和事务包装

**优先级：中 | 难度：高 | 收益：支持多设备、简化前端逻辑**

---

## 二、前端架构

### 2.1 AppContext 命令/事件总线

**现状：** Memocast 依赖 Vuex 进行全局状态管理，组件间通信主要通过 Vuex action/mutation，缺少细粒度的命令分发机制。

**Trilium 方案：**

```typescript
// AppContext 作为全局协调中心
// - 命令（Command）：向上冒泡，由唯一一个组件处理
// - 事件（Event）：向下广播，通知所有订阅者

triggerCommand('focusOnTitle', { noteId: 'xxx' });
// 从当前焦点组件向上冒泡直到找到处理者

handleEvent('noteSwitched', { noteId: 'xxx' });
// 从根节点向下广播到所有后代组件
```

- 命令和事件均通过 TypeScript 接口强类型约束
- 避免直接组件引用，降低耦合
- 关键事件：`noteSwitched`、`entitiesReloaded`、`beforeNoteSwitch`

**Memocast 可借鉴：**

- [ ] 实现一个轻量 `EventBus` 服务（主进程/渲染进程均可使用）
- [ ] 定义标准命令列表（打开笔记、保存笔记、切换分类等）
- [ ] 关键事件自动强制保存（`beforeNoteSwitch` 时立即 flush pending saves）

**优先级：中 | 难度：低 | 收益：解耦组件、提升响应一致性**

---

### 2.2 froca：前端实体缓存层

**现状：** Memocast 通过 Vuex 缓存笔记列表，每次切换笔记时从 SQLite 重新拉取，缺少统一的前端实体抽象。

**Trilium 方案：**

```
froca (Frontend Cache)
├── FNote    # 笔记元数据（title, type, mime, isProtected）
├── FBranch  # 树节点关系（noteId, parentNoteId, notePosition）
└── FBlob    # 笔记内容（实际文本、图片等）
```

- `froca` 是前端"只读缓存"，通过 WebSocket 增量同步更新
- 组件直接读 froca 而非每次发请求
- 实体变更通过 `entitiesReloaded` 事件通知
- `componentId` 机制避免组件收到自己触发的更新

**Memocast 可借鉴：**

- [ ] 在渲染进程实现 `froca` 等价物：`EntityCache`（FNote、FCategory）
- [ ] 主进程变更后通过 IPC/WebSocket 推送增量更新到前端缓存
- [ ] 组件优先读缓存，缓存未命中再请求主进程
- [ ] 利用 `dirty` 字段机制驱动缓存失效

**优先级：中 | 难度：中 | 收益：减少 IPC 调用、提升响应速度**

---

### 2.3 SpacedUpdate 防抖自动保存

**现状：** Memocast 的自动保存逻辑较简单，可能存在频繁保存或保存时机不当的问题。

**Trilium 方案：**

```
SpacedUpdate 防抖保存策略：
1. 变更触发 scheduleUpdate()，启动 1000ms 定时器
2. 以下关键时机强制立即保存（updateNowIfNecessary()）：
   - beforeNoteSwitch（切换笔记前）
   - beforeNoteContextRemove（关闭标签前）
   - beforeunload（页面卸载前）
```

- 编辑器内容通过 `useEditorSpacedUpdate` hook 管理
- 防抖避免频繁 IO，关键节点强制同步
- `getData()` 回调按需从编辑器获取最新状态

**Memocast 可借鉴：**

- [ ] 实现 `SpacedUpdate` 服务：防抖保存 + 关键节点强制 flush
- [ ] Monaco 编辑器内容变更触发防抖保存
- [ ] 切换笔记/关闭窗口时强制保存
- [ ] 暴露保存状态给 UI（保存中.../已保存）

**优先级：高 | 难度：低 | 收益：防数据丢失、提升响应性**

---

## 三、数据层

### 3.1 SQLite 索引策略

**现状：** Memocast 使用 sql.js（纯内存 SQLite），缺少细致的索引规划。

**Trilium 方案（PR #9141 — 2026 年 4 月）：**

为 `entity_changes` 表增加了关键复合索引：

```sql
-- sync push 路径是最热查询路径
CREATE INDEX IDX_entity_changes_isSynced_id ON entity_changes(isSynced, id);
-- (isSynced=1, id>?) 可直接跳到未同步记录，无需全表扫描

-- 其他关键索引：
IDX_entity_changes_isErased_entityName
IDX_attachments_isDeleted_utcDateModified
IDX_branches_isDeleted_utcDateModified
IDX_notes_isDeleted_utcDateModified
IDX_attributes_isDeleted_utcDateModified
IDX_attachments_utcDateScheduledForErasureSince
IDX_branches_parentNoteId_isDeleted_notePosition
```

- 索引总大小仅增加 ~3.7 MB（0.46% 数据库体积）
- `MAX(id)` 查询和范围扫描大幅加速
- 索引按查询频率排序优先级

**Memocast 可借鉴：**

- [ ] 审查当前 sql.js 模式，为 `notes.dirty`、`category.updated_at` 等字段添加索引
- [ ] 为分类树查询路径（parent_id + position）添加复合索引
- [ ] 评估是否切换到 better-sqlite3（原位持久化 + 显著性能提升）
- [ ] 引入 `ANALYZE` 命令优化查询计划

**优先级：高 | 难度：低 | 收益：10-100x 查询加速**

---

### 3.2 SQLite FTS5 全文搜索

**现状：** Memocast 的搜索基于 SQL `LIKE` 或内存过滤，大词库下性能瓶颈明显。

**Trilium 方案（PR #6839 — FTS5 实现）：**

- 使用 SQLite FTS5 虚拟表 + trigram 分词器
- **50-100x** 子串匹配加速（O(n) -> O(log n)）
- 支持 CJK、阿拉伯文等多语言
- 自动通过 TRIGGER 同步 FTS 索引
- 18 个辅助索引覆盖常见查询模式

**Memocast 可借鉴：**

- [ ] 迁移 sql.js -> better-sqlite3（sql.js 不支持 FTS5）
- [ ] 创建 `notes_fts` FTS5 虚拟表
- [ ] 实现 TRIGGER 自动同步（INSERT/UPDATE/DELETE on notes）
- [ ] 复用 Trilium 的 snippet 提取逻辑（高亮匹配片段）
- [ ] 搜索 API 返回匹配位置和上下文片段

**优先级：高 | 难度：中 | 收益：50-100x 搜索加速**

---

### 3.3 Search 性能优化（PR #9034 — 2026 年 4 月）

**Trilium 新增优化：**

| 优化项 | 说明 |
|--------|------|
| 扁平文本索引缓存 | 预计算 `title + content` 文本用于快速扫描 |
| 自动补全快速路径 | 单 token 时绕过递归父路径遍历，直接 `getBestNotePath()` |
| fuzzy matching 可配置 | 全局开关 + 自动补全单独开关 |
| snippet 提取优化 | 减少每结果归一化开销 |
| 搜索性能测试套件 | `search_profiling.spec.ts` 量化回归 |

**Memocast 可借鉴：**

- [ ] 实现模糊搜索的可配置控制（精确/模糊切换）
- [ ] 自动补全时使用 `title` 索引走快速路径，避免全量扫描
- [ ] 搜索结果返回上下文片段（前后各 N 个字符，高亮关键词）
- [ ] 建立搜索性能基准测试，防止回归

**优先级：中 | 难度：中 | 收益：搜索延迟降低 5-10x**

---

## 四、同步机制

### 4.1 entity_changes 增量同步

**现状：** Memocast 使用 `dirty` 字段标记变更，通过 WizNote API 同步。

**Trilium 方案：**

```sql
-- entity_changes 表记录每条变更的最小单元
-- sync push 每次拉取 1000 条，循环处理直到全部同步
-- 复合索引 (isSynced, id) 保证范围扫描最优
```

- **变更粒度细化到实体级别**（note/branch/attribute/attachment 各自独立记录）
- 同步状态通过 `isSynced` 字段跟踪
- **冲突处理**：以时间戳 + 实体 hash 判定优先权
- 支持部分同步（先拉取元数据，再按需拉取 blob 内容）

**Memocast 可借鉴：**

- [ ] 引入 `entity_changes` 表（参考 TODO-存储机制切换 已有 dirty 机制）
- [ ] 同步时按 500-1000 条批量推送，避免单次大请求
- [ ] 内容 hash 机制（对比本地 vs 远端 hash 判定是否需推送）
- [ ] **Worker Thread 并行化 content hash 计算**（Trilium 当前阻塞 UI，PR #7225 待解决）

**优先级：高 | 难度：高 | 收益：同步可靠性、离线体验**

---

### 4.2 WebSocket 实时同步

**现状：** Memocast 同步为轮询或手动触发模式。

**Trilium 方案：**

```typescript
// ws 服务（WebSocket）
// - 推送实体增量变更到客户端
// - 前端通过 entitiesReloaded 事件更新 froca 缓存
// - 连接保持心跳，断线自动重连
```

- 服务端变更通过 WebSocket 推送到所有连接的客户端
- 前端无需频繁轮询，即时感知他人修改
- 离线期间变更在重连后自动同步

**Memocast 可借鉴：**

- [ ] WizNote 同步服务增加 WebSocket 通知通道
- [ ] 前端订阅变更事件，实时更新笔记树
- [ ] 多设备场景下即时感知其他设备变更
- [ ] 重连时基于 `entity_changes` 补发离线期间变更

**优先级：中 | 难度：高 | 收益：多设备实时协同**

---

## 五、安全

### 5.1 每笔记 AES 加密

**现状：** Memocast 暂无细粒度加密能力。

**Trilium 方案：**

- 每条笔记独立 AES-128-CBC 加密
- 受保护笔记存储为密文，仅在输入密码解锁后解密到内存
- `protected_session` 管理会话超时和重新认证
- 加密笔记不纳入全文搜索索引（安全边界）

**Memocast 可借鉴：**

- [ ] 实现笔记级 AES-256 加密（CryptoJS 或 Node crypto）
- [ ] 受保护笔记的 `content` 字段存储密文，内存中解密
- [ ] 提供密码设置/修改/清除界面
- [ ] 加密笔记在笔记树中用特殊图标标识

**优先级：中 | 难度：中 | 收益：数据安全**

---

### 5.2 CSRF 防护与 SQL 注入防护

**Trilium 方案：**

- 所有状态变更 API 需要 CSRF token
- 所有 SQL 使用 prepared statement 参数化查询
- HTML 内容通过 DOMPurify 消毒

**Memocast 可借鉴：**

- [ ] API 层增加 CSRF token 验证
- [ ] 全局审查 SQL 拼接，禁止字符串拼接 SQL
- [ ] 渲染 Markdown 内容时消毒 HTML（防止 XSS）

**优先级：中 | 难度：低 | 收益：安全基线**

---

## 六、编辑器与多视图

### 6.1 CKEditor5 WYSIWYG 编辑器

**现状：** Memocast 主要使用 Monaco Editor（代码）和 Muya（Markdown 源码），缺少所见即所得的富文本编辑体验。

**Trilium 方案：**

- CKEditor5 作为默认富文本编辑器
- 自定义插件生态：admonition、footnote、math（LaTeX）、mermaid diagram
- Markdown autoformat（输入 `**bold**` 自动转为加粗）
- CodeMirror 用于代码笔记，提供语法高亮

**Memocast 可借鉴：**

- [ ] 评估引入 CKEditor5 作为富文本笔记选项（与 Monaco/Muya 并存）
- [ ] 开发 Memocast 专属 CKEditor 插件（符文渲染、数学公式）
- [ ] 或增强 Muya：加入 admonition（:::warning）、脚注、mermaid 块渲染
- [ ] 统一快捷键体系，在 Markdown 和富文本模式间平滑切换

**优先级：中 | 难度：高 | 收益：拓宽适用场景**

---

### 6.2 多种笔记视图（Collection Views）

**现状：** Memocast 主要提供树形列表视图。

**Trilium 提供的视图：**

| 视图 | 用途 |
|------|------|
| Table View | 表格型数据，支持排序筛选 |
| Board View | 看板（类似 Trello 的列+卡片） |
| List View | 结构化列表 |
| Grid View | 卡片网格 |
| Calendar View | 日期视图 |
| Geo Map | 地理位置视图 |
| Mind Map | 思维导图 |
| Relation Map | 笔记关系图谱 |

**Memocast 可借鉴：**

- [ ] 引入思维导图视图（已有 markmap/mermaid 渲染，可扩展）
- [ ] 日历视图（按创建/修改日期聚合笔记）
- [ ] 标签云/矩形树图视图（已有初步实现，可优化）
- [ ] 看板视图（用于项目管理和工作流）

**优先级：中 | 难度：中 | 收益：丰富内容组织方式**

---

### 6.3 Canvas 白板（Excalidraw）

**现状：** Memocast 无手绘白板功能。

**Trilium 方案：**

- 基于 Excalidraw 的 Canvas 笔记类型
- 支持绑制、手写、嵌入图片和文字
- 存储为 Excalidraw JSON 格式

**Memocast 可借鉴：**

- [ ] 集成 Excalidraw 作为 Canvas 笔记类型
- [ ] 利用已有 jsxgraph 和 mermaid 扩展渲染能力
- [ ] Canvas 内容通过 `note_type='canvas'` 和独立 blob 存储

**优先级：低 | 难度：中 | 收益：差异化竞争力**

---

## 七、自动保存与数据完整性

### 7.1 SpacedUpdate（已在 2.3 详述）

核心：防抖 1000ms + 关键节点强制 flush + 保存状态 UI 反馈

### 7.2 笔记版本历史

**Trilium 方案：**

- 每次保存自动创建 revision 记录
- 支持版本历史浏览和回滚
- 存储为 `revisions` 表（noteId + content + timestamp）

**Memocast 可借鉴：**

- [ ] 实现轻量版本历史（保存最近 N 个快照）
- [ ] 笔记右键菜单增加"查看历史"入口
- [ ] 对比两个版本差异（diff 视图）
- [ ] 一键回滚到指定版本

**优先级：中 | 难度：中 | 收益：防误操作、支持追溯**

---

## 八、OCR 与多媒体

### 8.1 内置 OCR

**现状：** Memocast 无 OCR 能力。

**Trilium 方案（v0.103.0）：**

- 内置 OCR 支持图片、PDF、Office 文档（Word/PowerPoint/Spreadsheet）文本提取
- OCR 文本自动整合到笔记全文索引，支持搜索
- 可配置 OCR 提供商（Tesseract 或云服务）

**Memocast 可借鉴：**

- [ ] 截图/图片粘贴时自动 OCR 提取文字
- [ ] PDF 导入时提取文本内容
- [ ] OCR 结果存储到笔记内容，支持全文搜索
- [ ] 可选：集成 Tesseract.js（客户端 OCR）或调用云 OCR API

**优先级：低 | 难度：高 | 收益：提升内容获取效率**

---

## 九、AI / LLM 集成

### 9.1 LLM Chat 集成

**Trilium 方案（v0.103.0 重新引入）：**

- LLM Chat 作为特殊笔记类型（`llmChat`）
- 聊天记录按月组织（`llmChat/YYYY-MM/`）
- Sidebar 提供工具：修改笔记、运行脚本
- 支持多模型配置

**Memocast 可借鉴：**

- [ ] 已有 AI 对话能力，参考 Trilium 的笔记集成方式
- [ ] 对话结果可选择性"追加到当前笔记"或"创建新笔记"
- [ ] AI Sidebar 工具增强：自动补全、翻译、摘要
- [ ] 聊天记录持久化为笔记（Markdown 格式），支持搜索

**优先级：中 | 难度：低 | 收益：AI 与笔记深度结合**

---

## 十、其他可借鉴点

### 10.1 笔记克隆（多父节点）

Trilium 允许一条笔记出现在树的多个位置（clone），Memocast 可借鉴实现**同一笔记归属多个分类**的能力。

### 10.2 属性/标签查询

Trilium 的 `attributes` 系统支持 `#label=value` 和 `~relation=target` 查询语法，Memocast 可增强标签查询 DSL。

### 10.3 导入/导出生态

- Evernote 导入（Trilium 原生支持）
- Markdown 批量导入导出
- Web Clipper 浏览器扩展

### 10.4 国际化（i18n）

Trilium 支持 20+ 语言，Memocast 可考虑引入 vue-i18n 架构（第 47 行已安装但可能未充分利用）。

---

## 十一、优化优先级汇总

| 优先级 | 优化项 | 难度 | 收益 |
|--------|--------|------|------|
| 🔴 高 | SQLite 索引优化 | 低 | 10-100x 查询加速 |
| 🔴 高 | SpacedUpdate 防抖保存 | 低 | 防数据丢失 |
| 🔴 高 | SQLite FTS5 全文搜索 | 中 | 50-100x 搜索加速 |
| 🔴 高 | entity_changes 增量同步 | 高 | 同步可靠性 |
| 🟡 中 | Search 性能优化 | 中 | 5-10x 搜索加速 |
| 🟡 中 | froca 前端实体缓存 | 中 | 减少 IPC 调用 |
| 🟡 中 | AppContext 事件总线 | 低 | 解耦组件 |
| 🟡 中 | 笔记版本历史 | 中 | 防误操作 |
| 🟡 中 | CKEditor5 集成 | 高 | 富文本能力 |
| 🟡 中 | TypeScript Monorepo | 中 | 可维护性 |
| 🟢 低 | OCR 集成 | 高 | 内容获取 |
| 🟢 低 | Canvas 白板 | 中 | 差异化功能 |
| 🟢 低 | 多视图（看板/日历等） | 中 | 丰富组织方式 |

---

## 十二、总结

TriliumNext 的核心优势在于：

1. **前端架构**：AppContext 总线 + froca 缓存 + SpacedUpdate 防抖 = 高内聚低耦合
2. **数据层**：FTS5 全文搜索 + 精细索引 + entity_changes 变更追踪 = 可靠高效
3. **同步**：客户端-服务端分离架构 + WebSocket 推送 = 多设备无缝体验
4. **安全**：每笔记 AES 加密 + CSRF + 参数化查询 = 纵深防御
5. **编辑器生态**：CKEditor5 + CodeMirror + Excalidraw + Univer Sheets = 全类型覆盖

Memocast 作为 Vue2 + Electron 笔记应用，与其差距主要在**搜索性能**、**同步可靠性**和**前端架构规范性**上。优先推荐实施：**FTS5 搜索 > 防抖保存 > SQLite 索引 > 事件总线**。
