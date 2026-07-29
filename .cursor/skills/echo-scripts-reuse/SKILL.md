# Echo / Boot 脚本复用规范

本项目在 `scripts/` 目录下放置可复用的工具脚本，主要服务于：

1. **Echo（回响）系统**的 IPC payload 契约（见下文"场景 1"）；
2. **`boot/globalGlobals.js` 扫描逻辑的回归验证**（见下文"场景 2"）。

> v2026-07-29 起：所有 `verify-*.js` 已迁入 Jest 29（`tests/` 下），`scripts/` 只保留**打包 / 部署**相关脚本（`after-pack.js`、`blog/`）。测试统一走 `yarn verify`。

---

## 目录结构

```
scripts/
├── tests/                                    # Jest 29 测试用例（v2026-07-29 起，护城河来源）
│   ├── smoke/
│   │   └── vue-mount.test.js                 # Jest + Vue 2.7 + jsdom 工具链烟雾
│   ├── unit/echo/
│   │   ├── jquery-echo-compile.test.js       # 16 张内置 anno_source 顶层结构
│   │   ├── jquery-afterrender.test.js        # handlerBody jQuery 化 + 历史包袱清理
│   │   ├── runtime-props.test.js             # EchoRuntime props / fallback / graceful skip
│   │   ├── schema-formcreate-align.test.js   # propsSchema 贴合 form-create rule
│   │   ├── inherit-from-previous.test.js     # inheritFromPrevious helper 全套语义
│   │   └── main-builtin-echoes.test.js       # renderer → IPC payload 契约（main 镜像 v2026-07-29 删除）
│   ├── unit/rune/
│   │   └── templates.test.js                 # 14 个 rune SFC 模板契约
│   └── unit/boot/
│       ├── enum-boot-smoke.test.js           # $enums 挂载完整性
│       ├── util-boot-smoke.test.js           # $utils 挂载完整性
│       └── enum-util-regex.test.js           # 文件命名规范 regex 自检
├── fixtures/
│   └── jquery-setup.js                       # jQuery 注入到 globalThis
├── jest.config.js                            # Jest 29 配置
├── babel.config.test.js                      # Jest 专用 babel 配置
└── blog/                                     # 博客部署相关脚本
```

> v2026-07-29 起：`scripts/verify-*.js` 已全部删除，所有验证走 `yarn verify`（Jest 29）。

---

## 复用场景与依赖关系

### 场景 1：Renderer → Main IPC payload 契约（v2026-07-29 起取代旧的"双源镜像"）

**目的**：把 renderer 端 `src/components/echo/echoBuiltins/echoBuiltins.js`（16 张内置回响的聚合入口）通过 IPC 直接推到 main 进程，落 DB。

**历史**（v2026-07-29 之前）：renderer 端 ESM 源文件经 `scripts/transform-main-builtin-echoes.js` 转译为 main 端 `src-electron/main-process/service/builtin-echoes.js`（CJS 镜像），main 进程通过 `require('./builtin-echoes').BUILTIN_ECHO_CARDS` 直接读内置 echo 列表。代价：每次改 `echoBuiltins/` 都要记得跑 transform 同步镜像。

**现状**（v2026-07-29 起）：main 端**不再维护** `builtin-echoes.js` 镜像，`scripts/transform-main-builtin-echoes.js` 与 `scripts/verify-main-builtin-echoes.js` 已删除。DB 落库完全由 renderer 通过 IPC payload 推送：

| IPC handler | payload 来源 | 字段含义 |
|---|---|---|
| `db:clearEchoes` | `payload.builtins` = renderer 端 `BUILTIN_ECHO_CARDS` 完整数组 | 重置 DB 内置 echo 行（保留自定义） |
| `db:saveEcho` | `echo` = 单个 echo 对象 | 增/改 echo 行；内置 echo 的 category 直接读 `echo.category`（renderer 真相源） |
| `db:saveEchoes` | `echoes` = echo 对象数组 | 批量增/改 |

**main 端契约**：
- `db:clearEchoes`：`payload.builtins` 必传且为非空数组（缺省 → `{ success: false, code: 'NO_BUILTIN_ECHO_CARDS' }`）。
- `db:saveEcho` / `db:saveEchoes`：内置 echo（id 前缀 `__builtin_`）的 category 直接读 `payload.echo.category`，主进程**不再查内置 meta 表强制覆盖**。`echo.category` 为空时按 id 前缀兜底：`isBuiltin ? 'builtin' : 'marker'`。
- 启动期"内置 echo showy/marker 类纠正"迁移已删除——历史脏数据由 renderer 端 `loadEchoes` 通过 `{ ...template, ...override }` 自然覆盖（DB 行的 category 永远是代码版默认值）。

