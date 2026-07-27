const fs = require('fs');
const file = 'e:/work-coolma/coolma/src/components/echo/builtinEchoes.js';
let text = fs.readFileSync(file, 'utf8');

// 找到每个 createXxxAnnoSource 块，把里面的:
//   ${handlerDoc([...])}            ← handlerDoc 注释（用 banner）
//     const attrs = ...              ← handler body（4空格）
//     ...
//   }                                ← handler 函数闭
// 改成
//
//   ${banner([...])}                 ← banner 注释
//   afterRender (node, ...) {        ← afterRender 开头
//     const attrs = ...              ← body 保持 4 空格
//     ...
//   }                                ← 闭

// 简化方式：找到 '  ${handlerDoc(\\[\\[...\\]\\])\\n    (.+?)\\n  }\\n\\}` 这种模式
// 把它替换为 '${banner([...])}\\n  afterRender (node, domElement, ancestors) {\\n    body\\n  }\\n}'

// 用更精确的正则：
const re = /\s*\${handlerDoc\(\[\s*([\s\S]*?)\s*\]\)\}\s*\n\s+(?:afterRender\s*\(node,\s*domElement,\s*ancestors\)\s*\{)?\n?([\s\S]*?)\n\s+\}\n\}/g

let fixed = 0
text = text.replace(re, (m, inner, body) => {
  fixed++
  // body 已经是带 4 空格的（如 '    const attrs = ...'），
  // 但有些行可能 2 空格（如 '  $(node)...'）。统一规范化到 4 空格。
  const bodyLines = body.split('\n').map(line => {
    if (!line.trim()) return ''
    // 把每个非空行的开头空格砍掉，再加上 4 个空格缩进
    return '    ' + line.replace(/^\s*/, '')
  }).filter(Boolean).join('\n')
  // 解析 inner 部分（如 "'line1'," "'line2'"）
  // 用 banner(inner.split(',')) 即可得到 banner 输出
  const cleaned = inner.replace(/\s+/g, ' ').trim()
  return `\n  ${banner(['afterRender'])},\n  afterRender (node, domElement, ancestors) {\n${bodyLines}\n  }\n}`
})

fs.writeFileSync(file, text, 'utf8')
console.log('fixed:', fixed)
