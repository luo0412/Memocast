// ============================================================================
// 内置回响共享样板（renderer 端）
//
// 提供 15 个 echo-chant 内置 + nice 共用的辅助函数 + 共享代码片段。
// 消除 builtinEchoes.js 里 16 份重复的 banner 注释与 cleanup 写法。
//
// === 主要导出 ===
//   banner(lines)                把多行教学注释格式化进 anno_source 顶部
//   handlerDoc(lines)            输出 handler 字段头（jQuery 函数体）；
//                                不再维护 handlerExample 演示槽。
//   DEFAULT_ECHO_COLOR / ICON    echo 默认颜色 / 图标
//   CURRENT_ECHO_PLACEHOLDER_RE  @name{attrs}(prompt) 当前形态的正则；
//                                attrs 段可选，因此旧式 @name{}() 也匹配得上。
//                                与 parser/rules.js 中 echo_anno 的结构同源。
//
// === anno_source 约定 ===
//   这些函数**字符串化**后塞进 anno_source 用！所以 "banner()" 之类的
//   内部调用都用普通 JS 字符串拼接，不能用 ES module 语法。
//
// === jQuery 集成 ===
//   handler 闭包内由 EchoRuntime 的 HANDLER_PRELUDE_SOURCE 先注入
//   `const $ = window.jQuery`，下面 helper 全部以 jQuery 选择器 API 为前提；
//   调用方拿到的是 jQuery 对象实例，可继续用
//   `.addClass` / `.removeClass` / `.css` / `.attr` / `.on` / `.off` 等。
// ============================================================================

// ---- 单行注释 banner：避免 /* */ 多行注释后直接接 , 触发 "Unexpected token ','" ----
export const banner = (lines) => lines.map(line => `//   ${line}`).join('\n  ')

// ---- 默认图标/颜色 ----
export const DEFAULT_ECHO_COLOR = '#26A69A'
export const DEFAULT_ECHO_ICON = 'graphic_eq'

// 捕获组：[name, attrsRaw, promptRaw]；attrsRaw 可缺省（兼容早期 @name{}() 形态）。
// 单行 prompt（[^)]*）以避免误吞下游 markdown；name 必须 1+ 字符。
export const CURRENT_ECHO_PLACEHOLDER_RE = /@([^\s{}()@]+)(?:\{([\s\S]*?)\})?\(([^)]*)\)/g

// ============================================================================
// handlerDoc(docLines)
//   输出 handler 字段头。
//   调用方写完模仿者逻辑后用 `}` 闭合函数 + `,` 闭合 handler 字段。
//   直接用 jQuery：`$(chantNode)` 拿到节点，沿 DOM 随便走即可。
// ============================================================================
export const handlerDoc = (docLines) => `${banner(docLines)}

  handler: function (chantNode, scopeContainer, meta) {
    // 直接用 jQuery 操作 DOM：
    //   $(chantNode).closest('p').addClass('my-style')
    //   $(chantNode).prev().css({ 'background-color': 'red' })
    //   const attrs = meta && meta.attrs || {} // 拿 @xxx{scope:"block"}() 里的 attrs
    //   // 返回一个函数用于解包/还原（cleanup）`