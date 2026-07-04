# scripts/blog — Memocast 博客打包 / 部署工具链

把本地 Memocast 笔记（`memocast.db`）一键打包为可静态部署的 vuepress 1.x
博客，含短链 ID、双模 publicPath、增量缓存。

> **设计目标**：与 `E:\work-前端\note` 参考项目保持目录命名、shortlink 算法
> 与 `nav./ch./sec.` 约定一致；产物可二次构建（相同输入产生 byte-identical
> 输出）；不引第三方包，Node 18+ 即可运行。

## 目录

```
scripts/blog/
├── hash-id.js            # M1  cyrb53+base36 稳定 ID，与参考项目一致
├── scan-nav.js           # M1  扫 _docs → { nav, sidebar, seqMap }
├── export-from-sqlite.js # M2  从 memocast.db 导出 markdown + 资源
├── shortlink.js          # M3  path → /<id>.html 短链
├── stage-docs.js         # M3  整理目录、写 seq-manifest.json
├── build-sidebar.js      # M3  scan + shortlink → sidebar.json
├── gen-vuepress-config.js# M4  按 BLOG_BASE 生成 config.js
├── pipeline.js           # M5  串联 export→stage→sidebar→config
├── incremental.js        # M6  sha256 增量 manifest，跳过未变文件
├── enhanceApp.js.template# M4  客户端 base 注入钩子（模板）
├── __tests__/            # M1-M6 单测 + E2E + workflow 校验
└── README.md
```

## 一、一次跑通

```bash
# 1. 全流程
yarn blog:build

# 2. 仅产 sidebar / config（增量构建时常用）
yarn blog:sidebar
yarn blog:config

# 3. 改博客部署前缀（vercel 子路径）
BLOG_BASE=/memocast-blog/ yarn blog:config

# 4. 跑全套单测
yarn blog:test
```

## 二、阶段脚本

| 脚本                    | 作用                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `yarn blog:export`      | `export-from-sqlite.js`：从 `%APPDATA%/coolma/memocast.db` 导出 `_docs-export/`（含 markdown + base64 图片落地） |
| `yarn blog:stage`       | `pipeline --stage-only`：把 `_docs-export/` 整理为 `_docs/`，序号剥离、写 `seq-manifest.json` |
| `yarn blog:sidebar`     | `pipeline --sidebar-only`：生成 `_docs/.vuepress/sidebar.json` |
| `yarn blog:config`      | `pipeline --config-only`：按 `BLOG_BASE` 生成 `_docs/.vuepress/config.js` |
| `yarn blog:build`       | `pipeline`：上面 4 个阶段一次跑完                             |
| `yarn blog:preview`     | 上面 + `vuepress dev _docs`（需先 `yarn add -D vuepress`）  |
| `yarn blog:test`        | 跑 `__tests__/*.test.js`                                     |

## 三、环境变量

| 变量                    | 默认值                                 | 说明                                       |
| ----------------------- | -------------------------------------- | ------------------------------------------ |
| `MEMOCAST_DB`           | `<APPDATA>/coolma/memocast.db`         | SQLite 数据库绝对路径                      |
| `MEMOCAST_BLOG_OUT`     | `<repo>/_docs-export`                  | export 阶段输出目录                        |
| `MEMOCAST_STAGE_DIR`    | `<repo>/_docs`                         | stage 阶段输出目录（vuepress 输入）         |
| `MEMOCAST_BASE`         | `/`                                    | 同 `BLOG_BASE`                             |
| `BLOG_BASE`             | `/`                                    | 部署基础路径（VERCEL 时 `/`，子路径时 `/foo/`）|
| `BLOG_SYS`              | （空）                                 | 只导出指定 `kb_guid` 的笔记                 |

## 四、笔记纳入规则

需要让一篇笔记进入博客，要么：

- 给它打 `published` / `发布` 标签；或
- 在 front-matter（YAML 或 HTML 注释）里写 `published: true`

```markdown
<!-- published: true -->
# 我的第一篇博客
```

```yaml
---
title: 我的第一篇博客
published: true
order: 5
---
```

离线根 `/My Notes/` 下的笔记默认排除（除非显式打 published 标签）。

## 五、目录命名约定（与参考项目一致）

`scan-nav.js` 用目录名前缀决定该目录进 `nav` 还是 `sidebar`：

- `nav.1-技术/`、`nav.2-生活/` 进入顶部 nav
- `ch.1-前端/`、`ch.2-后端/` 进入 sidebar 二级菜单
- `sec.3-进阶/` 进一步下钻

