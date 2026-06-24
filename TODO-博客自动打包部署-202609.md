# Memocast 博客自动打包部署功能实现计划

> 日期：2026-06-21（更新：2026-06-24）
> 项目：Memocast (coolma)
> 目标：右键文件夹 → 复制/导出 MD 到本地 → 调用 vuepress/vdoing 打包 → 通过 GitHub API 触发在线部署

---

## 零、打包策略（2026-06-24 更新）

### 核心思路

```
用户触发博客打包
    │
    ├─ [1] 检测 Node.js 是否安装
    │     └─ 未安装 → 引导用户安装 Node.js
    │           │
    │           └─ 提示信息：下载地址、安装步骤
    │
    ├─ [2] 检测博客目录的 node_modules
    │     │
    │     ├─ 已有 node_modules → 直接使用
    │     │
    │     └─ 无 node_modules → 创建软链接指向 Memocast 内置 node_modules
    │           │
    │           ├─ 开发模式：链接到项目根目录的 node_modules
    │           └─ 生产模式：链接到 Electron 打包后的 node_modules
    │
    ├─ [3] 从博客目录的 node_modules 获取 vuepress
    │     │
    │     └─ 优先博客自己的 vuepress，回退到 Memocast 内置
    │
    └─ [4] 执行 vuepress build 打包
```

### 软链接策略详解

| 场景 | node_modules 来源 | 说明 |
|------|-----------------|------|
| 博客已有自己的 node_modules | `博客目录/node_modules` | 用户可能已安装 vuepress/vdoing 等 |
| 开发模式打包 | `Memocast项目/node_modules` | 使用 Memocast 内置的依赖 |
| 生产模式打包 | `Electron app/node_modules` | Electron 打包后的 node_modules |

### Windows 兼容性

- Windows 使用 `mklink /J` 创建 **junction**（目录连接）
- junction 优点：无需管理员权限，不会跨驱动器限制
- 不使用 symlink（需要管理员权限）

### Node.js 检测与引导

当系统未安装 Node.js 时，显示引导对话框：

```
┌─────────────────────────────────────────┐
│  Node.js 未安装                          │
│                                          │
│  博客打包需要 Node.js 环境               │
│                                          │
│  安装步骤：                              │
│  1. 访问 https://nodejs.org/zh-cn/      │
│     下载 LTS 版本                        │
│  2. 安装时勾选 "Add to PATH"            │
│  3. 重启 Memocast 后重试                 │
│                                          │
│  [访问下载页面]        [关闭]            │
└─────────────────────────────────────────┘
```

---

## 一、需求分析与技术方案

### 1.1 现有能力盘点

| 能力 | 现状 | 可复用程度 |
|------|------|----------|
| 文件夹右键菜单 | 已实现 (`src/contextMenu/sideDrawer/`) | **高** — 只需扩展 menuItems |
| 批量导出 MD | 已实现 (`exportMarkdownFiles` action) | **高** — 复用 `exportMarkdownFiles` IPC 链路 |
| 主进程文件写入 | 已实现 (`fs-extra`) | **高** — 复用 `api.js` 中的 `fs` 操作模式 |
| 进程执行 (child_process) | **未使用** | **中** — 需新增 |
| GitHub API 调用 | **未实现** | **中** — 需新增 |
| 用户配置存储 | 通过 `electron-store` / SQLite `settings` 表 | **高** — 可复用现有存储方案 |
| IPC 通道注册 | 通过 `share/channels.js` | **高** — 只需新增 channel |
| 国际化 | 通过 `boot/i18n.js` | **高** — 只需新增 i18n key |
| 通知系统 | 通过 `sendNotification` | **高** — 复用现有通知模式 |

### 1.2 技术方案总览

```
用户右键文件夹
    │
    ├─ "导出到博客" (新增)
    │     │
    │     ├─ [1] 批量导出 MD（复用现有 exportMarkdownFiles 逻辑）
    │     │         ↓
    │     ├─ [2] 写入博客源目录 (blog-source-dir/_posts/)
    │     │         ↓
    │     ├─ [3] 生成或追加 sidebar.json（vdoing 侧边栏数据）
    │     │         ↓
    │     ├─ [4] 打开子进程执行 `vuepress build` 打包
    │     │         ↓
    │     ├─ [5] 若 GitHub 部署已配置 → 调用 GitHub API 触发 workflow_dispatch
    │     │         ↓
    │     └─ [6] 通知用户完成状态
    │
    └─ "导出 MD 并复制"（新增，仅步骤 1）
```

---

## 二、架构设计

### 2.1 新增文件清单

