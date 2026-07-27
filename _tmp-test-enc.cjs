const fs = require('fs');
const { execSync } = require('child_process');

// 把 HEAD 的内容（UTF-8）作为基础，写回工作区（UTF-8）
const headBytes = execSync('git -C "e:/work-coolma/coolma" show HEAD:src/components/echo/builtinEchoes.js', { encoding: 'buffer' })
// 写回 UTF-8（直接 binary write = UTF-8 无 BOM）
fs.writeFileSync('e:/work-coolma/coolma/src/components/echo/builtinEchoes.js', headBytes)
console.log('restored utf-8, bytes:', headBytes.length)
console.log('first 20:', headBytes.slice(0, 20))

// 验证
import('file:///e:/work-coolma/coolma/src/components/echo/builtinEchoes.js').then(m => {
  console.log('exports:', Object.keys(m))
  console.log('cards count:', m.BUILTIN_ECHO_CARDS?.length)
}).catch(e => console.log('IMPORT FAIL:', e.message))