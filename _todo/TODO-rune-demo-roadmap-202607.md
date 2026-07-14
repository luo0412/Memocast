---
name: rune-demo-roadmap-202607
overview: 在「收口 4 项」完成后，对 12 个内置回响/符文（11 原有 + nice 已被收纳进 echo）逐一规划「功能特性 + 演示效果」与「开发者文档」。本文件面向开发者。
todos:
  - id: section-nice
    content: nice —— 「点赞标记」的 echo 与 其双重身份（默认模板与 RuneCard）
    status: pending
  - id: section-growth
    content: growth —— 生生不息 的 动画参数、stagger 逻辑、者收出口
    status: pending
  - id: section-shatter
    content: shatter —— 破万法 的 「范围与模式」与 收尾细节
    status: pending
  - id: section-skywalk
    content: skywalk —— 天行健 的主题与排版动态参数
    status: pending
  - id: section-twinbloom
    content: twinbloom —— 双生花 的 「复制源」机制、范围与并发
    status: pending
  - id: section-mindsteal
    content: mindsteal —— 夺心魄 的 stack/override/disable 三种模式
    status: pending
  - id: section-lucky
    content: lucky —— 强运 的 AI 校对业务流、异常容错与交付物
    status: pending
  - id: section-scapegoat
    content: scapegoat —— 替罪 的 错误接住范围与 「故意 injured」模式
    status: pending
  - id: section-calamity
    content: calamity —— 招灾 的 随机参数 完整明织
    status: pending
  - id: section-disperse
    content: disperse —— 离析 的 三档密度与 CSS 变量
    status: pending
  - id: section-clock
    content: clock —— 报时 的 时间源与刷新频率
    status: pending
  - id: section-default
    content: 默认 echo 模板（以 nice 为例）的 双轨签名展示
    status: pending
  - id: section-routing
    content: 「在设置页 / 快速插入 / 教程页」中的接几指许
    status: pending
  - id: section-regression
    content: 回归测试清单（验证 收口 4 项 + 本规划 不造成 regression）
    status: pending
isProject: false
---

# 内置回响/符文 功能与演示效果规划

> **面向对象**：本仓库的开发者 / 新加入的 Rune 模仿者。
> **前提**：上一阶段已完成 4 项收口（i18n 收口 / 双轨签名 / lucky 接 AI / 替罪&招灾 赋语义），
>           所有 12 个内置 都能在 `Muya.vue` + `EchoRuntime.js` + `BUILTIN_ECHO_CARDS` 中加载、解析、调度。
> **目标**：让任何一个新加入的开发者，拿到这份文档 + 一个 `Muya.vue` 调试实例，
>          都能在 5 分钟内试玩 12 个内置并理解其参数与边界条件。

---

## 共同约定

### 怎么插入一个 echo / rune

1. 在 Muya 编辑器中输入 `@` → 弹出 quick insert 面板。
2. 选择 "Runes / 回响" 分类下面的一个条目，编辑器会自动插入形如：
   - `@强运{action: "ai-proofread", model: "gpt-4o-mini"}(一键润色)`
   - `@替罪{intensity: 0, scope: "block"}(救场位)`
3. 按 Esc / 失焦后 Muya 会调用 `runtime.afterRender(...)`，
   该 handler 把副作用施加到作用域内 DOM。

### 11 个 rune 的 ID 与中文名对照

| runeId | 中文名 | kind | 默认 scope | 默认参数 |
|--------|--------|------|-----------|----------|
| `growth` | 生生不息 | rune | siblings | trigger=auto |
| `shatter` | 破万法 | rune | block | mode=disable |
| `skywalk` | 天行健 | rune | document | theme=light |
| `twinbloom` | 双生花 | rune | prev-block | source=lastBlock |
| `mindsteal` | 夺心魄 | rune | siblings | mode=override |
| `lucky` | 强运 | rune | block | action=ai-proofread |
| `scapegoat` | 替罪 | rune | block | intensity=0 |
| `calamity` | 招灾 | rune | siblings | intensity=0.3 |
| `disperse` | 离析 | rune | block | density=loose |
| `clock` | 报时 | rune | block | format=HH:MM |
| `nice` | nice | echo | — | — |

### 在编辑器外触发的演示手段

| 用途 | 命令 |
|------|------|
| 看 `BUILTIN_ECHO_CARDS` 当前内容 | `node -e "console.log(require('./src/components/ui/editor/echo/builtinEchoes.js').BUILTIN_ECHO_CARDS)"`（需先 transpile） |
| 模拟一次 afterRender | `__memocastRuneHandlers.lucky({runeNode: document.querySelector('[data-rune-id="lucky"]'), meta: {attrs:{}}, scopeContainer: document})` |
| 验证 main 端 CJS 一致 | `node scripts/transform-main-builtin-echoes.js && node scripts/verify-main-builtin-echoes.js` |
| 看 11 个 rune 的样式 | `src/css/rune.css` 中 `ag-rune-*` 段 |