```
src/
  services/
    BlogDeployService.js          # 博客部署核心服务（渲染进程调用）
  components/ui/
    dialog/
      BlogDeployDialog.vue         # 部署配置对话框
      BlogDeployProgressDialog.vue # 部署进度对话框
src-electron/main-process/
  service/
    blog-deploy-handler.js         # 主进程 IPC handler（执行子进程、GitHub API）
  service/
    github-api.js                  # GitHub REST API / GraphQL 封装
src-electron/main-process/api.js   # 注册新 IPC handler
share/
  channels.js                      # 新增 channel 定义
src/contextMenu/sideDrawer/
  menuItems.js                     # 新增菜单项
  actions.js                       # 新增 action
  index.js                         # 新增菜单分支
src/constants/
  events.js                        # 新增事件名
src/store/server/
  actions.js                       # 新增 blogDeploy action
src/locales/
  zh-hans.js / en-us.js            # 新增 i18n 文本
```

### 2.2 核心数据流

```
Renderer (Vue Component)
    │ bus.$emit('side.drawer.context.menu.export.to.blog')
    ▼
CategoryTreePanel.vue (handler)
    │ store.dispatch('server/blogDeploy', { category, notes, options })
    ▼
Vuex Store Action (server/blogDeploy)
    │ 1. 调用 exportMarkdownFiles 批量导出到 blog-source-dir/_posts/
    │ 2. 调用 BlogDeployService.writeSidebarJson() 生成 sidebar
    │ 3. 调用 ApiInvoker.startBlogDeploy({ blogDir, githubConfig })
    ▼
ApiInvoker.startBlogDeploy()
    │ ipcRenderer.invoke('start-blog-deploy', { blogDir, githubConfig })
    ▼
Main Process (blog-deploy-handler.js)
    ├─ 子进程: spawn('vuepress', ['build', blogDir], { cwd: blogDir })
    ├─ 进度回调: webContents.send('blog-deploy-progress', { stage, message })
    ├─ 打包完成 → GitHub API: POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches
    └─ 通知: sendNotification({ msg: 'BlogDeploySuccess', ... })
    ▼
Renderer (BlogDeployProgressDialog.vue) 监听进度事件并更新 UI
```

---

## 三、实施步骤（Phase 1 → Phase 2 → Phase 3）

### Phase 1：右键菜单与配置界面（基础交互层）

**Step 1.1** — 新增 IPC Channel

文件：`share/channels.js`

```javascript
// 新增 channel
startBlogDeploy: 'start-blog-deploy',
getBlogDeployStatus: 'get-blog-deploy-status',
cancelBlogDeploy: 'cancel-blog-deploy',
```

**Step 1.2** — 新增 i18n 文本

文件：`src/locales/zh-hans.js` 和 `src/locales/en-us.js`

| key | zh-hans | en |
|-----|---------|-----|
| `exportToBlog` | 导出到博客 | Export to Blog |
| `exportMarkdownAndCopy` | 复制 MD 到剪贴板 | Copy MD to Clipboard |
| `blogDeploy` | 博客部署 | Blog Deploy |
| `blogDir` | 博客源目录 | Blog Source Directory |
| `selectBlogDir` | 选择博客目录 | Select Blog Directory |
| `vuepressNotFound` | 未找到 VuePress，请先配置博客目录 | VuePress not found, configure blog dir first |
| `deployStart` | 开始部署... | Deploying... |
| `deploySuccess` | 博客部署已触发！ | Blog deploy triggered! |
| `deployFailed` | 博客部署失败 | Blog deploy failed |
| `githubToken` | GitHub Personal Access Token | GitHub Personal Access Token |
| `githubRepo` | 目标仓库 (owner/repo) | Target Repository (owner/repo) |
| `githubWorkflowId` | Workflow 文件 ID | Workflow File ID |
| `deployInProgress` | 部署进行中 | Deploy in Progress |
| `stepExport` | 正在导出笔记... | Exporting notes... |
| `stepBuild` | 正在打包博客... | Building blog... |
| `stepTrigger` | 正在触发 GitHub Actions... | Triggering GitHub Actions... |
| `openInBrowser` | 在浏览器中打开 | Open in Browser |

**Step 1.3** — 新增 Bus Event

文件：`src/constants/events.js`

```javascript
SIDE_DRAWER_CONTEXT_MENU: {
  // ... 现有
  exportToBlog: 'side.drawer.context.menu.export.to.blog',
  copyMarkdown: 'side.drawer.context.menu.copy.markdown'
}
```

**Step 1.4** — 新增右键菜单项

文件：`src/contextMenu/sideDrawer/menuItems.js`

```javascript
// 新增
export const EXPORT_TO_BLOG = {
  label: 'exportToBlog',
  id: 'exportToBlogMenuItem',
  click: contextMenu.exportToBlog()
}

export const COPY_MARKDOWN = {
  label: 'copyMarkdown',
  id: 'copyMarkdownMenuItem',
  click: contextMenu.copyMarkdown()
}
```

文件：`src/contextMenu/sideDrawer/actions.js`