**Jest 护城河**：`tests/unit/echo/main-builtin-echoes.test.js` 锁住 renderer 端 `BUILTIN_ECHO_CARDS` 具备完整 IPC payload 字段（`id` / `name` / `desc` / `icon` / `color` / `category` / `anno_source` / `isBuiltin` / `metaId`），并校验 `id` 形态（`__builtin_*__`）、`category` enum（`showy` / `builtin`）、`anno_source` 顶层 type 三态合法、`kind` 不再出现、可被 `new Function(prelude + source)` 编译。

### 场景 2：Jest 测试套件的公共逻辑

所有 anno_source 编译套件共享以下模式：

**HANDLER_PRELUDE_SOURCE**：所有 anno_source 编译时注入的公共 helper 函数（从 `src/components/echo/echoAnnoSource.js` 导出）。

```javascript
// 当前实际值（echoAnnoSource.js 导出）
const HANDLER_PRELUDE = "const $ = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null\n"
```

handler body 统一用 jQuery（`$ = window.jQuery`）。Node 端 `$` 退化为 `null`，但 `render(props)` 不依赖 `$`，`afterRender` 报错由 `EchoRuntime._doAfterRender` try-catch 兜住（graceful skip）。

**公共验证逻辑**（Jest 29 套件对应表）：

| 检查项 | main-builtin-echoes | jquery-echo-compile | jquery-afterrender |
|-------|---------------------|---------------------|--------------------|
| anno_source 能被 `new Function()` 编译 | ✅ | ✅ | - |
| 顶层 type 三态合法（echo / echo-chant / echo-tbd） | ✅ | ✅ | - |
| `kind` 字段已合并到 type（不再出现） | ✅ | ✅ | - |
| `render({})` 返回 string | ✅ | ✅ | - |
| `afterRender` 是函数（type=echo-chant 必填） | ✅ | ✅ | - |
| jQuery 化（无 native fallback） | - | - | ✅ |
| afterRender 直接用 `$()` | - | - | ✅ |
| IPC payload 字段完整（id / name / desc / icon / color / category / anno_source / isBuiltin / metaId） | ✅ | - | - |
| `id` 形态：`__builtin_*__` | ✅ | - | - |
| `category` enum：`showy` / `builtin` | ✅ | - | - |

### 场景 3：继承关系验证（`inherit-from-previous.test.js`）

**目的**：验证 EchoRuntime 新增的「上一节点 value 继承」helper 函数。

**测试函数**：

| 函数 | 作用 |
|-----|------|
| `isInheritFromPreviousEnabled(attrs)` | 判断是否开启继承 |
| `echoInheritFromPrevious(attrs)` | 支持 attrs/inheritFromPrevious 多挂载位置 |
| `extractPrevEchoTokenValue(md, targetIdx, opts)` | 从 markdown 提取上一 echo token 的 value |
| `applyInheritedEchoValue(attrs, prevValue)` | 应用继承值到当前 attrs |
| `createEchoPlaceholderPayload(echo, opts)` | 创建开启继承的 echo 占位 payload |

### 场景 4：已删除（v2026-07-28）

主进程不再在启动时自动 sync 内置回响到 DB——用户在「设置 → 重置回响」里点一下走 `db:clearEchoes`。原来的 `seedBuiltinEchoes` 已拆，对应的 `verify-builtin-echo-upsert.js` 也一并删除。

---

## 脚本执行方式

所有脚本从项目根目录执行：

```bash
# 验证（已迁移到 Jest 29）
yarn verify                 # 全部 11 个 suite / 557 个 test
yarn verify:echo            # 6 个 echo suite
yarn verify:rune            # 1 个 rune suite
yarn verify:boot            # 3 个 boot suite
yarn verify:smoke           # 1 个工具链烟雾 suite
yarn jest tests/unit/echo   # 任意子集
```

---

## Boot 扫描正则回归测试

