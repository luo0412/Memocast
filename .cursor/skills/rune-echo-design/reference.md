# Rune 与 Echo 架构深入分析

## 1. 命名澄清（最重要）

| 名称 | 用户语义 | 实现机制 | main 功能 |
|------|---------|---------|---------|
| **rune（符文）** | Vue SFC + Vue.extend 卡片 | 用户通过 RuneFormDialog 自定义 | **自身就是完整卡片，不影响其他元素** |
| **echo（回响）** | `@xxx{}(prompt)` 占位符 | anno_source + handler | **main 功能是影响附近元素** |

### 代码内部枚举口径

代码内部有一个 enum 字段叫 `kind`，三个取值：

| kind 值 | 所属体系 | 含义 |
|--------|---------|------|
| `'echo'` | echo | 普通 echo，纯标记卡片（nice 等） |
| `'echo-chant'` | echo | "echo 的回响作用派发"，由 10 个内置 echo + 用户自定义 handler 组成 |
| `'echo-tbd'` | echo | 兜底 echo，无真实 handler |

**改名的动机**：原 `kind: 'rune'`、原 `kind: 'rune-tbd'`、原 `RUNE_KINDS`、`RUNE_HANDLERS` 等字段属于 echo 体系，但历史命名与 rune（符文）字面重名。v2026-07-15 起统一改名 `echo-chant` / `echo-tbd`，代码内**已全面替换**，**不保留任何 `kind: 'rune'` 兼容分支**（项目尚未对外发版）。

> **真正走 Vue SFC + Vue.extend 路径的 rune，只有用户通过 RuneFormDialog 自定义的那些**。

## 2. 两条管线的文件分布

```
src/components/ui/editor/Muya.vue
├── 第 102-167 行  normalizeRuneSfc + injectScopedAttribute  ← RUNE 路径
├── 第 220-248 行  migrateLegacyRunePlaceholders            ← RUNE 路径
├── 第 319-413 行  createRuneRendererCtor (Vue.extend)      ← RUNE 路径
├── 第 415-479 行  RunePreviewRenderer                      ← RUNE 路径
├── 第 481-...行   EchoPreviewRenderer                      ← ECHO 路径
└── 第 809-827 行  updateRunePlaceholderValue               ← RUNE 路径

src/components/ui/editor/echo/
├── EchoRegistry.js           ← ECHO 路径
├── EchoRuntime.js            ← ECHO 路径
├── builtinEchoes.js          ← ECHO 路径（11 个内置"rune"）
└── builtin-echo-shared.js    ← ECHO 路径
```

## 3. rune 路径详解（Vue SFC）

### 3.1 占位符生成（quickInsert 阶段）

```html
<!-- 笔记中实际存储的格式 -->
<div data-rune-name="我的符文"
     data-rune-id="uuid-instance-id"
     data-rune-node-id="rune-uuid-node-id"
     data-rune-value="初始值">
  显示文本
</div>
```

### 3.2 SFC 解析（normalizeRuneSfc）

```javascript
// 用 vue-template-compiler 解析 SFC 字符串
const parsed = vueSfcCompiler.parseComponent(rune.template)
// 返回 { template: {content}, script: {content}, styles: [...] }

const template = parsed.template.content  // <template>...</template> 里的内容
const script = parsed.script.content      // <script>export default {...}</script>
const styles = parsed.styles              // <style>...</style> 数组
```

### 3.3 脚本 eval（evalRuneScript）

```javascript
// 把 'export default {...}' 转成 'return {...}'
const sanitized = script.replace(/export\s+default/, 'return ')
const factory = new Function(sanitized)
const componentOptions = factory()
// componentOptions = Vue 组件选项 { props, data, methods, computed, ... }
```

### 3.4 模板编译（compileToFunctions）

```javascript
// scopeId 注入：给所有顶层标签加 data-rune-scope-${runeId}
const scopedTemplate = injectScopedAttribute(template, `data-rune-scope-${rune.id}`)
// 例如：<div class="x"> → <div class="x" data-rune-scope-uuid>

const compiled = vueSfcCompiler.compileToFunctions(scopedTemplate)
// compiled = { render, staticRenderFns }
```

### 3.5 CSS 注入（ensureRuneStyle）

```javascript
const ensureRuneStyle = (styleId, cssText) => {
  let styleEl = document.getElementById(styleId)
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = styleId
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = cssText
}

// 用法
ensureRuneStyle(`rune-style-${rune.id}`, styles.map(s => s.content).join('\n'))
```

### 3.6 构造 Vue 组件

```javascript
return Vue.extend({
  ...componentOptions,
  name: componentOptions.name || 'RunePreviewRenderer',
  props: { runeId, nodeId, rune, value },  // 外层注入的 props
  render: compiled.render,
  staticRenderFns: compiled.staticRenderFns
})
```

