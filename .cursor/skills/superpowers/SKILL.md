---
name: superpowers
description: coolma/Memocast 项目专用复杂任务工作流指南。用于分析、修改或扩展 Memocast 的核心能力，包括笔记编辑、布局交互、离线优先同步、WizNote 集成、Electron/Quasar/Vue2 架构与本地 SQLite 数据流。遇到跨文件实现、需求澄清、架构取舍、同步策略、编辑器行为、笔记管理规则，或需要先规划再落地的任务时应自动使用。
---

# Superpowers for coolma / Memocast

## 目标

在 coolma / Memocast 代码库中处理复杂任务时，优先用项目语境组织工作：先确认目标，再识别所在子系统，复用既有模式，小步修改，并在结束前做针对性验证。

## 项目默认认知

- 这是一个基于 Electron + Quasar + Vue 2 的桌面笔记应用。
- 笔记系统强调本地优先，云端主要承担备份与补回角色，而不是双向协同编辑主源。
- 目录与笔记管理尽量贴近本地文件系统语义：同路径下不允许重名，创建/复制可生成可读唯一名，移动/重命名必须先检查冲突。
- 修改功能时，优先保持用户已有笔记数据安全与行为可预测性。

## 自动触发关键词

当用户的请求中出现以下任一关键词或表达时，应自动应用本技能：

| 类别 | 关键词 / 表达 |
|------|--------------|
| **任务规模** | 大改动、重构、重新设计、涉及多个模块、跨文件、跨进程、涉及很多地方 |
| **需求模糊** | 先看看、先分析一下、先调研、先给个方案、按现状来做、怎么改、能不能实现 |
| **架构决策** | 架构、同步策略、本地优先、数据流、主进程、IPC |
| **笔记管理** | 重名、冲突、移动笔记、重命名笔记、新建笔记、复制笔记、导入笔记 |
| **子系统交接** | 编辑器和列表联动、编辑器切换、笔记保存后同步、笔记操作后刷新列表 |
| **验证确认** | 先计划、先拆解一下、先确认、再动手 |

## 技能分工联动

本技能与其他专项技能的关系如下，优先让专项技能处理其对应领域，本技能负责总览和协调：

| 技能 | 处理范围 | 本技能负责 |
|------|----------|-----------|
| `muya-design` | Muya Block 树、Parser、Renderer、ContentState、事件、快捷键、编辑行为 | 涉及多个子系统时的入口判断、步骤组织、收尾检查；并提醒同时检查 `src/components/ui/editor/Muya.vue` / `Monaco.vue` 的封装层联动 |
| `note-layout-design` | 三栏布局、分割器、面板显隐、响应式、主题 CSS | 涉及布局与编辑器联动时的全局协调，并提醒区分分类树、标签 treemap、日历筛选三种左侧语义 |
| `wiznote-api` | WizNote REST API、Token 认证、笔记 CRUD、文件夹、标签、资源上传 | 涉及 API 与本地数据库协同时的数据流梳理，并提醒登录会自动更新知识库 baseUrl、`updateNoteInfo()` 可能承载分类移动语义 |
| `sync-design` | SQLite 数据库、dirty 状态模型、本地优先同步、GUID 映射、恢复/备份策略 | 涉及同步逻辑扩展或修改时的一致性校验，避免重新引入传统 conflict 状态思维 |
| `blog-deploy-design` | Vuepress 1.x 博客部署流水线、`id-mappings.json` / `seq-manifest.json` 中间产物、permalink 平铺模式、sidebar/nav/verify builders、GitHub Actions + SFTP 推送、base 规范化 | 涉及 blog 目录结构、侧栏 / 导航分组、部署流水线、SFTP 上传、id 短链、frontmatter 注入 categories、构建产物分发等任务时直接落到本专项技能 |

当任务落在单一专项技能的职责范围时，优先使用该技能；当任务跨越多个技能范围，或用户要求“先分析再改”时，使用本技能作为入口工作流。

## 子系统识别

开始动手前，先判断任务主要落在哪个子系统，再决定是否需要：

### 1. 编辑器子系统 → 优先读 `muya-design`

适用于：Muya、Monaco、Markdown 解析、Block 树、渲染、快捷键、编辑行为。

优先关注：

- Muya block / parser / renderer / contentState 链路
- 编辑器切换时的数据一致性
- 所见即所得模式与源码模式之间的状态同步
- `src/components/ui/editor/Muya.vue` 与 `Monaco.vue` 的封装层事件、保存状态与 Vuex / bus 联动

### 2. 布局与交互子系统 → 优先读 `note-layout-design`

