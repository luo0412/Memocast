---
name: muya-design
description: Muya Markdown 编辑器架构与实现指南。用于分析、修改或扩展 Memocast 中的 Muya 编辑器功能，包括 Block 结构、Parser 设计、Renderer 机制、事件系统和主应用集成。遇到 Muya/Monaco 编辑器切换、Markdown 解析渲染、快捷键、复制粘贴、光标/选区、编辑行为异常，或需要调整编辑器交互时应自动使用。
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
| Parser | `src/libs/muya/lib/parser/index.js` | Markdown 行内解析 (tokenizer) |
| Lexer | `src/libs/muya/lib/parser/marked/lexer.js` | Markdown 块级解析 (Lexer) |

### 初始化

```javascript
import Muya from 'src/libs/muya/lib'

const editor = new Muya(containerElement, {
  markdown: '# Hello',
  bulletListMarker: '-',
  // ...
})
```

## Block 数据结构

内容以树状 Block 存储，每个 Block 的完整字段如下：

```javascript
{
  key: 'unique_id',               // 全局唯一 ID
  type: 'p|h1|blockquote|ul|ol|pre|figure|table|span|div|hr|input|li|th|td|thead|tbody',
  functionType: 'paragraphContent|codeContent|atxLine|html|multiplemath|mermaid|...',  // 功能细分
  text: 'content',               // 纯文本内容（叶子块有）
  children: [],                   // 子块数组（容器块有）
  parent: 'parent_key',           // 父块 key
  preSibling: 'prev_key',         // 前一个兄弟块 key
  nextSibling: 'next_key',        // 后一个兄弟块 key
  editable: true,                 // 是否可编辑
  lang: 'javascript',             // 代码块语言
  checked: false,                 // 任务列表勾选状态
  headingStyle: 'atx',            // 标题样式 (atx/setext)
  listType: 'ul|ol',              // 列表类型
  bulletMarkerOrDelimiter: '-',   // 列表标记符
  isLooseListItem: false,         // 松散列表标记
  align: 'left|center|right',    // 表格对齐
  column: 0,                      // 表格列索引
}
```

**Block 类型分类**：

- **容器块（composite）**：`p`, `h1-h6`, `blockquote`, `ul`, `ol`, `li`, `pre`, `figure`, `table`, `div`, `thead`, `tbody`, `th`, `td`，拥有 `children` 数组
- **叶子块（leaf）**：`span`, `hr`, `input`，无 `children`，`text` 字段存放原始文本

**functionType 速查**（决定渲染行为的关键字段）：

| functionType | 对应 type | 说明 |
|-------------|---------|------|
| `paragraphContent` | span | 段落文本行 |
| `atxLine` | span | ATX 标题行 |
| `codeContent` | span | 代码块内容 |
| `languageInput` | span | 代码块语言输入框 |
| `html` | div | HTML 预览块 |
| `multiplemath` | div | 数学公式块 |
| `mermaid` | div | Mermaid 图表 |
| `flowchart` | div | 流程图 |
| `sequence` | div | 时序图 |
| `vega-lite` | div | Vega-Lite 图表 |
| `cellContent` | span | 表格单元格文本 |

## 解析器设计

Muya 的解析分为**两层**：

### 第一层：块级解析（Lexer → Block 树）

由 `src/libs/muya/lib/utils/importMarkdown.js` 中的 `importMarkdown` 函数驱动，调用 `Lexer.lex(src)` 将 Markdown 文本转换为 Block 树：

```
Markdown Text → Lexer.lex() → Block Tree
```

块级规则定义在 `parser/marked/blockRules.js`：

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
| `footnote` | 脚注块 |
| `lheading` | Setext 标题 |
| `html` | HTML 块 |

### 第二层：行内解析（tokenizer → Tokens）

由 `parser/index.js` 中的 `tokenizer()` 函数对 Block 的 `text` 字段进行行内元素解析：

```
Block.text → tokenizer() → Token[]
```

`parser/rules.js` 定义行内规则：