```javascript
export const exportToBlog = (menuItem, browserWindow) => {
  return packClickFunction(events.SIDE_DRAWER_CONTEXT_MENU.exportToBlog)
}

export const copyMarkdown = (menuItem, browserWindow) => {
  return packClickFunction(events.SIDE_DRAWER_CONTEXT_MENU.copyMarkdown)
}
```

文件：`src/contextMenu/sideDrawer/index.js` — 在 `showContextMenu()` 中：

```javascript
// 在 EXPORT submenu 中新增 "导出到博客" 选项
// 或在 EXPORT 组后新增独立按钮
ITEMS.push(SEPARATOR)
ITEMS.push(EXPORT_TO_BLOG)
ITEMS.push(COPY_MARKDOWN)
```

**Step 1.5** — 创建部署配置对话框

文件：`src/components/ui/dialog/BlogDeployDialog.vue`

- 用户首次使用 → 弹出配置对话框
- 配置项：
  1. **博客源目录**（必填）— `QInput` + `QBtn` 触发 `dialog.showOpenDialog` 选择目录
  2. **VuePress 可执行文件路径**（可选，默认使用 `blogDir/node_modules/.bin/vuepress`）
  3. **GitHub 配置（可选）**：
     - Personal Access Token（`QInput` type="password"，存储加密）
     - 目标仓库（`owner/repo`）
     - Workflow ID 或文件名（如 `deploy.yml`）
     - Branch（默认 `main`）
- 配置持久化：写入 SQLite `settings` 表（key=`blogDeployConfig`），Token 用 `electron-store` + CryptoJS 加密存储

**Step 1.6** — 创建部署进度对话框

文件：`src/components/ui/dialog/BlogDeployProgressDialog.vue`

- `QDialog` 全屏或居中
- 4 阶段进度条：
  1. 导出笔记（0-25%）
  2. 生成配置文件（25-40%）
  3. VuePress 打包（40-90%）
  4. 触发部署（90-100%）
- 实时日志输出区域（`QScrollArea` 滚动日志）
- 取消按钮 + 完成按钮
- 监听 `blog-deploy-progress` 事件更新进度

---

### Phase 2：主进程 — 子进程打包与 GitHub API（核心逻辑层）

**Step 2.1** — 新增主进程 IPC Handler 注册入口

文件：`src-electron/main-process/api.js` 的 `registerApiHandler()` 方法中：

```javascript
// 博客打包部署
handleApi('start-blog-deploy', async (event, { blogDir, githubConfig }) => {
  const { execBlogBuild } = require('./service/blog-deploy-handler')
  return execBlogBuild(blogDir, githubConfig, event)
})
```

**Step 2.2** — GitHub API 封装

文件：`src-electron/main-process/service/github-api.js`

核心功能：
1. `dispatchWorkflow({ owner, repo, workflowId, branch, token, inputs })` — `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
2. `getWorkflowRuns({ owner, repo, token })` — 查询最近部署状态（可选，用于轮询）
3. `createPersonalAccessToken({ scopes })` — 指引用户去 GitHub Settings 生成

依赖：使用 Electron 主进程中内置的 `fetch` API（Node 18+）或现有 `src-electron/main-process/service/request.js` 中的 axios 实例。

```javascript
// 关键 API 调用
export async function dispatchWorkflow ({ owner, repo, workflowId, branch, token, inputs = {} }) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      ref: branch,
      inputs
    })
  })
  return response.status === 204  // 204 No Content = 成功
}
```

**Step 2.3** — 博客打包 Handler（核心）

文件：`src-electron/main-process/service/blog-deploy-handler.js`

核心流程：

```javascript
async function execBlogBuild(blogDir, githubConfig, event) {
  // 0. 检测 Node.js 是否安装
  const nodeCheck = await checkNodeJSInstalled()
  if (!nodeCheck.installed) {
    // 引导用户安装 Node.js
    return { error: 'nodeNotFound', guide: getNodeJSInstallGuide() }
  }

  // 1. 验证博客目录
  const validation = validateBlogDir(blogDir)
  if (!validation.valid) {
    return { error: 'blogDirInvalid', details: validation.errors }
  }

  // 2. 确保 node_modules 可用（软链接策略）
  const nodeModulesResult = await ensureBlogNodeModules(blogDir)
  if (nodeModulesResult.source === 'none') {
    return { error: 'nodeModulesSetupFailed' }
  }

  // 3. 获取 vuepress 二进制
  const { bin: vuepressBin } = getBuiltInVuepressBin(blogDir)
  if (!fs.existsSync(vuepressBin)) {
    return { error: 'vuepressNotFound' }
  }

  // 4. 执行 vuepress build
  const result = await runVuepressBuild(blogDir, vuepressBin, onProgress)

  // 5. 触发 GitHub Actions（若配置了）
  if (githubConfig?.token && githubConfig?.repo) {
    await dispatchWorkflow(githubConfig)
  }

  return { success: true, outputDir: path.join(blogDir, '.vuepress/dist') }
}

