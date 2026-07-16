# TODO — 博客打包部署优化

> 参考项目：`E:\work-前端\note\`（vuepress 1.x + gulp 流水线）
> 目标产物：纯静态博客站点
> 源数据：Memocast 本地 SQLite 笔记库导出
> 落地位置：本文档先定义 **打包/部署规则 + 流水线骨架**，实现按里程碑拆分。

---

## 0. 背景 & 关键参考规则

从参考项目 `E:\work-前端\note\` 提炼出三条本项目必须复用的核心规则（也是本次优化的关键点）：

| 关键点 | 参考实现 | 本项目复用形式 |
| --- | --- | --- |
| **侧边导航自动生成** | `_docs\.vuepress\utils\utils.js` 用目录前缀（`nav.`, `ch.`）扫描生成 `nav` + 多 `sidebar`；再由 `utils-shortlink.js` 二次转换为 `/<id>.html` 短链 | 新建 `scripts/blog/build-sidebar.js`，根据 SQLite 导出的 `_docs` 目录结构生成 `nav` + `sidebar` JSON |
| **publicPath / base 路径** | `_docs\.vuepress\config.js`：`base: IS_VERCEL ? '/' :  '/${CURRENT_SYS}/'` | Vite/Quasar `build.baseUrl` / `vue.config.js publicPath` 支持按 `BLOG_BASE` 环境变量切换；CDN 子路径与根域部署共用同一份 dist |
| **路径 hash / 短链 ID** | `gulpfile.js` 的 `cyrb53 + base36` 生成 ~26 字符确定性 ID，文件名剥离序号，序号单独存 `seq-manifest.json` 供排序 | 同算法迁移到 `scripts/blog/hash-id.js`；序号写入 `seq-manifest.json`；最终输出 `<base36-id>.html` |

---

## 1. 总体目标

1. **从 SQLite 导出 markdown**：构建期读取本地 `note.db`，把"已发布"分类下的笔记导出成 markdown + 资源。
2. **目录即导航**：用 `nav.` / `ch.` / `sec.` 前缀的目录约定，配合脚本生成 `nav.json` / `sidebar.json`，与 vuepress-bar 行为对齐。
3. **hash 短链 + 稳定排序**：导出文件以 `cyrb53+base36` 命名，原序号进 `seq-manifest.json`，UI 排序与文件解耦，重命名不破坏链接。
4. **publicPath 双模**：根域部署与子路径（如 `/blog/`）部署通过环境变量切换，不改源码。
5. **CI/CD 一条命令**：单条 `yarn blog:build` 串起"导出→整理→打包→上传"，与 quasar 应用构建解耦，可独立触发。

---

## 2. 阶段拆分

### M1. 规则对齐与目录约定（关键点：侧边导航）

- [ ] 新增 `scripts/blog/` 子目录，统一放博客构建脚本
- [ ] 实现 `scripts/blog/scan-nav.js`
  - 输入：`_docs/`（导出的 markdown 根目录）
  - 输出：`nav.json`、`sidebar.json`
  - 约定：目录名匹配 `^(nav|ch|sec)[\d.\-_]` 才进导航；否则只进 sidebar 子项
  - 参考 `_docs\.vuepress\utils\utils.js` 的 `nav()` / `side()` / `multiSide()` 思路
- [ ] 实现 `scripts/blog/hash-id.js`
  - 算法：`cyrb53(str,0) ^ cyrb53(str,1)` → Base36 拼接，~26 字符
  - 输入：原始 basename（去扩展名）+ 目录
  - 输出：`{ id, seq }`
- [ ] 输出 `seq-manifest.json`（id → seq），供 sidebar 排序
- [ ] 解析 markdown front-matter 中的 `order:` 字段，作为排序兜底（参考 `utils.js` `getChildren`）

### M2. SQLite 导出（关键点：源数据）

- [ ] 新增 `scripts/blog/export-from-sqlite.js`
  - 复用 Memocast 的 `sql.js` 加载本地 `note.db`（不引入新依赖）
  - 过滤条件：
    - 分类标记 = `published`
    - 排除 `@private` / `@draft` / `@archive` 命名前缀的笔记
  - 导出物：
    - markdown 正文（含 front-matter：title / order / date / tags）
    - 资源（图片/附件）→ `_docs/.vuepress/public/assets/<note-id>/`
    - 内嵌的 base64 图片 → 落地为文件，markdown 引用替换为相对路径
  - 目录映射：Memocast 分类树 → `nav.<seq>-<slug>` / `ch.<seq>-<slug>` / `sec.<seq>-<slug>`
- [ ] 提供 `--dry-run` 模式，仅打印将要导出的文件清单
- [ ] 提供 `--source <path-to-note.db>` 与 `--out <dir>` 参数，默认值指向 `~/Documents/coolma/note.db`

### M3. 文件整理与短链（关键点：路径 hash）

- [ ] 实现 `scripts/blog/stage-docs.js`
  - 输入：M2 导出的 `_docs/`
  - 处理：
    1. 解析目录名 `nav.<seq>-<slug>` → 删除 `nav.` 与序号
    2. 解析文件名 `<seq>-<title>.md` → 计算 hash → 输出 `<hash>.md`
    3. 写入 `seq-manifest.json`
    4. 把 emoji `❤ / ❤️ / ❤️️` 统一替换为长爱心字符串（拷贝输出展示用，hash 计算时忽略）
- [ ] 实现 `scripts/blog/shortlink.js`
  - 参考 `utils-shortlink.js`，在 sidebar JSON 落地前把 `nav.7-9.【日记】diary/ch.1996-.../41-1643052995065308` 转成 `/<hash>.html`
  - 找不到映射时保留原 path 并打印 warning（不静默丢链接）

### M4. publicPath / base 路径（关键点：部署路径）

- [ ] 选定静态站点生成器（候选见 §5 决策点）
- [ ] 配置 `base`
  - 环境变量：`BLOG_BASE`
  - 默认：`'/'`（根域部署）
  - 子路径：`'/blog/'`（CDN 子路径、GitHub Pages project page）
- [ ] 资源路径：所有静态资源走 `public/assets/`，由 `base` 自动前缀化
- [ ] 文档站首页跳转：`<domain><BLOG_BASE>` 与 `<domain>/` 之间通过 `index.html` 内 `<meta http-equiv="refresh">` 或构建期生成的 `redirect.html` 处理

### M5. 流水线串联

- [ ] 在 `package.json` 新增脚本：
  - `blog:export` — 跑 M2 导出
  - `blog:stage` — 跑 M3 整理
  - `blog:build` — `blog:export && blog:stage && <static-site-build>`
  - `blog:preview` — 本地预览（`<static-site> dev --base=$BLOG_BASE`）
  - `blog:deploy` — 跑完 `blog:build` 后用 `sftp` / `rsync` / `gh-pages` 上传（参考 `gulpfile.js` 的 `sftp:doc` 任务）
- [ ] CI workflow（`.github/workflows/blog.yml`）：
  - 触发：`push tags: blog-v*` 或手动 `workflow_dispatch`
  - 步骤：install → blog:build → upload artifact / push `gh-pages`
- [ ] 与现有 electron 构建解耦：不进 `quasar build` 链路，独立产物目录 `dist-blog/`

### M6. 增量与缓存（优化项）

- [ ] 导出层加 `manifest.json` 记录 `(noteId → outPath, mtime, hash)`
- [ ] `blog:stage` 检测到源文件未变 → 跳过 hash 计算与文件写入
- [ ] `blog:build` 全量时打印统计：导出 X 篇、改写 Y 篇、未变 Z 篇

### M7. 验证 & 文档

- [ ] 准备 fixture：`tests/fixtures/note.db`（含 1 篇已发布 + 1 篇草稿 + 1 个分类）
- [ ] `yarn test` 增加博客构建的快照测试：
  - `seq-manifest.json`
  - `nav.json` / `sidebar.json`
  - 输出文件名（hash 确定性）
- [ ] README 增补"博客构建"章节：环境变量、命令、目录约定、与 sqlite 同步策略

---

## 3. 关键文件 / 产物清单

```
Memocast/
├── scripts/
│   └── blog/
│       ├── export-from-sqlite.js   # M2
│       ├── scan-nav.js             # M1
│       ├── hash-id.js              # M1
│       ├── stage-docs.js           # M3
│       ├── shortlink.js            # M3
│       ├── build-sidebar.js        # M1：串起 scan + shortlink
│       └── pipeline.js             # M5：串联 export→stage→build
├── _docs/                          # 导出 + 整理后的中间产物（.gitignore）
│   └── .vuepress/
│       ├── config.js               # base / nav / sidebar
│       └── seq-manifest.json
├── dist-blog/                      # 最终静态产物（.gitignore）
└── .github/workflows/blog.yml      # CI
```

参考实现关键路径（仅供查阅，不引入依赖）：

- `E:\work-前端\note\gulpfile.js` — `renamePath` / `genId` / `seqMap`
- `E:\work-前端\note\_docs\.vuepress\config.js` — `base` 环境变量切换
- `E:\work-前端\note\_docs\.vuepress\utils\utils.js` — `nav()` / `side()` / `getName()` / `compareSidebarEntries()`
- `E:\work-前端\note\_docs\.vuepress\utils\utils-shortlink.js` — ID 扫描 + 短链转换 + seq 排序

---

## 4. 风险 & 决策点

- [ ] **静态站点生成器选型**：vuepress 1.x / vitepress / 自研 minimal renderer？
  - vuepress 1.x：与参考项目一致，但 Vue 2 兼容性问题需评估
  - vitepress：生态新，但要求 Vue 3
  - 自研：仅渲染 markdown 为 html + 一份 `sidebar.json` 注入脚本，最小依赖
  - **建议默认 vuepress 1.x**（迁移成本最低），待 M1 完成时验证兼容性
- [ ] **SQLite 导出时区**：笔记 `createdAt` / `updatedAt` 用本地时区还是 UTC？需与前端 i18n 协同
- [ ] **资源去重**：同一张图片被多篇笔记引用时是否合并？建议先按笔记隔离，M6 再优化
- [ ] **大库性能**：千篇笔记量级下，hash 计算与 fs 操作是否需要并发？`p-limit` 限流是够用

---

## 5. 与现有 TODO.md 的关系

`TODO.md` 2026-05 已有 `[x] 提供vdoing打包功能`，本次属于其延伸与升级：

- 不替换旧的 vdoing 脚本（保留兼容）
- 新增 `scripts/blog/` 作为长期维护入口
- 流水线改造后，`vdoing` 入口可标记为 `@deprecated`，统一收口到 `yarn blog:*`

---

## 6. 完成定义（DoD）

- [ ] `yarn blog:build` 在 fixture 上端到端跑通，产出 `dist-blog/` + `seq-manifest.json` + `sidebar.json`
- [ ] 同一份 SQLite 二次构建产物 **byte-identical**（验证 hash 算法确定性）
- [ ] `BLOG_BASE=/blog/ yarn blog:preview` 本地可访问 `http://localhost:port/blog/<id>.html`
- [ ] CI workflow 跑通并上传 artifact
- [ ] README "博客构建" 章节补全

