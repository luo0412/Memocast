# Echo / Boot 脚本复用规范

本项目在 `scripts/` 目录下放置可复用的工具脚本，主要服务于：
1. **Echo（回响）系统**的构建、验证和数据同步（见下文"Echo 相关脚本"）；
2. **`boot/globalGlobals.js` 扫描逻辑的回归验证**（见下文"Boot 扫描正则回归脚本"）。

---

## 目录结构

```
scripts/
├── transform-main-builtin-echoes.js          # renderer → main 端转译（核心）
├── tests/                                    # Jest 29 测试用例（v2026-07-29 起，护城河来源）
│   ├── smoke/
│   │   └── vue-mount.test.js                 # Jest + Vue 2.7 + jsdom 工具链烟雾
│   ├── unit/echo/
│   │   ├── jquery-echo-compile.test.js       # 16 张内置 anno_source 顶层结构
│   │   ├── jquery-afterrender.test.js        # handlerBody jQuery 化 + 历史包袱清理
│   │   ├── runtime-props.test.js             # EchoRuntime props / fallback / graceful skip
│   │   ├── schema-formcreate-align.test.js   # propsSchema 贴合 form-create rule
│   │   ├── inherit-from-previous.test.js     # inheritFromPrevious helper 全套语义
│   │   └── main-builtin-echoes.test.js       # main 端镜像编译 + 与 renderer 一致
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

> **过渡期（v2026-07-29 起 1 周内）**：旧的 `scripts/verify-*.js` 9 个脚本保留，作为参考。1 周后删除。`yarn verify` 当前已直接走 jest。

---

## 复用场景与依赖关系

### 场景 1：Renderer → Main 端同步（最常见）

**目的**：将 renderer 端 `src/components/ui/editor/echo/builtinEchoes.js` 转译为 main 端 `src-electron/main-process/service/builtin-echoes.js`，实现 main 进程也能使用相同的内置回响定义。

**执行链**：

```
scripts/transform-main-builtin-echoes.js
    ↓ 读取 renderer 端 ESM 源码
    ↓ 替换 import → require，export → module.exports
    ↓ 内联 createDefaultEchoAnnoSource 实现
    ↓ 写入 main 端 CJS 文件
```

**转译步骤**：
1. 去掉 ES import（`createDefaultEchoAnnoSource`、`banner`、`handlerExampleDoc` 等）
2. 插入 `require('./builtin-echo-shared')`
3. 内联 `createDefaultEchoAnnoSource` 实现（避免跨目录 require）
4. `export const` → `const`
5. 末尾追加 `module.exports = { BUILTIN_ECHO_CARDS, ... }`

### 场景 2：验证脚本的公共逻辑

所有 `verify-*.js` 脚本共享以下模式：

**HANDLER_PRELUDE_SOURCE**：所有 anno_source 编译时注入的公共 helper 函数。

```javascript
const HANDLER_PRELUDE_SOURCE = [
  "const __safeDollarRuntime = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null",
  "if (!__safeDollarRuntime) console.warn('[EchoRuntime] jQuery is missing')",
  "const $ = __safeDollarRuntime",
  "const __resolveScopeContainer = (node, scope) => { ... }",
  "const __safeQueryAll = (root, sel) => { ... }",
  "const __withAttrs = (meta, defaults) => Object.assign({}, defaults || {}, (meta && meta.attrs) || {})",
  ""
].join('\n')
```

**公共验证逻辑**：

| 检查项 | verify-main | verify-jquery | verify-afterrender |
|-------|------------|---------------|-------------------|
| 编译通过 | ✅ | ✅ | - |
| render() 返回对象 | ✅ | ✅ | - |
| handler/handlerExample 存在 | ✅ | ✅ | - |
| jQuery 化（无 native fallback） | - | ✅ | ✅ |
| afterRender 直接用 `$()` | - | - | ✅ |

### 场景 3：继承关系验证（verify-inherit-from-previous）

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
# 转译 renderer → main
node scripts/transform-main-builtin-echoes.js

# 验证（已迁移到 Jest 29）
yarn verify                 # 全部 11 个 suite / 557 个 test
yarn verify:echo            # 6 个 echo suite
yarn verify:rune            # 1 个 rune suite
yarn verify:boot            # 3 个 boot suite
yarn verify:smoke           # 1 个工具链烟雾 suite
yarn jest tests/unit/echo   # 任意子集
```

