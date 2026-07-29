---
name: echo-rune-current-state
overview: 回响/符文体系的现状索引：数据模型、双轨签名、11 个内置回响/符文、i18n、lucky 入口、设置页接入；以及仍未解决的小问题与可优化点。
todos:
  - id: lucky-diff-preview
    content: lucky 校对后改为「插入 diff + 跳转原位」而非整篇替换
    status: pending
  - id: header-ai-entry
    content: Header.vue 增设 lucky 调用入口（替代或补充 Muya 全局回调）
    status: pending
  - id: tutorial-page-demo
    content: 在 HelpDialog/新教程面板加「回响/符文演示」入口
    status: pending
  - id: transform-ast-extract
    content: ~~scripts/transform-main-builtin-echoes.js 改为 AST 抽取，不再硬编码~~ —— v2026-07-29 已解决（脚本整体删除，main 端不再维护镜像；DB 落库完全由 IPC payload 推送）
    status: done
    note: 解决方案不是 AST 抽取而是删脚本——真相源单一在 renderer 端 echoBuiltins/，main 端 db:clearEchoes / db:saveEcho / db:saveEchoes 直接读 payload。
  - id: rune-vs-echo-i18n
    content: SettingsDialog 在内置面板加 chip「类别: Rune / Echo」
    status: pending
  - id: regression-suite
    content: 把 demo-roadmap 10 条回归用例迁成可执行脚本
    status: pending
  - id: echo-events-vs-window-handlers
    content: 评估 ECHO_EVENTS bus 与 window.__memocastEchoChantHandlers 并存的最终方案
    status: pending
isProject: false
---

# 回响与符文 - 现状与待办（2026-07）

## 0. 现状速览

### 已实装

- **数据模型**：`echoCards[].anno_source` 替代旧 `template`；DB / IPC / store 全部走 `anno_source`。
- **anno 源结构**：默认模板走 `createDefaultEchoAnnoSource(name)`（`EchoRuntime.js`），签名双轨：
  - 旧轨（兼容）：`render(context) → card`
  - 新轨（默认）：`render(node, ancestors) → card` + `afterRender(node, domElement, ancestors)`
  - 运行时按 `definition.render.length === 2` 启发式分派。
- **运行时**：`EchoRuntime`（[src/components/echo/EchoRuntime.js](src/components/echo/EchoRuntime.js)）负责 `compileDefinition` / `render` / `renderToHtml` / `afterRender` 派发与 `echoChantHandlers` 动态注册/注销。
- **注册表**：`EchoRegistry`（[src/components/echo/EchoRegistry.js](src/components/echo/EchoRegistry.js)）维护 `echoIdMap / echoMap`，`refresh(echoCards)` 由设置页保存触发。
- **内置 11 个**：`builtinEchoes.js` 提供 `BUILTIN_ECHO_CARDS`（11 个，其中 10 个 echo-chant + 1 个 echo nice）+ `BUILTIN_ECHO_CHANT_IDS` + `isBuiltinEcho` / `isBuiltinEchoChantId`。
- **设置页**：[src/components/ui/dialog/SettingsDialog.vue](src/components/ui/dialog/SettingsDialog.vue) 内置分类面板已挂 `echoBuiltin*Desc` 描述；普通 echo 可拖拽 / 编辑 / 删除，内置 echo 只读且不可删。
- **表单**：[src/components/ui/dialog/EchoFormDialog.vue](src/components/ui/dialog/EchoFormDialog.vue) 独立于 RuneFormDialog，使用 Monaco 编辑 `anno_source`，重置模板走 `createDefaultEchoAnnoSource`。
- **Muya 集成**：[src/components/ui/editor/Muya.vue](src/components/ui/editor/Muya.vue) 内 quick insert provider 把 rune 项与 echo 项并列；`mounted` 挂 `window.__memocastEchoChantHandlers.lucky`，`beforeDestroy` 清理。
- **lucky 真接 AI**：`builtinEchoes.js` 的 lucky `handler` 调 `window.__memocastEchoChantHandlers.lucky`；`Muya.vue` 的 `handleLuckyChantTrigger` 调 [src/services/AiProofreadService.js](src/services/AiProofreadService.js) 走 Portkey AI；失败走 `aiLuckyNoConfig` / `aiLuckyConfigIncomplete` / `aiLuckyFailed` / `aiLuckyNoChange` 四类通知。
- **scapegoat / calamity**：`builtinEchoes.js` 中两个 rune 的 `handler` 完整实装；前者监听 `window.error`（capture=true）+ `ag:rune:error` 自定义事件，后者按 `intensity` 在 scope 内随机给文本加 `ag-rune-calamity-gothic` 类。
- **i18n 收口**：`runeBuiltin*` 已全部改名为 `echoBuiltin*`（中英各 20 条），`SettingsDialog.vue` 内置卡片已引用 desc。
- **main 端数据流**（v2026-07-29 起）：renderer 端 echoBuiltins/ 是真相源；DB 落库完全由 renderer 通过 IPC payload（`db:clearEchoes` / `db:saveEcho` / `db:saveEchoes`）推送；main 进程不再维护 `builtin-echoes.js` 镜像，相应 `transform-main-builtin-echoes.js` + `verify-main-builtin-echoes.js` 已删除。

