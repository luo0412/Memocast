# Memocast 借鉴 SiYuan 优化点规划

> 参照：https://github.com/siyuan-note/siyuan (44.5k stars, AGPL-3.0)
> 整理时间：2026-06-21

---

## 一、架构层面

### 1. 前后端分离：Go Kernel 化
**SiYuan 方案：** Go 编写的独立内核 `kernel/` 编译为 `SiYuan-Kernel` 可执行文件，运行在 6806 端口，通过 HTTP/WebSocket 为多端（桌面 Electron / 移动 App / Web / Docker）提供统一 API 服务。

**Memocast 现状：** Electron 主进程处理数据逻辑，尚未独立为可服务多端的内核。

**可借鉴方向：**
- 将核心数据操作（笔记 CRUD、分类管理、搜索、块引用链路）抽取为独立 Go 服务 `memocast-kernel`
- 内核暴露 REST + WebSocket API，前端只负责渲染
- 移动端（HBuilder / Tauri）可直接复用同一内核
- Docker 部署时，内核服务运行在容器内，支持通过浏览器访问

**优先级：** 高（架构重构收益最大，但成本也最高，建议作为中长期目标）

### 2. 混合存储：文件 + SQLite 双轨
**SiYuan 方案：** `.sy` JSON 文件做主存储（便携性与同步稳定性），SQLite（`siyuan.db` / `blocktree.db` / `history.db`）做高性能索引。

**Memocast 现状：** 主要依赖 SQLite 存储。

**可借鉴方向：**
- 考虑将笔记内容序列化存储为 `.md.json` 或 `.memocast` 文件作为快照/备份格式
- SQLite 专注于索引层（全文检索、块引用关系、标签索引）
- 在 `temp` 目录维护 `blocktree.db` 用于大纲导航，区分"内容存储"与"导航索引"

**优先级：** 中（可渐进改造）

---

## 二、数据模型

### 3. Block 粒度数据抽象
**SiYuan 方案：** 一切皆 Block，每个 Block 有唯一 ID、IAL（Inline Attribute List）、类型、内容。块可独立寻址、引用、嵌入，支持块级双向链接。

**Memocast 现状：** 笔记以文档为单位，块级引用能力较弱。

**可借鉴方向：**
- 在 SQLite 中为笔记内每个语义单元（段落、列表项、代码块等）分配唯一 ID
- 建立 `blocks` 表维护块层级关系，参考 SiYuan 的 `parent_id / root_id / hpath`
- 块 ID 作为双链引用（如 `[[block-id]]` 或 `siyuan://block/id`）的基础
- 支持块属性（自定义 IAL），扩展块元数据能力

**优先级：** 高（核心功能增强）

### 4. 自定义属性（IAL）
**SiYuan 方案：** 任意 Block 可挂载自定义键值对属性（class、id、ref、memo 等），支持通过 SQL 查询嵌入。

**可借鉴方向：**
- 笔记/段落级别的自定义属性系统
- 属性可用于分类、优先级、状态标记、别名等场景
- 提供属性面板 UI，支持快速添加/编辑

**优先级：** 中

---

## 三、同步与数据安全

### 5. 端到端加密云同步
**SiYuan 方案：** AES-GCM 端到端加密，数据在本地加密后才上传云端，第三方存储商无法获取明文。仓库密钥（repo key）在本地通过内置密钥加密保存。同步到 S3/WebDAV 均可。

**Memocast 现状：** 已有 WizNote 同步通道。

**可借鉴方向：**
- 实现端到端加密：笔记内容在上传前使用用户设置的 repo key 进行 AES-GCM 加密
- 支持 S3 兼容存储（阿里云 OSS / 腾讯云 COS / Cloudflare R2 / 自建 MinIO）作为同步后端
- 支持 WebDAV 作为备选（虽然 SiYuan 也指出 WebDAV 在数据量大时有性能问题）
- 提供数据仓库密钥初始化/导入/导出 UI

**优先级：** 高（用户数据安全是核心诉求）

### 6. 同步模式精细化
**SiYuan 方案：** 三种同步模式——自动同步（停止修改 30s 后自动同步）、半自动（启动退出时同步）、完全手动（完全由用户控制）。支持云端文件锁，同一时间只允许一端操作。