---

## nice —— echo 默认模板（双轨签名示范）

### 功能特性

- **种类**：echo（非 rune），无副作用
- **作用**：在内容里插入一个"点赞 / nice"的徽标（图标 thumb_up、绿色 #4CAF50）
- **开发者要点**：`nice` 的 `anno_source` 是用 `createDefaultEchoAnnoSource('nice')` 生成的——即"新模板签名"的演示案例。
- **效果**：编辑器内显示一个 `[nice] nice 标记为赞的内容` 的 card（绿色），文档右侧读到的 markdown 仍是 `@nice{...}(...)` 形式，不被转换为真实 DOM 替换。

### 演示代码

```javascript
import { createDefaultEchoAnnoSource } from '@/components/ui/editor/echo/EchoRuntime'

// 验证默认模板是新签名
const src = createDefaultEchoAnnoSource('nice')
console.log(src)
// 输出：
// export default {
//   kind: 'echo', version: 1, name: 'nice', namespace: '回响',
//   render (node, ancestors) { /* 双参新签名 */ },
//   afterRender (node, domElement, ancestors) { domElement.classList.add('ag-echo-default-mounted') }
// }

// 在编译时通过 render.length === 2 启发式选择调用形式：
// const obj = safeEvalFactory(annoSource)()
// obj.render.length === 2   // → 走 render(node, ancestors) 轨 B
//                            // → 走 render(context)        轨 A
```

### 开发者文档要点

- `namespace: '回响'` 是建议字段，但不影响渲染；以后可用于按命名空间分组。
- `afterRender` 默认仅给宿主加 `ag-echo-default-mounted` 类，便于快速定位 host DOM。
- 用户自建 echo 时，可以参考 nice 的 `anno_source` 然后改 render 返回的 `attrs.icon / attrs.color` 等。

---

## growth —— 生生不息

### 功能特性

- **作用域**：默认 siblings（同一段落的兄弟节点）。
- **作用**：对作用域内 `<p>/<pre>/<h1~h6>/<li>/<blockquote>/<table>` 加 `ag-rune-growth-pulse` CSS 类，触发"生长"动画（透明度 0→1 + Y 轴位移 12px→0，stagger 60ms）。
- **trigger=manual 时**：不自动 stagger，需通过 `bus.$emit('rune:growth:pulse', runeNode)` 外部触发。

### 演示代码

```markdown
- 第一条要点
- 第二条要点
@生生不息{scope: "siblings", trigger: "manual", target: "p, li"}(春风吹又生)
- 第三条要点
- 第四条要点
```

在控制台手动触发：

```javascript
bus.$emit('rune:growth:pulse', document.querySelector('[data-rune-id="growth"]'))
```

### 边界 / 已知坑

- `target` 选择器写错时 handler 静默失败（返回 cleanup=null），不影响后续。
- 同一段落内多个 growth 会叠加 stagger 动画，最后一个胜出（因为动画 keyframes 名相同）。

---

## shatter —— 破万法

### 功能特性

- **作用域**：默认 block。
- **作用**：对作用域内所有 `data-rune-id` / `data-echo-inline="true"` 节点加 `ag-rune-shatter-disabled` 类，使其 `opacity: 0.35; filter: grayscale(80%); pointer-events: none;`。
- **mode=hide**：直接 `display: none`，不保留灰阶痕迹。

### 演示代码

```markdown
> @生生不息{}(这是 inner echo)
>
> @破万法{scope: "block", mode: "disable"}(这条 block 内所有 echo 都失效)
>
> @强运{}(这个 lucky 也被灰掉)
```

### 边界 / 已知坑

- scope=block 时只影响最近 block；scope=document 影响整篇，会让笔记里所有 echo 都失效 —— 给文档顶部的 shatter 一定要明确意图。
- cleanup 时清 class，但 **不会** 触发"重新激活动画"——重入 growth 等需要重新加载或触发 pulse。

---

## skywalk —— 天行健

### 功能特性

- **作用域**：默认 document。
- **作用**：在 `<html>` 上加 `data-skywalk-theme="light|dark|sepia"` 和 `data-skywalk-density="compact|normal|loose"`，触发全局主题切换。
- **属性**：`theme`、`density`。

### 演示代码