### 待办（见文末）

- lucky 校对后**整篇替换** markdown（无 diff 预览、无导航跳转）；
- Header.vue 仍无 AI 校对入口；
- 教程页 demo 入口未做；
- transform / verify 脚本依赖硬编码；
- 中文 i18n 把 rune 与 echo 混用；
- ECHO_EVENTS bus 与 `window.__memocastEchoChantHandlers` 并存，尚未合并。

---

## 1. 架构与代码入口

### 1.1 数据模型 `anno_source`

每个 echo 的核心字段：

| 字段 | 含义 |
|---|---|
| `id` | echo 实例 id；内置形如 `__builtin_nice__` |
| `name` | 对应 `@回响名`，用户唯一标识 |
| `desc / icon / color` | 卡片元数据 |
| `anno_source` | Monaco 编辑的 JS 模块源（`export default {...}`） |
| `render_type` | 首版固定 `anno`，保留扩展位 |
| `isBuiltin` | 内置只读标记 |
| `created_at / updated_at` | 时间戳 |

兼容：旧 `template` 字段读取时若 `anno_source` 为空会自动回退（见 `EchoFormDialog.vue:548`）。

### 1.2 EchoRuntime 双轨签名 + render/afterRender 派发

[src/components/echo/EchoRuntime.js](src/components/echo/EchoRuntime.js) 关键点：

- `compileDefinition(echo)`：用 `safeEvalFactory` 把 `anno_source` 编译成可调用对象；缺 `handler` 时**自动复制** `handlerExample` 为 `handler`（`EchoRuntime.js:913`）。
- `render(token, echo)`：分派 `render.length === 2 ? render(token, ancestors) : render(context)`；若存在 `afterRender` 则把它包成 `afterRenderHook` 注入 `normalized`（`EchoRuntime.js:1007-1030`）。
- `afterRender(container, options)`：遍历 `[data-echo-inline="true"]` 节点派发；按 `render.length === 2` 启发式（`EchoRuntime.js:1104-1121`）。
- `echoChantHandlers`：内置 9 个 + 用户动态注册；`findEchoChantHandler / registerEchoChantHandler / unregisterEchoChantHandler` 提供完整生命周期 API。

### 1.3 EchoRegistry 注册表

[src/components/echo/EchoRegistry.js](src/components/echo/EchoRegistry.js)：

- `refresh(echoCards)` 重建 `echoIdMap / echoMap`。
- `getById / getByName / has / getAll / isBuiltin / canDelete` 为读侧 API。
- `render(token)` / `renderToHtml(token)` 直接转发到 `EchoRuntime`。

### 1.4 Muya 解析与 quick insert

[src/components/ui/editor/Muya.vue](src/components/ui/editor/Muya.vue)：

- `mounted` 钩子里 `quickInsertProvider` 返回两类条目：rune（来自 `runeCards`，label `rune:<id>`）与自定义 echo（来自 `echoCards`，label `echo:<id>`）。
- `mounted` 把 `this.handleLuckyChantTrigger` 挂到 `window.__memocastEchoChantHandlers.lucky`（`Muya.vue:1018`）。
- `beforeDestroy` 删除 `window.__memocastEchoChantHandlers.lucky`（`Muya.vue:1225`）。
- 编辑器容器初始化时调用 `echoRegistry.refresh(echoCards)` + `new EchoRuntime({ registry })`（`Muya.vue:1013-1014`）。

### 1.5 `BUILTIN_ECHO_CARDS` / `BUILTIN_ECHO_CHANT_IDS`

[src/components/echo/builtinEchoes.js](src/components/echo/builtinEchoes.js) 末尾集中导出：

