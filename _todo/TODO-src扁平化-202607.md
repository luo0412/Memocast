# Memocast `src/` 与 `src-electron/` 目录扁平化方案（设计稿）

> **起草日期**：2026-07-17
> **状态**：📐 设计稿 / 待决策，未启动编码
> **目标**：在"不改业务代码"前提下，把 `src/` 和 `src-electron/` 的目录层级压平到统一上限；同时把 `@src/libs/muya` 提为独立顶层文件夹。
> **范围**：仅做**路径 / 文件位置**调整，不改 `.vue`、`.js`、`.ts` 文件内部代码逻辑（除 import 路径字符串外）。

---

## 0. 背景与动机

| 现象 | 证据 | 痛点 |
| --- | --- | --- |
| muya 嵌在 `src/libs/` 之下，被业务代码与"运行时依赖"概念混淆 | `src/components/ui/editor/Muya.vue:14` 直接 `import Muya from 'src/libs/muya/lib'` | "libs" 本应放自研工具，但实际塞着整个三方编辑器 |
| muya 子树深度达 5 层 | `src/libs/muya/lib/assets/pngicon/<name>/`（每个图标一个空目录，45 个） | 路径长、`glob`/`fs` 操作极慢，IDE 跳转噪声大 |
| `components/ui/editor/echo/` 4 层 | `src/components/ui/editor/echo/EchoRegistry.js` 等 4 个文件 | 业务子目录嵌套无规则，已经不是"组件库"风格 |
| `i18n` 嵌套到 4 层 | `src/i18n/en-us/components/ui/<file>`、`zh-cn` 同款 | 多语言与组件一一对应，扩展性 OK，但层级和 components 同构 → 一起评估 |
| `main-process` 嵌套到 5 层 | `src-electron/main-process/i18n/src/<lang>/menu/<file>` | 主进程业务按"域→模块→语言→目录"四维分类，长期看新增成本高 |
| `services/cloud` 与 `store/{client,server}` | 现状各自单层 | 不动 |

**核心原则（拟）**：

1. **业务代码 ≤ 3 层**：`src/<域>/<子域>/<文件>` 封顶，再深必须合并 / 重命名。
2. **三方代码（muya）单独提出 `src/`**，不再藏在 `src/libs/` 里。
3. **静态资源（图标 / 字体 / css）按资源类型归口**到 `src/assets/muya-assets/`，不再按业务逻辑挂目录。
4. **路径调整不改业务实现**；只动 `import` 字符串、quasar `boot/` 的别名引用、`webpack` 资源路径。

---

## 1. 当前目录深度实测（2026-07-17）

> 数据来源：`cmd /c "dir <dir> /b /ad /s"`。

### 1.1 `src/`（按顶层 17 个目录分组）

| 顶层目录 | 子目录数 | 最大深度（从 `src/` 起算） | 越界文件 |
| --- | ---: | ---: | --- |
| `assets/` | 0 | 1 | — |
| `boot/` | 0 | 1 | — |
| `components/` | 5 | **4** | `ui/editor/echo/*.js`（4 文件） |
| `constants/` | 0 | 1 | — |
| `contextMenu/` | 4 | 2 | — |
| `css/` | 0 | 1 | — |
| `i18n/` | 9 | **4** | `en-us/components/ui/*`、`zh-cn/components/ui/*` |
| `layouts/` | 0 | 1 | — |
| `libs/` | 91 | **5** | `libs/muya/lib/assets/pngicon/<45>/` |
| `mixins/` | 0 | 1 | — |
| `pages/` | 0 | 1 | — |
| `router/` | 0 | 1 | — |
| `services/` | 1 | 2 | `services/cloud/` |
| `store/` | 2 | 2 | `store/client`、`store/server` |
| `utils/` | 1 | 2 | `utils/storage/` |

> **超限：components、i18n、libs 三个根**。其中 `libs/` 的 5 层是因为 muya 子树，本质上是"三方库"问题，不是业务代码扁平化问题。

### 1.2 `src-electron/`

| 顶层目录 | 子目录数 | 最大深度 | 越界文件 |
| --- | ---: | ---: | --- |
| `main-process/` | 14 | **5** | `main-process/i18n/src/<zh-cn\|en-us>/menu/<file>`（菜单文案） |
| `icons/` | 0 | 1 | — |

