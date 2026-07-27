// 模拟 builtin-echo-shared.js 的导出
const banner = (lines) => lines.map(line => `//   ${line}`).join('\n  ')

const handlerDoc = (docLines) => `${banner(docLines)}

  handler: function (domElement, ancestors && ancestors.document, node && node.attrsParsed) {
    // 直接用 jQuery 操作 DOM：`

console.log(handlerDoc(['【afterRender】xxx']))
