# Memocast 项目记忆

## 项目概述
- Memocast 是基于 Muya 编辑器的 Markdown 笔记应用
- 工作目录：`e:/work-github/demo/Memocast`
- 核心编辑器：`src/libs/muya/`

## QuickInsert（快捷面板）修复记录

### 问题描述
快捷面板（QuickInsert）的左右键盘导航异常，而上下导航正常。

### 问题根因
`BaseScrollFloat` 基类的 `step()` 方法中：
- `previous`/`next`：使用 `index ± columns` 并正确处理分区边界
- `left`/`right`：只是简单的 `index ± 1`，忽略分区边界

当 QuickInsert 有多个分区（basic block、advance block）且网格布局（columnsCount=3）时，简单 `±1` 会导致跳转到错误位置或跨越分区边界。

### 修复方案
在 `QuickInsert` 中重写 `step()` 方法，让左右导航与上下导航使用相同的"分区内相对位置"计算逻辑。

### 涉及文件
- `src/libs/muya/lib/ui/quickInsert/index.js` - 重写 step() 方法
- `src/libs/muya/lib/ui/baseScrollFloat/index.js` - 基类（暂不修改）

## BaseScrollFloat 继承关系
以下组件继承自 BaseScrollFloat：
- `QuickInsert` - 网格布局（3列），有分区，需重写 step()
- `ImagePathPicker` - 单列列表，无需重写
- `EmojiPicker` - 单列列表，无需重写
- `CodePicker` - 单列列表，无需重写

## 关键配置常量
- QuickInsert GRID_COLUMNS = 3（可配置网格列数）
