---
name: enum-plus
description: enum-plus 枚举增强库集成指南。用于在 Memocast 中使用 enum-plus 管理业务枚举，包括定义枚举、获取 label、生成 UI 选项、与 Element-UI 组件集成。遇到枚举定义、label 回显、下拉框选项、业务状态码、UI 组件绑定等场景时应自动使用。
---

# enum-plus 枚举增强库使用指南

> **来源**：`node_modules/enum-plus/README.md` + 源码
> **版本**：3.2.1

## 核心原则

enum-plus 的 **核心设计**：直接访问枚举项就是值本身！

```javascript
StatusEnum.Review === 2           // ✓ 直接就是值
StatusEnum.Review.value === undefined  // ✗ .value 不存在！
```

---

## 导入

```javascript
import { Enum } from 'enum-plus'
```

---

## API 一览（README 原文）

```javascript
const StatusEnum = Enum({
  Draft: { value: 1, label: 'Draft', color: 'default' },
  Review: { value: 2, label: 'In Review', color: 'processing' },
  Published: { value: 3, label: 'Published', color: 'success' },
})

// 直接访问就是值（核心特性！）
StatusEnum.Review         // 2
StatusEnum.label(2)       // 'In Review'
StatusEnum.has(2)         // true
StatusEnum.keys           // ['Draft', 'Review', 'Published']
StatusEnum.values          // [1, 2, 3]
StatusEnum.labels         // ['Draft', 'In Review', 'Published']
StatusEnum.items          // [{ key: 'Draft', value: 1, label: 'Draft', color: 'default' }, ...]
StatusEnum.named.Draft    // { key: 'Draft', value: 1, label: 'Draft', color: 'default' }
StatusEnum.item(1)        // { key: 'Draft', value: 1, label: 'Draft', color: 'default' }
StatusEnum.meta           // { color: [ 'default', 'processing', 'success' ] }
StatusEnum.findBy('color', 'success')  // { key: 'Published', value: 3, ... }
StatusEnum.toList({ valueField: 'id', labelField: 'name' })  // [{ id: 1, name: 'Draft' }, ...]
StatusEnum.toMap({ keySelector: 'key', valueSelector: 'value' })  // { Draft: 1, Review: 2, Published: 3 }
```

---

## 实例属性（README 明确列出）

| 属性 | 类型 | 说明 |
|-----|------|------|
| `EnumName.Key` | 值本身 | 直接访问就是 value，不需要 `.value`！ |
| `EnumName.keys` | `string[]` | 所有 key 名 |
| `EnumName.values` | `(string\|number)[]` | 所有 value |
| `EnumName.labels` | `string[]` | 所有 label（安装 i18n plugin 后自动翻译） |
| `EnumName.items` | `EnumItem[]` | 所有项的数组 |
| `EnumName.named` | `object` | 按 key 名访问 item，如 `named.Draft` |
| `EnumName.meta` | `object` | 按扩展字段聚合值，如 `{ color: ['default', 'success'] }` |

---

## 实例方法（README 明确列出）

| 方法 | 说明 |
|-----|------|
| `EnumName.label(keyOrValue)` | 通过 key 或 value 获取 label |
| `EnumName.key(value)` | 通过 value 获取 key 名 |
| `EnumName.item(keyOrValue)` | 通过 key 或 value 获取单个 item |
| `EnumName.has(keyOrValue)` | 判断 key 或 value 是否存在 |
| `EnumName.findBy(field, value)` | 按任意字段查找 item |
| `EnumName.toList({ valueField, labelField })` | 转为 UI 下拉框用的列表 |
| `EnumName.toMap({ keySelector, valueSelector })` | 转为 Map |

---

## 实例 Getter（源码中有）

| Getter | 类型 | 说明 |
|--------|------|------|
| `EnumName.name` | `string \| undefined` | 枚举集合名称 |
| `EnumName.valueType` | - | 值类型 |
| `EnumName.keyType` | - | key 类型 |
| `EnumName.rawType` | - | 原始类型 |

---

## 静态方法（在 Enum 上）

| 方法 | 说明 |
|-----|------|
| `Enum.install(plugin, options?)` | 安装插件（如 i18n） |
| `Enum.extends(obj)` | 扩展枚举方法（项目用它添加通用方法） |
| `Enum.isEnum(value)` | 判断是否是枚举实例 |
| `Enum.localize` | 获取/设置全局本地化函数 |
| `Enum.config` | 全局配置 |

---

## 全局访问：`Vue.prototype.$enums`

Memocast 在 `boot/i18n.js` 中将所有业务 enum **统一挂载到 Vue 原型**（复数语义：一个对象里多个 enum 实例的集合）：

```javascript
// src/boot/i18n.js（节选）
import { NoteOrderTypeEnum, ..., GeneralSubEnum, EditorSubEnum, ... } from 'src/utils/enum'
Vue.prototype.$enums = { NoteOrderTypeEnum, ..., GeneralSubEnum, EditorSubEnum, ... }
```