```javascript
export const inlineRules = {
  strong:    /^(\*\*|__)(?=\S)([\s\S]*?[^\s\\])(\\*)\1(?!(\*|_))/,
  em:        /^(\*|_)(?=\S)([\s\S]*?[^\s\*\\])(\\*)\1(?!\1)/,
  inline_code: /^(`{1,3})([^`]+?|.{2,})\1/,
  image:     /^(\!\[)(.*?)(\\*)\]\((.*)(\\*)\)/,
  link:      /^(\[)((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*?)(\\*)\]\((.*)(\\*)\)/,
  emoji:     /^(:)([a-z_\d+-]+?)\1/,
  del:       /^(~{2})(?=\S)([\s\S]*?\S)(\\*)\1/,
  auto_link: /^<(?:([a-zA-Z]{1}...)/,
  inline_math: /^(\$)([^\$]*?[^\$\\])(\\*)\1(?!\1)/,
  echo_anno: /^@([^\s\{\(\)@]+)?(?:\{([\s\S]*?)\})?\(([\s\S]*?)\)$/,  // Memocast 扩展
}

export const inlineExtensionRules = {
  superscript: /^(\^)((?:[^\^\s]|(?<=\\)\1|(?<=\\) )+?)(?<!\\)\1(?!\1)/,
  subscript: /^(~)((?:[^~\s]|(?<=\\)\1|(?<=\\) )+?)(?<!\\)\1(?!\1)/,
  footnote_identifier: /^(\[\^)([^\^\[\]\s]+?)(?<!\\)\]/,
}
```

**解析流程总览**：

```
Markdown Text
    │
    ▼
importMarkdown()          ← TurndownService 将 HTML 转回 Markdown 片段
    │                       ← 同时处理 CURSOR_ANCHOR_DNA / CURSOR_FOCUS_DNA
    ▼
Lexer.lex()               ← 块级 token 化，生成 Block 树
    │
    ▼
Block 树                    ← 树状结构，children 嵌套
    │
    ▼
renderLeafBlock()          ← 对每个叶子块调用 tokenizer()
    │
    ▼
tokenizer()                ← 行内 token 化
    │
    ▼
Token[]                    ← 平面数组，每 token 有 type/raw/range/children
    │
    ▼
renderInlines[token.type] ← 按 token 类型分发到对应渲染函数
    │
    ▼
snabbdom vnode             ← 最终 Patch 到真实 DOM
```

## 渲染器设计（核心）

### StateRender 架构

`StateRender`（`parser/render/index.js`）是渲染中枢，通过 mixin 模式注入两个渲染模块：

```javascript
mixins(StateRender, renderInlines, renderBlock)
```

`renderBlock` 提供 `renderBlock`、`renderLeafBlock`、`renderContainerBlock` 方法。
`renderInlines` 提供所有行内元素的渲染函数。

### 渲染流程

`StateRender` 维护以下缓存（用于性能优化）：

| 缓存 | 类型 | 用途 |
|------|------|------|
| `codeCache` | Map | 代码块内容缓存 |
| `loadMathMap` | Map | KaTeX 数学公式渲染结果 |
| `mermaidCache` | Map | Mermaid 图表待渲染队列 |
| `diagramCache` | Map | Flowchart/Sequence/Vega 待渲染队列 |
| `tokenCache` | Map | 行内 tokenizer 结果（无高亮时复用） |
| `labels` | Map | 引用定义标签映射 |
| `urlMap` | Map | URL 映射 |
| `runePlaceholderCache` | Map | Rune 占位符 DOM 缓存 |
| `echoPlaceholderCache` | Map | Echo 占位符 DOM 缓存 |
| `runeVmMap` | Map | Rune Vue 实例映射 |
| `echoVmMap` | Map | Echo Vue 实例映射 |

### 三种渲染模式

#### 1. 全量渲染 `render()`

首次渲染或大幅变更时使用：

```javascript
render(blocks, activeBlocks, matches) {
  const selector = `div#${CLASS_OR_ID.AG_EDITOR_ID}`
  const children = blocks.map(block =>
    this.renderBlock(null, block, activeBlocks, matches, true)  // useCache=true
  )
  const newVdom = h(selector, children)
  const rootDom = document.querySelector(selector) || this.container
  const oldVdom = toVNode(rootDom)
  patch(oldVdom, newVdom)           // snabbdom diff + patch
  this.renderMermaid()             // 异步渲染 Mermaid
  this.renderDiagram()              // 异步渲染 Flowchart/Sequence/Vega
  this.renderRunes()               // Rune/Echo 占位符渲染
  this.codeCache.clear()
}
```

#### 2. 局部渲染 `partialRender()`

光标区域内变更时使用，只 patch 局部 DOM：

```javascript
partialRender(blocks, activeBlocks, matches, startKey, endKey) {
  // 1. 找到需要替换的 DOM 范围（firstOldDom ~ endKey）
  // 2. 生成新 vnode，转换为 HTML 字符串
  const newVnode = h('section', blocks.map(...))
  const html = toHTML(newVnode).replace(/^<section>([\s\S]+?)<\/section>$/, '$1')
  // 3. 用 insertAdjacentHTML 插入新内容
  firstOldDom.insertAdjacentHTML('beforebegin', html)
  // 4. 移除旧 DOM 节点
  Array.from(needToRemoved).forEach(dom => dom.parentNode.removeChild(dom))
  // 5. 独立渲染光标所在块（如果不在 partial 范围内）
  if (needRenderCursorBlock) {
    const oldCursorVnode = toVNode(cursorDom)
    patch(oldCursorVnode, this.renderBlock(...))
  }
  // 6. 后处理
  this.renderMermaid()
  this.renderDiagram()
  this.renderRunes()
}
```

**注意**：`partialRender` **不使用 snabbdom 的 patch**，而是直接操作 DOM（`insertAdjacentHTML` + `removeChild`）。这是因为 partialRender 需要精确定位替换范围。

#### 3. 单块渲染 `singleRender()`

仅更新单个 Block 的 DOM：

```javascript
singleRender(block, activeBlocks, matches) {
  const selector = `#${block.key}`
  const newVdom = this.renderBlock(null, block, activeBlocks, matches, true)
  const rootDom = document.querySelector(selector)
  const oldVdom = toVNode(rootDom)
  patch(oldVdom, newVdom)           // snabbdom patch
  this.renderMermaid()
  this.renderDiagram()
  this.renderRunes()
}
```

### 块级渲染分发

```javascript
function renderBlock(parent, block, activeBlocks, matches, useCache = false) {
  const method = Array.isArray(block.children) && block.children.length > 0
    ? 'renderContainerBlock'   // 有子块 → 容器块
    : 'renderLeafBlock'         // 无子块 → 叶子块
  return this[method](parent, block, activeBlocks, matches, useCache)
}
```

#### renderLeafBlock 流程

叶子块渲染的关键逻辑（`renderBlock/renderLeafBlock.js`）：

```javascript
function renderLeafBlock(parent, block, activeBlocks, matches, useCache) {
  // 1. 生成选择器（id#key + class.ag-paragraph + ag-active/selected）
  let selector = getSelector(block, activeBlocks)

  // 2. 收集该 block 的搜索高亮
  const highlights = matches.filter(m => m.key === block.key)

  // 3. 行内解析（带 tokenCache 优化）
  if (text && highlights.length === 0 && tokenCache.has(text)) {
    tokens = tokenCache.get(text)           // 命中缓存
  } else if (text && HAS_TEXT_BLOCK_REG.test(type)) {
    const hasBeginRules = /paragraphContent|atxLine/.test(functionType)
    tokens = tokenizer(text, { highlights, hasBeginRules, labels, options })
    if (highlights.length === 0 && useCache && DEVICE_MEMORY >= 4) {
      tokenCache.set(text, tokens)          // 无高亮时缓存
    }
  }

  // 4. 按 token 类型分发渲染
  children = tokens.reduce((acc, token) =>
    [...acc, ...this[snakeToCamel(token.type)](h, cursor, block, token)], []
  )

  // 5. 特殊块处理：div → HTML/Math/Mermaid/Flowchart/Sequence
  //    input → checkbox
  //    codeContent → Prism 高亮

  // 6. 生成 vnode
  return h(selector, data, children)
}
```

#### renderContainerBlock 流程

容器块递归渲染子块：

```javascript
function renderContainerBlock(parent, block, activeBlocks, matches, useCache) {
  const children = block.children.map(child =>
    this.renderBlock(block, child, activeBlocks, matches, useCache)  // 递归
  )
  // 收集器块特有属性（table 对齐、list 标记、代码块语言等）
  return h(selector, data, children)
}
```

### 行内渲染函数分发

每个 Token 类型通过 `snakeToCamel(token.type)` 映射到渲染函数：

```javascript
children = tokens.reduce((acc, token) => [
  ...acc,
  ...this[snakeToCamel(token.type)](h, cursor, block, token)
], [])
```

| Token type | 渲染函数 | 文件 |
|-----------|---------|------|
| `text` | `text.js` | 纯文本（带 highlight） |
| `strong` | `strong.js` | 粗体 |
| `em` | `em.js` | 斜体 |
| `del` | `del.js` | 删除线 |
| `inline_code` | `inlineCode.js` | 行内代码 |
| `inline_math` | `inlineMath.js` | 行内数学 |
| `image` | `image.js` | 图片 |
| `link` | `link.js` | 链接 |
| `emoji` | `emoji.js` | Emoji |
| `hard_line_break` | `hardLineBreak.js` | 硬换行 |
| `soft_line_break` | `softLineBreak.js` | 软换行 |
| `html_tag` | `htmlTag.js` | HTML 标签 |
| `html_escape` | `htmlEscape.js` | HTML 转义 |
| `reference_link` | `referenceLink.js` | 引用链接 |
| `reference_image` | `referenceImage.js` | 引用图片 |
| `reference_definition` | `referenceDefinition.js` | 引用定义 |
| `echo_anno` | `echoAnno.js` | Echo 注释（Memocast 扩展） |
| `code_fense` | `codeFense.js` | 代码围栏 |
| `multiple_math` | `multipleMath.js` | 块级数学 |
| `auto_link` | `autoLink.js` | 自动链接 |
| `auto_link_extension` | `autoLinkExtension.js` | 自动链接扩展 |
| `super_sub_script` | `superSubScript.js` | 上标/下标 |
| `footnote_identifier` | `footnoteIdentifier.js` | 脚注标识 |
| `hr` | `hr.js` | 分割线 |
| `header` | `header.js` | 标题尾部 `#` |
| `tail_header` | `tailHeader.js` | 标题尾部空格 |
| `backlash` | `backlash.js` | 转义符 |
| `backlash_in_token` | `backlashInToken.js` | Token 内转义 |
| `html_ruby` | `htmlRuby.js` | Ruby 注音 |

### 高亮机制

搜索高亮通过 `matches` 参数传递，在两个层面生效：

1. **Block 级别**：`matches.filter(m => m.key === block.key)` 收集该 block 的所有高亮范围
2. **Token 级别**：每个 `text` token 调用 `highlight()` 函数，通过 `union()` 合并 token 范围与高亮范围，生成多个 `<span class="ag-highlight">` 或 `<span class="ag-selection">`

```javascript
// highlight.js 核心逻辑
for (const light of highlights) {
  const un = union({ start: rStart, end: rEnd }, light)
  if (un) unions.push(un)
}
// 生成 <span class="ag-highlight"> 或 <span class="ag-selection">
```

### Rune / Echo 占位符渲染（Memocast 扩展）

Muya 通过 `renderRunes()` 方法处理两类特殊占位符：

#### Echo 占位符

识别 `[data-echo-node-id]` 属性节点，将 `@name{value}(id)` 语法渲染为可交互卡片：

```javascript
renderEchoPlaceholderNodes() {
  // 1. 查找所有占位符 DOM 节点
  const hosts = root.querySelectorAll('[data-echo-node-id]')
  // 2. 通过 echoRegistry / echoCards 查找定义
  const echo = echoMap.get(`id:${definitionId}`) || echoMap.get(echoName)
  // 3. 生成回响卡片 HTML
  host.innerHTML = createEchoPlaceholderMarkup(echo, dataset)
  // 4. 缓存比较（相同则跳过）
  if (this.echoPlaceholderCache.get(host) === cacheKey) return
  this.echoPlaceholderCache.set(host, cacheKey)
}
```

#### Rune 占位符

识别 `[data-rune-name][data-rune-id][data-rune-node-id]` 属性节点，通过 Vue 构造函数渲染动态卡片：

```javascript
mountRuneVueHosts() {
  // 1. 查找占位符节点
  // 2. 从 runeCards 查找 Rune 定义
  const rune = runeMap.get(runeName)
  // 3. new RuneRenderer({ propsData: { runeId, nodeId, rune, value } })
  // 4. vm.$mount() 并 append 到 host
  // 5. 复用策略：相同 renderKey 则复用已有 vm
  this.runeVmMap.set(nodeId, vm)
}
```

### snabbdom 集成

Muya 使用 snabbdom 的核心模块：

```javascript
import { patch, h, toVNode, toHTML, htmlToVNode } from './snabbdom'

// snabbdom.init() 配置
patch = init([
  classModule,      // 切换 class
  attributesModule, // 属性
  styleModule,      // 样式（含动画）
  propsModule,      // DOM properties
  datasetModule,    // data-* 属性
  eventlistenersModule  // 事件监听
])
```

关键工具函数：

| 函数 | 用途 |
|------|------|
| `h(tag, children)` | 创建虚拟节点 |
| `patch(oldVNode, newVNode)` | diff 并 patch 到真实 DOM |
| `toVNode(dom)` | DOM → vnode |
| `toHTML(vnode)` | vnode → HTML 字符串 |
| `htmlToVNode(html)` | HTML 字符串 → vnode |

## 状态管理 (ContentState)

### ContentState 渲染入口

```javascript
// contentState/index.js
render(isRenderCursor = true, clearCache = false) {
  this.stateRender.render(blocks, activeBlocks, matches)
  this.setCursor()
  this.postRender()  // resizeLineNumber()
}

partialRender(isRenderCursor = true) {
  // 计算 startKey ~ endKey 范围
  const needRenderBlocks = blocks.slice(startIndex, endIndex)
  this.stateRender.partialRender(needRenderBlocks, activeBlocks, matches, startKey, endKey)
}

singleRender(block, isRenderCursor = true) {
  this.stateRender.singleRender(block, activeBlocks, matches)
}
```

### ContentState Mixin 控制器

当前实际注入的控制器：

```javascript
const prototypes = [
  coreApi,           // Block 树增删改查
  tabCtrl,          // Tab 缩进
  enterCtrl,        // 回车拆分/续接
  updateCtrl,       // 内容更新触发 rerender
  backspaceCtrl,    // 退格合并/空块清理
  deleteCtrl,       // Delete 前向删除
  codeBlockCtrl,    // 代码块编辑
  arrowCtrl,        // 方向键移动
  pasteCtrl,        // 粘贴处理
  copyCutCtrl,      // 复制/剪切
  tableBlockCtrl,   // 表格编辑
  tableDragBarCtrl, // 表格拖拽条
  tableSelectCellsCtrl, // 表格单元格选择
  paragraphCtrl,    // 段落级操作
  formatCtrl,       // 格式化（bold/italic/code/link 等）
  searchCtrl,       // 搜索与替换
  containerCtrl,    // 容器块处理
  htmlBlockCtrl,    // HTML 块处理
  clickCtrl,        // 点击行为
  inputCtrl,        // 输入事件
  tocCtrl,          // 目录提取
  emojiCtrl,        // Emoji 处理
  imageCtrl,        // 图片处理
  linkCtrl,         // 链接处理
  dragDropCtrl,     // 块拖拽
  footnoteCtrl,     // 脚注
  importMarkdown    // Markdown 导入
]
```

### renderRange 机制

`renderRange` 是性能优化的关键，记录需要局部渲染的范围：

```javascript
setNextRenderRange() {
  const startOutMostBlock = this.findOutMostBlock(startBlock)
  const endOutMostBlock = this.findOutMostBlock(endBlock)
  this.renderRange = [startOutMostBlock.preSibling, endOutMostBlock.nextSibling]
}

partialRender() {
  const [startKey, endKey] = this.renderRange
  const startIndex = blocks.findIndex(block => block.key === startKey)
  const endIndex = blocks.findIndex(block => block.key === endKey) + 1
  const needRenderBlocks = blocks.slice(startIndex, endIndex)
  this.stateRender.partialRender(needRenderBlocks, ...)
}
```

### History 管理

```javascript
class History {
  push(state)           // 入栈（含 blocks + renderRange + cursor）
  undo()               // 撤销（pop 并恢复）
  redo()               // 重做
  clearRedo()          // 清空重做栈
  getHistory()         // 获取 { stack, index }
  setHistory({ stack, index })  // 恢复历史
}
```

History 触发时机：光标位置变更超过 2 秒自动入栈，或选区跨 block 时立即入栈。

## 事件系统

### EventCenter API

```javascript
class EventCenter {
  attachDOMEvent(target, event, listener, capture)  // 绑定 DOM 事件
  detachDOMEvent(eventId)                           // 解绑 DOM 事件
  detachAllDomEvents()                              // 解绑所有 DOM 事件
  subscribe(event, listener)                         // 订阅
  unsubscribe(event, listener)                       // 取消订阅
  subscribeOnce(event, listener)                     // 单次订阅
  dispatch(event, ...data)                           // 派发事件
}
```

### 主要公开事件

| 事件 | 触发时机 | 数据 |
|------|----------|------|
| `change` | 内容变更 | `{ markdown, wordCount, cursor, history, toc }` |
| `selectionChange` | 选择变更 | 选择范围 |
| `selectionFormats` | 选中内容格式 | `{ formats }` |
| `focus` | 获得焦点 | - |
| `blur` | 失去焦点 | - |
| `crashed` | DOM 崩溃检测到 | - |

### 内部事件流

```
用户操作
  ↓
Keyboard / Mouse / Clipboard / DragDrop 事件处理器
  ↓
ContentState 修改 Block 树 + cursor
  ↓
EventCenter.dispatch('stateChange')
  ↓
Muya.dispatchChange()
  ↓
EventCenter.dispatch('change') → 主应用监听
```

## 主应用集成

### API 接口

```javascript
editor.setMarkdown(markdown, cursor)    // 设置内容（含光标）
editor.getMarkdown()                     // 获取 Markdown
editor.setCursor(cursor)                // 设置光标
editor.getCursor()                      // 获取光标
editor.format(type)                     // 格式化（bold/italic/strikethrough/code/link/image/clear）
editor.updateParagraph(type)            // 切换段落类型
editor.insertParagraph(location, text)   // 插入段落
editor.deleteParagraph()                // 删除段落
editor.duplicate()                      // 复制段落
editor.undo() / editor.redo()          // 撤销/重做
editor.selectAll()                      // 全选
editor.insertImage(imageInfo)          // 插入图片
editor.search(value, options)           // 搜索
editor.replace(value, options)          // 替换
editor.find('next'|'prev')             // 定位匹配
editor.exportHtml()                     // 导出 HTML
editor.exportStyledHTML(options)        // 导出带样式 HTML
editor.copyAsMarkdown()                 // 复制为 Markdown
editor.copyAsHtml()                    // 复制为 HTML
editor.pasteAsPlainText()              // 纯文本粘贴
editor.extractImages(markdown)         // 提取图片引用
editor.setOptions(options, needRender)  // 动态更新选项
editor.setFocusMode(bool)              // 专注模式
editor.setFont({ fontSize, lineHeight }) // 字体设置
editor.setListIndentation(n|'dfm')      // 列表缩进
editor.replaceWordInline(line, wordCursor, replacement)  // 替换单词
editor.refreshRuneCards(runeCards)     // 刷新 Rune 卡片
```

### 事件监听

```javascript
editor.on('change', ({ markdown, wordCount, cursor, toc }) => {
  saveDocument(markdown)
})

editor.on('selectionChange', (selection) => {
  updateToolbar(selection)
})

editor.on('selectionFormats', ({ formats }) => {
  updateFormatState(formats)
})

editor.on('crashed', () => {
  // 编辑器崩溃，需要恢复
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
| `src/libs/muya/lib/index.js` | 主入口，Muya 类 |
| `src/libs/muya/lib/contentState/index.js` | 状态管理，render/renderRange/history |
| `src/libs/muya/lib/parser/index.js` | 行内 tokenizer |
| `src/libs/muya/lib/parser/rules.js` | 行内规则定义 |
| `src/libs/muya/lib/parser/marked/blockRules.js` | 块级规则定义 |
| `src/libs/muya/lib/parser/marked/lexer.js` | 块级 lexer |
| `src/libs/muya/lib/parser/render/index.js` | StateRender，render/partialRender/singleRender |
| `src/libs/muya/lib/parser/render/snabbdom.js` | snabbdom 封装 |
| `src/libs/muya/lib/parser/render/renderBlock/index.js` | 块级渲染分发 |
| `src/libs/muya/lib/parser/render/renderBlock/renderLeafBlock.js` | 叶子块渲染（含 Mermaid/Diagram） |
| `src/libs/muya/lib/parser/render/renderBlock/renderContainerBlock.js` | 容器块渲染 |
| `src/libs/muya/lib/parser/render/renderInlines/index.js` | 行内渲染函数导出 |
| `src/libs/muya/lib/parser/render/renderInlines/echoAnno.js` | Echo 占位符渲染（Memocast 扩展） |
| `src/libs/muya/lib/eventHandler/event.js` | EventCenter |
| `src/libs/muya/lib/utils/importMarkdown.js` | Markdown → Block 树 |
| `src/libs/muya/lib/utils/exportMarkdown.js` | Block 树 → Markdown |
| `src/libs/muya/lib/config/index.js` | CLASS_OR_ID 常量、配置默认值 |
| `src/components/ui/editor/Muya.vue` | Vue 封装组件 |

## 扩展阅读

详细设计文档见 [reference.md](reference.md)