// 软链接策略核心
async function ensureBlogNodeModules(blogDir) {
  const blogNodeModules = path.join(blogDir, 'node_modules')

  // 优先使用博客自己的 node_modules
  if (fs.existsSync(blogNodeModules)) {
    return { source: 'blog', linked: false }
  }

  // 获取 Memocast 内置 node_modules
  const { path: memocastPath } = getMemocastNodeModules()

  // 创建软链接（Windows 使用 junction）
  const linked = await createNodeModulesSymlink(blogDir, memocastPath)

  return {
    source: linked ? 'memocast' : 'none',
    linked
  }
}

// 使用 spawn 执行 vuepress build
function runVuepressBuild(blogDir, vuepressBin, onProgress) {
  return new Promise((resolve) => {
    const cmd = `set NODE_OPTIONS=--openssl-legacy-provider && node "${vuepressBin}" build`
    const child = spawn(cmd, { cwd: blogDir, shell: true, windowsHide: true })
    // ... stdout/stderr 处理
  })
}
```

**关键函数说明：**

| 函数 | 作用 |
|------|------|
| `checkNodeJSInstalled()` | 检测系统是否安装 Node.js |
| `getNodeJSInstallGuide()` | 返回 Node.js 安装引导信息 |
| `getMemocastNodeModules()` | 获取 Memocast 内置 node_modules 路径 |
| `createNodeModulesSymlink()` | 创建软链接（Windows junction） |
| `ensureBlogNodeModules()` | 确保博客目录有可用 node_modules |
| `getBuiltInVuepressBin()` | 从博客 node_modules 获取 vuepress |

**Step 2.4** — 注册子进程任务取消机制

在 `blog-deploy-handler.js` 中维护 `currentProcess` 引用，支持 `cancelBlogDeploy` channel 中断子进程。

---

### Phase 3：Vuex Action 与服务层集成（业务编排层）

**Step 3.1** — 新增 Vuex Action

文件：`src/store/server/actions.js` 末尾新增：

```javascript
async blogDeploy ({ state, commit, dispatch }, { category, noteFields }) {
  Loading.show({
    spinner: QSpinnerGears,
    message: i18n.t('deployStart'),
    delay: 200
  })

  // 1. 获取部署配置
  const config = await this._vm.$db.getAppState('blogDeployConfig')
  if (!config?.blogDir) {
    Loading.hide()
    // 弹出配置对话框
    return dispatch('showBlogDeployDialog', { category, noteFields })
  }

  // 2. 批量导出笔记到博客目录
  await dispatch('exportMarkdownFiles', { noteFields, category })

  // 3. 生成 sidebar.json（vdoing 侧边栏数据）
  await BlogDeployService.generateSidebarJson(config.blogDir, noteFields)

  // 4. 调用主进程打包
  const result = await startBlogDeploy({
    blogDir: config.blogDir,
    githubConfig: config.github
  })

  Loading.hide()

  if (result.error) {
    this._vm.$q.notify({
      type: 'negative',
      message: i18n.t('deployFailed') + ': ' + result.error
    })
  } else {
    this._vm.$q.notify({
      type: 'positive',
      message: i18n.t('deploySuccess'),
      caption: result.outputDir
    })
  }
}
```

**Step 3.2** — BlogDeployService

文件：`src/services/BlogDeployService.js`

```javascript
import fs from 'fs-extra'
import path from 'path'

