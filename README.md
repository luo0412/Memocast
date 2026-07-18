# README

基于memocast，加入自己的笔记习惯进行二创，全程鞭策AI实现(基本已失控！！！)。

# 文件夹模式

<img width="1123" height="748" alt="image" src="https://github.com/user-attachments/assets/ee1ac04d-3eb0-41fe-a58e-b414bf60e5c0" />

# 标签模式

<img width="1123" height="748" alt="image" src="https://github.com/user-attachments/assets/93467559-16bd-48df-b730-9d21541ddb0f" />

# 日历模式

<img width="1123" height="748" alt="image" src="https://github.com/user-attachments/assets/18fd3798-90c6-4205-a20e-5a00b43852d4" />

---

# Muya 编辑器 Echo & Rune 渲染机制深度解析

## 一、架构总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Muya 编辑器渲染架构                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐   │
│   │   Markdown   │ --> │  Block Tree  │ --> │   renderBlock()          │   │
│   │    文本      │     │  (嵌套结构)   │     │   (snabbdom vnode)      │   │
│   └──────────────┘     └──────────────┘     └────────────┬─────────────┘   │
│                                                          │                  │
│                               ┌──────────────────────────┼───────────────┐  │
│                               │                          ▼               │  │
│                               │         ┌─────────────────────────────┐ │  │
│                               │         │  renderLeafBlock()          │ │  │
│                               │         │  - tokenizer() 行内解析     │ │  │
│                               │         │  - renderInlines[] 分发    │ │  │
│                               │         └────────────┬────────────────┘ │  │
│                               │                      │                   │  │
│                               │    ┌─────────────────┼─────────────────┐ │  │
│                               │    │                 │                 │ │  │
│                               │    ▼                 ▼                 ▼ │  │
│                               │  普通 Token      echo_anno          rune_anno │  │
│                               │  (text/strong/...)   Token             Token  │
│                               │    │                 │                 │  │
│                               │    │          ┌──────┴──────┐          │  │
│                               │    │          │             │          │  │
│                               │    │          ▼             ▼          │  │
│                               │    │   ┌──────────┐  ┌──────────┐       │  │
│                               │    │   │echoAnno │  │ runeAnno │       │  │
│                               │    │   │  .js    │  │   .js    │       │  │
│                               │    │   └────┬───┘  └────┬────┘       │  │
│                               │    │        │           │            │  │
│                               │    │        ▼           ▼            │  │
│                               │    │   ┌────────────────────────┐     │  │
│                               │    │   │  生成 span.host        │     │  │
│                               │    │   │  data-echo-* attrs    │     │  │
│                               │    │   └───────────┬────────────┘     │  │
│                               │    │               │                  │  │
│                               │    │               ▼                  │  │
│                               │    │   ┌────────────────────────┐     │  │
│                               │    │   │  snabbdom patch()     │     │  │
│                               │    │   │  真实 DOM 生成        │     │  │
│                               │    │   └───────────┬────────────┘     │  │
│                               │    │               │                  │  │
│                               │    └───────────────┼──────────────────┘  │
│                               │                    │                      │
│                               └────────────────────┼──────────────────────┘
│                                                        │
│                                                        ▼
│                               ┌──────────────────────────────────────────┐
│                               │               renderRunes()                │
│                               │          (兼容入口，内部调用两个独立通道)  │
│                               └────────────────────┬─────────────────────┘
│                                                    │
│                        ┌───────────────────────────┼───────────────────────────┐
│                        │                           │                           │
│                        ▼                           ▼                           ▼
│               ┌────────────────┐         ┌────────────────┐         ┌────────────────┐
│               │ postRender     │         │ postRender     │         │ Echo Runtime  │
│               │ RunePlaceholders│        │ EchoPlaceholders│        │ .afterRender() │
│               │ (Rune 通道)   │         │ (Echo 通道)   │         │ (特效处理)    │
│               └───────┬────────┘         └───────┬────────┘         └────────────────┘
│                       │                           │
│                       │ (enableRuneVueRenderer)   │ (enableEchoVueRenderer)
│                       ▼                           ▼
│               ┌──────────────────────────────────────────────────────────────────┐
│               │                   独立渲染架构                                      │
│               │  ┌─────────────────────┐      ┌─────────────────────┐             │
│               │  │  Rune 通道           │      │  Echo 通道           │             │
│               │  │  - renderRune*()     │      │  - renderEcho*()    │             │
│               │  │  - mountRune*()      │      │  - mountEcho*()     │             │
│               │  │  - cleanupRune*()    │      │  - cleanupEcho*()   │             │
│               │  │  - runePlaceholder*   │      │  - echoPlaceholder* │             │
│               │  │  - runeVmMap          │      │  - echoVmMap        │             │
│               │  │  - runeCacheMap       │      │  - echoCacheMap     │             │
│               │  └─────────────────────┘      └─────────────────────┘             │
│               └──────────────────────────────────────────────────────────────────┘
```

## 二、两套独立渲染通道

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                         Echo 通道 vs Rune 通道（完全独立）                       │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────┐    ┌─────────────────────────────────┐    │
│  │         Echo 回响通道             │    │         Rune 符文通道             │    │
│  ├─────────────────────────────────┤    ├─────────────────────────────────┤    │
│  │                                 │    │                                 │    │
│  │  数据选择器                      │    │  数据选择器                      │    │
│  │  [data-echo-node-id]           │    │  [data-rune-name][data-rune-id] │    │
│  │                                │    │  [data-rune-node-id]           │    │
│  │                                 │    │                                 │    │
│  │  jQuery 模式                    │    │  jQuery 模式                    │    │
│  │  ├─ renderEchoPlaceholders()   │    │  ├─ renderRunePlaceholders()   │    │
│  │  ├─ createEchoPlaceholderMarkup│    │  ├─ createRunePlaceholderMarkup │    │
│  │  └─ cleanupDetachedEcho*()    │    │  └─ cleanupDetachedRune*()    │    │
│  │                                 │    │                                 │    │
│  │  Vue 模式 (可选)                │    │  Vue 模式 (可选)                │    │
│  │  ├─ mountEchoVueHosts()        │    │  ├─ mountRuneVueHosts()        │    │
│  │  ├─ EchoPreviewRenderer        │    │  ├─ RunePreviewRenderer        │    │
│  │  │   (Vue.extend)              │    │  │   (Vue.extend)              │    │
│  │  └─ echoVmMap                 │    │  └─ runeVmMap                 │    │
│  │                                 │    │                                 │    │
│  │  特效处理                       │    │  动态编译                       │    │
│  │  └─ echoRuntime.afterRender()  │    │  └─ createRuneRendererCtor()  │    │
│  │     处理 echo-chant 特效        │    │     动态编译 SFC               │    │
│  │                                 │    │                                 │    │
│  │  入口方法                       │    │  入口方法                       │    │
│  │  └─ postRenderEchoPlaceholders │    │  └─ postRenderRunePlaceholders │    │
│  │                                 │    │                                 │    │
│  │  统一入口（兼容）               │    │  统一入口（兼容）               │    │
│  │  └─ renderRunes()             │    │  └─ renderRunes()             │    │
│  │                                 │    │                                 │    │
│  └─────────────────────────────────┘    └─────────────────────────────────┘    │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

## 三、详细渲染流程

### 3.1 Echo 回响通道（独立）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Echo 回响渲染流程（完全独立通道）                           │
└──────────────────────────────────────────────────────────────────────────────┘

  用户输入 @离析{density:'very-loose'}(echo-id-123)
           │
           ▼
  ┌─────────────────┐
  │  tokenizer()   │  解析 echo_anno token
  │  行内解析       │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  echoAnno.js   │  生成带 dataset 的 span host
  │  (renderInlines)│
  └────────┬────────┘
           │
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  <span class="ag-echo-anno-token"                                   │
  │        data-echo-node-id="echo-xxx-..."                             │
  │        data-echo-name="离析"                                         │
  │        data-echo-value="..."                                        │
  │        data-echo-attrs-json='{"density":"very-loose",...}'          │
  │        contenteditable="false">                                     │
  └──────────────────────────────────────────────────────────────────────┘
           │
           ▼ (snabbdom patch)
  ┌─────────────────┐
  │   真实 DOM      │
  └────────┬────────┘
           │
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                        renderRunes()                                  │
  │                        (兼容入口，内部调用两个通道)                     │
  └────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                  postRenderEchoPlaceholders()                          │
  │                  ────────────────────────────────                      │
  │                                                                      │
  │  1. renderEchoPlaceholders()                                         │
  │     ├─ querySelectorAll('[data-echo-node-id]')                       │
  │     ├─ getEchoMap() 从 echoRegistry 获取定义                         │
  │     ├─ 检查 cacheKey 是否变化                                         │
  │     └─ 判断 isEchoEffect (原 isChantLike)                            │
  │                                                                      │
  │        ┌─────────────────────────┐    ┌────────────────────────────┐   │
  │        │  isEchoEffect = false    │    │  isEchoEffect = true       │   │
  │        │  (普通 echo)             │    │  (echo-chant 类特效)        │   │
  │        │                          │    │                            │   │
  │        │  createEchoPlaceholder   │    │  echoRuntime.renderToHtml()│  │
  │        │  Markup()                │    │  - 生成含 data-rune-* 的   │  │
  │        │  - 静态卡片 HTML         │    │    span                    │  │
  │        │  - CSS 变量着色          │    │                            │  │
  │        │  - inline 布局           │    │  echoRuntime.afterRender() │  │
  │        │                          │    │  - 派发 handler            │  │
  │        └─────────────────────────┘    │  - 修改附近节点 CSS         │  │
  │                                        │  - 动画/边距效果            │  │
  │                                        └────────────────────────────┘   │
  │                                                                      │
  │  2. cleanupDetachedEchoPlaceholders()                                │
  │                                                                      │
  │  3. if (enableEchoVueRenderer) {                                     │
  │       mountEchoVueInstances()   // Vue.extend 模式                   │
  │     } else {                                                         │
  │       cleanupDetachedEchoVms(true)  // 清理 Vue 实例                │
  │     }                                                                │
  └──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Rune 符文通道（独立）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Rune 符文渲染流程（完全独立通道）                           │
└──────────────────────────────────────────────────────────────────────────────┘

  用户输入 #生生不息{value:"..."}(rune-id-456)
           │
           ▼
  ┌─────────────────┐
  │  tokenizer()    │  解析 rune_anno token
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  runeAnno.js    │  生成带 dataset 的 span host
  └────────┬────────┘
           │
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  <span class="ag-rune-anno-token"                                   │
  │        data-rune-name="生生不息"                                     │
  │        data-rune-id="rune-id-456"                                    │
  │        data-rune-node-id="..."                                       │
  │        data-rune-value="..."                                         │
  │        contenteditable="false">                                      │
  └──────────────────────────────────────────────────────────────────────┘
           │
           ▼ (snabbdom patch)
  ┌─────────────────┐
  │   真实 DOM      │
  └────────┬────────┘
           │
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                        renderRunes()                                  │
  └────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                  postRenderRunePlaceholders()                          │
  │                  ────────────────────────────────                      │
  │                                                                      │
  │  1. renderRunePlaceholders()                                        │
  │     ├─ querySelectorAll('[data-rune-name][data-rune-id][data-rune-node-id]')│
  │     ├─ getRuneMap() 从 runeCards 获取定义                           │
  │     └─ createRunePlaceholderMarkup() - 生成临时占位符                 │
  │                                                                      │
  │  2. cleanupDetachedRunePlaceholders()                                │
  │                                                                      │
  │  3. if (enableRuneVueRenderer) {                                     │
  │       mountRuneVueInstances()     // Vue.extend 模式                 │
  │     } else {                                                         │
  │       cleanupDetachedRuneVms(true)  // 清理 Vue 实例                │
  │     }                                                                │
  └────────────────────────────────┬─────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │ enableRuneVueRenderer = true │
                    └──────────────┬──────────────┘
                                   ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                    mountRuneVueHosts()                                │
  │              ───────────────────────────────                          │
  │                                                                      │
  │  ┌────────────────────────────────────────────────────────────────┐ │
  │  │  createRuneRendererCtor(rune)                                  │ │
  │  │  ────────────────────────────────                              │ │
  │  │                                                                 │ │
  │  │  1. normalizeRuneSfc(template)                                  │ │
  │  │  2. evalRuneScript(script)                                    │ │
  │  │  3. compileTemplateToFunctions()                              │ │
  │  │  4. ensureRuneStyle()                                          │ │
  │  │  5. return Vue.extend({...})                                   │ │
  │  └────────────────────────────────────────────────────────────────┘ │
  │                                   │                                   │
  │                                   ▼                                   │
  │  ┌────────────────────────────────────────────────────────────────┐ │
  │  │  new RunePreviewRenderer({ propsData })                        │ │
  │  │  vm.$mount() → host.appendChild(vm.$el)                        │ │
  │  │  runeVmMap.set(nodeId, vm)                                    │ │
  │  └────────────────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────────┘
```

