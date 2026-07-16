---
name: rune-echo-design
description: Memocast Muya 编辑器中 rune（符文）与 echo（回响）的核心区别。rune = Vue SFC + Vue.extend，是用户自定义的卡片，**不影响其他元素**；echo = @xxx{}(prompt) 占位符，**main 功能是改变附近元素的属性和排版**。遇到 rune、echo、Vue SFC、handler、afterRender、data-rune-name、data-echo-inline、@xxx{}()、kind: rune 等关键词时使用。
---

# Rune 与 Echo 设计分析

## 核心拆分（一句话）

| 名称 | 实现机制 | 占位符 | 主要功能 |
|------|---------|--------|---------|
| **rune（符文）** | Vue SFC + `Vue.extend` | `<div data-rune-name="...">` | 自身就是一个卡片，**不影响其他元素** |
| **echo（回响）** | anno_source + handler 派发 | `@xxx{attrs}(prompt)` | **main 功能是改变附近元素的属性和排版** |

两条管线**完全独立**，不要混用。

## 代码命名上的坑（务必读这段）

代码里曾经有个内部枚举值叫 `kind: 'rune'`（出现在 `builtinEchoes.js` 的 10 个内置 echo 上），名字像 rune 但**它们全是 echo**——属于 echo 体系里"需要 handler 改附近元素"的子分类。该分类在 v2026-07-15（即当前 `package.json` 版本号同步）重命名为 `kind: 'echo-chant'`，代码层面已全部替换为新名，**不再保留 `kind: 'rune'` 兼容分支**。

- `kind: 'echo'` —— 普通 echo（只是静态卡片，handler 不改附近元素），比如 nice
- `kind: 'echo-chant'` —— echo 的咏唱派发分类（有 handler，会改附近元素），比如生生不息、双生花
- `kind: 'echo-tbd'` —— 兜底 echo（占位但还没定义 handler），实现就是 `__echo_chant_tbd__` handler

`ECHO_CHANT_HANDLERS` 数组、`echoChantHandlers` Map、`@xxx{}(prompt)` 占位符、`data-rune-id="growth"` 属性，这些**都属于 echo 体系**，不要被"rune"字样误导。

> **真正走 Vue SFC + Vue.extend 路径的 rune，只有用户通过 RuneFormDialog 自定义的那些**。

## 内置 echo 一览（10 个 echo-chant + 1 个普通 echo）

| 名称 | id | kind | main 功能（影响附近元素的什么） |
|------|-----|------|-------------------------------|
| nice | `nice` | `echo` | 纯标记赞（不改附近元素） |
| 生生不息 | `growth` | `echo-chant` | 给附近段落/块元素加生长动画 + 错峰 delay |
| 破万法 | `shatter` | `echo-chant` | 禁用附近 echo 的作用 |
| 天行健 | `skywalk` | `echo-chant` | 改 document 根容器的主题/排版属性 |
| 双生花 | `twinbloom` | `echo-chant` | 克隆 prev/next block 插入副本 |
| 夺心魄 | `mindsteal` | `echo-chant` | 篡改其他 rune 的 mode/animation |
| 强运 | `lucky` | `echo-chant` | 给节点加 click/keydown 事件触发 AI 校对 |
| 替罪 | `scapegoat` | `echo-chant` | 监听 error，标 standby/injured |
| 招灾 | `calamity` | `echo-chant` | 随机给附近文字片段染哥特彩 |
| 离析 | `disperse` | `echo-chant` | 改 block 的 `data-disperse-density` |
| 报时 | `clock` | `echo-chant` | 在 block 内注入定时更新的时间标签 |

> 它们的 `BUILTIN_ECHO_CARDS` 数组、`@xxx{}(prompt)` 占位符、`data-rune-id` 属性都是 echo 体系。

## 两条管线对比

| 维度 | rune（符文，**用户自定义**） | echo（回响，**包括所有 "echo-chant"**） |
|------|--------------------------|--------------------------------------|
| **存储形态** | `<div data-rune-name="..." data-rune-id="..." data-rune-node-id="..." data-rune-value="...">innerText</div>` | `@echoName{attrs}(prompt)` |
| **解析层** | Muya HTML parser（当作普通 `<div>`） | Muya 自定义 `echo_anno` token |
| **核心技术** | `vue-template-compiler.parseComponent()` + `compileToFunctions()` + `Vue.extend()` | `safeEvalFactory()` 编译 anno_source |
| **渲染产物** | `Vue.extend()` 构造器 → `$mount` 到占位符 | `renderToHtml()` → `<span class="ag-echo-inline">` |
| **副作用机制** | Vue 生命周期（mounted/beforeDestroy）+ SFC 内 `$emit('input')` | `handler(chantNode, scopeContainer, meta) → cleanup` |
| **作用域隔离** | 每个 rune 用独立 `data-rune-scope-${runeId}` 注入到顶层标签 | 全局样式 `ag-echo-inline` |
| **数据回写** | `updateRunePlaceholderValue({runeId, nodeId, value})` 改 Markdown 源里的 `data-rune-value` 和 innerText | echo 内容直接编辑 Markdown 源里的 `@xxx{}()` |
| **典型功能** | 表单输入、图表、复杂交互（el-input、jsxgraph、萤火虫动画） | 改附近元素：动画、布局、克隆、事件响应 |
| **典型示例** | 用户在 RuneFormDialog 创建的 rune | nice、10 个内置 echo-chant、用户用 EchoFormDialog 创建的 echo |