**可借鉴方向：**
- 区分"同步时机"策略，提供自动/手动切换
- 同步前检测冲突，提供用户确认或自动合并策略
- 明确禁止第三方同步盘直接同步数据目录（防数据损坏警告）
- 同步进度 UI 优化（类似 SiYuan 的同步状态提示）

**优先级：** 高

### 7. 数据备份与导出
**SiYuan 方案：** 支持导出 Data 包（完整工作空间备份）、PDF、Word、HTML、标准 Markdown（带资源文件）。支持通过 Docker 导入 Markdown 文件。

**可借鉴方向：**
- 一键导出完整 Data 包（含笔记 + 资源 + 分类 + 设置）
- 支持导出为标准 Markdown + assets 文件夹结构（便于迁移到其他笔记工具）
- PDF 导出（可借助 Electron 的 `webContents.printToPDF`）
- 支持从外部 Markdown 文件批量导入

**优先级：** 中

---

## 四、插件与生态

### 8. 插件系统（参考 Petal）
**SiYuan 方案：** TypeScript 插件 API（Petal 项目），插件放在 `data/plugins/` 目录，通过 `petals.json` 记录启用状态。内核负责读取 `plugin.json` 元数据和 `dist/index.js` 代码并下发前端执行。支持插件设置持久化和多端同步。

**Memocast 现状：** 尚未建立插件生态。

**可借鉴方向：**
- 设计插件 API 接口层（TypeScript 类型定义，类似 `petal`）
- 插件注册生命周期：`onload` / `onunload` / `onLayoutReady`
- 插件可注册：顶部按钮、侧边栏面板、编辑器扩展、快捷键
- `data/storage/plugins/` 目录存放插件数据
- 插件配置通过主应用的设置界面管理

**优先级：** 高（生态建设关键）

### 9. 社区市场（Bazaar）
**SiYuan 方案：** Bazaar 社区市场，支持插件（Plugin）、主题（Theme）、模板（Template）、挂件（Widget）四种包类型。开发者发布到 GitHub Release，市场自动聚合分发。

**可借鉴方向：**
- 建立 Memocast 主题/插件社区市场
- 市场聚合 GitHub Release 作为分发渠道
- 支持主题切换（深色/浅色/自定义 CSS）
- 内置模板系统（会议记录模板、读书笔记模板等）

**优先级：** 中（长期生态建设）

---

## 五、编辑器与内容

### 10. Lute 编辑器引擎（参考）
**SiYuan 方案：** 自研 Lute 编辑器引擎（Go + JavaScript 双实现），支持结构化 Markdown 解析。处理块引用、嵌入、数学公式、图表等。

**Memocast 现状：** 使用 Muya Markdown 编辑器。

**可借鉴方向：**
- 评估 Muya 与 Lute 在块级操作、渲染性能上的差异
- 考虑引入 Lute 的某些解析逻辑（如块引用语法 `((block-id "alias"))`）
- 重点保持 Muya 的优势（双链笔记、所见即所得），在 Block 层面增强

**优先级：** 低（Muya 目前够用，不建议替换）

### 11. SQL 查询嵌入
**SiYuan 方案：** 在笔记中嵌入 SQL 查询，渲染为动态结果表。

**可借鉴方向：**
- 提供"查询块"组件，在笔记中嵌入自定义数据查询
- 可用于数据汇总、统计等场景

**优先级：** 低（属于高级功能，可作为插件实现）

---

## 六、内容管理

### 12. 数据库视图 / 表格
**SiYuan 方案：** 表格视图，支持将笔记以数据库表的方式组织，支持筛选、排序、多视图。

**Memocast 现状：** 笔记以文档列表为主。

**可借鉴方向：**
- 提供"数据库"类型笔记本，以表格视图管理笔记条目
- 支持自定义列字段（文本、数字、日期、标签等）
- 视图切换（表格 / 看板 / 日历）

**优先级：** 中

### 13. 大文档编辑优化
**SiYuan 方案：** 支持百万字级别大文档编辑。

**Memocast 现状：** 编辑器在大文档场景的性能有待验证。