export default {
  // 根据导出的笔记生成 vdoing 侧边栏数据
  async generateSidebarJson (blogDir, noteFields) {
    const sidebarPath = path.join(blogDir, 'sidebar.json')
    const sidebarData = {}

    noteFields.forEach(note => {
      const category = note.category || 'default'
      if (!sidebarData[category]) {
        sidebarData[category] = []
      }
      sidebarData[category].push({
        title: note.title.replace('.md', ''),
        path: `_posts/${note.title.replace('.md', '')}.md`
      })
    })

    await fs.writeJson(sidebarPath, sidebarData, { spaces: 2 })
  },

  // 将笔记内容写入博客 _posts 目录
  async writeBlogPosts (blogDir, notes) {
    const postsDir = path.join(blogDir, '_posts')
    await fs.ensureDir(postsDir)

    for (const note of notes) {
      const filename = `${note.title.replace('.md', '')}.md`
      const filepath = path.join(postsDir, filename)
      // 追加 vdoing frontmatter
      const content = this.addVdoingFrontmatter(note) + '\n\n' + note.content
      await fs.writeFile(filepath, content)
    }
  },

  addVdoingFrontmatter (note) {
    const date = new Date().toISOString().split('T')[0]
    return `---\ntitle: ${note.title.replace('.md', '')}\ndate: ${date}\nsidebar: auto\n---\n`
  }
}
```

**Step 3.3** — CategoryTreePanel.vue 监听事件

在 `CategoryTreePanel.vue` 的 `contextMenuHandler` 方法中处理新增事件：

```javascript
// 在 bus.$on 或直接在组件中监听
bus.$on('side.drawer.context.menu.export.to.blog', async (data) => {
  const notes = await this.fetchNotesInCategory(data.category)
  this.$store.dispatch('server/blogDeploy', {
    category: data.category,
    noteFields: notes
  })
})
```

---

## 四、关键设计决策

### 4.1 GitHub API vs. GitHub CLI

| 方案 | 优点 | 缺点 |
|------|------|------|
| **GitHub REST API** (推荐) | 无需用户安装 gh CLI，Token 管理更精细化，可完全由应用控制 | 需要用户手动生成 PAT |
| **GitHub CLI (gh)** | 命令简单，`gh workflow run` 一行搞定 | 需要用户安装 gh CLI，PAT 仍需存储 |

**决策：采用 GitHub REST API** — 依赖 Electron 主进程内置的 `fetch`（Node 18+），无需额外依赖。

### 4.2 PAT (Personal Access Token) 安全存储

- **不存储在 SQLite 明文** — 写入 `electron-store`（加密存储）
- **使用 CryptoJS AES** — 复用项目现有的加密方案（在 `electron-main.js` 中已用于 AI API Key）
- **明文不在日志中输出**

### 4.3 子进程打包的稳定性

- 使用 `child_process.spawn` + promise 封装，避免阻塞主进程
- 进度回调通过 `webContents.send` 实时推送，避免 renderer 轮询
- 支持取消按钮 — 维护 `child.kill('SIGTERM')` 终止进程
- 打包输出（stdout/stderr）实时转发到进度对话框的日志区域

### 4.4 博客配置与笔记导出的解耦

- 博客目录配置独立存储，首次使用引导配置
- 导出 MD 到博客目录时自动创建 `_posts` 子目录（符合 VuePress/Vdoing 规范）
- 支持自定义 `vuepress.config.js` 中的 `dest` 目录检测

---

## 五、用户交互流程

```
[右键文件夹] → [导出到博客] → [首次：弹出配置对话框]
                              │
                              ├─ 配置博客目录 + GitHub Token
                              └─ 保存并继续
                                    │
                                    ▼
                              [进度对话框出现]
                                    │
                        ┌───────────┼───────────┐
                        ▼           ▼           ▼
                    [导出笔记]  [打包博客]  [触发部署]
                        │           │           │
                        ▼           ▼           ▼
                    ✅ 完成      ✅ 完成    ✅ 成功通知
                        └───────────┴───────────┘
                                    │
                                    ▼
                            [在浏览器中打开博客]
                            [或打开 GitHub Actions 页面]