### 3.7 渲染流程

```
Muya 解析 <div data-rune-name="...">
  ↓
Muya 替换为 <RunePreviewRenderer>（外层包裹）
  ↓
RunePreviewRenderer 调 createRuneRendererCtor(rune)
  ↓
Vue.extend 构造器 → h(this.rendererCtor, { props, on }) → $mount
  ↓
内层 SFC 渲染到 DOM
  ↓
内层 SFC 的 mounted 钩子执行
  ↓
用户交互 → 内层 $emit('input', value)
  ↓
RunePreviewRenderer.onValueChange({runeId, nodeId, value})
  ↓
Muya.vue.updateRunePlaceholderValue({runeId, nodeId, value})
  ↓
rewriteRunePlaceholderByNodeId → contentEditor.setMarkdown(...)
  ↓
Muya 重渲染整个文档
```

## 4. echo 路径详解（@xxx{}() + handler）

### 4.1 Muya 解析 echo_anno token

```javascript
// src/libs/muya/lib/parser/rules.js
echo_anno: /^@([^\s\{\(\)@]+)?(?:\{([\s\S]*?)\})?\(([\s\S]*?)\)$/

// 匹配结果
{
  type: 'echo_anno',
  echoName: '生生不息',
  attrsParsed: { scope: 'siblings', trigger: 'auto' },
  prompt: '春风吹又生',
  raw: '@生生不息{scope: "siblings", trigger: "auto"}(春风吹又生)'
}
```

### 4.2 anno_source 编译（safeEvalFactory）

```javascript
// 用户在 EchoFormDialog 写的 anno_source 字符串
const source = `export default {
  kind: 'echo-chant',
  runeId: 'growth',
  render (context) {
    return { type: 'card', icon: 'park', color: '#43A047', ... }
  },
  // handler 是关键：改附近元素的入口
  handler (chantNode, container, meta) {
    const targets = container.querySelectorAll('p, h1, ...')
    targets.forEach(node => node.classList.add('ag-rune-growth-target'))
    return () => targets.forEach(node => node.classList.remove('ag-rune-growth-target'))
  }
}`

// 编译为 JS 对象
const factory = safeEvalFactory(source)
const definition = factory()
```

### 4.3 渲染卡片（renderToHtml）

```javascript
renderToHtml(token, echo) {
  const rendered = this.render(token, echo)
  return `<span class="ag-echo-inline"
            data-echo-inline="true"
            data-echo-name="${echoName}"
            data-echo-id="${echoId}"
            data-echo-value="${value}"
            data-rune-id="${runeMeta?.runeId}"
            data-rune-kind="${runeMeta?.kind}"
            style="--echo-color:${color}">
            <span class="ag-echo-inline__badge">
              <i class="material-icons">${icon}</i>
              <span class="ag-echo-inline__title">${title}</span>
            </span>
          </span>`
}
```

### 4.4 handler 派发（afterRender）

```javascript
// EchoRuntime.afterRender(container) 是 echo 改附近元素的入口
afterRender (container, options) {
  // 1. 对每个 echo host 调一次 definition.afterRender（可选）
  echoNodes.forEach(node => {
    const definition = this.compileDefinition(matchedEcho)
    if (typeof definition.afterRender === 'function') {
      cleanup = definition.afterRender(token, node, ancestors)
    }
  })

  // 2. 对每个 [data-rune-id] 派发到对应 handler（关键路径）
  const chantNodes = safeQueryAll(container, '[data-rune-id]')
  chantNodes.forEach(node => {
    const meta = { runeId, kind, attrs }
    const handler = this.resolveEchoChantHandler(meta)
    const cleanup = handler.apply(node, container, meta)
    if (typeof cleanup === 'function') {
      this._installed.push({ node, runeId, cleanup })
      node.__agRuneCleanup = cleanup
    }
  })
}
```

### 4.5 handler 解析优先级

```javascript
// EchoRuntime.resolveEchoChantHandler(meta)
resolveEchoChantHandler (meta) {
  const { runeId, kind } = meta

  // 1. 用户动态注册的自定义 handler（按 id 精确匹配）
  if (runeId && this.echoChantHandlers.has(runeId)) {
    return this.echoChantHandlers.get(runeId)
  }

  // 2. 用户动态注册的自定义 handler（按 match 探测）
  for (const handler of this.echoChantHandlers.values()) {
    if (handler.match(meta)) return handler
  }

  // 3. 10 个内置 handler
  const builtIn = findEchoChantHandler(runeId)
  if (builtIn) return builtIn

  // 4. echo-tbd 兜底
  if (kind === 'echo-tbd') return findEchoChantHandler('__echo_chant_tbd__')
  return null
}
```

### 4.6 9 个内置 handler 详解