> **超限：main-process**。`utlis/`（拼错）一并改名 → `utils/`。

### 1.3 被 import 引用统计（决定改动后扫几处字符串）

| 文件 | 引用 muya 的 import 行数 |
| --- | ---: |
| `src/components/ui/editor/Muya.vue` | 13（含 `lib/`、`themes/`、`ui/<sub>`） |
| `src/components/ui/dialog/PptPreviewDialog.vue` | 1 |
| `src/i18n/en-us/contextMenu/index.js` | 0（上下文菜单，未直接引 muya） |
| `src/i18n/zh-cn/contextMenu/index.js` | 0 |

> **结论：muya 路径替换只在 2 个文件、共 14 行**。其余大规模扫描主要发生在"路径层面"的目录移动上。

---

## 2. 决策项（必须先定，再动手）

> 下面是 4 个**会影响最终目录树形态**的硬决策，请逐项确认。

### 决策 A：muya 提到哪里？

| 方案 | 新路径 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **A1 推荐** | `src/muya/` | 与 `components/`、`pages/` 平级，语义最清晰 | muya 看起来像"业务模块"，需要靠 README / 命名约定约定其为三方 |
| A2 | `src/editor/muya/` | 强调"服务于 editor" | 多一层；且 `editor/` 目前在 `components/ui/editor`，需要同时把业务组件提到 `src/editor/`，否则双轨 |
| A3 | 保留 `src/libs/muya/`，仅清空 `src/libs/` 其它项 | 改动最小 | 与用户原话"单独成一个文件夹"不符，且 `libs/` 仍存在 → 后续又有人塞新三方 |

### 决策 B：muya 内部要不要也展平到 3 层？

> muya 自身 `muya/lib/assets/pngicon/<name>/` 是 5 层；如果按"统一 3 层"硬卡，要做下面其中之一。

| 方案 | 怎么做 | 风险 |
| --- | --- | --- |
| **B1 推荐（暂缓）** | muya 视为"vendor 静态资产"，放到 `src/assets/muya-vendor/` 旁边，**不再要求三层**；只把 muya 从 `libs/` 提出来 | 与用户原话"最多三层"存在张力，需要你确认"三层是否包含 vendor" |
| B2 | 把 `muya/lib/assets/pngicon/<name>/<icon>.png` 拍平为 `muya/assets/pngicon/<name>.png`（变成 3 层，但 pngicon 子目录仍是 1 层多文件） | 需要改 muya 自身代码（PNG 路径拼接方式），破坏"不改代码"前提 |
| B3 | 把 `pngicon/<name>/` 合并为 `pngicon/<name>.png` 同级存放（仍是 4 层） | **依旧违规**，等于没做 |

### 决策 C："最多三层"从哪一级数起？

| 方案 | 含义 |
| --- | --- |
| **C1 推荐** | 从 `src/` 算起：`src/a/b/c/file` 算合规，`src/a/b/c/d/file` 不合规 |
| C2 | 从"该子树的根"算起（muya 自身算根）→ muya 允许 `muya/lib/ui/x/y` 4 层 |

### 决策 D：i18n 与 components 同构嵌套如何处理？

| 方案 | 描述 |
| --- | --- |
| **D1 推荐** | 把 `src/i18n/<lang>/components/ui/*` 全部拍平为 `src/i18n/<lang>/<key>.js`；命名按 `componentName` 索引 |
| D2 | i18n 维持现状，业务 `components/` 压到 3 层即可 |
| D3 | 引入 `src/i18n/<lang>/components.json`（单文件 JSON）替代分散 `.js`；同样只 3 层 |

---

## 3. 拟定方案（按决策 A1 + B1 + C1 + D1 推进时的目录草图）

> ⚠️ 本节**仅在用户拍板决策 A/B/C/D 后**才作为最终落地方案。下面是"如果都选推荐项"的样子。

### 3.1 顶层结构对比

