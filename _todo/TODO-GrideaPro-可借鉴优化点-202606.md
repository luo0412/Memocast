# Gridea-Pro 可借鉴优化点 — Memocast 实施计划

> 日期：2026-06-21
> 参考：Gridea-Pro ([https://github.com/Gridea-Pro/gridea-pro](https://github.com/Gridea-Pro/gridea-pro))
> 目标：借鉴 Gridea-Pro 的核心能力，为 Memocast 制定可落地的增强计划

---

## 一、Gridea-Pro 核心能力概览

Gridea-Pro 是基于 Wails（Go + Vue 3）构建的静态博客写作客户端，核心定位与 Memocast 高度重合——都是"本地优先 + 博客发布"的工作流。以下按能力维度梳理其值得借鉴之处。

| 维度 | Gridea-Pro 能力 | Memocast 现状 | 差距 |
|------|----------------|--------------|------|
| 写作编辑器 | Monaco Editor（VS Code 同款） | Muya / Monaco 可切换 | **可借鉴** Monaco 深度集成 |
| AI 集成 | MCP 协议 + 内置免费模型 | 已接入 AI Provider | **可深化** MCP 协议支持 |
| 博客部署 | 一键部署 + 内置纯 Go Git 引擎 | 正在规划博客打包部署（见 `TODO-博客自动打包部署-202609.md`） | **可借鉴** Gridea 的部署交互体验 |
| 主题系统 | 9 款内置主题 + 可视化配置 | 主题切换已实现 | **可借鉴** 主题参数可视化配置 |
| SEO | 自动生成 sitemap、robots、RSS、Open Graph | 部分能力 | **可借鉴** SEO 自动化 |
| 评论系统 | 7 种评论系统集成（Gitalk/Giscus/Disqus 等） | 未实现 | **可新增** |
| PWA | 一键开启 PWA | 未实现 | **可新增** |
| 国际化 | 11 种语言 | 目前中英文 | **可扩展** |
| 闪念笔记 | 灵感速记 + 标签 + 热力图统计 | **已实现** Memos 功能 | 持平，可互鉴 |
| 模板引擎 | Jinja2 / EJS / Go Templates | 当前博客导出为纯 MD | **可新增** 模板系统 |

---

## 二、重点借鉴项详细计划

以下拣选对 Memocast 价值最高、可行性最强的 5 个方向，制定分阶段实施计划。

---

### 2.1 AI 能力深化：MCP 协议集成

**Gridea-Pro 亮点：**
- 实现了 MCP（Model Context Protocol）协议，提供 25+ 工具（笔记 CRUD、标签、菜单、评论、主题、部署等）
- AI 可直接操作博客数据、自动触发部署
- 内置免费模型（每日限额），也支持 OpenAI / Anthropic / DeepSeek / Gemini 等 13 种服务商

**Memocast 现状：**
- 已实现可配置的 AI Provider（通过 Portkey-AI 等）
- 已有对话功能（Chat 界面）

**Memocast 可借鉴点：**

| 优先级 | 借鉴项 | 说明 |
|--------|--------|------|
| **P1** | 暴露 MCP 工具集 | 为 Memocast 的笔记/分类/标签操作设计 MCP 工具定义，让 AI 助手可以直接操控笔记数据 |
| **P1** | AI 写作助手工作流 | Gridea 内置 5 个工作流提示词（写作助手、闪念整理成文、内容审查等），Memocast 可设计类似的 AI 辅助写作提示词模板 |
| **P2** | 深度搜索 + AI 总结 | 让 AI 助手基于笔记库语义搜索并生成摘要（Gridea 的客户端全文搜索 + AI 理解能力） |

**实施路径：**
1. 定义 Memocast MCP 工具 schema（参考 Gridea 的工具列表）
2. 用 `@modelcontextprotocol/sdk` 构建本地 MCP Server
3. 设计 AI 写作助手提示词模板（在笔记编辑区提供快捷调用）
4. 接入 Cursor AI（通过 MCP）直接操作 Memocast 笔记

---

### 2.2 博客部署体验优化

**Gridea-Pro 亮点：**
- 一键部署，支持 5 大平台：GitHub Pages、Vercel、Netlify、Coding、SFTP/FTP
- 内置纯 Go Git 引擎，**不依赖系统 Git**
- CDN 媒体文件自动上传
- 自定义域名 CNAME 支持

**Memocast 现状（见 `TODO-博客自动打包部署-202609.md`）：**
- 已规划 Phase 1/2/3 实施路径，核心链路为：右键文件夹 → 导出 MD → VuePress 打包 → GitHub API 触发
- 技术方案已确定，依赖 Electron 子进程 + GitHub REST API

**Memocast 可借鉴点：**

| 优先级 | 借鉴项 | 说明 |
|--------|--------|------|
| **P0** | 推进现有计划落地 | Gridea 的部署交互体验可直接参考，Memocast 的 `TODO-博客自动打包部署-202609.md` 已规划完整方案，推进实施即可 |
| **P1** | SFTP/FTP 部署支持 | Gridea 支持 SFTP/FTP，Memocast 可新增此类部署目标（目前只规划了 GitHub Actions） |
| **P1** | 内置 Git 操作 | 不依赖系统 Git，参考 Gridea 的纯 Go 实现或 Node.js 的 `simple-git` / `isomorphic-git` |
| **P2** | CDN 媒体文件同步 | 部署时自动将笔记中的图片等资源同步到 GitHub 仓库，参考 Gridea 的 CDN 上传机制 |

---

### 2.3 SEO 自动化增强

**Gridea-Pro 亮点：**
- 自动生成 `sitemap.xml`（含图片元数据）
- 自动生成 `robots.txt`
- 自动生成 RSS/Atom Feed
- Open Graph、Twitter Card 等社交分享 Meta 标签
- JSON-LD 结构化数据
- Google Analytics / 百度统计 / Google Search Console 验证
- 自定义 `<head>` 代码注入

**Memocast 现状：**
- 导出博客时生成 MD 文件，SEO 相关配置由用户手动在 VuePress/Vdoing 中设置

**Memocast 可借鉴点：**

| 优先级 | 借鉴项 | 说明 |
|--------|--------|------|
| **P1** | 导出时自动生成 sitemap.xml | 在博客部署流程中追加 sitemap 生成步骤 |
| **P1** | Open Graph / Twitter Card meta | 导出 MD 时自动追加 frontmatter（如 `cover`、`description`、`tags`）供博客主题读取 |
| **P2** | RSS Feed 生成 | 博客导出时生成 `atom.xml` 或 `rss.xml` |
| **P3** | Google Analytics 集成 | 在部署配置中提供 GA ID 注入选项 |

**实施路径：**
1. 复用 `TODO-博客自动打包部署-202609.md` 中的 Phase 3，在 `BlogDeployService` 中新增 `generateSitemap()` 和 `generateRSS()` 方法
2. frontmatter 标准化：定义 Memocast 导出的标准 frontmatter 字段（title、date、tags、categories、cover、description）
3. 可配置 `<head>` 注入：在 BlogDeployDialog 中增加自定义 head 代码输入框

---

### 2.4 评论系统集成

**Gridea-Pro 亮点：**
- 内置 7 种评论系统（Gitalk、Giscus、Disqus、Valine、Waline、Twikoo、Cusdis），勾选即启用

**Memocast 现状：**
- 纯本地笔记管理，无评论功能

**Memocast 可借鉴点：**

| 优先级 | 借鉴项 | 说明 |
|--------|--------|------|
| **P2** | 评论系统嵌入 | 将评论系统作为博客发布的附属配置——用户在部署配置中选择评论系统，应用自动注入对应脚本 |
| **P2** | Giscus（基于 GitHub Discussions） | 最推荐的方案（无需登录、免费），Memocast 导出时自动注入 Giscus 脚本 |

**实施路径：**
1. 在 `BlogDeployDialog.vue` 中新增"评论系统"配置区块（QSelect，支持 Gitalk / Giscus / Disqus / Valine 等）
2. 用户填写必要参数（GitHub Repo、Discussion 分类等）
3. `BlogDeployService` 在生成博客页面时注入对应的评论 JS 脚本到 HTML 中
4. 存储用户偏好到 SQLite `settings` 表（key=`commentSystemConfig`）

---

### 2.5 PWA 支持与国际化

**Gridea-Pro 亮点：**
- PWA 一键开启，可配置应用名称、图标、主题色、屏幕方向
- 11 种语言国际化

**Memocast 可借鉴点：**

| 优先级 | 借鉴项 | 说明 |
|--------|--------|------|
| **P3** | PWA 支持 | 在博客侧增加 Web App Manifest，引导用户将博客"安装"到手机/桌面 |
| **P3** | 国际化扩展 | Gridea 支持 11 种语言（简中、繁中、英、日、韩、德、西、法、意、葡、俄），Memocast 目前仅中英文，可按需扩展日语、韩语等 |

---

## 三、MCP 协议工具定义（详细设计）

参考 Gridea-Pro 的 MCP 实现，为 Memocast 设计以下工具集：

```json
{
  "mcpTools": {
    "notes": {
      "list": { "description": "获取笔记列表，支持分类/标签过滤" },
      "get": { "description": "根据 GUID 获取单条笔记详情" },
      "create": { "description": "创建新笔记" },
      "update": { "description": "更新笔记内容/元数据" },
      "delete": { "description": "删除笔记" }
    },
    "categories": {
      "list": { "description": "获取分类树" },
      "create": { "description": "创建分类" },
      "rename": { "description": "重命名分类" },
      "delete": { "description": "删除分类" }
    },
    "tags": {
      "list": { "description": "获取所有标签" },
      "create": { "description": "创建标签" },
      "delete": { "description": "删除标签" }
    },
    "blog": {
      "listPosts": { "description": "获取博客文章列表" },
      "publish": { "description": "将笔记发布到博客" },
      "triggerDeploy": { "description": "触发博客部署（需用户开启权限）" }
    },
    "search": {
      "query": { "description": "全文搜索笔记内容" },
      "semantic": { "description": "AI 语义搜索笔记" }
    }
  }
}
```

---

## 四、实施路线图

```
2026-Q3（7-9月）
├─ P0: 博客自动打包部署落地（推进 TODO-博客自动打包部署-202609.md）
│     ├─ Phase 1: 右键菜单 + 配置界面
│     ├─ Phase 2: 主进程打包 + GitHub API
│     └─ Phase 3: Vuex Action + Service 集成
├─ P1: SEO 增强（sitemap / frontmatter / RSS）
└─ P1: AI 写作助手提示词模板设计

2026-Q4（10-12月）
├─ P1: MCP 工具集设计与本地 MCP Server
├─ P2: 评论系统集成（Giscus 优先）
└─ P2: SFTP/FTP 部署支持

2027-Q1+
├─ P2: AI 语义搜索能力
├─ P3: PWA 博客支持
└─ P3: 国际化扩展（日语、韩语）
```

---

## 五、风险与注意事项

1. **Electron vs. Wails 架构差异**：Gridea-Pro 用 Go 编写核心（Git 引擎等），Memocast 是 Electron + Node.js。部分借鉴项（如内置 Git）需要找到 Node.js 等效实现（`isomorphic-git` / `nodegit`）。
2. **本地优先原则不变**：所有 AI / 云端功能均不影响 Memocast 现有的本地 SQLite 优先策略。云端仅为备份和发布通道。
3. **打包体积控制**：Gridea 参考 Gridea 的做法，所有博客相关逻辑（打包脚本、Git 操作）不打入 Memocast 主包，仅在用户本地博客目录执行。
4. **博客格式兼容性**：Memocast 目前规划兼容 VuePress/Vdoing，后续扩展 SFTP/FTP 部署时需保持通用性，避免强耦合特定博客框架。

---

## 六、可直接复用的 Gridea-Pro 资源

| 资源 | 地址 | 复用方式 |
|------|------|---------|
| MCP Server 示例 | Gridea-Pro MCP 实现 | 参考其工具定义与协议实现 |
| 工作流提示词 | Gridea 内置 5 个工作流 | 迁移为 Memocast AI 写作助手提示词 |
| 评论系统注入模板 | Gridea 评论配置逻辑 | 迁移为 Memocast 的评论系统注入 |
| SEO 生成逻辑 | Gridea sitemap/rss 生成 | 迁移为 Memocast BlogDeployService 的方法 |
| 国际化词条 | Gridea 11 种语言文件 | 部分迁移（如日语、韩语） |