- `BUILTIN_ECHO_CARDS` —— 11 个 frozen 对象：`__builtin_nice__` / `__builtin_growth__` / `__builtin_shatter__` / `__builtin_skywalk__` / `__builtin_twinbloom__` / `__builtin_mindsteal__` / `__builtin_lucky__` / `__builtin_scapegoat__` / `__builtin_calamity__` / `__builtin_disperse__` / `__builtin_clock__`。
- `BUILTIN_ECHO_CHANT_IDS` —— `['growth','shatter','skywalk','twinbloom','mindsteal','lucky','scapegoat','calamity','disperse','clock']`（10 个 runeId）。
- `getDefaultEchoAnnoSource = createDefaultEchoAnnoSource`（**只导出**一份默认源；`builtinEchoes.js` 内的 `createDefaultEchoAnnoSource` 直接转发到 `EchoRuntime` 的同名导出，避免双源漂移）。
- `isBuiltinEcho(echo)` / `isBuiltinEchoChantId(runeId)`。

---

## 2. 11 个内置回响 / 符文 参考

> 实现位置：[src/components/echo/builtinEchoes.js](src/components/echo/builtinEchoes.js)（nice / scapegoat / calamity / clock 等为完整 `handler` 实装；其余为 `handlerExample` 模板，运行时自动复制为 `handler`）。
> 样式位置：`src/css/rune.css` 中 `ag-rune-*` 段。

### 2.1 nice —— echo 默认模板（双轨签名示范）

- **种类**：echo（非 rune），无副作用。
- **用途**：在内容里插入一个绿色「点赞」徽标。
- **关键 attr**：无（纯展示）。
- **开发者要点**：`nice` 的 `anno_source` 即 `createNiceAnnoSource()`，是 `render(node, ancestors) + afterRender(...)` 新签名的演示案例；用户自建 echo 可复制此结构。

### 2.2 growth —— 生生不息

- **作用域**：默认 `siblings`。
- **关键 attr**：`scope`、`target`（CSS 选择器，默认覆盖 `p/pre/h1~h6/li/blockquote/table`）、`trigger`（`auto`=自动 stagger；`manual`=外部触发）。
- **效果**：作用域内命中元素加 `ag-rune-growth-pulse` 类，触发生长动画（透明度 0→1 + Y 轴位移 12px→0，stagger 60ms）。
- **边界**：`target` 写错时静默失败；同段落多个 growth 动画 keyframes 重名，后注册者胜出。

### 2.3 shatter —— 破万法

- **作用域**：默认 `block`。
- **关键 attr**：`scope`、`target`（默认 `line`，单行/单块）、`mode`（`disable` / `hide`）。
- **效果**：作用域内 `data-rune-id` / `data-echo-inline="true"` 节点加 `ag-rune-shatter-disabled`（灰阶 + 不可交互），`mode=hide` 直接 `display: none`。
- **边界**：cleanup 只清 class，不会重新激活其他 rune 的动画；`scope=document` 会让全篇 echo 失效，慎用。

### 2.4 skywalk —— 天行健

- **作用域**：默认 `document`。
- **关键 attr**：`theme`（`light`/`dark`/`sepia`/`auto`，默认 `auto`）、`layout`（`enhanced` 默认）。
- **效果**：在编辑器根容器上加 `data-skywalk-theme` / `data-skywalk-layout` dataset，触发 CSS 主题切换。
- **边界**：与 SettingsDialog 主题设置可能冲突；cleanup 恢复原 dataset。

### 2.5 twinbloom —— 双生花

- **作用域**：默认 `prev-block`。
- **关键 attr**：`source`（`prev-block` / `next-block` / `current`）、`placeholder`（默认「双生节点」）。
- **效果**：把 source 对应 block 克隆成占位副本插入到 twinbloom 节点之后；带 `ag-rune-twinbloom-clone` 类 + 粉紫虚线 outline。
- **边界**：克隆是 placeholder，双击进入编辑态，原块未变；`data-twinbloom-of` sentinel 已实现幂等。

### 2.6 mindsteal —— 夺心魄

- **作用域**：默认 `siblings`。
- **关键 attr**：`mode`（`override`/`stack`/`disable`）、`targets`（runeId 列表，逗号分隔，默认空）。
- **效果**：按 `mode` 篡改命中 rune 的 `data-rune-id` 或叠加动画；`override` 会移除目标 `data-rune-id`（剥夺效果）。
- **边界**：`stack` 在 CSS 层用 `::after` 叠加，不破坏原 handler。