其他命名前缀（`tpl/`、`faq/`、`news/`、`demo/` 等）按参考项目的折叠规则自动
处理。完整列表见 `scan-nav.js` 中的 `DEFAULT_COLLAPSABLE_FOLDERS`。

文件名以 `01-` `02-` 开头会自动剥离序号，序号写进 `seq-manifest.json`，供
`shortlink` 阶段保持 hash 稳定。

## 六、shortlink 算法

- `genId(basename, dir) = base36(cyrb53(basename + '|' + dir, 0)) + base36(cyrb53(..., 1))`
- 输入会剥离 ❤ / ❤️ / 变体选择符（不影响 ID）
- 输出 ≈ 16-26 字符 Base36
- 算法与参考项目一致，**不要轻易改**

短链映射示例：

| 原 path                                | 短链                |
| -------------------------------------- | ------------------- |
| `nav.1-技术/ch.1-前端/01-react.md`     | `/<id>.html`        |
| `nav.1-技术/`                          | `/<id>/`            |
| `https://github.com`                   | 透传                |
| `assets/<note-id>/img-1.png`           | 透传（资源链接）    |

## 七、permalink

每个导出的 markdown front-matter 都自动注入 `permalink: /<id>.html`，让
vuepress 用与 sidebar.json 完全一致的 URL 渲染。

```yaml
---
title: "Hello"
order: 1
permalink: /1r1n24r5ad8kc1sz2cb32oxy8k.html
note_id: n1
tags: ["published"]
created: "2023-11-14T22:13:20.000Z"
---
```

为什么必须：

- vuepress 默认会按文件路径拼 URL（`nav.技术/01-Hello.md` → `/nav.技术/01-Hello.html`），
  但 sidebar.json 里写的是 `shortlink.js` 算出的 `/{id}.html`。两端 URL 不一致，
  点链接会 404。
- 注入 permalink 后，vuepress 直接把它当 canonical URL，sidebar 和详情页完全吻合。
- **算法一致性**：`shortlinkForExport` 与 `shortlink` 用同样的 cyrb53，同样的
  basename 剥离规则；E2E 测试会断言两者输出字符串相等。

目录索引也会注入 `permalink: /<id>/`，让 `nav.技术/` 这种 nav 大项也能独立成页。

## 八、双模 publicPath

部署到不同位置：

```bash
# Vercel / Netlify 自定义域名（根路径）
BLOG_BASE=/ yarn blog:config

# 子路径部署（如 https://example.com/memocast-blog/）
BLOG_BASE=/memocast-blog/ yarn blog:config
```

生成产物差异：

- `_docs/.vuepress/config.js` 里的 `base` 字段
- 客户端通过 `.vuepress/enhanceApp.js` 把 base 注入 `window.__BLOG_BASE__`

## 九、增量缓存

`scripts/blog/incremental.js` 在 export / stage 阶段共用一份
`seq-manifest.json` + `.blog-build-manifest.json`：

- 内容 hash（sha256 前 16 字符）命中 → 跳过磁盘写
- 文件被删 → 自动从 manifest 清理（prune）
- manifest 写入 `.gitignore`（`/docs/_docs/.vuepress/.blog-build-manifest.json`）

构建耗时对比（300 篇笔记、第二次构建）：

- 全量：~8 s
- 增量：~0.6 s（仅 2 篇笔记变更时）

## 十、CI / GitHub Actions

仓库自带三份 workflow，全部放在 `.github/workflows/`：

| 文件 | 触发时机 | 作用 |
| --- | --- | --- |
| `blog-build.yml` | push 到 master/main、tag `v*`、workflow_dispatch | 跑完整 pipeline → vuepress build → 推 gh-pages |
| `blog-db-upload.yml` | workflow_dispatch | 把 secret 里的 `memocast.db` 解码后上传为 artifact |
| `blog-preview.yml` | pull_request | 不部署；跑测试 + sidebar/config 构建，发 PR 评论 |

### 首次接入步骤

1. **把数据库塞进 CI**。在仓库 Settings → Secrets and variables → Actions：

   - 新建 `MEMOCAST_DB_BASE64`：值是 `base64 -w0 memocast.db` 的输出
     ```bash
     # 本地执行（小文件可，>20MB 建议改用 artifact 方式）
     base64 -w0 "%APPDATA%/coolma/memocast.db" | head -c 100  # 检查大概长度
     ```
   - 新建 `MEMOCAST_BLOG_BASE`（可选）：子路径部署时填 `/memocast-blog/`，默认 `/`