```

---

## 六、依赖与包管理

### 需要新增的依赖

| 依赖 | 版本 | 用途 | 安装命令 |
|------|------|------|---------|
| `@octokit/rest` | `^21.x` | GitHub REST API 官方 SDK（替代手写 fetch） | `yarn add @octokit/rest` |

> 注：若不想引入新依赖，可使用 Electron 主进程内置 `fetch` API（Node 18+ 已内置），但 `@octokit/rest` 体验更好且有自动重试、分页等能力。

### 可选依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `chalk` | `^4.x` | 控制台输出彩色文字（打包日志展示） |
| `ora` | `^5.x` | 命令行 loading spinner（控制台用） |

---

## 七、测试计划

### 7.1 单元测试

| 测试项 | 测试文件 | 框架 |
|--------|----------|------|
| GitHub API 封装 | `test/unit/github-api.test.js` | Jest + nock |
| BlogDeployService 工具函数 | `test/unit/blog-deploy-service.test.js` | Jest |
| IPC handler 集成 | `test/unit/blog-deploy-handler.test.js` | Jest |

### 7.2 E2E 测试（Electron）

| 测试项 | 操作 |
|--------|------|
| 右键菜单显示 | 右键文件夹 → 确认"导出到博客"和"复制 MD"菜单项出现 |
| 配置保存/读取 | 填写配置 → 重启应用 → 确认配置被正确恢复 |
| 完整打包流程 | 右键 → 导出 → 确认进度条更新 → 确认打包产物存在 |
| GitHub API 触发 | 配置 Token → 触发部署 → 确认 GitHub Actions 运行 |

---

## 八、风险与注意事项

1. **Node.js 依赖**：博客打包依赖系统安装的 Node.js 环境，首次使用应引导用户安装。

2. **软链接兼容性**：
   - Windows 使用 `mklink /J`（junction），无需管理员权限
   - junction 只能用于目录，不能跨驱动器
   - 确保博客目录和 Memocast 在同一驱动器

3. **打包体积影响**：新增 `@octokit/rest` 会略微增加安装包体积。建议放在 `dependencies` 而非 `devDependencies`，确保生产可用。

4. **electron-builder 排除**：当前 `quasar.conf.js` 的 `files` 配置中已排除 `vuepress*/**/*`。博客打包脚本本身不需要被打入 Memocast 安装包，只需在用户本地博客目录中执行。

5. **Windows 兼容性**：子进程调用 `vuepress` 时注意跨平台，使用 `path.join` 和 `shell: true` 确保 Windows 兼容。

6. **Token 权限**：用户在 GitHub 生成 PAT 时需要 `repo` 范围（完整仓库控制）或 `workflow` 范围（仅工作流），建议应用内提供指引链接。

7. **VuePress 版本**：当前 `package.json` 中使用 `vuepress@^1.9.10`，VuePress 2.x 和 1.x 命令行接口不同，需确认用户博客版本。

---

## 九、实现优先级

| 优先级 | 步骤 | 工作量估计 |
|--------|------|-----------|
| **P0** | Step 1.1-1.3 (IPC + i18n + events) | 1h |
| **P0** | Step 1.4-1.5 (右键菜单 + 配置对话框) | 2h |
| **P0** | Step 2.1-2.3 (主进程打包 + GitHub API) | 4h |
| **P1** | Step 3.1-3.3 (Vuex Action + Service) | 2h |
| **P1** | Step 1.6 (进度对话框) | 2h |
| **P2** | Step 7 (测试) | 3h |
| **P3** | 文档与用户指引 | 1h |

**总工时估算：约 15 小时**

---

## 十、后续扩展方向

1. **定时自动部署**：集成 `node-schedule`（项目已安装）实现定时同步部署
2. **Gitee / GitLab 支持**：扩展 API 封装支持更多平台
3. **Vdoing 主题增强**：自动生成 `sidebar.json`、`categories.json`、`pages.json` 等 vdoing 特有配置
4. **部署历史记录**：在 SQLite 中记录每次部署的时间、状态、目标仓库
5. **预览模式**：打包后自动打开本地预览服务器 (`vuepress dev`)

---

## 十一、进度显示增强（P2）

> 更新日期：2026-06-24
> 参考：MisthinTools 的任务栏进度和托盘通知

### 11.1 目标

实现更丰富的进度反馈，让用户即使在后台打包也能了解进度。

### 11.2 任务栏进度条

使用 Electron 的 `BrowserWindow.setProgressBar()` API 在系统任务栏显示打包进度：

```javascript
// src-electron/main-process/service/blog-deploy-handler.js

function sendProgress (webContents, stage, message, percent) {
  // 发送进度到渲染进程
  webContents.send('blog-deploy-progress', { stage, message, percent })

  // 更新任务栏进度条
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) {
    win.setProgressBar(percent / 100)
  }
}

function clearProgressBar (webContents) {
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) {
    win.setProgressBar(-1) // -1 表示清除进度条
  }
}
```

**进度阶段划分：**

| 阶段 | 进度范围 | 说明 |
|------|---------|------|
| `nodejs` | 1-5% | 检测 Node.js |
| `config` | 5-15% | 验证博客目录、配置检查 |
| `node_modules` | 15-25% | 创建软链接 |
| `export` | 25-40% | 导出笔记到 _posts |
| `build` | 40-85% | VuePress 打包构建 |
| `upload` | 85-95% | SFTP/GitHub 上传 |
| `done` | 100% | 完成，清除进度条 |

### 11.3 托盘图标通知

```javascript
// src-electron/main-process/service/blog-deploy-handler.js

const { Tray, nativeImage } = require('electron')

let tray = null

function showTrayNotification (title, body, type = 'info') {
  if (!tray) {
    tray = new Tray(nativeImage.createEmpty())
  }

  // 显示系统通知
  tray.displayBalloon({
    iconType: type === 'error' ? 'error' : 'info',
    title,
    content: body
  })
}

// 打包完成通知
function notifySuccess (webContents) {
  showTrayNotification('博客部署完成', '打包并部署成功！', 'info')
  clearProgressBar(webContents)
}

