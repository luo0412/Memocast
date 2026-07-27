const fs = require('fs');
const file = 'e:/work-coolma/coolma/src/components/echo/builtinEchoes.js';
let text = fs.readFileSync(file, 'utf8');

// meta && node.attrsParsed  →  node && node.attrsParsed
text = text.replace(/meta && node\.attrsParsed/g, 'node && node.attrsParsed');

// meta, node.attrsParsed  →  node.attrsParsed  （逗号形式）
text = text.replace(/meta, node\.attrsParsed/g, 'node.attrsParsed');

// meta: node.attrsParsed  （对象简写形式）
text = text.replace(/meta: node\.attrsParsed/g, 'node.attrsParsed');

// 残余 meta 引用（按句子级模式清掉）：
//   - "...({domElement, meta, ancestors && ancestors.document})" 等 —— 这些是 banner 注释里讲的签名，
//     改成 (...{domElement, node.attrsParsed, ancestors && ancestors.document})
text = text.replace(/\{domElement, meta, /g, '{domElement, node.attrsParsed, ');
text = text.replace(/\{domElement, meta\}/g, '{domElement, node.attrsParsed}');

// 注释里 "handler(domElement, ancestors && ancestors.document, meta)" → 注释保持简洁
text = text.replace(/handler\(domElement, ancestors && ancestors\.document, meta\)/g, 'afterRender(node, domElement, ancestors)');

fs.writeFileSync(file, text, 'utf8');
console.log('remaining meta refs:', (text.match(/\bmeta\b/g) || []).length);