2. **启用 GitHub Pages**。Settings → Pages → Source 选择 `gh-pages` 分支 / `(root)` 目录。第一次 push 后会自动启用。

3. **手动触发试跑**。Actions → `blog-build` → Run workflow → 勾上 deploy → Run。日志会显示：
   - 数据库从哪里取（artifact / base64 / fixture）
   - sidebar.json 的 nav / sidebar 路由数
   - vuepress 静态站大小

### 三份 workflow 详解

#### `blog-build.yml`

主部署流水线，关键步骤：

```yaml
- Checkout（深度 0，需要 tags）
- Setup Node 20 + yarn 缓存
- yarn install --frozen-lockfile
- 取 memocast.db（artifact → base64 → fixture 三级 fallback）
- yarn blog:sidebar && yarn blog:config     # 快速通道：仅构建索引
- yarn blog:build                            # 慢通道：有 db 时跑 export
- yarn add -D vuepress@^1.9                  # 临时装 vuepress
- vuepress build _docs
- cp dist/index.html dist/404.html           # GitHub Pages SPA fallback
- peaceiris/actions-gh-pages@v4 → gh-pages 分支
```

特性：

- **并发控制**：`concurrency: blog-${{ github.ref }}` 取消旧部署
- **PR 跳过部署**：只有 push 与手动触发才部署
- **失败诊断**：`failure()` 时 dump sidebar.json / config.js / _docs 树
- **Artifact 保留**：构建产物 `_docs` 14 天、vuepress dist 30 天
- **gh-pages 强推**：`force_orphan: false` 保留历史 commit

#### `blog-db-upload.yml`

把 base64 secret 解码后上传 artifact，给 `blog-build` 下载。**用途**：db 文件太大不方便放 secret 时，先跑这个把 db 作为 artifact 缓存，再触发 build：

```bash
# 一次性设置
gh secret set MEMOCAST_DB_BASE64 < memocast.db.b64
# 然后：Actions → blog-db-upload → Run workflow
```

#### `blog-preview.yml`

PR 触发，不部署。跑 `yarn blog:test` + sidebar/config 构建，然后把 BASE/nav 数/sidebar 数贴到 PR 评论。

### 故障排查

| 症状 | 可能原因 | 排查 |
| --- | --- | --- |
| workflow 卡在"取 db"步骤 | secret 没配或配错 | 检查 secret 名是 `MEMOCAST_DB_BASE64` 不是 `MEMOCAST_DB_BASE_64` |
| vuepress build OOM | 大博客 + 2G runner | 加 `--max-old-space-size=4096` 或换 self-hosted runner |
| gh-pages 没更新 | peaceiris 没权限 | 确认 `permissions.contents: write` 已在 workflow 顶部 |
| PR 评论没出现 | github-script 缺权限 | 检查 `permissions.pull-requests: write` |
| 中文 sidebar 乱码 | vuepress 1.x 字体 | 在 `.vuepress/styles/index.styl` 加字体回退 |

### 本地验证 workflow

```bash
node scripts/blog/__tests__/gh-workflow.test.js
```

会做：
1. YAML 解析（用项目自带的 `yaml` 包）
2. action 版本号合法性（actions/checkout@v4 等）
3. 与 `package.json scripts` 的引用一致性
4. 步骤顺序检查（checkout → install → db → build → deploy）
5. secrets 引用规范（不允许硬编码长 base64）

## 十一、自测

每个 milestone 都有对应的纯 JS 单测：

```bash
node scripts/blog/__tests__/m1.test.js
node scripts/blog/__tests__/m2.test.js
node scripts/blog/__tests__/m3.test.js
node scripts/blog/__tests__/m4.test.js
node scripts/blog/__tests__/m5.test.js
node scripts/blog/__tests__/m6.test.js
node scripts/blog/__tests__/e2e.test.js
node scripts/blog/__tests__/gh-workflow.test.js
# 或
yarn blog:test
```

不依赖任何第三方包（gh-workflow 测试用了项目自带的 `yaml` 包），CI 与本地都能跑。

## 十二、待办（计划外 / 待用户决策）

- [ ] 静态站点生成器选型：vuepress 1.x / vitepress / 自研 minimal renderer
- [ ] 是否把 `_docs-export` 与 `_docs` 都放进 git（默认两者都 gitignore）
- [x] 添加 gh-pages 自动部署 workflow（见 `.github/workflows/blog-build.yml` 等三份）