适用于：三栏布局、分割器、面板显隐、列表/树/抽屉、响应式交互。

优先关注：

- 现有 splitters、pane layout mode、显示状态字段
- 不同布局模式下的行为一致性
- UI 改动是否破坏编辑器区域稳定性
- 左侧当前到底是分类树、标签 treemap，还是日历筛选面板，以及它是否会改变笔记列表查询语义

### 3. 同步与数据子系统 → 优先读 `sync-design` + `wiznote-api`

适用于：本地数据库、同步服务、WizNote 接口、GUID 映射、同步日志。

优先关注：

- 本地优先是否仍被保持
- 云端拉取是否只是补缺，不覆盖本地
- 本地上传是否坚持本地覆盖云端
- 是否引入了新的重名、映射或状态流转问题
- `AccountServerApi.Login()` 是否已自动刷新知识库 baseUrl，是否还存在多余或缺失的 baseUrl 设置
- `updateNoteInfo()` / 分类操作是否会改变路径语义，从而影响列表、同步与本地落库

## 推荐工作流程

### 1. 先缩小上下文

先找最相关的模块、状态、接口和入口文件，只读取完成当前判断所需的关键上下文，避免无差别通读。

### 2. 先确认不变量

改动前优先确认本任务是否触及以下不变量：

- 本地优先
- 同路径唯一性
- 现有组件通信与状态来源
- 编辑器内容一致性
- 主进程 / 渲染进程职责边界

如果会触碰这些不变量，先说明风险或调整方案。

### 3. 再拆步骤

复杂任务默认拆成 3 到 5 步：

1. 定位入口与依赖关系
2. 明确最小改动面
3. 实现核心行为
4. 补齐关联状态或文案
5. 做针对性验证

### 4. 实施时遵循项目风格

- 优先延续现有命名、目录和状态组织方式
- 尽量做局部改动，不轻易重写成熟模块
- 不引入与当前技术栈不协调的新抽象
- 不为了"理论更完整"破坏 coolma 当前本地优先模型
- 注释只解释非显然约束，不解释表面代码

## 关键设计偏好

### 同步相关

- 默认把本地 SQLite 视为真实数据源
- 默认把云端视为备份库与缺失数据回补来源
- 不把传统双向 merge 作为首选模型
- 若出现"是否该用云端覆盖本地"的设计，默认答案应是"不应该"，除非用户明确改变产品策略

### 笔记管理相关

- 同一路径下禁止重名
- 创建 / 复制可以生成 `name (1)` 这类可读唯一名
- 移动 / 重命名必须先检查目标路径冲突
- 任何自动命名都应保持可读、稳定、可预测

### UI 与编辑体验相关

- 优先保证编辑器主流程稳定，不因外围 UI 改动破坏输入体验
- 保持三栏/双栏/单栏模式切换的一致性
- 涉及列表、树、抽屉、浮动按钮时，优先考虑可见性状态与现有布局联动

### 业务枚举与字典（enum-plus）

`enum-plus` 是项目内业务枚举的**唯一**实现方式，必须按以下写法使用。详细 API 见 `node_modules/enum-plus/README.md`（README Quick Example 就是本项目期望的写法）；本节只列项目特化的约束。

#### 1. 三层物理位置分工

```
src/utils/enum/
├── enumSetup.js               仅放 Enum.extends() 全局方法，i18nKey / tagType / iconOf
├── index.js                   barrel：导入 enumSetup 后再 re-export 所有业务 enum
├── aiAssistantProviderEnum.js
├── calendarDateBasisEnum.js
├── cloudSyncProviderEnum.js
├── noteOrderTypeEnum.js
├── settingsTabEnum.js         （含嵌套 subEnum）
└── ...

src/utils/const/
└── runeEchoCategoriesConst.js  业务 enum 实例所在（数据量大 / 多分类）
                              （已改为 re-export from enum/）

src/components/<feature>/
└── <Feature>*.vue             组件内 import { ... } from 'src/utils/enum'
```

约定：
- **数据源 enum 实例**可以放 `src/utils/const/<feature>Const.js`，由 `enum/index.js` 统一 re-export
- 不写中间 wrapper（如 `runeCategoryEnum.js` 那种 `export { RuneCategoryEnum } from './real-source.js'` 的过水层）
- `Enum` 工厂函数仅 `enum/index.js` 透出一次，业务组件不要直接 `import { Enum } from 'enum-plus'`

#### 2. 标准定义形态