### 2.7 lucky —— 强运

- **作用域**：默认 `block`。
- **关键 attr**：`action`（默认 `ai-proofread`）、`model`（可选，缺省走 SettingsDialog 默认 AI provider）。
- **效果**：点击后 `window.__memocastEchoChantHandlers.lucky({ chantNode, meta, scopeContainer })` → `Muya.vue.handleLuckyChantTrigger` → `AiProofreadService.proofread(markdown, { model })` → 校对结果 setMarkdown 整体替换当前笔记。
- **异常容错**：
  - 无默认 AI provider → `aiLuckyNoConfig` 通知；
  - AI 配置不完整 → `aiLuckyConfigIncomplete` 通知 + missingFields 列表；
  - 网络错误 → `aiLuckyFailed: <msg>` 通知；
  - 校对结果与原文相同 → `aiLuckyNoChange` 通知。
- **边界**：当前是**整篇替换**而非 diff 插入（见文末待办 `lucky-diff-preview`）。

### 2.8 scapegoat —— 替罪

- **作用域**：默认 `block`。
- **关键 attr**：`scope`、`intensity`（0=standby 黄边 + 🛡️ 救场位标签；>0=injured 红边 + ⚠️ 错误信息，用于模拟已知错误）。
- **效果**：作用域内最近 block 加 `ag-rune-scapegoat-standby`；监听 `window.error`（capture=true）+ `ag:rune:error` 自定义事件；后续抛错时 standby 转 injured，错误信息写入 `data-scapegoat-error` / `data-scapegoat-rune-error`。
- **边界**：监听是 capture=true，所有 `window.error` 都会被接住；多次 scapegoat 不会重复触发 injury（cleanup 时清监听）。

### 2.9 calamity —— 招灾

- **作用域**：默认 `siblings`。
- **关键 attr**：`intensity`（0.05–0.8，默认 0.3，决定随机染彩比例）。
- **效果**：在作用域内 `p/h1~h6/li/blockquote/td/th/dd/dt` 中随机抽 `count = total * intensity` 个元素，加 `ag-rune-calamity-gothic` 类（哥特字体 + 紫红渐变）。
- **边界**：同一段多次招灾结果不叠加（每次 cleanup 各自清自己抽到的元素）。

### 2.10 disperse —— 离析

- **作用域**：默认 `block`。
- **关键 attr**：`density`（`tight`/`normal`/`loose`，默认 `loose`）。
- **效果**：在作用域 block 上写 `data-disperse-density` dataset，CSS 据此调整 letter-spacing / line-height。
- **边界**：与 skywalk 的 `data-skywalk-density` 互斥，后挂的胜出；纯样式切换无动画。

### 2.11 clock —— 报时

- **作用域**：默认 `block`。
- **关键 attr**：`format`（默认 `HH:MM`，支持 `HH:MM:SS` / `YYYY-MM-DD HH:mm` 等任意 `toLocaleString` 格式串）。
- **效果**：在 block 右上角注入 `<div class="ag-rune-clock">HH:MM</div>`，`setInterval` 每分钟刷新；cleanup 调 `clearInterval` + 移除节点。
- **边界**：多个 clock 在同 block 各自独立 timer；切换笔记/编辑器重建时 cleanup 触发，clock 短暂消失属正常。

---

## 3. 设置页 / quick insert / 全局回调 入口

### 3.1 SettingsDialog.vue 内置分类面板

[src/components/ui/dialog/SettingsDialog.vue](src/components/ui/dialog/SettingsDialog.vue) 关键位置：

- 内置分类面板（L1969-1981）按 `id` 映射到 `echoBuiltin*Desc` i18n key，每个内置卡片显示描述。
- 内置 echo 卡片禁用删除（L2024-2027 走 `echoBuiltinCannotDelete` 通知）。
- 普通 echo 卡片可拖拽排序、编辑、删除。

### 3.2 quick insert 两分组

[src/components/ui/editor/Muya.vue](src/components/ui/editor/Muya.vue) 1029-1040：

- `quickInsertProvider` 返回 `[...runeItems, ...echoItems]`。
- rune 项 label 前缀 `rune:`，来自 `runeCards`（旧符文体系，与 echo 并存）；
- echo 项 label 前缀 `echo:`，来自 `echoCards`。
- 选中后通过 `createEchoPlaceholderMarkup` 生成 `@name{...}()` 字符串并 setMarkdown。

