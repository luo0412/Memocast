# Muya SDK 化迁移计�?

> 目标：将 `coolma-muya` 迁移�?`_plugins/muya-sdk`，使其成为纯净�?Markdown 编辑�?SDK

## 当前问题

`coolma-muya` 中混入了 Memocast 业务逻辑，污染了 SDK�?

| 文件 | 混入的业务逻辑 | 迁移目标 |
|-----|--------------|---------|
| `lib/parser/rules.js` | `echo_anno` 解析规则 | 业务层插�?|
| `lib/contentState/enterCtrl.js` | 回车键处�?echo token | 业务层插�?|
| `lib/contentState/backspaceCtrl.js` | 退格键处理 echo token | 业务层插�?|
| `lib/contentState/deleteCtrl.js` | 删除键处�?echo token | 业务层插�?|
| `lib/parser/render/renderInlines/echoAnno.js` | echo 渲染�?| 业务层插�?|
| `lib/parser/render/index.js` | `renderEchoPlaceholders()` | 业务层插�?|
| `lib/ui/quickInsert/` | rune/echo 快速插�?| 业务层插�?|
| `lib/index.js` | `refreshRuneCards()` | 业务层插�?|

## 目标架构

```
_plugins/
├── muya-sdk/                      # 纯净�?Muya SDK
�?  ├── package.json              # 独立项目配置
�?  ├── src/                      # 纯净�?muya 源码
�?  �?  ├── lib/                  # 核心�?
�?  �?  �?  ├── index.js          # 入口（无 refreshRuneCards�?
�?  �?  �?  ├── config.js         # 配置（无 ECHO 相关常量�?
�?  �?  �?  ├── parser/
�?  �?  �?  �?  ├── rules.js      # 纯净版（移除 echo_anno�?
�?  �?  �?  �?  └── render/
�?  �?  �?  �?      ├── index.js  # 纯净版（移除 renderEchoPlaceholders�?
�?  �?  �?  �?      └── renderInlines/
�?  �?  �?  �?          └── (�?echoAnno.js)
�?  �?  �?  ├── contentState/
�?  �?  �?  �?  ├── enterCtrl.js  # 纯净版（移除 echo 处理�?
�?  �?  �?  �?  ├── backspaceCtrl.js  # 纯净�?
�?  �?  �?  �?  └── deleteCtrl.js # 纯净�?
�?  �?  �?  └── ui/
�?  �?  �?      └── quickInsert/  # 纯净版（移除 rune/echo�?
�?  �?  ├── themes/
�?  �?  └── dist/                 # 构建产物
�?  └── README.md
�?
└── muya-business/                 # Memocast 业务层插件（新建�?
    └── src/
        ├── index.js              # 插件入口
        ├── echoParserPlugin.js   # echo_anno 规则插件
        ├── echoRendererPlugin.js # echo 渲染器插�?
        └── echoContentCtrlPlugin.js # 键盘事件插件

src/
└── muya -> ../_plugins/muya-sdk   # 软链接（本地开发）
```

## 迁移步骤

### Phase 1: 创建 muya-sdk 基础结构

1. [ ] 创建 `_plugins/muya-sdk/package.json`
2. [ ] 复制 `coolma-muya/` �?`_plugins/muya-sdk/src/`
3. [ ] 清理 `src/lib/index.js` - 移除 `refreshRuneCards()` 方法
4. [ ] 清理 `src/lib/parser/rules.js` - 移除 `echo_anno` 规则
5. [ ] 清理 `src/lib/parser/render/index.js` - 移除 `renderEchoPlaceholders()`
6. [ ] 清理 `src/lib/parser/render/renderInlines/echoAnno.js` - 删除文件
7. [ ] 清理 `src/lib/contentState/enterCtrl.js` - 移除 echo 处理
8. [ ] 清理 `src/lib/contentState/backspaceCtrl.js` - 移除 echo 处理
9. [ ] 清理 `src/lib/contentState/deleteCtrl.js` - 移除 echo 处理
10. [ ] 清理 `src/lib/ui/quickInsert/` - 移除 rune/echo 相关
11. [ ] 清理 `src/lib/config.js` - 移除 ECHO 相关常量
12. [ ] 创建 `_plugins/muya-sdk/README.md`

### Phase 2: 创建业务层插�?

1. [ ] 创建 `_plugins/muya-business/src/echoParserPlugin.js`
2. [ ] 创建 `_plugins/muya-business/src/echoRendererPlugin.js`
3. [ ] 创建 `_plugins/muya-business/src/echoContentCtrlPlugin.js`
4. [ ] 创建 `_plugins/muya-business/src/index.js`

### Phase 3: 配置软链接和构建

1. [ ] 创建软链�?`coolma-muya` -> `_plugins/muya-sdk`
2. [ ] 更新 `quasar.conf.js` alias 配置
3. [ ] 更新 `src/components/muya/Muya.vue` 使用业务层插�?

### Phase 4: 验证

1. [ ] 运行 `yarn verify` 确保测试通过
2. [ ] 手动测试 echo 功能
3. [ ] 手动测试 rune 功能

## SDK 用户文档模板

```markdown
# Muya SDK 使用指南

## 依赖

- Vue 2.7+
- jQuery (用于 afterRender hooks)

## 快速开�?

```html
<script src="https://cdn.example.com/muya@0.1.x/dist/muya.min.js"></script>
<link rel="stylesheet" href="https://cdn.example.com/muya@0.1.x/themes/default.css">

<div id="editor"></div>

<script>
  const muya = new Muya(document.getElementById('editor'), {
    markdown: '# Hello'
  })
  
  muya.on('change', ({ markdown }) => {
    console.log('content:', markdown)
  })
</script>
```

## 扩展：自定义语法解析

使用 `Muya.use()` 注册解析器插件：

```javascript
import MyParserPlugin from './my-parser-plugin'

Muya.use(MyParserPlugin, {
  // 插件选项
})
```

## 扩展：自定义渲染

使用 `Muya.use()` 注册渲染器插件：

```javascript
import MyRendererPlugin from './my-renderer-plugin'

Muya.use(MyRendererPlugin)
```
```

## 注意事项

1. **软链�?vs CDN**：本地开发用软链接，生产环境�?CDN
2. **jQuery 依赖**：afterRender hooks 依赖 jQuery，请确保页面已引�?
3. **Vue 版本**：SDK 本身不依�?Vue，但使用 jQuery
