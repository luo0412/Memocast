# 符文预设模板：从分类下拉到 SQLite 持久化改造方案

> 沉淀目的：把本次"两个相邻会话之间，文件系统被外部误删 / git 历史被破坏"场景下的
> 改动内容固化到一份可独立阅读的 MD，下次从零复制粘贴即可恢复全部代码。

---

## 0. 背景

现状问题：
1. `RuneFormDialog.vue` 里硬编码了 13 个 `createXxxTemplate()` 当作"预设模板"下拉项，
   每个新增 / 修改都需要改两处代码（`rune-templates.js` + 表单内的 if-else 分发链）。
2. 没有"远端模板导入"能力——看到博客上喜欢的 rune 组件，只能手动复制粘贴到表单里。
3. 内置模板没有持久化——每次清掉 `rune_templates` 表都得重新手动补齐。

目标：
- 提供一个"分类下钻 + 模板二级"的公共选择器 `CategoryPicker`（仿 heyui v1）。
- 让 `RuneFormDialog` 通过 `CategoryPicker` 选内置 / 用户已导入的预设模板。
- 支持把 GitHub URL（blob / raw 形式都识别）→ 自动转 raw 抓取 → 解析 front-matter 注释 →
  写入 SQLite `rune_templates` 表。
- 内置 13 个模板首次启动自动 seed（即便 SQLite 表为空也能恢复）。

---

## 1. 涉及到的文件清单

本次改动共涉及 7 个文件：

| # | 路径                                                                                          | 类型     |
|---|-----------------------------------------------------------------------------------------------|----------|
| 1 | `src/components/common/CategoryPicker.vue`                                                    | 新增     |
| 2 | `src/services/RuneTemplateService.js`                                                         | 新增     |
| 3 | `src-electron/main-process/service/rune-template-service.js`                                 | 新增     |
| 4 | `src-electron/main-process/service/builtin-rune-templates.js`                                | 新增     |
| 5 | `src-electron/main-process/electron-main.js`                                                  | 修改     |
| 6 | `src/utils/DatabaseClient.js`                                                                 | 修改     |
| 7 | `src/components/ui/dialog/RuneFormDialog.vue`                                                 | 修改     |

> ⚠️ 重要：第 4 项（内置 seed 文件）必须放在 `src-electron/main-process/service/`
> 内部，**不要** 跨目录 `require('../../../src/components/ui/dialog/rune-templates')`。
> 理由：electron-builder 打包后会以 asar 为根，`src/` 与 `src-electron/` 的运行时相对路径会
> 被改变，跨目录 require 在生产包直接报错。

---

## 2. 公共组件 `CategoryPicker.vue`

仿 heyui v1 `category-picker`：
- `el-popover` 触发，弹层内是 面包屑 + 一级分类列表 / 二级模板列表 两级 drill-down。
- 分类节点"不可直接选中"，只下钻；模板节点才触发 `@change` 并关闭弹层。
- 支持懒加载 `option.getDatas(node, ok, fail)` / `option.getTotalDatas`。
- `dataMode='list'` 把扁平数据按 `option.datas`（已分组）渲染。
- 支持多选 / 自定义 `selectable(data, level)` / `checkable(data, level)`。
- `type='key'` 或 `'object'`，与 v-model 双向同步。
- 暗色模式兼容（`body--dark` 下用深色背景 + 浅色前景）。

关键 props：
```js
props: {
  value: { /* v-model, 单 key 字符串 或 多 key[]; object 类型时是节点对象 */ },
  type: { default: 'key' },                       // 'key' | 'object'
  option: { /* { datas, fieldNames, getDatas, getTotalDatas, dataMode } */ },
  showAllLevels: { default: false },
  showChildCount: { default: false },
  multiple: { default: false },
  limit: { default: 0 },
  placeholder: { default: '点击选择' },
  datasLabel: { default: 'child' }
}
```

关键事件：`@change(v, selectedNodes)`。

---

## 3. 主进程 DB Service `rune-template-service.js`

导出工厂 `createRuneTemplateService({ db, execToObjects, execOne })`，提供以下方法：

