/**
 * 内置回响共享样板（main 端，CommonJS）
 *
 * ⚠️ 与 renderer 端的 src/components/echo/echoBuiltinsShared.js
 *    保持一致；本文件严禁 require 跨目录文件。
 *
 * ⚠️ main 进程不会执行 anno_source（只把它当字符串塞进 SQLite），
 *    所以本文件仅作为「DB 覆写时的语义镜像」。
 *
 * 提供 16 个内置 echo anno_source 共用的辅助函数源码 + 默认常量。
 */
const banner = (lines) => lines.map(line => `//   ${line}`).join('\n  ')

const DEFAULT_ECHO_COLOR = '#26A69A'
const DEFAULT_ECHO_ICON = 'graphic_eq'

// ---- handlerDoc(docLines) ----
//   输出 afterRender 字段头。
//   调用方写完模仿者逻辑后用 `}` 闭合函数 + `,` 闭合 afterRender 字段。
//   签名：(node, props = {}) -> cleanup|undefined；handler 函数体内统一用 jQuery。
const handlerDoc = (docLines = []) => {
  const b = banner(Array.isArray(docLines) ? docLines : [])
  return `${b}\n  afterRender (node, props = {}) {`
}

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