**可借鉴方向：**
- 编辑器虚拟化渲染（只渲染可视区域）
- 懒加载笔记内容（按大纲节点分片加载）
- 笔记大纲侧边栏快速导航

**优先级：** 中

---

## 七、辅助功能

### 14. 闪卡与间隔重复（FSRS）
**SiYuan 方案：** 内置闪卡功能，基于 FSRS 算法实现间隔重复记忆。支持从块内容挖空生成卡片（标记挖空、超级块、列表项、标题块）。

**Memocast 现状：** 暂无。

**可借鉴方向：**
- 开发闪卡系统，支持在笔记中选中内容一键制卡
- 集成 FSRS 算法（已有开源实现）
- 提供复习界面（参考 SiYuan 的复习弹窗 UI）
- 闪卡数据存储在 SQLite，与笔记数据分离

**优先级：** 低（属于锦上添花功能）

### 15. Chrome 剪藏扩展
**SiYuan 方案：** Chrome/Edge 浏览器插件，支持剪藏网页内容为笔记。

**Memocast 现状：** 暂无。

**可借鉴方向：**
- 开发浏览器扩展（Chrome/Edge/Firefox），支持选中网页内容或整页保存为笔记
- 支持标注、高亮、批注
- 可借助 Electron 的 `webview` 或独立扩展 API

**优先级：** 中

### 16. AI 集成
**SiYuan 方案：** 对接 OpenAI API，实现 AI 写作辅助、工具调用、文档内对话（AI 问答）。

**Memocast 现状：** 已接入 Element-UI-X AI 组件（侧边栏对话/打字机效果）。

**可借鉴方向：**
- 在笔记编辑器内嵌入 AI 辅助（选中文字 AI 续写/总结/翻译）
- AI 对话面板支持多轮上下文
- 支持自定义 API Endpoint（兼容 OpenAI 格式）
- 考虑接入 MCP 协议，支持工具调用

**优先级：** 中（已有基础，可深化集成）

### 17. OCR 文字识别
**SiYuan 方案：** 集成 Tesseract OCR，支持从图片中提取文字。

**可借鉴方向：**
- 在笔记编辑器中提供图片 OCR 功能
- 可借助 Electron + `tesseract.js`（纯前端方案）或 Go 后端调用 Tesseract

**优先级：** 低

### 18. 深链协议（Protocol Handler）
**SiYuan 方案：** `siyuan://` 协议，支持从外部 deep link 到具体笔记或块。

**可借鉴方向：**
- 注册 `memocast://` 协议，支持 `memocast://note/{guid}` 跳转到指定笔记
- 浏览器扩展剪藏时可通过协议回传内容

**优先级：** 低

---

## 八、部署与多端

### 19. Docker 部署
**SiYuan 方案：** 官方镜像 `b3log/siyuan`，支持 Unraid、TrueNAS、1Panel、宝塔等多种部署方式。容器仅支持浏览器访问，不支持桌面/移动端连接。

**Memocast 现状：** 桌面应用。

**可借鉴方向：**
- 如果未来 Go 内核独立，可提供 Docker 镜像
- 支持通过浏览器访问（基于内核 API 构建轻量 Web UI）
- 提供反向代理配置示例（Nginx + WebSocket）
- 支持 PUID/PGID 环境变量处理权限问题

**优先级：** 中（长期目标）

### 20. 移动端（Android / iOS / HarmonyOS）
**SiYuan 方案：** 独立移动端 App，通过 Gomobile bindings 复用 Go 内核代码。

**Memocast 现状：** 暂无移动端。

**可借鉴方向：**
- 若 Go 内核独立，可通过 Gomobile 生成移动端 SDK
- 或使用 Flutter/Tauri 构建跨平台移动端
- 移动端与桌面端共享同一数据层（通过云同步）

**优先级：** 低（移动端投入较大）

---

## 九、开发体验

### 21. API 文档与开放生态
**SiYuan 方案：** Kernel API 分"开放 API"（有文档）与"内部 API"（不稳定，无文档）两类，插件可调用前端 API（`require('siyuan')`）或后端 API（`fetchPost`）。

