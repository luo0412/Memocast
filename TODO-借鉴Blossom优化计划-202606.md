# Memocast 优化借鉴计划 — 参考 Blossom Editor

> 依据 [Blossom Editor](https://github.com/blossom-editor/blossom)（星标 3.8k，Java/Vue3 技术栈，支持私有部署的云端双链笔记）梳理可借鉴的优化方向，供 Memocast 参考落地。

---

## 一、技术架构升级

### 1.1 升级前端技术栈（高优先级）

**现状**：Memocast 使用 Vue 2.7 + Quasar 1.x + Vuex 3，已进入维护状态。

**Blossom 参考**：

| 维度 | Blossom | Memocast 借鉴方向 |
|---|---|---|
| 前端框架 | Vue 3 + Element Plus 2 | 评估 Vue 3 迁移路径，Element Plus 与 Quasar 的取舍 |
| 状态管理 | Pinia | Vue 3 下的状态管理标准解法，可先在局部试点 |
| 构建工具 | electron-vite | 更快的 HMR，支持 Vite 生态 |
| 编辑器 | CodeMirror 6 + marked | CodeMirror 6 架构更现代，插件体系完善 |
| 类型安全 | TypeScript（前端+后端） | 已有部分 TS，建议全量推进 |

**行动项**：

- 评估 Vue 3 + Element Plus（或维持 Quasar 2.x）升级路径的成本与收益
- 在新功能模块中使用 Pinia 替代部分 Vuex store
- 参考 Blossom 的 `electron-vite` 配置改善构建体验
- 将 `src/libs/muya` 替换为 CodeMirror 6 的可行性调研

### 1.2 升级 Electron 安全模型（高优先级）

**现状**：`nodeIntegration: true`，`contextIsolation: false`，遗留配置。

**Blossom 参考**：Blossom 使用 `@electron-toolkit/preload` + 规范化的 preload 脚本，启用 `contextIsolation: true`。

```javascript
// Blossom 的 preload 模式（示意）
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
})
```

**行动项**：

- 引入 `@electron-toolkit/preload` 规范 IPC 通信
- 逐步将 main process 的 node API 迁移到 preload 暴露
- 启用 `contextIsolation: true`，消除直接暴露 node 的安全风险
- 这是一项长期工作，建议按模块逐步迁移

### 1.3 引入后端服务架构（中优先级）

**现状**：Memocast 所有逻辑运行在 Electron 主进程，cloud sync 依赖 WizNote 第三方 API。

**Blossom 参考**：独立 Java Spring Boot 后端（MyBatis Plus + MySQL + Redis），职责清晰：

```
blossom-backend/
├─ backend/         # 主应用，Controller 层
├─ common-base/     # 公共响应、异常、日志
├─ common-cache/    # Redis + Caffeine 缓存封装
├─ common-db/       # MyBatis Plus、慢 SQL 监控
├─ common-iaas/     # 云厂商功能（文件存储抽象）
├─ expand-sentinel/ # Sentinel 流量控制
└─ expand-tracker/ # 链路追踪
```

**对 Memocast 的借鉴**：

- 将 WizNote API 调用抽离为独立的 Sync Backend（如有必要可自建）
- 引入 Redis 做缓存层（笔记列表缓存、用户会话）
- 引入 Sentinel 做流量控制（防止 sync 风暴）
- 即使不重写 WizNote 集成，也可以将 sync 逻辑从主进程抽离为独立 service

---

## 二、同步与数据架构

### 2.1 完善冲突处理机制（高优先级）

**现状**：本地优先策略，`localModified` vs `serverModified` 字段存在但实际"本地覆盖"逻辑粗放，无真正的冲突合并。

**Blossom 参考**：Blossom 是自建后端，冲突处理更可控。Blossom 的文章接口返回 `references`（双向链接）、`version`（乐观锁）字段。

**行动项**：

- 引入三向合并（3-way merge）策略：本地版本、基准版本、远程版本
- 参考 TODO-本地线上文件冲突合并-202608.md 中的合并算法设计
- 增加 `version` 字段用于乐观锁，避免更新覆盖
- 提供冲突预览 UI，让用户选择保留版本或手动合并

### 2.2 引入备份/导出机制（中优先级）

**现状**：`BlogDeployService` 可将笔记导出为静态博客，但通用备份机制薄弱。

**Blossom 参考**：

- 支持一键备份全部笔记（md/txt 格式）
- 支持一键导出图片资源
- 导出的内容无缝兼容 VS Code、Obsidian 等工具

**行动项**：

- 增加全量笔记导出功能（ZIP 打包 md 文件 + 图片）
- 增加从备份包一键恢复的能力
- 备份文件支持增量（基于时间戳）和全量两种模式

### 2.3 数据存储安全（中优先级）

**现状**：`sql.js` 数据库文件明文存储在 `userData` 目录，无 at-rest 加密。

**行动项**：

- 评估 SQLite 加密方案（如 `sqlcipher`，或主进程层加密）
- 对 `ai_model_configs` 表中的 API Key 做加密存储
- 增加数据目录的可选密码保护机制

---

## 三、编辑器体验

### 3.1 双向链接（双链笔记）（高优先级）

**现状**：Memocast 有 `[[wiki-link]]` 语法解析能力，但双向链接的可视化和管理较弱。

**Blossom 参考**：Blossom 的 `article_reference` 功能展示双向链接关系。

**行动项**：

- 完善 `[[笔记标题]]` 链接的 autocomplete（参考 Obsidian）
- 增加"双向链接"面板：显示当前笔记被哪些笔记引用
- 在笔记列表中显示"反向链接计数"
- 支持图谱视图（类似 Obsidian graph view）

### 3.2 表格编辑器增强（中优先级）

**现状**：Muya 编辑器有基础表格支持，但复杂表格操作（合并单元格、调整列宽）体验一般。

**Blossom 参考**：Blossom 使用 marked + highlight.js + katex，表格渲染成熟。

**行动项**：

- 评估引入 `mdtable-editor` 或类似专用表格插件
- 支持表格工具栏（插入行/列、删除、对齐）
- 支持从 CSV/Excel 粘贴导入表格

### 3.3 搜索能力升级（中优先级）

**现状**：`NoteService.search()` 支持基于 SQLite FTS 的全文搜索。

**Blossom 参考**：Blossom 后端使用 **Lucene 8** 做全文索引，支持高亮显示。

**行动项**：

- 考虑引入 `flexsearch` 或 `minisearch` 做前端全文索引（离线优先）
- 搜索结果高亮关键词
- 支持搜索过滤器（按标签、时间范围、分类）

---

## 四、功能增强

### 4.1 笔记统计与可视化（中优先级）

**Blossom 参考**：

- 字数统计（单篇 + 全部）
- 字数折线图（按日期）
- 编辑热力图（GitHub 风格的提交热力图）
- 这些数据可存储在 `app_state` 表中定期计算

**行动项**：

- 在侧边栏或设置页增加"笔记统计"面板
- 使用 ECharts（已有依赖）绘制折线图和热力图
- 在笔记列表增加字数列

### 4.2 内置博客/发布功能（中优先级）

**现状**：`BlogDeployService` 已实现 VuePress 静态博客生成，但集成度不高。

**Blossom 参考**：Blossom 内置博客系统，文章可一键发布，支持：

- 自定义博客主题配色
- 水印功能（文字水印）
- 临时分享链接（带过期时间）

**行动项**：

- 深化博客部署流程，增加主题定制选项
- 增加文章"发布到博客"开关（类似 Blossom 的 `openStatus`）
- 支持生成带密码/过期时间的临时分享链接（`/temp/h` 机制）
- 增加博客水印配置

### 4.3 待办事项与计划管理（中优先级）

**Blossom 参考**：Blossom 有独立的待办事项（TODO）和计划安排（Plan）模块，内置番茄钟。

**Memocast 借鉴思路**：

- 可在笔记内嵌入待办列表（已有部分支持），但缺独立的待办管理视图
- 考虑增加轻量级待办面板（独立于笔记树）
- 番茄钟可考虑以插件/侧边栏形式集成

### 4.4 多用户与权限管理（低优先级，远期）

**Blossom 参考**：Blossom 后端支持多用户（普通用户 + 管理员），用户管理 CRUD、禁用启用、会话踢出。

**现状**：Memocast 是单用户设计，暂无多用户需求，但 `BlogDeployService` 未来可能需要多用户博客管理。

**行动项**：

- 中期：博客部署可考虑增加多博客账号管理
- 长期：如 Memocast 走向多设备协同，多用户架构需提前规划

---

## 五、DevOps 与部署

### 5.1 Docker 化部署（中优先级）

**Blossom 参考**：单文件 `docker-compose` 包含 MySQL + 后端服务，health check 完善。

```yaml
# Blossom 的 docker-compose（核心结构）
services:
  blossom:
    image: jasminexzzz/blossom:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9999/sys/alive"]
    depends_on:
      blmysql:
        condition: service_healthy
```

**行动项**：

- 如果 Memocast 未来提供自托管后端方案，参考 Blossom 的 Docker Compose 模板
- 即使是纯客户端， Electron-builder 的 Windows/Mac 打包配置可参考 Blossom 的 `electron-builder` 设置

### 5.2 性能监控与链路追踪（中优先级）

**Blossom 参考**：自研 `expand-tracker` 模块做链路追踪，`common-db` 模块做慢 SQL 监控。

**行动项**：

- 在 Electron 主进程中增加 sync 操作耗时日志
- 引入慢查询检测（超过阈值的 SQL 操作打 warn 日志）
- 使用 `electron-log` 规范化日志输出格式和级别

---

## 六、安全加固

### 6.1 API 安全（中优先级）

**Blossom 参考**：Blossom 后端使用 JWT 认证，Spring Security 注解级权限控制（`@AuthUserType`）。

**行动项**：

- 如果自建 sync 后端，使用 JWT Token 认证
- 对 `ai_model_configs` 中的 API Key 做加密存储和传输
- 笔记分享链接使用一次性 token 或签名验证

### 6.2 流量控制（中优先级）

**Blossom 参考**：集成 Alibaba Sentinel，实现 API 级别的限流和熔断。

**行动项**：

- Sync 操作增加重试 + 指数退避策略（防止频繁 sync 被限流）
- WizNote API 调用增加请求间隔控制

---

## 七、可迁移性增强（用户生态）

### 7.1 数据迁移工具（中优先级）

**Blossom 参考**：Blossom 官方提供 WizNote → Blossom 迁移工具（`wiz2blossom`）。

**行动项**：

- 完善 Memocast 的数据导入能力（支持 Obsidian、Notion、Standard Notes 格式）
- 提供 WizNote 迁移到 Memocast 的工具（已有 WizNote API 集成基础）
- 增加一键备份导出为标准 Markdown + YAML front-matter

### 7.2 标准 Markdown 兼容（中优先级）

**Blossom 参考**：Blossom 承诺"没有破坏性的语法拓展"，所有内容兼容标准 Markdown。

**Memocast 行动项**：

- 评估 `[[wiki-link]]`、`{{回响}}`、Rune 语法对标准 Markdown 的侵入程度
- 提供"导出为纯标准 Markdown"选项（剥离 Memocast 特有语法）
- 编辑器切换到源码模式时，不丢失 Memocast 特有语法的视觉提示

---

## 八、优先级汇总

| 优先级 | 优化项 | 借鉴来源 | 预期收益 |
|---|---|---|---|
| P0 | Electron 安全模型升级 | Blossom | 消除安全风险，满足现代 Electron 标准 |
| P0 | 冲突合并机制完善 | Blossom + 自研 | 解决多设备同步的核心痛点 |
| P1 | 双向链接功能增强 | Blossom | 提升笔记知识管理水平 |
| P1 | 备份导出能力 | Blossom | 数据安全保障，用户迁移友好 |
| P1 | 前端技术栈评估（Vue3/Pinia） | Blossom | 长期可维护性 |
| P2 | 笔记统计与可视化 | Blossom | 用户粘性，数据价值 |
| P2 | 搜索能力升级（Lucene/Flexsearch） | Blossom | 搜索体验提升 |
| P2 | 博客部署功能深化 | Blossom | 增强内容发布能力 |
| P2 | 临时分享链接 | Blossom | 便捷分享体验 |
| P2 | 表格编辑器增强 | Blossom | 编辑体验优化 |
| P2 | Docker 化部署模板 | Blossom | 降低自托管门槛 |
| P3 | 多用户架构规划 | Blossom | 未来多设备协同基础 |
| P3 | 待办/计划/番茄钟 | Blossom | 功能丰富度 |
| P3 | 数据迁移工具 | Blossom | 用户生态建设 |
| P3 | 后端服务化（Redis/Sentinel） | Blossom | 可靠性与扩展性 |

---

## 九、参考资源

- **Blossom 项目地址**：https://github.com/blossom-editor/blossom
- **Blossom 文档**：https://www.wangyunf.com/blossom-doc/index
- **Blossom 在线试用**：https://www.wangyunf.com/blossom-demo/#/settingindex
- **Blossom 后端部署文档**：https://www.wangyunf.com/blossom-doc/guide/deploy/backend.html
- **WizNote → Blossom 迁移工具**：https://github.com/kidultff/wiz2blossom