| 方法                       | 作用                                                           |
|----------------------------|----------------------------------------------------------------|
| `ensureSchema()`           | 建表 `rune_templates` + 两条索引；幂等可反复调用               |
| `listAll()`                | 返回所有按 `sort_order` 排序的 row（内置 + 用户导入）          |
| `saveOne(row)`             | upsert 单条，按 `id` 主键冲突则 UPDATE                         |
| `saveMany(rows)`           | 批量 upsert（首次 seed 用），返回 `{ success, count }`          |
| `remove(id)`               | 删除单条                                                       |
| `importFromRemote({ sourceUrl, categoryKey })` | GitHub URL → raw URL → 抓内容 → 解析 → 写入表 |

### 3.1 `rune_templates` 表结构

```sql
CREATE TABLE IF NOT EXISTS rune_templates (
  id           TEXT PRIMARY KEY,
  category_key TEXT NOT NULL,        -- 与 src/constants/runeEchoCategories.js 的 RUNE_CATEGORIES.value 同源
  name         TEXT NOT NULL,
  desc         TEXT,
  color        TEXT,
  icon         TEXT,
  template     TEXT NOT NULL,        -- Vue SFC 源码
  source_url   TEXT,                 -- 远端导入时填原始 GitHub blob URL；内置为 ''
  is_builtin   INTEGER NOT NULL DEFAULT 0,  -- 1=内置，0=用户导入
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rune_tpl_cat  ON rune_templates(category_key);
CREATE INDEX IF NOT EXISTS idx_rune_tpl_name ON rune_templates(name);
```

### 3.2 URL 转 raw 的规则

- `https://github.com/<u>/<r>/blob/<b>/<p>` → `https://raw.githubusercontent.com/<u>/<r>/<b>/<p>`
- `https://github.com/<u>/<r>/raw/<b>/<p>` → 同上（GitHub 也支持 raw 形式）
- 已经是 `raw.githubusercontent.com` 或 `gist.githubusercontent.com` 原样使用
- 不支持的协议 / host 返回 `null`（上层 fall back 到 `@change` 报错）

### 3.3 抓内容
- 用 node builtin `https` + `http.get`，最多跟随 8 次 redirect。
- 限制返回大小 1 MB 防止失控（`content-length` 超限则 abort）。

### 3.4 front-matter 推断
扫描模板字符串前 20 行，匹配：

```
<!--
  name: <模板名>
  desc: <模板描述>
  category: <分类 key>
-->
```

未命中 `name` 时按 URL 末段（去掉 `.vue`）做兜底；`category` 无效白名单时回退 `general`。

### 3.5 主进程 IPC（`electron-main.js` 注册）

```
db:getRuneTemplates        -> []
db:saveRuneTemplate        (payload)
db:saveRuneTemplates       (list)
db:deleteRuneTemplate      (id)
rune-template:fetchRemote  ({ sourceUrl, categoryKey })
```

---

## 4. 渲染端 DB 客户端（`DatabaseClient.js`）

在 `DatabaseClient` 顶层新增子命名空间 `runeTemplates`：

```js
DatabaseClient.runeTemplates = {
  getAll    ()                  { return ipcRenderer.invoke('db:getRuneTemplates') },
  save      (item)              { return ipcRenderer.invoke('db:saveRuneTemplate', item) },
  saveMany  (list)              { return ipcRenderer.invoke('db:saveRuneTemplates', list) },
  remove    (id)                { return ipcRenderer.invoke('db:deleteRuneTemplate', id) },
  fetchRemote ({ sourceUrl, categoryKey })
                              { return ipcRenderer.invoke('rune-template:fetchRemote', { sourceUrl, categoryKey }) }
}
```

---

## 5. 业务服务封装（`RuneTemplateService.js`）

提供：

```js
import runeTemplateService from 'src/services/RuneTemplateService'

runeTemplateService.listFlat(force = false)                                  // []<row>
runeTemplateService.listGroupedByCategory(i18nResolver, force = false)       // [{ category_key, name, items }]
runeTemplateService.save(item)
runeTemplateService.remove(id)
runeTemplateService.fetchFromGithub({ sourceUrl, categoryKey })
runeTemplateService.clearCache()                  // 显式让下一次 list* 强制重新拉
```

内部 60s 内存缓存；任何写入操作自动 invalidate。

---

## 6. `RuneFormDialog.vue` 改造要点

### 6.1 删除
- 整个 `presetTemplateOptions` 数组（13 个硬编码预设）。
- `onPresetSelected` 方法中 13 段 `else if (fnName === 'createXxxTemplate')` 链。
- `import { createXxxTemplate }` 大段批量 import（**保留 `createBlankTemplate` 用于默认初始值**）。