```javascript
// src/utils/enum/noteOrderTypeEnum.js
import { Enum } from 'enum-plus'

export const NoteOrderTypeEnum = Enum({
  NoteTitleAsc: { value: 'orderByNoteTitleAsc', label: 'orderByNoteTitleAsc' },
  ModifiedDesc: { value: 'orderByModifiedTimeDesc', label: 'orderByModifiedTimeDesc' }
})

// ⚠️ 关键：直接访问就是值，不需要 .value！
// NoteOrderTypeEnum.NoteTitleAsc === 'orderByNoteTitleAsc'
// NoteOrderTypeEnum.NoteTitleAsc.value === undefined ❌
```

约定：
- `label` 字段**就是 i18n key**（不带前缀 `xxxEnum.`），让组件 `this.$t(enumInst.label(value))` 即可
- 业务侧枚举扩展字段直接挂在 item 对象上：`{ value, label, icon, accent, ... }`
  - **直接通过 item 访问扩展字段**：`enum.items[0].icon` 或 `enum.item(1).icon`
  - **不要用 `.raw`**（README 没提到这个属性）
- 嵌套结构（如 `SettingsTabEnum` 内嵌 5 个 `GeneralSubEnum` 等）：把子 enum 实例挂在父 item 的 `subEnum` 字段里，**不**用 `tab.General.subEnum` 这种游离命名

#### 3. 组件消费模式

##### 3a. 全局访问（推荐）：`this.$enums`

项目在 `boot/globalGlobals.js` 中将所有业务 enum 通过**显式 import + 列举**统一挂载到 `Vue.prototype.$enums`（复数语义：一个对象里多个 enum 实例的集合）。**模板和组件中推荐使用 `$enums`**，无需逐个 import：

```html
<!-- ✅ 模板直接用 $enums，不需要 import -->
<SettingsSectionContent v-if="subTab === $enums.GeneralSubEnum.Language" ...>
  ...
</SettingsSectionContent>
```

```javascript
// ✅ JS 中通过 this.$enums 访问
computed: {
  subTabOptions () {
    return this.$enums.GeneralSubEnum.items.map(c => ({
      value: c.value,
      label: this.$t(c.label),
      icon: c.icon
    }))
  }
}
```

> **设计原因**：避免每个组件都写 `import { XxxEnum }` + 挂实例。新增 enum 后只需在 `boot/globalGlobals.js` 的 `$enums` 对象里加一行 + 对应 import。
>
> **命名说明**：用复数 `$enums` 而非 `$enum`——对象里装的是"多个 enum 实例的集合"。

##### 3b. 显式 import（服务函数 / store action / 非 .vue 文件）

在 `.vue` 组件以外的场景（如 service、store action、工具函数），**仍然用显式 import**：

```javascript
// ✅ 非 .vue 文件中显式 import
import { NoteOrderTypeEnum } from 'src/utils/enum'

// 原生 enum-plus API
const options = NoteOrderTypeEnum.items.map(c => ({
  value: c.value,
  label: c.label,
  icon: c.icon
}))

// 数据校验
if (!NoteOrderTypeEnum.has(this.form.status)) return null

// label 回显
const statusLabel = i18n.t(NoteOrderTypeEnum.label(this.status))
```

#### 4. 全局扩展（`Enum.extends`）

> **注意**：README 没有提到 `.raw` 访问扩展字段，扩展字段是直接挂在 item 上的。

```javascript
// src/utils/enum/enumSetup.js
import { Enum } from 'enum-plus'

Enum.extends({
  i18nKey (v) { return this.label(v) },
  tagType (v) { const it = this.item(v); return it && it.tagType || null },
  iconOf (v)  { const it = this.item(v); return it && it.icon || null }
})
```

约定：
- `enumSetup.js` 必须**第一个** import，且在所有业务 enum 实例 import 之前已被加载
- `enum/index.js` 顶部用 `import './enumSetup.js'` 强制执行，`business enum exports` 跟在它后面
- 扩展方法**只能挂在 enum 实例方法上**，不要再单独建 `commonHelper.js` / `enumHelper.js`

#### 5. 业务规则归一化 ≠ enum

enum 是字典，**不承载业务规则**。当读到 raw 数据需要兜底归一化时，独立建一个 `xxxLogic.js`：

```javascript
// src/utils/const/runeEchoCategoryLogic.js
import { EchoCategoryEnum } from 'src/utils/enum'

// 业务规则：内置 echo 必须落到 builtin/showy；非内置未指定 → marker
export function normalizeEchoCategory (raw, isBuiltin, echoCategory) {
  const value = String(raw || '').trim()
  if (EchoCategoryEnum.has(value)) return value
  if (isBuiltin) {
    if (echoCategory && EchoCategoryEnum.has(echoCategory)) return echoCategory
    return EchoCategoryEnum.Builtin
  }
  return EchoCategoryEnum.Marker
}
```

