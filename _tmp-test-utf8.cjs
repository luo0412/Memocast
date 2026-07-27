const fs = require('fs');
const buf = fs.readFileSync('e:/work-coolma/coolma/src/components/echo/builtinEchoes.js')

// 这是个 ES module，不能用 require。改用 --experimental-vm-modules 或直接 esprima 解析
// 简化方式：只检查文件是否包含 export const BUILTIN_ECHO_CARDS 这种字符串

// 用 utf-16le 解码
let text = ''
for (let i = 2; i < buf.length - 1; i += 2) {
  const code = buf[i] | (buf[i + 1] << 8)
  if (code === 0x000A) text += '\n'
  else if (code >= 0x20) text += String.fromCharCode(code)
  else if (code === 0x09) text += '\t'
}

console.log('contains BUILTIN_ECHO_CARDS =', text.includes('BUILTIN_ECHO_CARDS'))
console.log('contains Object.freeze([', text.includes('Object.freeze(['))
console.log('contains export const:', (text.match(/export const/g) || []).length)

// 看末尾
const tail = text.slice(-200)
console.log('tail:')
console.log(tail)