```
【现状】                              【目标】
src/                                  src/
├─ libs/                              ├─ muya/               ← 决策 A1
│  └─ muya/                           │  ├─ lib/
│     ├─ lib/                         │  ├─ themes/
│     └─ themes/                      │  └─ assets/          ← 决策 B1：muya 自带的图标/字体落地
├─ components/                        ├─ components/
│  ├─ common/                         │  ├─ common/
│  ├─ ui/                             │  ├─ ui/               ← 决策 D1 之后只剩 3 层
│  │  ├─ dialog/                      │  │  ├─ dialog/
│  │  └─ editor/                      │  │  └─ editor/
│  │     └─ echo/   ← 4 层            │  │     ├─ EchoRegistry.js       ← 从 echo/ 提到此层
│  │        ├─ EchoRegistry.js        │  │     ├─ EchoRuntime.js
│  │        ├─ EchoRuntime.js         │  │     ├─ builtinEchoes.js
│  │        ├─ builtinEchoes.js       │  │     └─ builtin-echo-shared.js
│  │        └─ builtin-echo-shared.js │  └─ ... (AiDemoDrawer.vue, NoteItem.vue 等)
│  ├─ Header.vue                      ├─ editor/             ← 新顶层模块（可选）
│  ├─ Sidebar.vue                     │  ├─ Muya.vue
│  ├─ NoteList.vue                    │  ├─ Monaco.vue
│  └─ ...                             │  └─ MarkMap.vue
├─ i18n/                              ├─ i18n/
│  ├─ en-us/                          │  ├─ en-us/
│  │  ├─ components/ui/  ← 4 层       │  │  ├─ components/  ← 拍平
│  │  ├─ contextMenu/                 │  │  ├─ contextMenu/
│  │  └─ utils/                       │  │  ├─ utils/
│  └─ zh-cn/                          │  │  └─ ...  (单层 .js)
├─ services/                          ├─ services/
├─ store/                             ├─ store/
├─ utils/                             ├─ utils/
├─ pages/                             ├─ pages/
├─ ...                                └─ ...

src-electron/                         src-electron/
├─ main-process/                      ├─ main-process/
│  ├─ i18n/src/<lang>/menu/  ← 5 层   │  ├─ i18n/
│  │  ├─ zh-cn/menu/<file>.js         │  │  ├─ zh-cn.js   (合并单文件)
│  │  └─ en-us/menu/<file>.js         │  │  └─ en-us.js
│  ├─ menu/{actions,templates}/       │  ├─ menu-actions.js
│  ├─ service/                        │  ├─ service.js (按需拆分)
│  ├─ 3rd-part/                       │  ├─ 3rd-part/
│  ├─ assets/                         │  ├─ assets/
│  ├─ utlis/   ← 拼错                 │  └─ utils/      ← 改名同步
│  └─ ...                             └─ ...
└─ icons/                             └─ icons/
```

### 3.2 components/ 拍平细则

> 仅针对"4 层"违规点；其它保持原状。

| 旧路径 | 新路径 | 备注 |
| --- | --- | --- |
| `components/ui/editor/echo/EchoRegistry.js` | `components/ui/editor/EchoRegistry.js` | 上提 1 层；文件名加 PascalCase 后缀保留 |
| `components/ui/editor/echo/EchoRuntime.js` | `components/ui/editor/EchoRuntime.js` | 同上 |
| `components/ui/editor/echo/builtinEchoes.js` | `components/ui/editor/builtinEchoes.js` | 同上 |
| `components/ui/editor/echo/builtin-echo-shared.js` | `components/ui/editor/builtin-echo-shared.js` | 同上（保留 kebab-case） |
| `components/Header.vue` 等顶层 `.vue` | 不动 | 已在第 2 层 |

> 同时考虑把 `components/ui/editor/{Muya,Monaco,MarkMap}.vue` 上提到新建的 `components/editor/` 下，让"编辑器"成为独立顶层模块。但这会牵涉到所有 `pages/`、`layouts/` 的 import 路径，**取决于决策 A**（如果 muya 也走 `src/editor/muya/`，则业务 editor 应同步迁到 `src/editor/`）。

### 3.3 i18n/ 拍平细则

| 旧路径 | 新路径 | 备注 |
| --- | --- | --- |
| `i18n/en-us/components/ui/Editor.json` 等 | `i18n/en-us/editor.js`（或 `i18n/en-us/components-ui.js`） | 把 `components/ui/` 拍成单文件 |
| `i18n/zh-cn/components/ui/Editor.json` 等 | `i18n/zh-cn/editor.js` | 同上 |
| `i18n/en-us/contextMenu/*` | 不动（已 3 层） | — |
| `i18n/en-us/utils/*` | 不动（已 3 层） | — |