这样**任何 .vue 模板中**都可以直接通过 `$enums.XxxEnum` 访问，**无需 import，也无需 mixin**：

```html
<!-- ✅ 模板直接用 $enums，不需要 import，不需要 mixin -->
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

> **设计原因**：避免每个组件都写 `import { XxxEnum } from 'src/utils/enum'` + 在 `export default` 中把 XxxEnum 挂在实例上。新增 enum 后只需在 `boot/i18n.js` 的 `$enums` 对象里加一行即可。
>
> **命名说明**：用复数 `$enums` 而非 `$enum` 是为了语义清晰——对象里装的是"多个 enum 实例的集合"，而不是"一个 enum"。

---

## 在 Memocast 中的正确用法

### 1. 直接访问值（不需要 .value）

```javascript
// ✅ 正确
subTab: GeneralSubEnum.Language          // → 'language'
category: RuneCategoryEnum.General      // → 'general'

// ❌ 错误
subTab: GeneralSubEnum.Language.value   // → undefined
category: RuneCategoryEnum.General.value // → undefined
```

### 2. 生成下拉选项

```javascript
// ✅ 用 items.map（README 原生用法）
categoryOptions () {
  return EchoCategoryEnum.items.map(c => ({
    value: c.value,
    label: this.$t(c.label)
  }))
}

// ✅ 或者用 toList
categoryOptions () {
  return EchoCategoryEnum.toList({ valueField: 'value', labelField: 'label' })
}
```

### 3. 校验值是否存在

```javascript
// ✅ 用 has 方法
if (!RuneCategoryEnum.has(rawValue)) {
  return RuneCategoryEnum.General  // fallback
}
```

### 4. 按字段查找

```javascript
// ✅ 用 findBy 方法
const item = StatusEnum.findBy('color', 'success')
```

### 5. 访问自定义扩展字段

```javascript
const item = StatusEnum.item(1)
// item = { key: 'Draft', value: 1, label: 'Draft', color: 'default', raw: {...}, ... }

// ✅ 扩展字段直接挂在 item 上
item.color  // 'default'

// ✅ 也可以通过 .raw 访问（raw = 原始定义对象）
item.raw.color  // 'default'
```

---

## 禁止的反模式

| 反模式 | 说明 |
|-------|------|
| `EnumName.Key.value` | ✗ enum-plus 直接访问就是值！ |
| 虚构方法 | 只用 README 明确列出的方法 |

## 常见问题

### Q: 自定义字段怎么访问？

```javascript
// 每个 item（EnumItemClass 实例）包含定义时的所有字段
const item = StatusEnum.item(1)
// item = { key: 'Draft', value: 1, label: 'Draft', color: 'default', raw: {...}, ... }

// ✅ 扩展字段直接挂在 item 上
item.color  // 'default'

// ✅ 也可以通过 .raw 访问
item.raw.color  // 'default'
```

---

## 相关文件结构

```
src/utils/enum/
├── index.js                     # 统一导出
├── enumSetup.js                 # Enum.extends() 扩展方法
├── settingsTabEnum.js           # 设置面板 Tab（含嵌套 subEnum）
├── noteOrderTypeEnum.js         # 笔记排序
├── calendarDateBasisEnum.js     # 日历日期基准
└── runeEchoCategoriesEnum.js   # 符文/回响分类

src/utils/const/
└── runeEchoCategoryLogic.js     # 业务规则 helper
```

---

## 扫描 enum 并挂到 `$enums`（require.context 写法）

**目标**：新增 `src/utils/enum/<Xxx>Enum.js` 后，无需改 `boot/i18n.js` 即可在所有组件用 `$enums.XxxEnum`。

Quasar v1 + webpack 用 `require.context` 实现：

```javascript
// src/boot/i18n.js
const enumContext = require.context('src/utils/enum/', false, /[A-Z]\w+Enum\.js$/)
const enumMap = {}
enumContext.keys().forEach(key => {
  // key 形如 './noteOrderTypeEnum.js'
  const mod = enumContext(key)
  Object.keys(mod).forEach(exportName => {
    if (exportName === 'default') return
    const val = mod[exportName]
    // 只挑 enum-plus Enum 实例（带 .items）
    if (val && typeof val === 'object' && val.items) {
      enumMap[exportName] = val
    }
  })
})
Vue.prototype.$enums = enumMap
```

> **正则约束 `/[A-Z]\w+Enum\.js$/`**：只匹配 `XxxEnum.js` 命名的文件，跳过 `enumSetup.js` / `index.js` 等基础设施文件。
>
> 当前项目 `boot/i18n.js` 直接用 `import { ... } from 'src/utils/enum'`，但**后续可平滑迁移到 require.context 写法**，无需改动模板（模板一律通过 `$enums` 访问）。

---

## 扩展阅读

- npm: https://www.npmjs.com/package/enum-plus
- GitHub: https://github.com/shijistar/enum-plus
