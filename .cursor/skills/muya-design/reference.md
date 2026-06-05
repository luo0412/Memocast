# Muya 编辑器详细设计参考

本文档是 [SKILL.md](SKILL.md) 的详细参考补充。

## 完整目录结构

```
muya/
├── lib/
│   ├── index.js                    # 主入口
│   ├── config.js                   # 配置常量
│   ├── contentState/
│   │   ├── index.js               # 状态管理核心
│   │   ├── history.js             # 撤销/重做
│   │   ├── inputCtrl.js           # 输入处理
│   │   ├── enterCtrl.js           # 回车处理
│   │   ├── backspaceCtrl.js       # 退格处理
│   │   └── ...
│   ├── parser/
│   │   ├── index.js               # Tokenizer
│   │   ├── rules.js                # 规则定义
│   │   ├── marked/                # 基于marked的解析器
│   │   │   ├── blockRules.js
│   │   │   ├── renderer.js
│   │   │   ├── Lexer.js
│   │   │   └── utils.js
│   │   └── render/                # 渲染器
│   │       ├── index.js           # StateRender
│   │       ├── snabbdom.js
│   │       ├── renderBlock/       # 块渲染
│   │       └── renderInlines/     # 行内渲染
│   ├── eventHandler/
│   │   ├── event.js              # EventCenter
│   │   ├── keyboard.js            # 键盘事件
│   │   ├── mouseEvent.js          # 鼠标事件
│   │   ├── clipboard.js           # 剪贴板
│   │   └── dragDrop.js            # 拖拽
│   ├── selection/                 # 选择管理
│   ├── ui/                        # UI组件
│   │   ├── tooltip/
│   │   ├── formatPicker/
│   │   ├── emojiPicker/
│   │   └── ...
│   └── utils/                    # 工具函数
├── themes/                        # 样式主题
└── dist/                         # 编译输出
```

## 行内元素渲染函数

每个行内元素类型都有对应的渲染函数在 `renderInlines/` 目录：

| 文件 | 处理类型 |
|-----|---------|
| `em.js` | 粗体/斜体 |
| `strong.js` | 强调 |
| `link.js` | 链接 |
| `image.js` | 图片 |
| `inlineCode.js` | 行内代码 |
| `inlineMath.js` | 行内数学 |
| `emoji.js` | 表情符号 |
| `header.js` | 标题尾部 `#` |
| `referenceLink.js` | 引用链接 |
| `htmlTag.js` | HTML 标签 |

## 状态机流程

```
用户输入 → Keyboard/Input 事件 → ContentState 处理 → stateChange 事件 → dispatchChange()
                                                        ↓
                                               EventCenter.dispatch('change')
                                                        ↓
                                               主应用监听 change 事件
```

## 虚拟 DOM 更新机制

Muya 使用 snabbdom 的 `patch` 算法：

```javascript
import { patch, h, toVNode, toHTML } from './snabbdom'

class StateRender {
  render(blocks, activeBlocks, matches) {
    const selector = `div#${CLASS_OR_ID.AG_EDITOR_ID}`
    const children = blocks.map(block => 
      this.renderBlock(null, block, activeBlocks, matches, true)
    )
    const newVdom = h(selector, children)
    const rootDom = document.querySelector(selector)
    const oldVdom = toVNode(rootDom)
    patch(oldVdom, newVdom)
  }
}
```

## ContentState 控制器详解

### coreApi - 核心 API

Block 树的基本操作方法。

### enterCtrl - 回车处理

处理回车键的行为，包括：
- 段落拆分
- 列表项续接
- 引用块续接

### backspaceCtrl - 退格处理

处理退格键的行为，包括：
- 块合并
- 删除空块
- 取消列表项

### tableBlockCtrl - 表格块控制

- 单元格导航
- 表格内回车
- 表格内退格

### formatCtrl - 格式化

支持的格式化类型：
- `bold`, `italic`, `strikethrough`
- `code`, `link`, `image`
- `math_block`, `html`
- `clear`

## 光标状态 (Cursor)

```javascript
class Cursor {
  key: string          // 所在块 key
  block: Block          // 所在块引用
  offset: number        // 块内偏移
  left: boolean         // 是否在块左侧
  anchor: {...}         // 选区起点
  head: {...}           // 选区终点
}
```

## 搜索和替换

```javascript
// 搜索
editor.search(value, {
  isRegex: false,
  isCaseSensitive: false,
  matchWholeWord: false,
  searchMax: -1  // -1 表示不限制
})

// 替换
editor.replace(value, {
  isRegex: false,
  isCaseSensitive: false,
  matchWholeWord: false,
}, {
  value: 'replacement text',
  isSingle: false,  // 是否只替换一个
})

// 查找下一个/上一个
editor.find('next')  // 或 'prev'
```

## 导出功能

### 导出为 HTML

```javascript
// 纯 HTML
const html = await editor.exportHtml()

// 带样式 HTML
const styledHtml = await editor.exportStyledHTML({
  theme: 'Default-Light',  // 或 'Default-Dark'
  themeStyle: {            // 自定义样式
    fontSize: '16px',
    lineHeight: '1.6',
  },
  customHtml: '<div class="export-wrapper">{content}</div>'
})
```

### 复制为 Markdown/HTML

```javascript
// 复制选中内容为 Markdown
editor.copyAsMarkdown()

// 复制选中内容为 HTML
editor.copyAsHtml()

// 复制选中内容为纯文本
editor.copyAsPlaintext()
```

## 调试技巧

### 查看 Block 树

```javascript
const state = editor.contentState
console.log('Blocks:', state.blocks)
console.log('History:', state.history)
```

### 查看当前光标

```javascript
const cursor = editor.contentState.cursor
console.log('Cursor:', cursor)
```

### 查看 Token 解析结果

```javascript
import { tokenizer } from '@/libs/muya/lib/parser'
const tokens = tokenizer('# Hello **world**', {
  highlights: [],
  hasBeginRules: [],
  labels: {},
  options: {}
})
console.log('Tokens:', tokens)
```
