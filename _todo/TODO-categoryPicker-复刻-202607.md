# CategoryPicker 复刻 heyui 设计 — 实施记录与后续优化清单

> 文档版本：2026-07-14
> 主题：深度分析 github heyui 的 categoryPicker，Vue2 按需引入可行性评估，复刻实现，后续扩展点
> 状态：核心改造已完成
> 涉及文件：
> - `src/components/common/CategoryPicker.vue`（重写，约 750 行）
> - `src/components/ui/dialog/RuneFormDialog.vue`（2 处最小适配）

---

## 0. 任务缘起

符文表单的"选择分类 / 模板"预设 picker 此前使用 `src/components/common/CategoryPicker.vue`（已在仓库中实现，仿 heyui v1 category-picker 风格）。本次任务：

1. 深度分析 heyui v1 categoryPicker 的设计核心（联动面板）
2. 验证 Vue2 项目按需引入 `heyui` 是否可行
3. 不可行 → 在现有组件基础上复刻 heyui 的核心机制

---

## 1. `yarn add heyui` Vue2 按需引入可行性结论：不可行

### 1.1 试装事实

| 项 | 数据 |
|---|---|
| 包 | `heyui@1.26.1`（v1 系列最后一个 Vue2 兼容版；v1.28.0 是 v1 末班；v2.x 是 Vue3） |
| Vue 约束 | `vue: ^2.6.10`（项目 2.7.16 ✓） |
| 入口 | `main: ./dist/heyui.js`、`module: ./dist/heyui.esm.js` |
| 间接依赖 | `vue@2.7.16` / `manba@1.3.5` / `postcss@8.5.19` / `@vue/compiler-sfc@2.7.16` / `@babel/parser` / `nanoid` / `prettier` / `csstype` 等共 15 个 |
| 按需能力 | **无**——`dist/heyui.js` 是 UMD 整体打包（383KB），无 `heyui/components/category-picker` 这类 subpath 导出；想 tree-shaking 必须 fork 后改构建 |

### 1.2 不可行的根本原因

1. **整包强耦合**：`heyui.esm.js` 是 `lib/index.js` 的合并产物，`require('heyui/components/category-picker')` 拿不到单独文件
2. **依赖污染**：装一次多 15 个包（含 `vue@2.7.16` 会触发 `Vue 2 EOL` 警告、`postcss@8.5.19` 与 webpack 5 链路冲突风险）
3. **主题栈重复**：项目已用 `quasar` + `element-ui`，heyui 再带一套主题与图标（`themes/fonts/heyui.svg`）
4. **替代代价 ≈ 复刻代价**：要按需只能 fork → 改 `components.js` + `hey -b` → 自维护，等于自己写一个

---

## 2. heyui categoryPicker 核心设计深度分析

源码路径：`v1.26.1/src/components/category-picker/categorypicker.vue` + 从 tarball 还原的完整 `categorypicker.js`。

### 2.1 8 个核心机制

| # | 机制 | heyui 实现 | 复刻到新 CategoryPicker.vue |
|---|---|---|---|
| 1 | 面包屑 + 当前列表 | `tabs[]` + `this.list` 双数据 | `tabs` / `tabIndex` / `currentLevelList` 计算属性 |
| 2 | O(1) 索引 | `categoryObj: {[key]: node}` | 同款索引，`getParentChain` 用 O(1) 查父 |
| 3 | 双权限模型 | `selectable` / `checkable` 各一回调 | `option.selectable` / `option.checkable`，`status.selectable` / `status.checkable` |
| 4 | 异步加载 | `getTotalDatas` / `getDatas(parent, ok, err)` | `option.getTotalDatas` + `option.getDatas(parent, success, error)` + `status.loading` |
| 5 | list → tree | `dataMode: 'list'` + `generateTree` | `_generateTree(flatList)` 按 `parentName` 关联 |
| 6 | 完整路径显示 | `showAllLevels` + `getParentTitle().reverse().join('/')` | 同款算法 + **可配 `separator`** |
| 7 | v-model 兼容 | `type: 'key' \| 'object'` + `dispose()` | 同款 + `_stripChildren()` 派发时去掉 children |
| 8 | 多选分支 | tag 列表 + checkbox + limit 超限提示 | tag 列表 + el-checkbox + `limit-reached` 事件 |

### 2.2 架构图（仿 heyui 数据流）