**可借鉴方向：**
- 完善 Memocast HTTP API 文档（如果未来独立内核）
- 提供 SDK（TypeScript / Python）降低第三方集成门槛
- 参考 SiYuan 的 API 分层策略，区分稳定/不稳定 API

**优先级：** 中

### 22. 数据库性能优化
**SiYuan 方案：** SQLite 调优参数：
```sql
?_journal_mode=WAL
&_synchronous=OFF
&_mmap_size=2684354560  -- 2.6GB mmap
&_cache_size=-2048       -- 2MB cache
```
连接池：`SetMaxOpenConns(20)` / `SetMaxIdleConns(20)`，操作通过 `dbQueueOperation` 批量事务提交。

**可借鉴方向：**
- 检查 Memocast SQLite 连接池配置
- 对高频写操作使用批量事务（减少 fsync 开销）
- 考虑 WAL 模式提升并发读性能
- 对大文本字段（笔记内容）启用 mmap

**优先级：** 高（性能立竿见影）

---

## 十、综合对比

| 维度 | SiYuan | Memocast 现状 | 借鉴价值 |
|------|--------|----------------|----------|
| 架构 | Go Kernel + TS 前端 | Electron TS | ⭐⭐⭐ 高 |
| 存储 | JSON 文件 + SQLite | SQLite 为主 | ⭐⭐ 中 |
| 数据模型 | Block 粒度 | 文档粒度 | ⭐⭐⭐ 高 |
| 同步 | S3/WebDAV + 端到端加密 | WizNote 同步 | ⭐⭐⭐ 高 |
| 插件生态 | Petal API + Bazaar 市场 | 无 | ⭐⭐⭐ 高 |
| 数据库优化 | WAL + mmap + 批事务 | 未专项优化 | ⭐⭐⭐ 高 |
| 闪卡系统 | FSRS 内置 | 无 | ⭐ 中 |
| 剪藏扩展 | Chrome 扩展 | 无 | ⭐⭐ 中 |
| Docker 部署 | 完整支持 | 无 | ⭐⭐ 中 |
| AI 集成 | OpenAI API | Element-UI-X | ⭐⭐ 中 |
| 多端 | 桌面/移动/Web/Docker | 仅桌面 | ⭐⭐⭐ 高 |

---

## 十一、实施建议

### 第一阶段（快速见效）
1. **SQLite 性能优化** —— WAL 模式、mmap、批量事务；改动最小，收益明确
2. **端到端加密同步** —— 在现有 WizNote 通道上叠加 AES-GCM 加密层；保护用户数据安全
3. **Block ID 与块引用** —— 给笔记内每个段落/列表项分配 ID，支持 `[[block-id]]` 引用语法

### 第二阶段（核心能力）
4. **插件系统基础** —— 参照 Petal 设计插件 API，定义生命周期和入口点
5. **自定义属性面板** —— 支持笔记/段落级别的 IAL 属性
6. **冲突解决策略** —— 完善同步冲突时的用户确认/自动合并机制

### 第三阶段（生态建设）
7. **社区市场雏形** —— 主题 + 模板分享平台（可先基于 GitHub Release）
8. **浏览器剪藏扩展** —— Chrome/Edge 扩展
9. **数据库视图** —— 表格/看板视图

### 第四阶段（长期演进）
10. **Go Kernel 独立** —— 重构为可服务多端的内核
11. **Docker 部署** —— 基于 Go 内核的 Web 服务
12. **移动端** —— 基于 Go 内核 + Tauri 或原生 App
13. **闪卡系统** —— FSRS 间隔重复

---

## 参考资料

- SiYuan 官方仓库：https://github.com/siyuan-note/siyuan
- SiYuan 内核架构：https://deepwiki.com/siyuan-note/siyuan/3-kernel-(backend)
- SiYuan 数据模型：https://deepwiki.com/siyuan-note/siyuan/2.2-data-model-and-storage
- SiYuan 插件系统：https://deepwiki.com/siyuan-note/siyuan/7-plugin-and-extension-system
- Petal 插件 API：https://github.com/siyuan-note/petal
- Bazaar 市场：https://github.com/siyuan-note/bazaar
- Lute 编辑器引擎：https://github.com/88250/lute
- Riff 间隔重复：https://github.com/siyuan-note/riff