| handler id | 影响元素 | 主要副作用 | cleanup |
|------------|---------|-----------|---------|
| growth | 同段落 / 块的兄弟节点 | 加 `ag-rune-growth-target` class + `--ag-rune-growth-delay` CSS 变量 | 移除 class |
| shatter | 同段落 echo 节点 | 给其他 echo 加 `data-shatter-disabled` + `ag-rune-shatter-disabled` | 移除属性和 class |
| skywalk | document 根容器 | 加 `data-skywalk-theme` / `data-skywalk-layout` | 移除属性 |
| twinbloom | 当前 block | 克隆当前 block 插入到 prev/next | 移除克隆块 |
| mindsteal | 附近的 rune 节点 | 加 `data-mindsteal-mode` + `animation: none` | 移除属性和样式 |
| lucky | 当前 rune 节点 | 加 `role=button` + click/keydown 事件 | 移除属性 + 解绑事件 |
| scapegoat | 当前 block | 加 `ag-rune-scapegoat-standby` + 监听 `error` / `ag:rune:error` | 移除 class + 解绑监听 |
| calamity | 同段落文字节点 | 给随机文字片段加 `ag-rune-calamity-gothic` | 移除 class |
| disperse | 当前 block | 加 `data-disperse-density` | 移除属性 |

> `__echo_chant_tbd__` 是 echo-tbd 的兜底 handler，只给节点加 `ag-echo-tbd-active` class，没有真实副作用。

### 4.7 scope 解析（resolveScopeContainer）

```javascript
const resolveScopeContainer = (chantNode, scope = 'siblings') => {
    const block = chantNode.closest('[data-block-type], .mu-block, p, pre, li, h1~h6, blockquote, table, ul, ol')
    const documentRoot = chantNode.closest('[data-echo-document], .mu-editor, article, [data-doc-id]') || document.body

  switch (String(scope).toLowerCase()) {
    case 'prev-block': {
      let prev = block?.previousElementSibling
      while (prev && !prev.firstElementChild && prev.textContent.trim() === '') {
        prev = prev.previousElementSibling
      }
      return prev || block
    }
    case 'block':      return block
    case 'document':   return documentRoot
    case 'siblings':
    default:           return block?.parentElement || documentRoot
  }
}
```

## 5. 与 Muya 编辑器集成

### 5.1 Muya 拦截 `<div data-rune-name="...">` 标签

Muya 在生成 DOM 时识别 `<div data-rune-name="...">`，把它替换为 `<RunePreviewRenderer>` 组件实例。

### 5.2 Muya 解析 `echo_anno` token

`src/libs/muya/lib/parser/render/renderInlines/echoAnno.js` 在渲染时调用 `EchoRegistry.render(token)` → `EchoRuntime.renderToHtml(token)` → 输出 `<span class="ag-echo-inline">`。

### 5.3 afterRender 触发时机

- 每次 Muya 全量渲染（`render()`）
- 每次局部渲染（`partialRender()`）
- 每次单块渲染（`singleRender()`）

每个入口都会调用 `this.renderRunes()` → `registry.afterRender(container)`。

## 6. 数据回写对比

| | rune（Vue SFC） | echo（@xxx{}()） |
|--|----------------|-----------------|
| **回写入口** | `updateRunePlaceholderValue({runeId, nodeId, value})` | 直接编辑 Markdown 源 |
| **修改位置** | `<div data-rune-node-id="..." data-rune-value="...">innerText` | `@xxx{value: 'new value'}(prompt)` |
| **触发条件** | SFC 内 `$emit('input', value)` | 用户在编辑器里改 |
| **存储同步** | 走 `contentEditor.setMarkdown()`，Muya 重渲染 | 同上，但 echo 是静态卡片，重渲不丢 |

## 7. 表单对话框对比

| | RuneFormDialog.vue | EchoFormDialog.vue |
|--|---------------------|---------------------|
| **编辑字段** | `template`（Vue SFC 字符串） | `anno_source`（JS 对象字面量字符串） |
| **Monaco language** | `html` | `javascript` |
| **模板辅助** | `createBlankTemplate()` 等 | `createDefaultEchoAnnoSource()` 等 |
| **特有功能** | 分类选择 + 远端导入 | 注解语法帮助提示 |
| **编辑的内容** | `<template><script><style>` 三段式 SFC | `export default { kind, render, handler, ... }` |

## 8. 关键常量