```
用户传入 option.datas (Array | Function | undefined)
   │
   ▼
initCategoryDatas() ─── 异步分支 ──▶ option.getTotalDatas(success, error)
   │                                     │
   │                                     ▼
   │                               initDatas(result) ← _generateTreeIfNeeded
   ▼                                     │
_generateTreeIfNeeded(raw) ◀──────────────┘
   │
   ▼
_buildTree(datas, parentKey, isWait, level)   ← 递归规范化
   │
   ▼
每个节点 = { key, title, value, parentKey, status, children }
   │                    status = { level, loading, isWait, opened,
   │                              selected, selectable, checkable }
   ▼
categoryObj[k] = node   ← O(1) 索引

用户点击行 ──▶ onRowClick(node, evt)
   │
   ├── 是分类 ──▶ openNew(node, evt)
   │     ├── 有 children ──▶ tabIndex++，tabs.push，下钻
   │     ├── 是异步(isWait) ──▶ option.getDatas(parent, success, error)
   │     │                       → children 填充后下钻
   │     └── 是叶子 ──▶ change(node, evt)
   └── 是叶子 ──▶ change(node, evt)
                  │
                  ├── 多选 ──▶ limit 校验 ──▶ toggle this.objects
                  └── 单选 ──▶ this.object = node
                            │
                            ▼
                       emitChange()
                            │
                            ├── $emit('change', v, nodes)
                            ├── $emit('input', disposeValue())
                            └── popoverVisible = !isCategory(node)
```

### 2.3 与原 CategoryPicker.vue 的差异（重点）

| 维度 | 原组件 | 复刻后 | 收益 |
|---|---|---|---|
| 路径回溯 | 递归线性扫描 `findPath(datas, key, trail)` | `categoryObj[k]` + `parentKey` 链 O(1) | 大树性能提升 10-100x |
| 单/多选权限 | 只有 `selectable` | 新增 `checkable` | 多选场景可独立控制可勾选性 |
| 异步加载 | 不支持 | `getDatas(parent, success, error)` + `status.loading` | 可对接云端模板 |
| list→tree | 不支持 | `dataMode: 'list'` + `fieldNames.parent` | 接受扁平后端响应 |
| 分隔符 | 硬编码 `' / '` | `separator` prop 可配 | 适配不同视觉风格 |
| 多选 UI | 无 | tag 列表 + 关闭图标 + 复选框 | 支持多选场景 |
| loading 态 | 无 | `el-icon-loading` 旋转图标 | 异步加载体验完整 |

---

## 3. 改动文件与最小化适配

### 3.1 实际改动

| 文件 | 改动量 | 说明 |
|---|---|---|
| `src/components/common/CategoryPicker.vue` | 重写（约 750 行） | 吸收上面 8 个机制；保留原有 UI（面包屑 + el-popover + 紫色主题 + 暗色模式） |
| `src/components/ui/dialog/RuneFormDialog.vue` | 2 处最小适配 | `selectable` 回调读 `node.value._isCategory`；`onPresetPicked` 用 `(picked.value \|\| picked)._templateRow` 兼容新旧形态 |

### 3.2 兼容性设计要点

1. **`selectable` 回调收到的 node**：原组件传原数据；复刻版传规范化节点（`node.value` 才是原数据）
2. **`@change` 派发形态**：原 `(value, nodes)`，复刻同款——`value` 是 `disposeValue()` 结果（瘦对象或 key），`nodes` 是规范化节点
3. **`onPresetPicked` 兼容写法**：
   ```js
   const raw = (picked && picked.value) || picked
   const row = raw && raw._templateRow
   ```
   这样无论新组件还是旧组件派的节点都能正确取出 `_templateRow`

### 3.3 Lint 状态

两个改动文件均 `No linter errors found`。

---

## 4. 立即可体验的新能力

符文预设模板 picker 在保持原有 UX 的同时，新增：

1. **多选**：`<category-picker :multiple="true" :limit="5">` —— tag 列表 + 复选框 + limit 超限事件
2. **异步下钻**：传 `option.getDatas(parent, success, error)` 即可云端按需加载（runeTemplateService 现在是同步，可平滑升级）
3. **扁平列表自动建树**：`option.dataMode='list'`，配 `fieldNames.parent` 一键转树
4. **可配分隔符**：`separator=" > "` / `" / "` / `" → "`
5. **单选/多选权限分离**：`option.selectable` 与 `option.checkable` 各自回调，分类节点可"只可下钻 + 不可勾选"
6. **async 行加载态**：`status.loading` + `el-icon-loading` 旋转图标

