---
name: enum-plus
description: enum-plus 枚举增强库集成指南。用于在 Memocast 中使用 enum-plus 管理业务枚举，包括定义枚举、获取 label、生成 UI 选项、与 Element-UI 组件集成。遇到枚举定义、label 回显、下拉框选项、业务状态码、UI 组件绑定等场景时应自动使用。
---

# enum-plus 枚举增强库使用指南

## 快速参考

### 导入

```javascript
import { Enum } from 'enum-plus'
```

### 基本用法

```javascript
const StatusEnum = Enum({
  Draft: { value: 1, label: '草稿', color: 'default' },
  Review: { value: 2, label: '审核中', color: 'processing' },
  Published: { value: 3, label: '已发布', color: 'success' },
})

// 获取 label（最常用）
StatusEnum.label(1) // '草稿'
StatusEnum.label(2) // '审核中'

// 获取元数据
StatusEnum.color(1) // 'default'
StatusEnum.color(3) // 'success'

// 获取 key
StatusEnum.key(2) // 'Review'

// 获取值
StatusEnum.value('Review') // 1

// 获取所有项（用于生成下拉选项）
StatusEnum.items // [{ key: 'Draft', value: 1, label: '草稿', color: 'default' }, ...]

// 遍历所有 key
StatusEnum.keys // ['Draft', 'Review', 'Published']

// 遍历所有 value
StatusEnum.values // [1, 2, 3]

// 转为列表（用于 el-select）
Enum.toList(StatusEnum) // [{ label: '草稿', value: 1 }, ...]
```

## 在 Memocast 中的最佳实践

### 1. 集中管理枚举定义

枚举定义应放在 `src/const/` 目录下，按业务模块组织：

```
src/const/
├── noteConst.js         // 笔记状态、类型等
├── syncConst.js         // 同步状态
├── editorConst.js       // 编辑器设置
└── ...
```

### 2. 定义示例

```javascript
// src/const/noteConst.js
import { Enum } from 'enum-plus'

export const NoteTypeEnum = Enum({
  Markdown: { value: 'markdown', label: 'Markdown', icon: 'icon-markdown' },
  Document: { value: 'document', label: '纯文档', icon: 'icon-doc' },
  RichText: { value: 'richtext', label: '富文本', icon: 'icon-rich' },
})

export const NoteStatusEnum = Enum({
  Normal: { value: 0, label: '正常', color: 'success' },
  Archived: { value: 1, label: '已归档', color: 'info' },
  Deleted: { value: 2, label: '已删除', color: 'danger' },
})

export const SyncStatusEnum = Enum({
  Synced: { value: 'synced', label: '已同步', color: 'success' },
  Pending: { value: 'pending', label: '待同步', color: 'warning' },
  Syncing: { value: 'syncing', label: '同步中', color: 'primary' },
  Error: { value: 'error', label: '同步失败', color: 'danger' },
})
```

### 3. 在 Vue 组件中使用

```vue
<template>
  <el-select v-model="form.type">
    <el-option
      v-for="item in noteTypeOptions"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    />
  </el-select>

  <el-tag :type="syncStatusColor">
    {{ syncStatusLabel }}
  </el-tag>
</template>

<script>
import { NoteTypeEnum, NoteStatusEnum, SyncStatusEnum, Enum } from 'enum-plus'
import { noteConst } from 'src/const/noteConst'

export default {
  computed: {
    noteTypeOptions() {
      return Enum.toList(NoteTypeEnum)
    },
    syncStatusLabel() {
      return SyncStatusEnum.label(this.note.syncStatus)
    },
    syncStatusColor() {
      return SyncStatusEnum.color(this.note.syncStatus)
    },
  }
}
</script>
```

### 4. 与 el-form 集成

```vue
<template>
  <el-form :model="form" label-width="100px">
    <el-form-item label="状态">
      <el-select v-model="form.status">
        <el-option
          v-for="item in statusOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
    </el-form-item>
  </el-form>
</template>

<script>
import { NoteStatusEnum, Enum } from 'enum-plus'
import { noteConst } from 'src/const/noteConst'

export default {
  data() {
    return {
      form: {
        status: 0
      },
      statusOptions: Enum.toList(NoteStatusEnum)
    }
  }
}
</script>
```

### 5. 批量获取多个字段

```javascript
const item = StatusEnum.item(2)
// { key: 'Review', value: 2, label: '审核中', color: 'processing' }

// 结合解构使用
const { label, color } = StatusEnum.item(this.status)
this.$message.success(`状态：${label}`)
```

### 6. 判断值是否存在

```javascript
StatusEnum.has(1) // true
StatusEnum.has(99) // false

StatusEnum.hasKey('Draft') // true
StatusEnum.hasKey('Unknown') // false
```

## 类型安全（TypeScript）

如果项目使用 TypeScript，可以利用枚举的值类型约束：

```typescript
import { Enum } from 'enum-plus'

const StatusEnum = Enum({
  Draft: { value: 1 as const, label: '草稿' },
  Published: { value: 2 as const, label: '已发布' },
})

// valueType 自动推断为 1 | 2
function setStatus(status: typeof StatusEnum.valueType) {
  // status 只能是 1 或 2
}
```

## 常见模式

### 状态映射到 UI

```javascript
// 状态 -> Element-UI tag type
const StatusTagMap = Enum({
  Draft: { value: 1, label: '草稿', tagType: 'info' },
  Active: { value: 2, label: '活跃', tagType: 'success' },
  Suspended: { value: 3, label: '暂停', tagType: 'warning' },
})

// 在组件中使用
<el-tag :type="StatusTagMap.tagType(note.status)">
  {{ StatusTagMap.label(note.status) }}
</el-tag>
```

### 布尔值枚举

```javascript
const YesNoEnum = Enum({
  Yes: { value: 1, label: '是', bool: true },
  No: { value: 0, label: '否', bool: false },
})

// 判断逻辑
if (YesNoEnum.bool(form.required)) {
  // 必须
}
```

### 数字 + 字符串混用

```javascript
const MixedEnum = Enum({
  Unknown: { value: 0, label: '未知' },
  Active: { value: 'active', label: '活跃' },
})
```

## 注意事项

1. **枚举定义后不要修改结构**：`Enum` 创建的是冻结对象，运行时修改不会生效
2. **value 必须唯一**：`value` 是枚举的唯一标识，不能重复
3. **向后兼容**：新增枚举值时，建议在末尾添加，避免影响已有代码的数组下标
4. **国际化支持**：`enum-plus` 支持 `@enum-plus/plugin-i18next`，如需 i18n 可以扩展

## 相关文件结构

```
src/
├── const/
│   ├── noteConst.js        # 笔记相关枚举
│   ├── syncConst.js        # 同步状态枚举
│   └── index.js            # 统一导出
└── ...
```

## 扩展阅读

- npm: https://www.npmjs.com/package/enum-plus
- GitHub: https://github.com/shijistar/enum-plus