`boot/globalGlobals.js` 当前用 `require.context` 扫描 `src/cloudfns/`，未来也计划扫描 `src/utils/enum/` 和 `src/utils/util/`。**项目文件名约定是小驼峰（camelCase）**，所以任何 `require.context` 的正则必须用 `/^[a-z]\w*Xxx\.js$/`，**不能用** `/[A-Z]\w+Xxx\.js$/`（后者要求首字母大写，会全部漏掉）。

> 历史教训：早期草稿正则 `/[A-Z]\w+Util\.js$/` 配项目 `emptyUtil.js` / `treeUtil.js` 等 camelCase 文件会**一个都匹配不到**，导致 `this.$utils.emptyUtil` 在组件里全是 undefined。这 3 个 jest 用例就是为了"打脸"那个旧正则、固化正确写法而写的。

### `tests/unit/boot/enum-util-regex.test.js`

直接跑 RegExp 打几个文件名，打印 true/false，肉眼对照。

### `tests/unit/boot/enum-boot-smoke.test.js`

扫 `src/utils/enum/` 实际目录：

- 对每个文件跑旧正则 `/[A-Z]\w+Enum\.js$/` 和新正则 `/^[a-z]\w*Enum\.js$/`，打印命中数。
- 期望新正则命中 6 个 enum 文件（`aiAssistantProvider` / `calendarDateBasis` / `cloudSyncProvider` / `noteOrderType` / `runeEchoCategories` / `settingsTab`），不命中 `index.js` / `enumSetup.js` 基础设施。
- 新增 enum 时**只**需要把 `EXPECTED_ENUM_FILES` 同步加 1 即可。

### `tests/unit/boot/util-boot-smoke.test.js`

扫 `src/utils/util/` 实际目录：

- 跑旧/新正则对比。
- 模拟 `buildNameSpacedMap` 把命中文件转成 `$utils.emptyUtil` / `$utils.treeUtil` / `$utils.dateUtil` 这种 namespace map，确认 `NoteItem.vue` 用到的三个 key 都存在。

> **何时跑**：
> - 修改 `boot/globalGlobals.js` 的 require.context 正则时**必须**先跑 `yarn verify:boot`。
> - 在 `src/utils/enum/` 或 `src/utils/util/` 新增/删除/改名文件后跑对应 jest 套件，确认正则仍然覆盖到位。

---

## 路径处理规范

| 脚本位置 | 目标文件 | 路径写法 |
|---------|---------|---------|
| `scripts/` | `src/components/echo/echoBuiltins/` | `path.resolve(__dirname, '../src/components/echo/echoBuiltins')` |
| `scripts/` | `src-electron/main-process/service/` | `path.resolve(__dirname, '../src-electron/main-process/service')` |
| `scripts/` | renderer 端 ESM（动态 import） | `path.resolve('src/components/echo/echoBuiltins/echoBuiltins.js')`（相对项目根） |

---

## 新增脚本规范

1. **必须放在 `scripts/`**（临时调试脚本放 `_temp/`）
2. **必须从项目根目录执行**（不要从子目录执行）
3. **使用 `path.resolve(__dirname, '..')` 计算项目根**
4. **验证脚本必须 `process.exit(1)` 表示失败**
5. **输出格式**：`[OK]` / `[FAIL]` 前缀，便于 CI 解析

---

## 何时跑这些脚本

| 时机 | 跑的脚本 |
|-----|---------|
| 修改 `echoBuiltins/` 子目录的卡片 / 工厂后 | `yarn verify:echo`（Jest 29 直接跑 `main-builtin-echoes.test.js` 校验 IPC payload 契约） |
| 修改 `echoRuntime.js` 后 | `yarn jest tests/unit/echo/inherit-from-previous.test.js` |
| 修改 afterRender 签名后 | `yarn jest tests/unit/echo/jquery-afterrender.test.js` |
| 任何 echo 相关改动的最终验证 | `yarn verify:echo` |
| 修改 `boot/globalGlobals.js` 的 require.context 正则后 | `yarn jest tests/unit/boot/enum-util-regex.test.js` / `enum-boot-smoke.test.js` / `util-boot-smoke.test.js` |
| `src/utils/enum/` 新增/删除/改名 enum 文件后 | `yarn jest tests/unit/boot/enum-boot-smoke.test.js` |
| `src/utils/util/` 新增/删除/改名 util 文件后 | `yarn jest tests/unit/boot/util-boot-smoke.test.js` |