// 打包失败通知
function notifyError (webContents, error) {
  showTrayNotification('博客部署失败', error || '未知错误', 'error')
  clearProgressBar(webContents)
}
```

### 11.4 进度对话框增强

文件：`src/components/ui/dialog/BlogDeployProgressDialog.vue`

**UI 结构：**

```
┌────────────────────────────────────────────────────────┐
│  博客部署进度                                    [×]  │
├────────────────────────────────────────────────────────┤
│                                                        │
│  [████████████████░░░░░░░░░░░]  42%                  │
│                                                        │
│  正在打包博客...                                       │
│                                                        │
│  ┌─ 步骤 ─────────────────────────────────────────┐  │
│  │ ✓ 检测 Node.js                                 │  │
│  │ ✓ 验证博客目录                                 │  │
│  │ ✓ 创建 node_modules 软链接                     │  │
│  │ ● VuePress 打包中...                           │  │
│  │ ○ 触发 GitHub Actions                         │  │
│  │ ○ 完成                                         │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─ 日志 ─────────────────────────────────────────┐  │
│  │ [17:30:01] Starting VuePress build...         │  │
│  │ [17:30:02] wait  for  building site...       │  │
│  │ [17:30:05]   ✓  generating pages             │  │
│  │ ...                                           │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
│                              [取消]  [后台运行]        │
└────────────────────────────────────────────────────────┘
```

**组件特性：**
- 顶部进度条：粗细 8px，圆角，显示百分比
- 步骤列表：已完成(✓)、进行中(●)、待完成(○)
- 日志区域：自动滚动，可折叠/展开
- 按钮：取消（终止进程）、后台运行（最小化到托盘）

### 11.5 实现清单

| 步骤 | 文件 | 工作内容 |
|------|------|---------|
| 11.5.1 | `blog-deploy-handler.js` | 添加 `setProgressBar()` 调用 |
| 11.5.2 | `blog-deploy-handler.js` | 添加托盘通知函数 |
| 11.5.3 | `BlogDeployProgressDialog.vue` | 增强 UI：步骤列表 + 日志区 |
| 11.5.4 | `zh-hans.js` / `en-us.js` | 新增进度相关 i18n |

---

## 十二、SFTP 部署支持（P2）

> 更新日期：2026-06-24
> 参考：MisthinTools 的 FTP/SFTP 部署功能

### 12.1 目标

支持将打包后的静态文件直接上传到用户自己的服务器，无需依赖 GitHub Pages。

### 12.2 技术方案

```
┌─────────────────────────────────────────────────────────────┐
│                      部署模式选择                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ○ GitHub Actions（已有）                                  │
│     自动触发 GitHub Pages 部署                              │
│                                                             │
│  ● SFTP 上传（新增）                                       │
│     直接上传到您的服务器                                    │
│                                                             │
│  ○ 两者都执行                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 12.3 SFTP 配置项

文件：`BlogDeployDialog.vue` 新增配置区域：

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `sftp.enabled` | boolean | 是否启用 SFTP |
| `sftp.host` | string | 服务器地址 |
| `sftp.port` | number | 端口，默认 22 |
| `sftp.username` | string | 用户名 |
| `sftp.authType` | 'password' \| 'key' | 认证方式 |
| `sftp.password` | string | 密码（加密存储） |
| `sftp.privateKeyPath` | string | SSH Key 路径 |
| `sftp.remotePath` | string | 远程目录，如 `/var/www/blog` |
| `sftp.backupEnabled` | boolean | 是否备份 |
| `sftp.backupPath` | string | 备份目录 |

### 12.4 新增 IPC Channel

```javascript
// share/channels.js

// SFTP 相关
sftpTestConnection: 'sftp-test-connection',
sftpUpload: 'sftp-upload',
sftpBackup: 'sftp-backup',
```

### 12.5 SFTP Service 实现

文件：`src-electron/main-process/service/sftp-service.js`

```javascript
const { Client } = require('ssh2')
const fs = require('fs-extra')
const path = require('path')

let currentClient = null

/**
 * 测试 SFTP 连接
 */
async function testConnection (config) {
  return new Promise((resolve, reject) => {
    const client = new Client()

    client.on('ready', () => {
      client.sftp((err, sftp) => {
        if (err) {
          client.end()
          reject(err)
          return
        }

        // 测试写入权限
        const testFile = path.join(config.remotePath, '.sftp_test')
        sftp.writeFile(testFile, 'test', (writeErr) => {
          if (writeErr) {
            client.end()
            reject(new Error('No write permission'))
            return
          }

          // 删除测试文件
          sftp.unlink(testFile, () => {
            client.end()
            resolve({ success: true })
          })
        })
      })
    })

    client.on('error', (err) => {
      reject(err)
    })

    // 连接配置
    const connConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username
    }

    if (config.authType === 'password') {
      connConfig.password = config.password
    } else {
      connConfig.privateKey = fs.readFileSync(config.privateKeyPath)
      if (config.passphrase) {
        connConfig.passphrase = config.passphrase
      }
    }

    client.connect(connConfig)
  })
}

/**
 * 上传目录到远程服务器
 */
async function uploadDirectory (config, localDir, onProgress) {
  return new Promise((resolve, reject) => {
    const client = new Client()
    currentClient = client

    client.on('ready', () => {
      client.sftp(async (err, sftp) => {
        if (err) {
          client.end()
          reject(err)
          return
        }

        try {
          // 确保远程目录存在
          await ensureRemoteDir(sftp, config.remotePath)

          // 递归上传
          await uploadRecursive(sftp, localDir, config.remotePath, onProgress)

          client.end()
          resolve({ success: true })
        } catch (uploadErr) {
          client.end()
          reject(uploadErr)
        }
      })
    })

    client.on('error', reject)

    // 连接配置（同上）
    const connConfig = { /* ... */ }
    client.connect(connConfig)
  })
}

/**
 * 递归上传文件
 */
async function uploadRecursive (sftp, localPath, remotePath, onProgress) {
  const stats = fs.statSync(localPath)
  const entries = fs.readdirSync(localPath)

  for (const entry of entries) {
    const localFullPath = path.join(localPath, entry)
    const remoteFullPath = `${remotePath}/${entry}`
    const stat = fs.statSync(localFullPath)

    if (stat.isDirectory()) {
      await ensureRemoteDir(sftp, remoteFullPath)
      await uploadRecursive(sftp, localFullPath, remoteFullPath, onProgress)
    } else {
      await uploadFile(sftp, localFullPath, remoteFullPath)
      onProgress?.(entry)
    }
  }
}

/**
 * 上传单个文件
 */
function uploadFile (sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/**
 * 确保远程目录存在
 */
function ensureRemoteDir (sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (err) => {
      // 忽略已存在的错误
      if (err && err.code !== 4) {
        // 4 = Failure: directory already exists
        // 其他错误才 reject
        // 但通常 mkdir 报 4 表示目录已存在
        // 所以这里简单处理：忽略错误即可
      }
      resolve()
    })
  })
}

/**
 * 取消上传
 */
function cancelUpload () {
  if (currentClient) {
    currentClient.end()
    currentClient = null
  }
}

module.exports = {
  testConnection,
  uploadDirectory,
  cancelUpload
}
```