### 6.2 模板
- 把 `<q-select :options='presetTemplateOptions'>...</q-select>` 替换为：

```html
<category-picker
  v-model='selectedPresetKey'
  :option='categoryPickerOption'
  type='object'
  :show-all-levels='true'
  :show-child-count='true'
  placeholder='选择分类 / 模板'
  class='preset-template-picker'
  @change='onPresetPicked'
/>
```

- 在同一行加 "远端导入" 按钮，弹出一个 `<el-dialog>` 内嵌表单：
  - GitHub 链接输入框（`el-input`）。
  - 分类下拉（`el-select`，可选，缺省走 `inferTemplateMeta`）。
  - 错误提示 + loading 状态。

### 6.3 script 新增 data / methods

```js
data () {
  return {
    // ...,
    selectedPresetKey: null,
    remoteImportDialogVisible: false,
    remoteImportUrl: '',
    remoteImportCategory: '',
    remoteImporting: false,
    remoteImportError: '',
    categoryPickerTree: [],
    // 保留 (monacoEditor 仍要用)
    monacoEditor: null,
    runeCategoryOptions: RUNE_CATEGORIES.map(c => ({ value: c.value, label: this.$t(c.i18nKey) }))
  }
},

computed: {
  categoryPickerOption () {
    // 把扁平 row 数组渲染成 [{ key: 'cat::<key>', title, _isCategory: true,
    //                          children: [{ key: 'tpl::<id>', title, _isCategory: false, _templateRow }] }]
    // _isCategory=true 的节点 selectable=false （只能下钻）
    // _isCategory=false（模板节点）selectable=true
    const grouped = new Map()
    for (const node of this.categoryPickerTree) {
      const k = node.category_key
      if (!grouped.has(k)) grouped.set(k, [])
      grouped.get(k).push(node)
    }
    // ... 构造 tree ...
    return {
      datas: tree,
      fieldNames: { key: 'key', title: 'title', children: 'children' },
      selectable: (node) => node && node._isCategory === false
    }
  }
},

methods: {
  async loadTemplatePicker (force = false) {
    const grouped = await runeTemplateService.listGroupedByCategory(
      (key) => (this.runeCategoryOptions.find(o => o.value === key) || {}).label || key,
      force
    )
    const flat = []
    for (const g of grouped) for (const it of g.items) flat.push(it)
    this.categoryPickerTree = flat
  },

  onPresetPicked (picked) {
    if (!picked) { this.selectedPresetKey = null; return }
    this.selectedPresetKey = picked
    const row = picked._templateRow
    if (!row) return    // 点中分类节点本身，仅下钻
    if (row.name && !this.form.name) this.form.name = row.name
    if (row.desc && !this.form.desc) this.form.desc = row.desc
    if (row.category_key) this.form.category = row.category_key
    const nextTemplate = row.template || createBlankTemplate()
    this.form.template = nextTemplate
    if (this.monacoEditor && this.monacoReady) {
      this.monacoEditor.setValue(nextTemplate)
    }
  },

  openRemoteImportDialog () {
    this.remoteImportError = ''
    this.remoteImportUrl = ''
    this.remoteImportCategory = this.form.category || ''
    this.remoteImportDialogVisible = true
  },

  async submitRemoteImport () {
    this.remoteImporting = true
    this.remoteImportError = ''
    try {
      const res = await runeTemplateService.fetchFromGithub({
        sourceUrl: this.remoteImportUrl,
        categoryKey: this.remoteImportCategory || this.form.category || DEFAULT_RUNE_CATEGORY
      })
      if (!res || !res.success) {
        this.remoteImportError = (res && (res.message || res.code)) || '导入失败'
        return
      }
      await this.loadTemplatePicker(true)
      const newRow = res.data
      if (newRow) {
        this.selectedPresetKey = {
          key: 'tpl::' + newRow.id,
          title: newRow.name,
          _isCategory: false,
          _templateRow: newRow,
          children: []
        }
        this.onPresetPicked(this.selectedPresetKey)
      }
      this.remoteImportDialogVisible = false
    } catch (e) {
      this.remoteImportError = (e && e.message) || String(e)
    } finally {
      this.remoteImporting = false
    }
  }
}
```

### 6.4 watch.value 中加一行

