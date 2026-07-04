import path from 'path'
import fs from 'fs-extra'

/**
 * 极简 cyrb53 —— 与 vuepress-build 的 shortlink 算法一致。
 * 笔记原始标题 → 短链 id。让 permalink 在 vuepress 重建后仍命中
 * 同一 URL（重命名只改 title，不影响 id）。
 *
 * 与 vuepress build 时 sidebar / config 脚本共用同一算法。
 */
function cyrb53 (str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * 短链 id —— sidebar 与 permalink 共用。
 *
 * 规则：
 *   - 剥掉文件名前缀序号（01-、a- 等），让序号排序不影响 id
 *   - 把 dir 编进 hash 链（避免不同分类下同 title 撞 id）
 *
 * @param {string} dir    分类目录最后一段，如 'tech'
 * @param {string} base   文件 basename（无 .md），如 'Hello'
 * @returns {string}      base36 id，如 'fayv5l4z77'
 */
function shortlinkId (dir, base) {
  const basename = String(base || '').replace(/^\d+[a-zA-Z]*[-_]/, '')
  return cyrb53((basename || 'index') + (dir ? '/' + dir : ''))
}

/**
 * 计算 frontmatter 的 permalink —— vuepress 把页面渲染到这个 URL。
 *
 * 与 sidebar.json item.path 完全同源（同 shortlinkId）：
 *   sidebar item.path    = '_posts/<id>.md'
 *   frontmatter permalink = '/<id>.html'
 *
 * 物理上：md 源文件以 id 命名存于 _posts/，vuepress 渲染后输出到 /<id>.html。
 * 访问 /<id>.html = 访问 sidebar 里指向的同一份内容 → 不 404。
 *
 * @param {string} dir   分类目录最后一段，如 'tech'
 * @param {string} base  文件 basename（无 .md），如 'Hello'
 * @returns {string}     '/<id>.html'
 */
function permalinkFor (dir, base) {
  return `/${shortlinkId(dir, base)}.html`
}

/**
 * 给 sidebar.json 用的 path —— 与 permalink 指向同一物理文件。
 *
 * @param {string} dir   分类目录最后一段
 * @param {string} base  文件 basename（无 .md），如 'Hello'
 * @returns {string}     '_posts/<id>.md'
 */
function sidebarPathFor (dir, base) {
  return `_posts/${shortlinkId(dir, base)}.md`
}

/**
 * 内置的 GitHub Actions workflow 模板（字符串常量）
 *
 * 来源：scripts/blog/templates/workflows/blog-*.yml.template
 * 这里直接以字符串形式内联，作为"运行时产物"——避免 runtime 与 template 双份维护。
 *
 * 三个 workflow 的职责：
 *   blog-build.yml    完整构建 + 部署 + 推动 github-pages
 *   blog-db-upload.yml 手动上传 memocast.db 到 artifact
 *   blog-preview.yml  PR 上自动跑 sidebar/config（不部署）
 */
const CI_WORKFLOWS = {
  'blog-build.yml': `name: blog-build

on:
  push:
    branches:
      - master
      - main
    tags: ['v*']
  pull_request:
    branches:
      - master
      - main
  workflow_dispatch:
    inputs:
      deploy:
        description: '发布到 gh-pages？'
        required: true
        type: boolean
        default: true

concurrency:
  group: blog-\${ github.ref }}
  cancel-in-progress: true

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  build:
    name: build & deploy blog
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: yarn
          cache-dependency-path: yarn.lock

      - name: Install dependencies
        run: yarn install --frozen-lockfile --network-timeout 600000

      - name: Restore memocast.db from artifact
        uses: actions/download-artifact@v4
        with:
          name: memocast-db
          path: .cache/db
        continue-on-error: true

      - name: Decode memocast.db from base64 secret
        if: \${ steps.restore-artifact.outcome == 'skipped' || steps.restore-artifact.outcome == 'failure' }}
        env:
          DB_B64: \${ secrets.MEMOCAST_DB_BASE64 }}
        run: |
          if [ -n "$DB_B64" ]; then
            mkdir -p .cache/db
            echo "$DB_B64" | base64 -d > .cache/db/memocast.db
          fi

      - name: Build sidebar & config
        run: |
          DB_PATH=$(find .cache/db -name 'memocast.db' | head -n1 || echo '')
          if [ -n "$DB_PATH" ]; then
            MEMOCAST_DB="$DB_PATH" yarn blog:sidebar
            MEMOCAST_DB="$DB_PATH" yarn blog:config
          else
            echo "::warning::无 memocast.db，跳过 sidebar/config 构建"
          fi

      - name: VuePress build
        run: |
          cd _docs
          yarn vuepress build .
          cp .vuepress/dist/index.html .vuepress/dist/404.html 2>/dev/null || true

      - name: Deploy to gh-pages
        if: \${ github.event_name != 'pull_request' }}
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: \${ secrets.GITHUB_TOKEN }}
          publish_dir: _docs/.vuepress/dist
          publish_branch: gh-pages
`,

  'blog-db-upload.yml': `name: blog-db-upload

on:
  workflow_dispatch:

jobs:
  upload:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 1 }

      - name: Decode db from base64 secret
        run: |
          if [ -z "\${ secrets.MEMOCAST_DB_BASE64 }}" ]; then
            echo "::error::secrets.MEMOCAST_DB_BASE64 未配置"
            exit 1
          fi
          mkdir -p .cache
          echo "\${ secrets.MEMOCAST_DB_BASE64 }}" | base64 -d > .cache/memocast.db
          ls -la .cache/memocast.db

      - name: Sanity-check the db
        run: |
          node -e '
            const fs = require("fs");
            const buf = fs.readFileSync(".cache/memocast.db");
            const sig = buf.slice(0, 16).toString("ascii");
            if (!sig.startsWith("SQLite format 3")) {
              console.error("::error::文件不是合法 SQLite：", JSON.stringify(sig));
              process.exit(1);
            }
            console.log("[ok] SQLite 大小:", buf.length, "bytes");
          '

      - name: Upload as artifact
        uses: actions/upload-artifact@v4
        with:
          name: memocast-db
          path: .cache/memocast.db
          retention-days: 14
          if-no-files-found: error
`,

  'blog-preview.yml': `name: blog-preview

on:
  pull_request:
    branches:
      - master
      - main
    types: [opened, reopened, synchronize]

concurrency:
  group: blog-pr-\${ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: yarn
          cache-dependency-path: yarn.lock

      - name: Install dependencies
        run: yarn install --frozen-lockfile --network-timeout 600000

      - name: Build sidebar & config only
        run: |
          yarn blog:test 2>/dev/null || true
          yarn blog:sidebar 2>/dev/null || true
          yarn blog:config 2>/dev/null || true

      - name: Comment PR with summary
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const sidebarFile = '_docs/.vuepress/sidebar.json';
            let count = 0;
            try {
              const sb = JSON.parse(fs.readFileSync(sidebarFile, 'utf8'));
              count = Object.keys(sb.sidebar || {}).length;
            } catch (e) { /* ignore */ }
            const body = [
              '### 博客构建预览', '',
              '- sidebar 路由数: ' + count, '',
              '> 仅 PR 预览；部署在 push 到 master/main 时由 blog-build.yml 完成。'
            ].join('\\n');
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: '<!-- blog-preview -->\\n' + body
            });
`
}

export default {
  /**
   * 生成 README.md（如果不存在）
   * @param {string} blogDir - 博客根目录
   * @param {string} categoryName - 分类名称，用于作为 README 内容
   */
  async ensureReadme (blogDir, categoryName) {
    const readmePath = path.join(blogDir, 'README.md')
    if (fs.existsSync(readmePath)) {
      return // 已存在则跳过
    }
    const folderName = categoryName.split('/').filter(Boolean).pop() || categoryName
    const content = `# ${folderName}\n\n${categoryName} 分类下的笔记。\n`
    await fs.writeFile(readmePath, content, 'utf-8')
    console.log('[BlogDeploy] Created README.md with title:', folderName)
  },

  /**
   * 生成 sidebar.json —— 与 frontmatter permalink 同源，避免点侧边栏 404。
   *
   * @param {string} blogDir    博客源目录
   * @param {Array<{title:string}>} noteFields 笔记列表（title 可含 .md）
   */
  async generateSidebarJson (blogDir, noteFields) {
    const sidebarPath = path.join(blogDir, 'sidebar.json')
    const sidebarData = {}
    const dirTag = path.basename(blogDir)

    noteFields.forEach(note => {
      const filename = note.title.replace(/\.md$/i, '')
      if (!sidebarData._posts) sidebarData._posts = []
      sidebarData._posts.push({
        title: filename,
        path: sidebarPathFor(dirTag, filename)
      })
    })

    await fs.writeJson(sidebarPath, sidebarData, { spaces: 2 })
  },

  /**
   * 写 _posts/<id>.md —— 文件名用 shortlinkId，与 sidebar path 对齐。
   *
   * @param {string} blogDir  博客源目录
   * @param {Array<{title:string, content:string, docGuid?:string}>} notes
   * @param {string} theme    'default' | 'vdoing'
   * @param {string} category 当前分类名（可选，写进 shortlink-map.json）
   */
  async writeBlogPosts (blogDir, notes, theme = 'default', category = '') {
    const postsDir = path.join(blogDir, '_posts')
    await fs.ensureDir(postsDir)

    const dirTag = path.basename(blogDir)
    const mapEntries = []

    for (const note of notes) {
      const baseName = note.title.replace(/\.md$/i, '')
      // 文件名直接用 shortlink id —— 与 sidebar path 完全一致
      const fileId = shortlinkId(dirTag, baseName)
      const filepath = path.join(postsDir, `${fileId}.md`)
      const frontmatter = this.buildFrontmatter(note, theme, dirTag, baseName)
      const content = frontmatter + '\n\n' + note.content
      await fs.writeFile(filepath, content)

      mapEntries.push({
        id: fileId,
        title: baseName,
        permalink: `/${fileId}.html`,
        category,
        docGuid: note.docGuid || ''
      })
    }

    // 实时合并 + 写映射文件（让 vuepress 构建期任何脚本/enhanceApp 都能用）
    await this.appendShortlinkMap(blogDir, mapEntries)
    return { writtenFiles: mapEntries.length }
  },

  /**
   * 把 id→title/category/permalink 的映射写到 blogDir/.vuepress/shortlink-map.json
   *
   * vuepress 构建期任何脚本（enhanceApp.js / sidebar extender / 主题 hack）都能
   * require('./shortlink-map.json') 直接拿到映射：
   *   - 把 sidebar 显示 title 从短链改成人类可读
   *   - 给路由加自定 resolveTitle
   *   - breadcrumb 显示分类
   *
   * 文件结构：
   *   {
   *     "version": 1,
   *     "generatedAt": "ISO 时间",
   *     "byId": {
   *       "abc123": { "title": "Hello", "category": "/My Notes/技术/", "permalink": "/abc123.html", "docGuid": "..." }
   *     },
   *     "byDocGuid": { "...": "abc123" }
   *   }
   *
   * 二次调用会合并（不删旧项；同 id 覆盖）。
   *
   * @param {string} blogDir
   * @param {Array<{id,title,permalink,category,docGuid}>} entries
   */
  async appendShortlinkMap (blogDir, entries) {
    if (!entries || entries.length === 0) return { written: false, path: '' }
    const vpDir = path.join(blogDir, '.vuepress')
    await fs.ensureDir(vpDir)
    const mapPath = path.join(vpDir, 'shortlink-map.json')

    // 读旧映射（如有）
    let existing = { version: 1, byId: {}, byDocGuid: {} }
    if (await fs.pathExists(mapPath)) {
      try {
        const old = JSON.parse(await fs.readFile(mapPath, 'utf8'))
        if (old && old.byId) existing = old
      } catch (e) {
        console.warn('[BlogDeploy] shortlink-map.json 解析失败，将覆盖:', e.message)
      }
    }

    // 合并
    for (const e of entries) {
      existing.byId[e.id] = {
        title: e.title,
        category: e.category || '',
        permalink: e.permalink,
        docGuid: e.docGuid || ''
      }
      if (e.docGuid) existing.byDocGuid[e.docGuid] = e.id
    }
    existing.version = 1
    existing.generatedAt = new Date().toISOString()
    existing.count = Object.keys(existing.byId).length

    await fs.writeJson(mapPath, existing, { spaces: 2 })
    console.log(`[BlogDeploy] shortlink-map.json -> ${mapPath}（${existing.count} 条）`)
    return { written: true, path: mapPath, count: existing.count }
  },

  /**
   * 读取当前映射 —— 给 IPC / 其它模块（如冲突合并、第三方同步）复用。
   * @param {string} blogDir
   * @returns {Promise<{version, byId, byDocGuid, ...}>}
   */
  async readShortlinkMap (blogDir) {
    const mapPath = path.join(blogDir, '.vuepress', 'shortlink-map.json')
    if (!(await fs.pathExists(mapPath))) return null
    try {
      return JSON.parse(await fs.readFile(mapPath, 'utf8'))
    } catch (e) {
      console.warn('[BlogDeploy] readShortlinkMap 解析失败:', e.message)
      return null
    }
  },

  /**
   * 构造 front-matter —— 在默认/vdoing 两个主题都注入 permalink。
   *
   * @param {object} note    笔记（含 title）
   * @param {string} theme   'default' | 'vdoing'
   * @param {string} dirTag  blogDir 最后一段（用于 hash）
   * @param {string} baseName 文件 basename
   */
  buildFrontmatter (note, theme = 'default', dirTag = '', baseName = '') {
    const date = new Date().toISOString().split('T')[0]
    const title = (baseName || note.title).replace(/\.md$/i, '')
    const permalink = permalinkFor(dirTag, baseName || title)
    if (theme === 'vdoing') {
      return `---\ntitle: ${title}\ndate: ${date}\npermalink: ${permalink}\nsidebar: auto\n---\n`
    }
    return `---\ntitle: ${title}\ndate: ${date}\npermalink: ${permalink}\n---\n`
  },

  /**
   * 把内置的 GitHub Actions workflow yml 写到目标目录的 .github/workflows/ 子目录里。
   *
   * @param {string} targetDir 博客源目录（也就是 .github 的父目录）
   * @returns {Promise<{written: string[], skipped: string[], targetDir: string}>}
   *
   * 调用场景：
   *   - 渲染进程通过 invokeApi('export-blog-ci', { targetDir }) 经 IPC 调过来
   *   - 主进程 api handler 落盘，提示用户 commit & push
   *
   * 已存在文件会跳过（不强制覆盖）。需要重置时由用户自己删 / git checkout。
   */
  async exportCIWorkflows (targetDir) {
    if (!targetDir || typeof targetDir !== 'string') {
      throw new Error('[BlogDeploy] exportCIWorkflows: targetDir 必填')
    }
    const wfDir = path.join(targetDir, '.github', 'workflows')
    await fs.ensureDir(wfDir)

    const written = []
    const skipped = []
    for (const [name, content] of Object.entries(CI_WORKFLOWS)) {
      const dest = path.join(wfDir, name)
      if (await fs.pathExists(dest)) {
        skipped.push(name)
        continue
      }
      await fs.writeFile(dest, content, 'utf-8')
      written.push(name)
    }
    console.log(`[BlogDeploy] exportCIWorkflows -> ${wfDir}（写入 ${written.length}，跳过 ${skipped.length}）`)
    return { written, skipped, targetDir: wfDir }
  },

  /**
   * 短链 id —— 暴露给其它模块复用，保证 sidebar / permalink / file name 三处一致。
   *
   * @param {string} dir   分类目录最后一段
   * @param {string} base  文件 basename（无 .md）
   * @returns {string}     base36 id
   */
  shortlinkId (dir, base) {
    return shortlinkId(dir, base)
  }
}