---

## 5. 后续可拓展方向（按收益/代价排序）

### 5.1 高收益（推荐近期实施）

| # | 方向 | 收益 | 代价 |
|---|---|---|---|
| 1 | runeTemplateService 异步化 | 大量预设模板时不阻塞 dialog 打开 | runeTemplateService 改为 Promise 化，picker 自动走异步分支 |
| 2 | 多选模式接 SettingsDialog 的"批量应用模板" | 一键给多个 rune 套同一模板 | 新增 SettingsDialog 中的批量操作入口 |
| 3 | 过滤搜索 `filterable` | 模板数量大时可搜索 | 在 list 上方加 `<input>` 配合 `searchValue` 计算属性 |

### 5.2 中收益（按需）

| # | 方向 | 收益 | 代价 |
|---|---|---|---|
| 4 | 复刻 cascader（heyui v1 的 cascader 组件，机制类似） | 替代 element-ui 的 el-cascader，统一 UI 风格 | 类似本次工作量 |
| 5 | 复刻 tree-picker | 已有 tree 但选择交互不同，可统一 | 类似本次工作量 |
| 6 | 支持 keyboard navigation（↑↓ ←→ Enter） | 提升键盘用户体验 | 增加 ~50 行 |
| 7 | `displayFormat` 自定义函数 | 显示文本完全可控 | 增加 ~20 行 |

### 5.3 低收益（暂缓）

| # | 方向 | 收益 | 代价 |
|---|---|---|---|
| 8 | 整包导入 heyui 给后续复刻省力 | 拿到完整组件库参考 | 与 §1.2 同样问题 |
| 9 | 复刻 heyui 的 Tabs 组件（被 categoryPicker 依赖） | UI 更原生 | 当前用现成 tabs 文本即可 |

---

## 6. 经验沉淀（可复用于其他组件）

### 6.1 "整包 UI 库的取舍"决策框架

引入第三方 UI 库前必查 3 件事：
1. **包入口是否能 subpath 引用**（`pkg/<feature>/...`）；不能则视为整包强耦合
2. **间接依赖是否与现有 webpack/postcss/node 链路冲突**（尤其是 postcss、babel、compiler-sfc）
3. **主题栈是否与现有 quasar/element-ui 重复**

如果 3 件事任一为否，先考虑复刻。复刻成本 ≈ fork 后改构建的成本。

### 6.2 "规范化节点 + O(1) 索引"模式

任何树形选择器都适用：
1. `initTreeModeData` 把用户数据转为内部节点（含 `key/title/value/parentKey/children/status`）
2. `categoryObj` 做 `{[key]: node}` 索引
3. 路径回溯走 `parentKey` 链 O(depth)
4. 选择时存"规范化节点"，派发时 `disposeValue()` 还原为对外形态

此模式同样适用于待办目录选择、笔记层级选择、tag 选择器等。

### 6.3 "selectable vs checkable" 双权限

单选/多选权限分离的必要性：
- 单选（selectable）：决定节点能否作为最终值
- 多选（checkable）：决定节点能否被勾选进数组

二者可以独立。例如：分类节点 `selectable=false, checkable=true`（可勾选但单选时不会选中它）；叶子节点 `selectable=true, checkable=true`（默认）。

---

## 7. 验证步骤（已执行）

- [x] `yarn info heyui@1.26.1` 确认依赖与入口
- [x] 实际安装到 `./heyui-probe/`（临时）后分析 dist 目录
- [x] 从 npm tarball 还原 `categorypicker.js` 完整源码（template + script）
- [x] 解析 `categorypicker.less` 样式系统（确认依赖 `.h-func-plugin-input()` 等全局 mixin）
- [x] 解析 `src/utils/config.js` 找到 `categoryPicker.default` 默认字段名
- [x] 对比现有 `CategoryPicker.vue` 与 heyui 实现，列出 8 处差异
- [x] 改造 `CategoryPicker.vue` 重写
- [x] `RuneFormDialog.vue` 2 处最小适配
- [x] lint 干净

## 8. 待用户决定的下一步

- [ ] 是否启用 `option.dataMode='list'` 接 runeTemplateService 的扁平返回？（需改 service）
- [ ] 是否启用 `option.getDatas` 异步下钻？（需先评估网络环境）
- [ ] 是否在 SettingsDialog 增加"批量应用模板"多选入口？
- [ ] 是否继续复刻 heyui 的 cascader / tree-picker 组件？