## Rune 路径详解（Vue SFC + Vue.extend）

**主文件**: `src/components/ui/editor/Muya.vue`（第 319-479 行）

### 1. 占位符格式

```html
<div data-rune-name="我的符文"
     data-rune-id="uuid-instance-id"
     data-rune-node-id="rune-uuid-node-id"
     data-rune-value="初始值">
  显示文本
</div>
```

### 2. SFC 编译（`createRuneRendererCtor`）

```javascript
const createRuneRendererCtor = (rune) => {
  // 1. 解析 SFC
  const { template, script, styles } = normalizeRuneSfc(rune.template)
  // vue-template-compiler.parseComponent() 拆出 template/script/styles

  // 2. eval 脚本 → Vue 组件选项
  const componentOptions = evalRuneScript(script)
  // 'export default {...}' → new Function('return {...}')()

  // 3. 编译 template 为 render 函数（注入 scopeId 实现样式隔离）
  const compiled = compileTemplateToFunctions(
    injectScopedAttribute(template, `data-rune-scope-${rune.id}`)
  )

  // 4. 把 style 插入到 <style id="rune-style-${runeId}">
  ensureRuneStyle(`rune-style-${rune.id}`, styles.map(s => s.content).join('\n'))

  // 5. 用 Vue.extend 构造构造器
  return Vue.extend({
    ...componentOptions,
    render: compiled.render,
    staticRenderFns: compiled.staticRenderFns
  })
}
```

### 3. RunePreviewRenderer（外层包裹）

```javascript
const RunePreviewRenderer = Vue.extend({
  props: { runeId, nodeId, rune, value },
  computed: {
    rendererCtor () { return createRuneRendererCtor(this.rune) }
  },
  render (h) {
    // 把 SFC 渲染出来，把 input 事件冒泡给父组件
    return h(this.rendererCtor, {
      props: { runeId, nodeId, rune, value },
      on: {
        input: (raw) => this.onValueChange({
          runeId, nodeId,
          value: raw == null ? '' : String(raw)
        })
      }
    })
  }
})
```

### 4. 数据回写

```javascript
// Muya.vue 第 809-827 行
updateRunePlaceholderValue ({ runeId, nodeId, value }) {
  const markdown = this.contentEditor.getMarkdown()
  // 按 nodeId 精准定位 <div data-rune-node-id="..."> 并替换 value + innerText
  const nextMarkdown = rewriteRunePlaceholderByNodeId(markdown, nodeId, value)
  this.contentEditor.setMarkdown(nextMarkdown, cursor, false)
}
```

## Echo 路径详解（@xxx{}() + handler 改附近元素）

**主文件**: `src/components/ui/editor/echo/EchoRuntime.js`

### 1. 占位符格式

```markdown
@echoName{key1: 'value1', key2: 'value2'}(prompt 内容)
```

### 2. Muya 行内解析

`src/libs/muya/lib/parser/rules.js` 中的 `echo_anno` 规则：

```javascript
echo_anno: /^@([^\s\{\(\)@]+)?(?:\{([\s\S]*?)\})?\(([\s\S]*?)\)$/
```

### 3. EchoRuntime 渲染

```javascript
render (token, echo) {
  const definition = this.compileDefinition(echo)
  // safeEvalFactory(source) → 编译 anno_source 字符串为 JS 对象
  const result = definition.render(context)
  // 输出 { type, icon, color, title, attrs, runeMeta }
  return normalized
}

renderToHtml (token, echo) {
  const rendered = this.render(token, echo)
  return `<span class="ag-echo-inline"
            data-echo-inline="true"
            data-echo-name="${echoName}"
            data-echo-id="${echoId}"
            data-echo-value="${value}"
            data-rune-id="${echoChantMeta?.runeId}"  // 如果是 kind:'echo-chant'
            data-rune-kind="${echoChantMeta?.kind}"
            style="--echo-color:${color}">
            <span class="ag-echo-inline__badge">
              <i class="material-icons">${icon}</i>
              <span class="ag-echo-inline__title">${title}</span>
            </span>
            <span class="ag-echo-inline__body">
              ${descriptionHtml}${promptHtml}${customHtml}
            </span>
          </span>`
}
```

### 4. Handler 派发（echo 的 main 功能：改附近元素）

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
    const cleanup = handler.apply(node, scopeContainer, meta)
    if (typeof cleanup === 'function') {
      this._installed.push({ node, runeId, cleanup })
      node.__agRuneCleanup = cleanup
    }
  })
}
```

### 5. handler 解析优先级

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

  // 3. 内置 ECHO_CHANT_HANDLERS（10 个）
  const builtIn = findEchoChantHandler(runeId)
  if (builtIn) return builtIn

  // 4. echo-tbd 兜底
  if (kind === 'echo-tbd') return findEchoChantHandler('__echo_chant_tbd__')
  return null
}
```