```markdown
# 标题
正文内容。
@天行健{theme: "sepia", density: "loose"}(切换到 sepia 主题)
```

刷新笔记后整个编辑器换 sepia 色调；撤销 skywalk 需要删 rune 或手动清 `<html>` 上的 dataset。

### 边界 / 已知坑

- theme=sepia 是浅褐色文本 + 米黄色背景，跟 darkMode 互斥；skywalk 优先级更高。
- cleanup 时移除 dataset，但可能与 SettingsDialog 里的主题设置冲突（下次刷新会被覆盖）。

---

## twinbloom —— 双生花

### 功能特性

- **作用域**：默认 prev-block（克隆上一个 block）。
- **source**：取值 `lastBlock|firstBlock|siblingAbove|siblingBelow`。
- **作用**：把 source 对应的 block 内容作为 placeholder 注入到 twinbloom 节点之后。

### 演示代码

```markdown
> 第一段（被克隆源）
>
> @双生花{source: "lastBlock"}(克隆上一个段落)
>
> 第二段（被克隆源）
```

### 边界 / 已知坑

- 没有 prev-block 时回退到当前 block（`__resolveScopeContainer` 已实现）。
- 克隆是 placeholder——双击会进入编辑态，原块未变。

---

## mindsteal —— 夺心魄

### 功能特性

- **作用域**：默认 siblings。
- **mode**：`override`（覆盖 effect）、`stack`（叠加 effect）、`disable`（禁用 effect）。
- **target**：CSS 选择器，默认 `*`。

### 演示代码

```markdown
- 1
- 2
@夺心魄{mode: "override", target: "li"}(把 li 全部替换为 mindsteal 自身的动画)
```

### 边界 / 已知坑

- `mode=override` 会移除目标节点的 `data-rune-id` 属性（剥夺其它 rune 的效果）。
- `mode=stack` 在 CSS 层用 `::after` 叠加额外动画，不破坏原 handler。

---

## lucky —— 强运

### 功能特性

- **作用域**：默认 block。
- **action**：默认 `ai-proofread`（AI 校对）。
- **model**：可选指定 `gpt-4o-mini` 等模型；不指定则走 SettingsDialog 里的默认 AI provider。
- **流程**：点击 rune → `AiProofreadService.proofread(markdown)` → 用校对结果 setMarkdown 替换当前笔记 → $q.notify 提示。
- **异常容错**：
  - 无默认 AI provider → `aiLuckyNoConfig` 通知，请去设置页配置。
  - AI 配置不完整 → `aiLuckyConfigIncomplete` 通知 + missingFields 列表。
  - 网络错误 → `aiLuckyFailed: <msg>` 通知。
  - 校对结果与原文相同 → `aiLuckyNoChange` 通知。

### 演示代码

```markdown
# 这是一份笔记，里面有几个错别字。
@强运{action: "ai-proofread", model: "gpt-4o-mini"}(一键润色)
```

在浏览器控制台直接触发：

```javascript
window.__memocastRuneHandlers.lucky({
  runeNode: document.querySelector('[data-rune-id="lucky"]'),
  meta: { attrs: { model: 'gpt-4o-mini' } },
  scopeContainer: document
})
```

### 开发者文档要点

- 全局回调在 `Muya.vue` 的 `mounted` 钩子里注册，`beforeDestroy` 清理。
- `AiProofreadService.proofread(markdown)` 是可独立调用的 API：
  ```javascript
  import AiProofreadService from '@/services/AiProofreadService'
  try {
    const { corrected, model } = await AiProofreadService.proofread('# 你号')
    console.log(corrected)
  } catch (err) {
    console.warn(err.code, err.missingFields)
  }
  ```
- prompt 模板见 `AiProofreadService.js` 顶部的 `SYSTEM_PROMPT` / `USER_PROMPT_TEMPLATE`。
- 适配 provider：`PortkeyService.getDefaultConfig()` + `PortkeyService.chat()`，同时支持 portkey 与 openai-compatible。

---

## scapegoat —— 替罪

### 功能特性

- **作用域**：默认 block（把最近 block 标为"救场位"）。
- **intensity=0（默认）**：block 加 `ag-rune-scapegoat-standby`（黄边 + 🛡️ 救场位标签）。
- **intensity>0**：直接加 `ag-rune-scapegoat-injured`（红边 + ⚠️ 错误信息），用于模拟"已知错误"。
- **监听 `window.error` 与 `ag:rune:error`**：后续 rune / DOM 抛错时，standby 转 injured，错误信息写入 `data-scapegoat-error`。

### 演示代码