> 拍平后所有语言包在 `src/i18n/<lang>/index.js` 一处 require 即可；不再有深层 `components/ui/` 目录。

### 3.4 muya 迁移细则

```
旧：src/libs/muya/{lib,themes}
新：src/muya/{lib,themes}
```

**唯一需要改的代码**：

```diff
- import Muya from 'src/libs/muya/lib'
- import 'src/libs/muya/themes/default.css'
- import TablePicker from 'src/libs/muya/lib/ui/tablePicker'
- ... (共 12 处)
+ import Muya from 'src/muya/lib'
+ import 'src/muya/themes/default.css'
+ import TablePicker from 'src/muya/lib/ui/tablePicker'
```

> 涉及文件：`src/components/ui/editor/Muya.vue`（13 行）、`src/components/ui/dialog/PptPreviewDialog.vue`（1 行）。

### 3.5 src-electron 拍平细则

| 旧路径 | 新路径 | 备注 |
| --- | --- | --- |
| `main-process/i18n/src/zh-cn/menu/*.js` | `main-process/i18n/zh-cn.js` 单文件 | 合并 menu 文案 + 其它 i18n |
| `main-process/i18n/src/en-us/menu/*.js` | `main-process/i18n/en-us.js` 单文件 | 同上 |
| `main-process/menu/actions/*.js` | `main-process/menu-actions.js`（按需拆为多个同层文件） | 上提 1 层 |
| `main-process/menu/templates/*.js` | `main-process/menu-templates.js` | 同上 |
| `main-process/service/*.js` | `main-process/service.js` 或 `main-process/service/<...>.js` 保持 3 层 | 看实际文件数 |
| `main-process/utlis/` | `main-process/utils/` | **顺手改名**，拼写修正 |

---

## 4. 实施步骤（按推荐决策拟定，未启动）

> 每步都是"git safe"操作。**任何 rm / mv >1 文件前先 `git tag backup-before-flatten-<ts>` 或 `Copy-Item -Recurse` 备份**（参见 `.cursor/rules/safe-shell.mdc`）。

### Phase 1：备份 + 现状冻结

1. `git status` 必须 clean（无未提交改动），或仅有本次新增文件。
2. `git tag backup-before-flatten-20260717-<HHMMSS>`。
3. `cp -a src src.bak.flatten / cp -a src-electron src-electron.bak.flatten`（双保险）。

### Phase 2：muya 迁移（影响面最小，**先做**）

1. 在 `_temp/` 写一个 Node 脚本 `mv-muya.js`，**只用字面路径** `src/libs/muya` → `src/muya`：
   ```js
   // _temp/mv-muya.js
   const fs = require('fs')
   const path = require('path')
   const root = path.resolve(__dirname, '..') // 仓库根
   fs.renameSync(path.join(root, 'src/libs/muya'), path.join(root, 'src/muya'))
   console.log('moved:', 'src/libs/muya → src/muya')
   ```
2. 运行：`node _temp/mv-muya.js`。
3. 全局替换 14 行 import 字符串（`src/libs/muya` → `src/muya`）。
4. `yarn run dev` 或 `yarn run lint` 自检；预期无报错。

### Phase 3：components/echo/ 上提

1. `git mv src/components/ui/editor/echo/*.js src/components/ui/editor/`
2. `rmdir src/components/ui/editor/echo`（空目录）。
3. 改 4 个文件对外 `export` 路径不变（仍在 `src/components/ui/editor/`），因此 import 不用动。

### Phase 4：i18n 拍平

1. 把 `src/i18n/en-us/components/ui/*.js` 合并为 `src/i18n/en-us/components-ui.js`（或 `<key>.js`）。
2. 同步处理 `zh-cn/`。
3. 更新 `src/i18n/<lang>/index.js` 的 require 路径。
4. 检查所有 `this.$t('components.ui.editor.xxx')` 等调用方（搜索 `components.ui.` 字符串）。

### Phase 5：src-electron 拍平