约定：
- 业务 helper 文件**不导 enum 实例之外的新常量**（如 `RUNE_CATEGORIES` frozen 数组、`get*CategoryValue` 这种以 enum 为基础导出的二次封装的统统不要）
- helper 文件名建议 `<feature>Logic.js`，与数据源 enum 文件并列在 `src/utils/const/`

#### 6. 禁止的反模式

- ❌ **`subLanguage: GeneralSubEnum.Language`** 这种 data 别名字段——直接模板里写 `subTab === GeneralSubEnum.Language`
- ❌ **`tabGeneral: () => SettingsTabEnum.General`** 这种 computed 别名——同上
- ❌ **`enumToI18nOptions(vm, XxxEnum, { extraFields: [...] })`** 这种第三方 helper——用 `enum.items.map(...)`
- ❌ **`const RUNE_CATEGORIES = Object.freeze([{value, i18nKey}, ...])`** 二次暴露 frozen 数组——直接 `RuneCategoryEnum.items` 或 `RuneCategoryEnum.values`
- ❌ **`getRuneCategoryValue(raw)` / `getEchoCategoryValue(raw, ...)`** 等以 enum 为基础导出的二次封装——只允许业务规则的归一化函数（如 `normalizeEchoCategory`），但实现里要用 `enum.has`/`enum.findBy`
- ❌ **`runeCategoryEnum.js` / `echoCategoryEnum.js`** 这种 `export { Foo } from '../const/real-source.js'` 的过水 wrapper——barrel 直接 from 真实源即可
- ✅ **`this.$enums.XxxEnum` 全局原型链访问器**（在 `boot/globalGlobals.js` 里显式 `import` + 列举后挂到 `Vue.prototype.$enums`）——这是**项目推荐做法**，`.vue` 模板和组件中优先使用 `$enums` 访问，避免重复 import。详见第 3a 节。
- ❌ **`require.context` 自动扫描 enum 目录并挂原型链**——虽然 `$enums` 本身是推荐的，但用 `require.context('./utils/enum', false, /.*Enum\.js$/).keys().forEach(...)` **自动扫描**来填充 `$enums` 是禁止的。理由：
  - 自动扫描是 webpack 魔法，IDE 跳转、TypeScript 推断、单元测试全部失灵
  - 自动扫描会让"新增一个 enum 文件就自动全局暴露"，绕过 code review
  - 正确做法是 `boot/globalGlobals.js` 中**显式 import + 手动列举**每个 enum（当前实现就是这样）
- ❌ **`XxxEnum.General.value`** —— enum-plus 直接访问就是值，`XxxEnum.General === 'general'`，加 `.value` 会得到 `undefined`！这是**最容易犯的错误**，一定要避免：
  ```javascript
  // ❌ 错误
  subTab: GeneralSubEnum.Language.value    // → undefined
  category: RuneCategoryEnum.General.value  // → undefined
  
  // ✅ 正确
  subTab: GeneralSubEnum.Language          // → 'language'
  category: RuneCategoryEnum.General       // → 'general'
  ```

#### 7. 修改 enum 已存在的字段时

- 改 `value` 是**破坏性**：调用方拿到的字符串全变；如必须改，**只在数据侧**（落库层）做一次性迁移，**不要**在消费方写 `if (raw === 'old-value') ... else ...` 兼容分支
- 改 `label` 字段值（i18n key）安全，但 i18n 文件里要同步改 key
- 改 `icon` / `accent` 等附加字段安全，只影响 UI 表现

## 输出要求

默认按以下方式组织对外说明：

- 先给结果
- 再说明改动点与原因
- 涉及风险时直接点明
- 若仍有待定项，只列最关键的 1 到 3 项

## 收尾检查

完成后至少自查：

- 是否符合 coolma / Memocast 现有架构习惯
- 是否破坏本地优先或同路径唯一性
- 是否遗漏相关状态、文案、i18n 或调用链
- 是否引入明显 lint / 语法问题
- 是否真正满足用户目标，而不是只做了局部表面修改
- **业务 enum** 是否按上面"业务枚举与字典（enum-plus）"章节写（无 alias 字段、无第三方 helper、无 wrapper 文件、barrel 顺序正确；`.vue` 中用 `$enums`、非 `.vue` 中用显式 import；新增 enum 同步更新 `boot/globalGlobals.js`）

## 详细参考

常看路径和关键模块清单见 [reference.md](reference.md)。