```markdown
> 重要结论（替罪保护这一段）
>
> @替罪{intensity: 0, scope: "block"}(救场位)
>
> @夺心魄{mode: "override"}(这条若抛出 DOM 异常，会被替罪接住)
```

在控制台抛个错看替罪是否变红：

```javascript
window.dispatchEvent(new ErrorEvent('error', { message: 'fake DOM error for scapegoat' }))
// → 替罪 block 立即变 injured，data-scapegoat-error = "fake DOM error for scapegoat"
```

### 边界 / 已知坑

- 监听是 capture=true，意味着**所有** window.error 都被接住；多次 scapegoat 会重复监听但不会重复触发 injury（cleanup 时清理）。
- `ag:rune:error` 是自定义事件，需要由其它 rune handler 在 catch 块里主动 dispatch：
  ```javascript
  } catch (err) {
    window.dispatchEvent(new CustomEvent('ag:rune:error', { detail: { runeId: 'growth', error: err.message } }))
  }
  ```

---

## calamity —— 招灾

### 功能特性

- **作用域**：默认 siblings。
- **intensity**：0.05–0.8 范围（默认 0.3），决定随机染彩的文字比例。
- **作用**：在作用域内 `p/h1~h6/li/blockquote/td/th/dd/dt` 中随机抽 `count = total * intensity` 个元素，加 `ag-rune-calamity-gothic` class，CSS 实现哥特字体 + 紫红渐变。
- **cleanup**：移除 class。

### 演示代码

```markdown
- 一年之计在于春
- 一日之计在于晨
- @招灾{intensity: 0.5, scope: "siblings"}(一半文字染彩)
- 一切从实际出发
- 实干兴邦空谈误国
```

### 边界 / 已知坑

- 同一段多次招灾 → 多次随机，结果不叠加（每次 cleanup 各自清自己抽到的元素）。
- 选中的元素如果包含 rune 节点会被过滤（避免哥特渲染覆盖 rune 文字）。

---

## disperse —— 离析

### 功能特性

- **作用域**：默认 block。
- **density**：tight|normal|loose（默认 loose）。
- **作用**：在 `<html>` 上加 `data-disperse-density="..."`，CSS 据此调整 letter-spacing 与 line-height。

### 演示代码

```markdown
@离析{density: "loose"}(宽松排版)
正文内容……
@离析{density: "tight"}(回归紧凑)
```

### 边界 / 已知坑

- 与 skywalk 的 `data-skywalk-density` 互斥；后挂的胜出。
- 没有动画，纯样式切换。

---

## clock —— 报时

### 功能特性

- **作用域**：默认 block。
- **format**：默认 `HH:MM`，支持 `HH:MM:SS`、`YYYY-MM-DD HH:mm` 等任意 toLocaleString 格式串。
- **作用**：在 block 右上角注入 `<div class="ag-rune-clock">HH:MM</div>`，每分钟 setInterval 刷新一次。
- **cleanup**：clearInterval + 移除节点。

### 演示代码

```markdown
> @报时{format: "HH:MM:SS"}(实时秒)
> 旁边的笔记内容
```

### 边界 / 已知坑

- 多个 clock 在同一 block 会堆叠（每个独立 timer）。
- 切换笔记 / 编辑时清理；若编辑器重建频繁，clock 可能短暂消失。

---

## 默认 echo 模板（nice 示范）—— 双轨签名

### 旧签名（兼容） `render(context)`

```javascript
export default {
  kind: 'echo', version: 1, name: 'myEcho',
  render (context = {}) {
    return {
      type: 'card',
      icon: (context.attrs && context.attrs.icon) || 'graphic_eq',
      color: (context.attrs && context.attrs.color) || '#26A69A',
      title: (context.attrs && context.attrs.title) || context.echo?.name || 'myEcho',
      description: (context.attrs && context.attrs.desc) || context.echo?.desc || '',
      prompt: context.prompt || '',
      attrs: context.attrs || {},
      html: (context.attrs && context.attrs.html) || ''
    }
  }
}
```

### 新签名 `render(node, ancestors) + afterRender(node, domElement, ancestors)`

```javascript
export default {
  kind: 'echo', version: 1, name: 'myEcho',
  namespace: '回响',
  render (node, ancestors) {
    const attrs = (node && node.attrsParsed) || {}
    const prompt = (node && node.prompt) || ''
    const echoMeta = (ancestors && ancestors.echo) || {}
    return {
      type: 'card',
      icon: attrs.icon || echoMeta.icon || 'graphic_eq',
      color: attrs.color || echoMeta.color || '#26A69A',
      title: attrs.title || echoMeta.name || 'myEcho',
      description: attrs.desc || echoMeta.desc || '',
      prompt, attrs,
      html: attrs.html || ''
    }
  },
  afterRender (node, domElement, ancestors) {
    if (domElement) domElement.classList.add('ag-echo-mine')
  }
}
```

