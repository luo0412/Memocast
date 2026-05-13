---
name: muya-design
description: Muya Markdown 编辑器架构与实现指南。用于分析、修改或扩展 Memocast 中的 Muya 编辑器功能，包括 Block 结构、Parser 设计、Renderer 机制、事件系统和主应用集成。
---

# Muya 编辑器设计

## 架构概览

Muya 是基于 snabbdom 的虚拟 DOM Markdown 编辑器，版本 0.1.2。

### 核心模块

| 模块 | 路径 | 职责 |
|------|------|------|
| EventCenter | `src/libs/muya/lib/eventHandler/event.js` | 事件发布/订阅 |
| ContentState | `src/libs/muya/lib/contentState/index.js` | 状态管理、Block 树操作 |
| StateRender | `src/libs/muya/lib/parser/render/index.js` | 虚拟 DOM 渲染 |
| Parser | `src/libs/muya/lib/parser/index.js` | Markdown 解析 |

### 初始化

```javascript
import Muya from '@/libs/muya'

const editor = new Muya(containerElement, {
  markdown: '# Hello',
  bulletListMarker: '-',
  // ...
})
```

## Block 数据结构

内容以树状 Block 存储：

```javascript
{
  key: 'unique_id',
  type: 'p|h1|blockquote|ul|ol|pre|figure|table|span',
  functionType: 'paragraphContent',
  text: 'content',
  editable: true,
  parent: 'parent_key',
  preSibling: 'prev_key',
  nextSibling: 'next_key',
  children: []  // 嵌套块
}
```

**Block 类型**：
- **容器块**：`p`, `h1-h6`, `blockquote`, `ul`, `ol`, `li`, `pre`, `figure`, `table`
- **叶子块**：`span`, `hr`, `input`

## 解析器设计

### 块级解析 (`parser/marked/blockRules.js`)

| 规则 | 用途 |
|------|------|
| `newline` | 换行符 |
| `code` | 缩进代码块 |
| `fences` | 围栏代码块 |
| `heading` | ATX 标题 |
| `blockquote` | 引用块 |
| `list` | 列表 |
| `table` | 表格 |
| `frontmatter` | YAML 前端配置 |
| `multiplemath` | 块级数学公式 |

### 行内解析 (`parser/rules.js`)

```javascript
export const inlineRules = {
  strong:    /^(\*\*|__)(?=\S)([\s\S]*?[^\s\\])(\\*)\1/,
  em:        /^(\*|_)(?=\S)([\s\S]*?[^\s\*\\])(\\*)\1/,
  inline_code: /^(`{1,3})([^`]+?|.{2,})\1/,
  image:     /^(\!\[)(.*?)(\\*)\]\((.*)(\\*)\)/,
  link:      /^(\[)((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*?)(\\*)\]\((.*)(\\*)\)/,
  emoji:     /^(:)([a-z_\d+-]+?)\1/,
  del:       /^(~{2})(?=\S)([\s\S]*?\S)(\\*)\1/,
  auto_link: /^<(?:([a-zA-Z]{1}...)/,
  inline_math: /^(\$)([^\$]*?[^\$\\])(\\*)\1/,
}
```

### 解析流程

```
Markdown Text → Lexer (块级) → Tokens → tokenizer (行内) → Tokens → Block Tree
```

## 渲染器设计

### 三种渲染模式

| 模式 | 方法 | 用途 |
|------|------|------|
| 全量渲染 | `render()` | 首次渲染或大幅变更 |
| 局部渲染 | `partialRender()` | 只更新指定范围 blocks |
| 单块渲染 | `singleRender()` | 仅更新单个 block |

### 渲染分发

```javascript
function renderBlock(parent, block, activeBlocks, matches, useCache) {
  const method = Array.isArray(block.children) && block.children.length > 0
    ? 'renderContainerBlock'  // 容器块
    : 'renderLeafBlock'       // 叶子块
  return this[method](parent, block, activeBlocks, matches, useCache)
}
```

## 状态管理 (ContentState)

ContentState 通过 Mixin 模式注入功能：

```javascript
const prototypes = [
  coreApi,        // 核心API
  tabCtrl,        // Tab处理
  enterCtrl,     // 回车处理
  updateCtrl,    // 更新处理
  backspaceCtrl, // 退格处理
  deleteCtrl,    // 删除处理
  codeBlockCtrl, // 代码块
  tableBlockCtrl, // 表格
  formatCtrl,    // 格式化
  searchCtrl,    // 搜索
]
prototypes.forEach(ctrl => ctrl(ContentState))
```

### Block 树操作 API

```javascript
ContentState.prototype = {
  createBlock(),      // 创建块
  removeBlock(),      // 删除块
  appendChild(),      // 添加子块
  insertAfter(),      // 在后插入
  insertBefore(),     // 在前插入
  replaceBlock(),     // 替换块
  getBlock(),         // 获取块
  getParent(),        // 获取父块
}
```

### History 管理

```javascript
class History {
  push(state)           // 入栈
  undo()                // 撤销
  redo()                // 重做
  clearRedo()           // 清空重做栈
}
```

## 事件系统

### EventCenter API

```javascript
class EventCenter {
  attachDOMEvent(target, event, listener, capture)  // 绑定DOM事件
  detachDOMEvent(eventId)                           // 解绑DOM事件
  subscribe(event, listener)                        // 订阅
  unsubscribe(event, listener)                      // 取消订阅
  subscribeOnce(event, listener)                   // 单次订阅
  dispatch(event, ...data)                         // 派发事件
}
```

### 主要事件

| 事件 | 触发时机 | 数据 |
|------|----------|------|
| `change` | 内容变更 | `{ markdown, wordCount, cursor, history }` |
| `selectionChange` | 选择变更 | 选择范围 |
| `focus` | 获得焦点 | - |
| `blur` | 失去焦点 | - |

## 主应用集成

### API 接口

```javascript
editor.setMarkdown(markdown, cursor)   // 设置内容
editor.getMarkdown()                    // 获取内容
editor.setCursor(cursor)                // 设置光标
editor.getCursor()                     // 获取光标
editor.format(type)                    // 格式化
editor.undo()                          // 撤销
editor.redo()                          // 重做
editor.insertImage(imageInfo)           // 插入图片
editor.exportHtml()                    // 导出HTML
editor.exportStyledHTML(options)        // 导出带样式HTML
editor.copyAsMarkdown()                // 复制为Markdown
editor.copyAsHtml()                    // 复制为HTML
```

### 事件监听

```javascript
editor.on('change', ({ markdown, wordCount, cursor }) => {
  saveDocument(markdown)
})

editor.on('selectionChange', (selection) => {
  updateToolbar(selection)
})
```

### 插件系统

```javascript
Muya.use(MyPlugin, { /* options */ })

class MyPlugin {
  static pluginName = 'myPlugin'
  constructor(muya, options) { /* ... */ }
}
```

## 相关文件索引

| 文件 | 用途 |
|------|------|
| `src/libs/muya/lib/index.js` | 主入口 |
| `src/libs/muya/lib/contentState/index.js` | 状态管理 |
| `src/libs/muya/lib/parser/index.js` | Tokenizer |
| `src/libs/muya/lib/parser/marked/blockRules.js` | 块级规则 |
| `src/libs/muya/lib/parser/rules.js` | 行内规则 |
| `src/libs/muya/lib/parser/render/index.js` | StateRender |
| `src/libs/muya/lib/eventHandler/event.js` | EventCenter |
| `src/components/ui/editor/Muya.vue` | Vue 封装组件 |

## 扩展阅读

详细设计文档见 [reference.md](reference.md)