## 四、命名规范（完全独立）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           命名对比                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────┐    ┌─────────────────────────┐                │
│  │      Echo 回响           │    │      Rune 符文           │                │
│  ├─────────────────────────┤    ├─────────────────────────┤                │
│  │                         │    │                         │                │
│  │  数据属性                 │    │  数据属性                 │                │
│  │  ├─ data-echo-*         │    │  ├─ data-rune-*         │                │
│  │  ├─ echoName            │    │  ├─ runeName            │                │
│  │  ├─ echoId              │    │  ├─ runeId              │                │
│  │  └─ echoValue           │    │  └─ runeValue           │                │
│  │                         │    │                         │                │
│  │  方法命名                │    │  方法命名                │                │
│  │  ├─ renderEcho*        │    │  ├─ renderRune*        │                │
│  │  ├─ mountEcho*         │    │  ├─ mountRune*         │                │
│  │  ├─ cleanupEcho*       │    │  ├─ cleanupRune*       │                │
│  │  └─ postRenderEcho*    │    │  └─ postRenderRune*    │                │
│  │                         │    │                         │                │
│  │  缓存 Map               │    │  缓存 Map               │                │
│  │  ├─ echoPlaceholderCache│   │  ├─ runePlaceholderCache│                │
│  │  └─ echoVmMap          │    │  └─ runeVmMap          │                │
│  │                         │    │                         │                │
│  │  选项                   │    │  选项                   │                │
│  │  ├─ echoRuntime        │    │  ├─ runeRendererCtor    │                │
│  │  ├─ echoRegistry       │    │  └─ runeCards           │                │
│  │  ├─ echoCards          │    │                         │                │
│  │  └─ enableEchoVueRenderer│  │  └─ enableRuneVueRenderer│                │
│  │                         │    │                         │                │
│  │  CSS 类名               │    │  CSS 类名               │                │
│  │  ├─ ag-echo-*          │    │  ├─ ag-rune-*          │                │
│  │  └─ ECHO_HOST_CLASS     │    │  └─ RUNE_HOST_CLASS    │                │
│  │                         │    │                         │                │
│  └─────────────────────────┘    └─────────────────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 五、调用链路

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         renderRunes() 调用链路                               │
└─────────────────────────────────────────────────────────────────────────────┘

  render()          ── 全量渲染 ──► renderRunes()
       │                              │
       │                              ├── postRenderEchoPlaceholders()
       │                              │      ├─ renderEchoPlaceholders()
       │                              │      ├─ cleanupDetachedEchoPlaceholders()
       │                              │      └─ (enableEchoVueRenderer ?)
       │                              │             mountEchoVueInstances() : cleanup
       │                              │
       │                              └── postRenderRunePlaceholders()
       │                                     ├─ renderRunePlaceholders()
       │                                     ├─ cleanupDetachedRunePlaceholders()
       │                                     └─ (enableRuneVueRenderer ?)
       │                                            mountRuneVueInstances() : cleanup
       │
       ▼
  partialRender()   ── 局部渲染 ──► renderRunes() ✓
       │
       ▼
  singleRender()   ── 单块渲染 ──► renderRunes() ✓


  渲染模式选择:
  ─────────────────

  if (needsFullRefresh)      → render()
  else if (changedBlocks)    → partialRender()
  else                       → singleRender()

  // render() / partialRender() / singleRender() 都调用 renderRunes()
  // renderRunes() 依次调用两个独立通道