### 运行时如何分发

`EchoRuntime.render(token, echo)` 中：

```javascript
if (definition.render.length === 2) {
  // 新签名
  result = definition.render(token, ancestors)
} else {
  // 旧签名
  result = definition.render(context)
}

if (typeof definition.afterRender === 'function') {
  normalized.afterRenderHook = (domElement) => {
    definition.afterRender(token, domElement, ancestors)
  }
}
```

`afterRender` hook 在 `runtime.afterRender(container)` 中被遍历调用（对每个 `[data-echo-inline="true"]` 节点）。

---

## 「在设置页 / 快速插入 / 教程页」中的接几指许

### 设置页（SettingsDialog.vue）

- "My Echoes" 标签下展示 11 个内置回响，每个 RuneCard 显示 i18n 描述（`echoBuiltin*Desc`）。
- 内置卡片禁止拖拽、删除；普通 echo 卡片可拖拽排序、编辑、删除。

### 快速插入（quickInsert）

- 输入 `@` 触发。
- 11 个 rune 全部出现在第一分组（"Runes / 符文"）。
- 自定义 echo 在第二分组（"My Echoes / 我的回响"）。
- 选中后通过 `createEchoPlaceholderMarkup` 生成 `@runeName{...}()` 字符串并 setMarkdown。

### 教程页（可选，下一阶段再做）

- 在 HelpDialog 或新教程面板里加 "回响/符文 演示" 入口。
- 点击后插入一段示例 markdown（包含 11 个 rune 的常用 attr）到当前笔记。
- 教程页 markdown 模板可以由 AiProofreadService.proofread 校对（dogfooding）。

---

## 回归测试清单（验证收口 4 项 + 本规划不造成 regression）

| # | 测试 | 命令 / 步骤 | 期望 |
|---|------|------------|------|
| 1 | transform + verify | `node scripts/transform-main-builtin-echoes.js && node scripts/verify-main-builtin-echoes.js` | pass=11, fail=0 |
| 2 | 旧 render(context) 仍能跑 | 在自定义 echo 中写 `render(ctx){}`，插入到笔记 | 卡片正常显示 |
| 3 | 新 render(node, ancestors) 能跑 | 用 createDefaultEchoAnnoSource 生成 nice 卡片，插入到笔记 | 卡片正常显示，且 `ag-echo-default-mounted` class 存在 |
| 4 | lucky 触发 AI | 配置 SettingsDialog 中的 AI provider，插入 `@强运{}(一键润色)`，点击 | 通知出现，内容被替换 |
| 5 | lucky 无配置 | 切换到全新环境，插入 `@强运{}(一键润色)`，点击 | `aiLuckyNoConfig` 通知 |
| 6 | scapegoat 监听 window.error | 插入 `@替罪{}(救场位)`，控制台 `throw new Error('test')` | 替罪变 injured，data-scapegoat-error=test |
| 7 | calamity 随机染彩 | 插入 `@招灾{intensity: 0.5}(五折染彩)` | 约一半文字显示哥特彩 |
| 8 | RuneCard i18n 描述 | 切换语言（中/英），打开 SettingsDialog → My Echoes | 描述随语言切换 |
| 9 | `__memocastRuneHandlers` 清理 | 切换笔记（Muya 实例销毁）再切回 | 全局回调仍存在（因为新实例会重新注册） |
| 10 | 关闭再打开笔记 | 笔记内包含 `@双生花@招灾@替罪`，关闭重开 | 三个 rune 都按预期显示 / 触发 |

---

## 风险与未决项

| 风险 | 缓解 |
|------|------|
| transform 脚本仍依赖硬编码 createDefault impl，每次改 EchoRuntime 都要手动同步 | 下一阶段把 transform 脚本改为从 EchoRuntime.js 读取源码字符串后做 AST 抽取 |
| `ag:rune:error` 自定义事件目前没有任何内置 rune 在 catch 里 dispatch | 下一阶段给 `EchoRuntime.afterRender` 的 try-catch 加 dispatch，使 scapegoat 默认就能接住所有 rune 错误 |
| 中文翻译里 "回响种类：rune" 与 "echo" 在 SettingsDialog 混用 | 在 SettingsDialog 内置面板加一个 chip：`类别：Rune` / `类别：Echo` |
| Header.vue 仍持有 ECHO_EVENTS bus 监听，与 Muya 的全局回调并存 | 暂不冲突；如果未来 Header 也想做 lucky，迁移到 Header 注册 |