### 6. handler 改附近元素示例

```javascript
// growthHandler：给附近元素加生长动画
apply (chantNode, scopeContainer, meta) {
  const targets = safeQueryAll(scopeContainer, 'p, h1, h2, ..., table')
  targets.forEach((node, index) => {
    addClassOnce(node, 'ag-rune-growth-target')
    node.style.setProperty('--ag-rune-growth-delay', `${index * 120}ms`)
  })
  return () => {
    targets.forEach(node => removeClasses(node, 'ag-rune-growth-target'))
  }
}

// skywalkHandler：改 document 根容器属性
apply (chantNode, scopeContainer, meta) {
  scopeContainer.setAttribute('data-skywalk-theme', attrs.theme)
  scopeContainer.setAttribute('data-skywalk-layout', attrs.layout)
  return () => {
    scopeContainer.removeAttribute('data-skywalk-theme')
    scopeContainer.removeAttribute('data-skywalk-layout')
  }
}

// twinbloomHandler：克隆附近 block
apply (chantNode, scopeContainer, meta) {
  const cloned = block.cloneNode(true)
  block.parentElement.insertBefore(cloned, block.nextSibling)
  return () => cloned.parentElement.removeChild(cloned)
}
```

## scope 作用域系统

handler 影响附近元素的范围（resolveScopeContainer）：

| scope | 含义 |
|-------|------|
| `siblings` | 同段落兄弟节点（默认） |
| `prev-block` | 前一块 block |
| `block` | 当前 block |
| `document` | 整篇文档 |

## 相关文件索引

### Rune 路径（Vue SFC）—— 真正的 rune 在这里

| 文件 | 行号 | 职责 |
|------|------|------|
| `src/components/ui/editor/Muya.vue` | 102-167 | `normalizeRuneSfc` + `injectScopedAttribute` |
| `src/components/ui/editor/Muya.vue` | 319-413 | `createRuneRendererCtor`（Vue.extend 主路径） |
| `src/components/ui/editor/Muya.vue` | 415-479 | `RunePreviewRenderer` 外层包裹 |
| `src/components/ui/editor/Muya.vue` | 809-827 | `updateRunePlaceholderValue` 数据回写 |
| `src/components/ui/editor/Muya.vue` | 220-248 | `migrateLegacyRunePlaceholders` |
| `src/components/ui/dialog/rune-templates.js` | 全文件 | 多个 rune SFC 模板（el-input、jsxgraph、萤火虫等） |
| `src/components/ui/dialog/RuneFormDialog.vue` | 全文件 | rune 创建/编辑表单 |
| `src/components/ui/dialog/RuneCard.vue` | 全文件 | rune 卡片组件 |
| `src/boot/rune-deps.js` | 全文件 | jQuery 全局挂载（用于 rune SFC 内部） |

### Echo 路径（@xxx{}()）—— 包括所有 "echo-chant" 内置

| 文件 | 职责 |
|------|------|
| `src/libs/muya/lib/parser/render/renderInlines/echoAnno.js` | Muya 行内渲染器 |
| `src/components/ui/editor/echo/EchoRegistry.js` | echo 注册表 |
| `src/components/ui/editor/echo/EchoRuntime.js` | anno_source 编译 + handler 派发 + `ECHO_CHANT_HANDLERS` |
| `src/components/ui/editor/echo/builtinEchoes.js` | **11 个内置 echo 定义（含 10 个 kind:'echo-chant' 子分类）** |
| `src/components/ui/editor/echo/builtin-echo-shared.js` | anno_source 共享工具 |
| `src/components/ui/dialog/EchoFormDialog.vue` | echo 创建/编辑表单 |
| `src/constants/runeEchoCategories.js` | 分类定义 |

## 易混淆点（再次强调）

1. **`kind: 'echo-chant'` 不是 rune 类型**——它是 echo 体系内的子分类（"咏唱派发 / 需要 handler 改附近元素"）。所有用 `kind: 'echo-chant'` 的卡片都在 `BUILTIN_ECHO_CARDS` 数组里，都是 echo。
2. **真正的 rune 只有用户自定义的**——通过 `RuneFormDialog` 创建，存 `template`（Vue SFC 字符串）。
3. **handler 概念属于 EchoRuntime**——Vue SFC 的 rune 走 Vue 生命周期（mounted/beforeDestroy），不走 handler。
4. **`data-rune-id` 属性会出现在两种 echo 上**——10 个内置 rune-kind 的渲染产物 `<span>` 上有（`renderToHtml` 里加 `data-rune-id`），用于派发 handler；用户自定义 rune 的 `<div>` 占位符上也有（quickInsert 插入时加），用于找到 Vue 组件构造器。**同名不同义**，根据上下文区分。