---

## 7. 主题支持扩展（2026-07-16）

### 已完成

支持 4 种 VuePress 主题：`default` / `vdoing` / `hope` / `reco`。

修改文件：

| 文件 | 改动 |
|------|------|
| `src/components/ui/dialog/BlogDeployDialog.vue` | q-btn-toggle 选项加 hope / reco |
| `src/i18n/zh-cn/other.js` | 加 blogThemeHope / blogThemeReco 翻译 |
| `src/i18n/en-us/other.js` | 同上英译 |
| `src-electron/main-process/service/blog-deploy-handler.js` | ensureBlogConfig 加 hope/reco 模板；buildBlogPackageJson 加主题依赖；detectBlogTheme 检测 hope/reco；依赖检测逻辑支持 4 主题 |
| `src-electron/main-process/service/blog-config-writer.js` | writeVuepressConfig 加 hope/reco/vdoing 分支 |
| `scripts/blog/blog-config-writer.js` | writeVuepressConfig 同上 |
| `.cursor/skills/blog-deploy-design/SKILL.md` | 文档更新 §3.5 主题支持表格 |

### 各主题 config.js 风格（2026-07-16 修正：v1 API 与 v2 完全不兼容）

- **default**: `module.exports = {}` + `themeConfig.sidebar/nav`
- **vdoing**: `module.exports = { theme: 'vdoing' }`（不要用 `vdoingTheme({})`）
- **hope**: `const { config } = require('vuepress-theme-hope'); config({ ... themeConfig: { navbar, sidebar } })`（不要用 `defineUserConfig` + `hopeTheme`）
- **reco**: `module.exports = { theme: 'reco', themeConfig: { ... } }`（不要用 `defineUserConfig` + `recoTheme`）

### 待验证

- [ ] hope/reco 主题的 `yarn install` 在博客目录能正常拉取依赖
- [ ] `vuepress build` 在 hope/reco 主题下能正常输出 dist
- [ ] sidebar/nav 在 hope/reco 的主题样式下正确渲染
