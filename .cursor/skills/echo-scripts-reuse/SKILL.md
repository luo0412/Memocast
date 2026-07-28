# Echo 脚本复用规范

本项目在 `scripts/` 目录下放置可复用的工具脚本，主要服务于 Echo（回响）系统的构建、验证和数据同步。

---

## 目录结构

```
scripts/
├── transform-main-builtin-echoes.js   # renderer → main 端转译（核心）
├── verify-main-builtin-echoes.js      # 验证 main 端 builtin-echoes.js 编译正确性
├── verify-jquery-echo-compile.js      # 验证 renderer 端 builtinEchoes.js 编译正确性
├── verify-jquery-afterrender.js       # 验证 afterRender 使用 jQuery 而非原生 DOM
├── verify-inherit-from-previous.js    # 验证「上一节点 value 继承」helper 正确性
├── verify-builtin-echo-upsert.js      # 验证 electron-main 强制覆盖逻辑正确性
└── blog/                              # 博客部署相关脚本
```

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

### 场景 4：数据库强制覆盖验证（verify-builtin-echo-upsert）

**目的**：验证 electron-main 的 `seedBuiltinEchoes` 逻辑能正确覆盖老数据。

**验证点**：
1. `insertedCount === 0`（全部走 UPDATE 而非 INSERT）
2. `updatedCount === 16`（16 个内置回响全部被覆盖）
3. 所有 `anno_source` 与代码侧一致
4. `created_at` 保留旧值，`updated_at` 刷新为 now
5. 二次覆盖幂等性

---

## 脚本执行方式

所有脚本从项目根目录执行：

```bash
# 转译 renderer → main
node scripts/transform-main-builtin-echoes.js

# 验证
node scripts/verify-main-builtin-echoes.js
node scripts/verify-jquery-echo-compile.js
node scripts/verify-jquery-afterrender.js
node scripts/verify-inherit-from-previous.js
node scripts/verify-builtin-echo-upsert.js
```

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
| 修改 `builtinEchoes.js` 后 | `transform-main-builtin-echoes.js` → `verify-main-builtin-echoes.js` |
| 修改 `EchoRuntime.js` 后 | `verify-inherit-from-previous.js` |
| 修改 afterRender 签名后 | `verify-jquery-afterrender.js` |
| 修改 builtin echo 数量/结构后 | `verify-builtin-echo-upsert.js` |
| 任何 echo 相关改动的最终验证 | 全部跑一遍 |