```javascript
// EchoRuntime.js
const DEFAULT_ECHO_COLOR = '#26A69A'
const DEFAULT_ECHO_ICON = 'graphic_eq'
const ECHO_PAYLOAD_VERSION = 1

// echo 占位符正则
const CURRENT_ECHO_PLACEHOLDER_RE = /@([^\s{}()@]*)\{([\s\S]*?)\}\(([^)]*)\)/g

// echo kind 集合（重命名后，原 `RUNE_KINDS = new Set(['rune','rune-tbd'])` 已废）
const ECHO_CHANT_KINDS = new Set(['echo-chant', 'echo-tbd'])

// 10 个内置 chant id（注意：这些是 echo 的咏唱卡片，不是 rune）
const BUILTIN_ECHO_CHANT_IDS = [
  'growth', 'shatter', 'skywalk', 'twinbloom',
  'mindsteal', 'lucky', 'scapegoat', 'calamity',
  'disperse', 'clock'
]
```

## 9. 性能优化

1. **definitionCache**：EchoRuntime 缓存编译过的 anno_source（按 echoId）
2. **scopeId 隔离**：每个 rune 用独立 `data-rune-scope-${runeId}` 避免 CSS 污染
3. **cleanupFirst**：Muya 重渲时先调 cleanup 再派发新 handler，避免属性累积
4. **tokenCache**：Muya 的 tokenizer 缓存（无高亮时复用）

## 10. 已知边界情况

1. **twinbloom 幂等**：克隆块用 `data-twinbloom-of` 标记，若已存在则跳过
2. **disperse 累积**：`data-disperse-density` 属性可能覆盖而非累积
3. **mindsteal 冲突**：多个 mindsteal 节点对同一目标操作时，后者覆盖前者
4. **scapegoat 错误捕获**：依赖 `window.error` 和 `ag:rune:error` 自定义事件
5. **clock 单例性**：每个 `@报时()` 实例独立计时，重渲后旧计时器被 cleanup 清理

## 11. 重命名记录（2026-07-15）

将 echo 体系内的 `kind: 'rune'` → `kind: 'echo-chant'`，`kind: 'rune-tbd'` → `kind: 'echo-tbd'`，`RUNE_KINDS` → `ECHO_CHANT_KINDS`，`RUNE_HANDLERS` → `ECHO_CHANT_HANDLERS`，`BUILTIN_ECHO_CARDS` 内 `kind: 'rune'` 们改名为 `kind: 'echo-chant'`，`BUILTIN_RUNE_IDS` → `BUILTIN_ECHO_CHANT_IDS`，`isBuiltinRuneId` → `isBuiltinEchoChantId`，anno_source 函数参数名 `runeNode` → `chantNode`，`resolveRuneHandler` / `findRuneHandler` / `registerRuneHandler` / `unregisterRuneHandler` / `listCustomRuneHandlers` / `extractRuneMeta` 全部改名，全局注册点 `window.__memocastRuneHandlers` → `window.__memocastEchoChantHandlers`，`KIND_ALIASES` / `normalizeKindAlias` / `customHandlers` / `_readRuneAttrs` 等兼容层全部移除（项目未对外发版，不需要保留旧名 fallback）。

理由：
- `RUNE_*` 这个名字过去在 echo 体系里被滥用（`kind`、`RUNE_HANDLERS`、`RUNE_KINDS`、表里属性 `data-rune-id`、`runeNode` 函数参数名、`__memocastRuneHandlers` 全局点），与 rune（Vue SFC 卡片）字面重名，**给人阅读造成严重混淆**。
- `echo-chant`（echo 的咏唱 / 回响触发）+ `echo-tbd` 直接表明它们都属于 echo 体系，与 rune 彻底断开字面联系。
- 维护者后续在做改动时，看到 `echo-*` 就归 echo，看到 `rune-*`（指 `data-rune-name`、`data-rune-id` 等元素标签属性、`Vue.extend` 的构造器、`RuneFormDialog` 表单）才算 rune，两套视觉上一刀切开。
- 项目尚未对外发版，没有历史用户笔记需要兼容，趁机做彻底改名。

> 注意：渲染产物上的 `data-rune-id="growth"` / `data-rune-kind="echo-chant"` 等**DOM 属性名未改名**，因为它们是 markdown 源 ABI，写到了历史笔记里；这是字面值的稳定。Skills 里以后看到 `data-rune-id`，**按值找到的逻辑实体是 echo-chant，不是 rune**。
> 注意：`ag-rune-*` CSS class 名也未改名（视觉样式锚点，避免回归）。

## 12. 何时用 Rune、何时用 Echo（决策树）

```
想让卡片影响其他元素吗？
├── 是 → 用 echo
│         ├── 选 builtin echo / 创建新 echo
│         └── 在 anno_source 的 handler() 里改附近 DOM
└── 否 → 用 rune
          ├── Vue SFC 卡片，自身完整
          └── 通过 $emit('input') 回写到自己的占位符
```

**不要混淆**：
- 用 rune 想做"影响附近元素" → 错。rune 不动兄弟节点。
- 用 echo 想做"自包含 Vue 卡片" → 错。echo 只能输出 `<span class="ag-echo-inline">`，不能挂载 Vue SFC。