### 3.3 Muya.vue 挂载 `window.__memocastEchoChantHandlers.lucky`

> 早期规划文档中误写为「Header.vue 注册 `window.__memocastRuneHandlers.lucky`」。当前实际注册点在 [src/components/ui/editor/Muya.vue](src/components/ui/editor/Muya.vue)：

- **mounted**（1018 行）：`window.__memocastEchoChantHandlers = Object.assign(window.__memocastEchoChantHandlers || {}, { lucky: this.handleLuckyChantTrigger.bind(this) })`。
- **beforeDestroy**（1224-1226）：`delete window.__memocastEchoChantHandlers.lucky`。
- lucky 的 `handler`（`builtinEchoes.js:502-507`）从 `window.__memocastEchoChantHandlers?.lucky` 取回调；未注册时 `console.info('[lucky] no window.__memocastEchoChantHandlers.lucky registered')`。
- 命名空间是 **`__memocastEchoChantHandlers`**（注意是 echo-chant，不是 `__memocastRuneHandlers`）。

---

## 4. 已知问题与待办

| # | 问题 | 来源 | 处理建议 |
|---|---|---|---|
| 1 | lucky 校对后整篇替换 markdown，无 diff 预览 / 无导航跳转 | 早期规划 vs 实际实现 | 改造 `handleLuckyChantTrigger`：先做 markdown diff 再插入 + 高亮 + 跳转（见 todos `lucky-diff-preview`） |
| 2 | Header.vue 无 AI 校对入口 | 早期规划遗漏 | 增设 Header 的 lucky 入口，作为 Muya 全局回调的替代/补充（见 `header-ai-entry`） |
| 3 | 教程页 demo 入口未做 | demo-roadmap 风险表 | HelpDialog 或新教程面板加「回响/符文演示」入口，一键插入示例 markdown（见 `tutorial-page-demo`） |
| 4 | ~~`transform-main-builtin-echoes.js` 硬编码 `createDefaultEchoAnnoSource` 源码字符串~~ | demo-roadmap 风险表 | **已解决**（v2026-07-29 删脚本 + 删 main 镜像；详见 `transform-ast-extract`） |
| 5 | SettingsDialog 中文 i18n 把 rune 与 echo 混用（无类别 chip） | demo-roadmap 风险表 | 在内置面板加 chip「类别：Rune / Echo」（见 `rune-vs-echo-i18n`） |
| 6 | ECHO_EVENTS bus 与 `window.__memocastEchoChantHandlers` 并存 | demo-roadmap 风险表 | 评估两套事件机制统一方案（见 `echo-events-vs-window-handlers`） |
| 7 | 11 个 rune 的回归测试 10 条人工执行，自动化未做 | demo-roadmap 风险表 | 把 10 条用例迁成 `scripts/regression-echo.js`，可重复执行（见 `regression-suite`） |

---

## 5. 参考文件索引

| 模块 | 路径 |
|---|---|
| 运行时（双轨签名 / 派发） | [src/components/echo/EchoRuntime.js](src/components/echo/EchoRuntime.js) |
| 注册表 | [src/components/echo/EchoRegistry.js](src/components/echo/EchoRegistry.js) |
| 11 内置 + 工具 | [src/components/echo/builtinEchoes.js](src/components/echo/builtinEchoes.js) |
| 共享工具 / 模板片段 | [src/components/echo/builtin-echo-shared.js](src/components/echo/builtin-echo-shared.js) |
| 编辑器封装 | [src/components/ui/editor/Muya.vue](src/components/ui/editor/Muya.vue) |
| 回响编辑表单 | [src/components/ui/dialog/EchoFormDialog.vue](src/components/ui/dialog/EchoFormDialog.vue) |
| 设置页入口 | [src/components/ui/dialog/SettingsDialog.vue](src/components/ui/dialog/SettingsDialog.vue) |
| AI 校对服务 | [src/services/AiProofreadService.js](src/services/AiProofreadService.js) |
| i18n 中英 | [src/i18n/zh-cn/components/ui/SettingsDialog.js](src/i18n/zh-cn/components/ui/SettingsDialog.js) / [src/i18n/en-us/components/ui/SettingsDialog.js](src/i18n/en-us/components/ui/SettingsDialog.js) |
| 样式 | `src/css/rune.css`（`ag-rune-*` 段） |