1. `git mv main-process/i18n/src/zh-cn/menu/* main-process/i18n/zh-cn-tmp.js`
2. 合并 menu 文案到一个 `zh-cn.js` / `en-us.js`。
3. `git mv main-process/menu/actions/*.js main-process/` 改名后缀。
4. `git mv main-process/menu/templates/*.js main-process/` 同上。
5. `git mv main-process/utlis main-process/utils`（**注意大小写敏感**：Windows 下首字母大小写改名需要 `git mv -f` 两步）。

### Phase 6：清理 + 验证

1. 删除 `src.bak.flatten/`、`src-electron.bak.flatten/`（**确认 git tag 备份可用**后再删）。
2. `yarn run lint` + `yarn run build` + `yarn run dev` 完整跑一遍。
3. 删除 `_temp/mv-muya.js`。

---

## 5. 风险评估

| 风险 | 概率 | 影响 | 缓解 |
| --- | ---: | --- | --- |
| `git mv` 在 Windows 大小写不敏感下把 `utlis → utils` 改名失败 | 高 | 中 | 用 `git mv -f utlis utils2 && git mv -f utils2 utils` 两步法 |
| muya 内部 `lib/assets/pngicon/<name>/` 内还有非 `.png` 文件被忽略 | 中 | 低 | `Glob **/*` 全文扫一次，确认每个子目录只有图片 |
| i18n 拍平后语言包 merge 冲突（不同 `components/ui/` 下的同 key） | 中 | 中 | 合并前先 `git grep "components.ui\\."` 列出所有 key，再做去重 |
| Editor.vue 改了文件路径后，开发模式 HMR 不刷新 | 低 | 低 | `yarn run dev` 启动时 `--reset` 清缓存 |
| Phase 5 一次性改动太大，导致一次合并冲突爆炸 | 中 | 高 | **强烈建议把 src-electron 单独拆 PR**，与 src/ 分开评审 |
| 备份目录忘记清理，长期占空间 | 低 | 低 | Phase 6 强制清理，并入 CI smoke |

---

## 6. 与其他 TODO 的关系

- **`TODO-总览-202607.md`**：本文件落地后请同步更新 §2.1 "关键代码路径" 表（`src/libs/muya` → `src/muya`、`src/components/ui/editor/echo/` → `src/components/ui/editor/`、`src-electron/main-process/utlis/` → `utils/`）。
- **`TODO-模块联邦组件加载改造-202610.md`**：**未开始**。本扁平化**先于**联邦改造完成（否则联邦边界还没定就要改路径，二次返工）。
- **`TODO-是否升级技术栈-202607.md`** §3 已决策"不升 Vue3"。本扁平化与 Vue 版本无关。
- **`TODO-笔记特色功能借鉴路线-202607.md`**：若其中提到 `src/components/ui/editor/echo/`，同步改路径引用。
- **`.cursor/rules/vue-dialog-component.mdc`**：本扁平化不动弹层组件结构，只动它们所在的目录。

---

## 7. 不做的事（防误伤）

1. **不改任何 `.vue`/`.js`/`.ts` 内部业务逻辑**，除了 import 字符串。
2. **不重构 muya**（muya 是 vendor，只搬位置不改结构，详见决策 B）。
3. **不删除任何历史文件**，除非 `git mv` 之后确认为空目录。
4. **不在 `src-electron/` 里引入新依赖**。
5. **不在 `_todo/` 之外创建文档**（除本文件）。
6. **不在本次合并中夹带业务改动**，遇到 bug 单独开 PR。

---

## 8. TODO Checklist（落地时打勾）

- [ ] **决策 A 拍板**：muya 提到 `src/muya/`
- [ ] **决策 B 拍板**：muya vendor 资源是否豁免三层
- [ ] **决策 C 拍板**：层数从 `src/` 起算还是各子树自算
- [ ] **决策 D 拍板**：i18n 拍平 or 保留
- [ ] Phase 1：备份 + git tag
- [ ] Phase 2：muya 迁移
- [ ] Phase 3：components/echo/ 上提
- [ ] Phase 4：i18n 拍平
- [ ] Phase 5：src-electron 拍平
- [ ] Phase 6：清理 + 验证
- [ ] 同步更新 `TODO-总览-202607.md` §2.1 路径表

---

## 9. 变更日志

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-07-17 | v0.1（草案） | 初稿：实测深度 + 决策项 A/B/C/D + 拟定方案 |