```

## 六、关键代码位置

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           关键文件索引                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  src/libs/muya/lib/parser/render/index.js      ← StateRender 主类           │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│  Echo 回响通道（完全独立）                                                   │
│  ════════════════════════════════════════════════════════════════════════  │
│  ├─ getEchoMap()                          ← 获取 Echo 定义                 │
│  ├─ createEchoPlaceholderMarkup()         ← 生成静态卡片 HTML              │
│  ├─ renderEchoPlaceholders()              ← jQuery DOM 渲染              │
│  ├─ mountEchoVueHosts()                   ← Vue.extend 渲染               │
│  ├─ cleanupDetachedEchoPlaceholders()     ← 清理已卸载节点               │
│  ├─ cleanupDetachedEchoVms()              ← 清理 Vue 实例               │
│  ├─ postRenderEchoPlaceholders()          ← Echo 通道统一入口           │
│  └─ echoPlaceholderCache, echoVmMap       ← 缓存 Map                     │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│  Rune 符文通道（完全独立）                                                   │
│  ════════════════════════════════════════════════════════════════════════  │
│  ├─ getRuneMap()                          ← 获取 Rune 定义                 │
│  ├─ createRunePlaceholderMarkup()         ← 生成静态卡片 HTML              │
│  ├─ renderRunePlaceholders()              ← jQuery DOM 渲染              │
│  ├─ mountRuneVueHosts()                   ← Vue.extend 渲染               │
│  ├─ cleanupDetachedRunePlaceholders()      ← 清理已卸载节点               │
│  ├─ cleanupDetachedRuneVms()              ← 清理 Vue 实例               │
│  ├─ postRenderRunePlaceholders()          ← Rune 通道统一入口           │
│  └─ runePlaceholderCache, runeVmMap       ← 缓存 Map                     │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│  统一入口（兼容旧名）                                                       │
│  ════════════════════════════════════════════════════════════════════════  │
│  └─ renderRunes()                         ← 依次调用两个独立通道           │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  src/libs/muya/lib/parser/render/renderInlines/echoAnno.js                │
│                                                                             │
│  src/components/ui/editor/Muya.vue                                         │
│  ├─ RunePreviewRenderer = Vue.extend({...})    ← Rune Vue 组件             │
│  ├─ EchoPreviewRenderer = Vue.extend({...})    ← Echo Vue 组件            │
│  └─ createRuneRendererCtor()                ← 动态 SFC 编译             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 七、总结

| 特性 | Echo 回响通道 | Rune 符文通道 |
|------|-------------|-------------|
| **语法** | `@name{value}(id)` | `#rune{value}(id)` |
| **数据选择器** | `[data-echo-node-id]` | `[data-rune-name][data-rune-id][data-rune-node-id]` |
| **jQuery DOM** | `renderEchoPlaceholders()` | `renderRunePlaceholders()` |
| **Vue 模式** | `mountEchoVueHosts()` | `mountRuneVueHosts()` |
| **Vue 选项** | `enableEchoVueRenderer` | `enableRuneVueRenderer` |
| **缓存 Map** | `echoPlaceholderCache`, `echoVmMap` | `runePlaceholderCache`, `runeVmMap` |
| **通道入口** | `postRenderEchoPlaceholders()` | `postRenderRunePlaceholders()` |
| **统一入口** | `renderRunes()` (内部调用两个通道) | `renderRunes()` (内部调用两个通道) |
| **特效处理** | `echoRuntime.afterRender()` | ❌ |
| **动态编译** | ❌ | ✅ `createRuneRendererCtor()` |

**架构原则**：
1. **完全独立**：Echo 和 Rune 是两条独立的渲染通道，互不干扰
2. **命名清晰**：所有方法、变量、选项都以 `echo` 或 `rune` 开头，一目了然
3. **向后兼容**：`renderRunes()` 保持为统一入口，内部调用两个独立通道
4. **按需启用**：Vue 渲染模式通过 `enableEchoVueRenderer` / `enableRuneVueRenderer` 独立控制