---

## Boot 扫描正则回归脚本

`boot/globalGlobals.js` 当前用 `require.context` 扫描 `src/cloudfns/`，未来也计划扫描 `src/utils/enum/` 和 `src/utils/util/`。**项目文件名约定是小驼峰（camelCase）**，所以任何 `require.context` 的正则必须用 `/^[a-z]\w*Xxx\.js$/`，**不能用** `/[A-Z]\w+Xxx\.js$/`（后者要求首字母大写，会全部漏掉）。

> 历史教训：早期草稿正则 `/[A-Z]\w+Util\.js$/` 配项目 `emptyUtil.js` / `treeUtil.js` 等 camelCase 文件会**一个都匹配不到**，导致 `this.$utils.emptyUtil` 在组件里全是 undefined。这三个脚本就是为了"打脸"那个旧正则、固化正确写法而写的。

### `verify-enum-util-regex.js`

直接跑 RegExp 打几个文件名，打印 true/false，肉眼对照。

### `verify-enum-boot-smoke.js`

扫 `src/utils/enum/` 实际目录：

- 对每个文件跑旧正则 `/[A-Z]\w+Enum\.js$/` 和新正则 `/^[a-z]\w*Enum\.js$/`，打印命中数。
- 期望新正则命中 6 个 enum 文件（`aiAssistantProvider` / `calendarDateBasis` / `cloudSyncProvider` / `noteOrderType` / `runeEchoCategories` / `settingsTab`），不命中 `index.js` / `enumSetup.js` 基础设施。
- 新增 enum 时**只**需要把 `EXPECTED_ENUM_FILES` 同步加 1 即可。

### `verify-util-boot-smoke.js`

扫 `src/utils/util/` 实际目录：

- 跑旧/新正则对比。
- 模拟 `buildNameSpacedMap` 把命中文件转成 `$utils.emptyUtil` / `$utils.treeUtil` / `$utils.dateUtil` 这种 namespace map，确认 `NoteItem.vue` 用到的三个 key 都存在。

> **何时跑**：
> - 修改 `boot/globalGlobals.js` 的 require.context 正则时**必须**先跑这 3 个脚本。
> - 在 `src/utils/enum/` 或 `src/utils/util/` 新增/删除/改名文件后跑对应脚本，确认正则仍然覆盖到位。

---

## 路径处理规范

| 脚本位置 | 目标文件 | 路径写法 |
|---------|---------|---------|
| `scripts/` | `src/components/ui/editor/echo/` | `path.resolve(__dirname, '../src/components/ui/editor/echo')` |
| `scripts/` | `src-electron/main-process/service/` | `path.resolve(__dirname, '../src-electron/main-process/service')` |
| `scripts/` | renderer 端 ESM（动态 import） | `path.resolve('src/components/...')`（相对项目根） |

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
| 修改 `echoBuiltins.js` 后 | `transform-main-builtin-echoes.js` → `verify-main-builtin-echoes.js` |
| 修改 `echoRuntime.js` 后 | `verify-inherit-from-previous.js` |
| 修改 afterRender 签名后 | `verify-jquery-afterrender.js` |
| 任何 echo 相关改动的最终验证 | 全部跑一遍 |
| 修改 `boot/globalGlobals.js` 的 require.context 正则后 | `verify-enum-util-regex.js` / `verify-enum-boot-smoke.js` / `verify-util-boot-smoke.js` |
| `src/utils/enum/` 新增/删除/改名 enum 文件后 | `verify-enum-boot-smoke.js` |
| `src/utils/util/` 新增/删除/改名 util 文件后 | `verify-util-boot-smoke.js` |
