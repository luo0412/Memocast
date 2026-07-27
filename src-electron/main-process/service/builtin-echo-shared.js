/**
 * 内置回响共享样板（main 端，CommonJS）
 *
 * ⚠️ 与 renderer 端的 src/components/echo/builtin-echo-shared.js
 *    内容基本保持一致；本文件严禁 require 跨目录文件。
 *
 * ⚠️ 2026-07 jQuery 化改造说明：
 *    - renderer 端已把 helper 全部切到 jQuery（`$(node).closest(...)` 等），
 *      并要求 HANDLER_PRELUDE_SOURCE 注入 `const $ = window.jQuery`。
 *    - main 进程**不会执行** anno_source（只把它当字符串塞进 SQLite），所以
 *      本文件保留原生 DOM 实现，仅作为「DB 覆写时的语义镜像」。如果未来 main
 *      端需要真正 `new Function` 编译 anno_source，必须同步切到 jQuery 版本。
 *
 * 提供 11 个内置 rune anno_source 共用的辅助函数源码 + 默认常量。
 */
const banner = (lines) => lines.map(line => `//   ${line}`).join('\n  ')

const DEFAULT_ECHO_COLOR = '#26A69A'
const DEFAULT_ECHO_ICON = 'graphic_eq'

// ---- handlerDoc(docLines) ----
//   输出 handler 字段头。
//   调用方写完模仿者逻辑后用 `}` 闭合函数 + `,` 闭合 handler 字段。
//   直接用 jQuery：`$(chantNode)` 拿到节点，沿 DOM 随便走即可。
const handlerDoc = (docLines) => `${banner(docLines)}

  handler: function (chantNode, scopeContainer, meta) {
    // 直接用 jQuery 操作 DOM：
    //   $(chantNode).closest('p').addClass('my-style')
    //   $(chantNode).prev().css({ 'background-color': 'red' })
    //   const attrs = meta && meta.attrs || {} // 拿 @xxx{scope:"block"}() 里的 attrs
    //   // 返回一个函数用于解包/还原（cleanup）`

module.exports = {
  banner,
  handlerDoc,
  DEFAULT_ECHO_COLOR,
  DEFAULT_ECHO_ICON,
  SCOPE_TYPES: Object.freeze({
    SIBLINGS: 'siblings',
    PREV_BLOCK: 'prev-block',
    BLOCK: 'block',
    DOCUMENT: 'document'
  })
}