弹窗每次打开时调用 `this.loadTemplatePicker(true)`，保证拿到最新数据。

---

## 7. 内置 seed 文件 `builtin-rune-templates.js`

**位置**：`src-electron/main-process/service/builtin-rune-templates.js`（**绝不**放在 `src/` 下）

文件导出 `module.exports = { BUILTIN_RUNE_TEMPLATES }`。其中每个元素形如：

```js
{
  id: 'builtin-tpl-createBlankTemplate',     // 用函数名驼峰 + 前缀
  category_key: 'general',                   // 或 'resume' 等
  name: '空白模板',
  desc: '标准 Vue SFC 格式...',
  color: '#7E57C2',
  icon: 'description',
  template: '<template>...</template>\n\n<script>export default { name: "BlankDemo" }<\/script>\n...'
}
```

主进程 `initSchema()` 末尾：

```js
global.__runeTemplateService = createRuneTemplateService({ db, execToObjects, execOne })
global.__runeTemplateService.ensureSchema()

const __tplCount = execOne('SELECT COUNT(*) as count FROM rune_templates')
if (__tplCount && __tplCount.count === 0) {
  try {
    const __seedModule = require('./service/builtin-rune-templates')
    const list = (__seedModule && __seedModule.BUILTIN_RUNE_TEMPLATES) || []
    if (list.length) {
      const now = Date.now()
      const rows = list.map((it, idx) => ({
        id: it.id, category_key: it.category_key, name: it.name,
        desc: it.desc, color: it.color, icon: it.icon, template: it.template,
        source_url: '', is_builtin: 1, sort_order: idx, created_at: now, updated_at: now
      }))
      const result = global.__runeTemplateService.saveMany(rows)
      if (result && result.success) {
        saveDatabase()
        log.info(`[DB] Seeded ${result.count} built-in rune templates into rune_templates`)
      }
    }
  } catch (seedError) {
    console.warn('[DB] seedRuneTemplates skipped:', seedError && seedError.message)
  }
}
```

---

## 8. 复检顺序（手动验证步骤）

每次改完之后按这个顺序跑一遍：

1. `yarn dev:electron` 或启动 dev 模式，看主进程日志：
   - `[DB] rune_templates table ready` — schema 创建正常
   - `[DB] Seeded 13 built-in rune templates into rune_templates`（仅首次启动）
2. DevTools Console 检查 `window.DatabaseClient.runeTemplates.getAll()` 返回 13 条 row。
3. 打开任意笔记 → 点"新建 rune 卡片" → 看 RuneFormDialog 弹层：
   - "预设模板"下拉显示分类下钻
   - 点二级模板，编辑器内容被替换
   - 点 "远端导入" 弹出 el-dialog，粘贴一个真实的 GitHub URL（如
     `https://github.com/coolma/memocast-blank-rune-template/blob/main/blank.vue`）
     → 看到 "已导入到本地数据库" 提示 → 树里多了一个 "通用 / 来自 GitHub" 节点 → 点它自动填进编辑器。
4. 重启应用 → 树里的远端导入节点依然存在（持久化生效）。

---

## 9. 如果又被删了，恢复步骤

1. 按"§1 文件清单"检查哪些文件还在（用 IDE 搜索文件路径）。
2. 不在的，按本文"§2~§7"对应章节从代码补回去。
3. 跑 §8 复检顺序。

---

## 10. 已知陷阱

- **跨目录 require 一定会爆**：不要从 `src-electron/` 直接 `require('../../../src/...')`。
- **Electron 渲染端拿不到 `https`**：必须通过 IPC 走主进程，所以远端抓取放在主进程。
- **Monaco 编辑器 reset 后再 setValue 会丢光标位置**：
  `onPresetPicked` 中先 `monacoEditor.setValue()`，然后 `nextTick` 再 focus 即可。
- **`onPresetSelected` 与 `onPresetPicked` 共存**：外部可能仍有引用，**不要** 直接删掉
  `onPresetSelected`，保留一行 `this.onPresetPicked(preset)` 兼容层即可。
- **不要把 `selectedPreset` / `presetTemplateOptions` 从 data 里删除后还有引用**：搜索全文
  `selectedPreset` / `presetTemplateOptions` 并清理，模板里用 `selectedPresetKey`。
- **暗色模式**：CategoryPicker 与远端导入 el-dialog 都用 `body--dark` 覆盖而非新增主题变量。