### 12.6 部署流程集成

文件：`src-electron/main-process/service/blog-deploy-handler.js`

```javascript
async function execBlogBuild (blogDir, githubConfig, sftpConfig, event) {
  // ... 现有打包逻辑 ...

  // 打包完成
  const outputDir = path.join(blogDir, '.vuepress/dist')

  // GitHub Actions（若配置了）
  if (githubConfig?.enabled && githubConfig?.token) {
    sendProgress(webContents, 'upload', 'Triggering GitHub Actions...', 90)
    await dispatchWorkflow(githubConfig)
  }

  // SFTP 上传（若配置了）
  if (sftpConfig?.enabled) {
    sendProgress(webContents, 'upload', 'Connecting to server...', 85)
    
    const { uploadDirectory } = require('./sftp-service')
    await uploadDirectory(sftpConfig, outputDir, (filename) => {
      sendProgress(webContents, 'upload', `Uploading: ${filename}`, percent)
    })
  }

  sendProgress(webContents, 'done', 'Deploy complete!', 100)
  notifySuccess(webContents)
  return { success: true, outputDir }
}
```

### 12.7 实现清单

| 步骤 | 文件 | 工作内容 |
|------|------|---------|
| 12.7.1 | `sftp-service.js` (新增) | SFTP 连接与上传核心逻辑 |
| 12.7.2 | `blog-deploy-handler.js` | 集成 SFTP 上传流程 |
| 12.7.3 | `BlogDeployDialog.vue` | 添加 SFTP 配置表单 |
| 12.7.4 | `share/channels.js` | 新增 SFTP IPC channel |
| 12.7.5 | `src-electron/main-process/api.js` | 注册 SFTP IPC handler |
| 12.7.6 | `zh-hans.js` / `en-us.js` | 新增 SFTP 相关 i18n |

### 12.8 依赖

```bash
yarn add ssh2
```

> 注：`ssh2` 是一个纯 JavaScript 实现的 SSH2 客户端，支持 SFTP、SSH Tunnel 等功能。

### 12.9 安全考虑

1. **密码加密**：使用 `electron-store` + CryptoJS 加密存储
2. **SSH Key**：支持用户选择本地私钥文件，不存储密码
3. **连接超时**：设置 30 秒超时，避免长时间等待
4. **错误处理**：详细的错误信息，便于排查问题

---

## 十三、实现优先级（更新）

| 优先级 | 步骤 | 工作量估计 |
|--------|------|-----------|
| **P0** | Step 1.1-1.3 (IPC + i18n + events) | 1h |
| **P0** | Step 1.4-1.5 (右键菜单 + 配置对话框) | 2h |
| **P0** | Step 2.1-2.3 (主进程打包 + GitHub API) | 4h |
| **P1** | Step 3.1-3.3 (Vuex Action + Service) | 2h |
| **P1** | Step 1.6 (进度对话框) | 2h |
| **P2** | 11.x (进度显示增强) | 3h |
| **P2** | 12.x (SFTP 部署支持) | 5h |
| **P3** | Step 7 (测试) | 3h |
| **P3** | 文档与用户指引 | 1h |

**总工时估算：约 23 小时**
