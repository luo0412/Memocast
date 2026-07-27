const fs = require('fs');
global.window = {
  jQuery: () => ({ on: () => {}, off: () => {}, css: () => {}, attr: () => {} }),
  __memocastEchoChantHandlers: { lucky: () => {} }
}

const code = fs.readFileSync('e:/work-coolma/coolma/src/components/echo/builtinEchoes.js', 'utf8')

const banner = (lines) => lines.map(l => `//   ${l}`).join('\n  ')
const handlerDoc = () => ''

const fnStart = code.indexOf('const createLuckyAnnoSource')
const btStart = code.indexOf('`', fnStart)
let j = btStart + 1
while (j < code.length) {
  if (code[j] === '\\') { j += 2; continue }
  if (code[j] === '`') break
  j++
}
const tpl = code.slice(btStart + 1, j)
const evaluated = eval('`' + tpl.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`')

const normalized = 'const $ = window.jQuery\n' + evaluated.replace(/export\s+default/, 'return ')
try {
  const factory = new Function(normalized)
  const def = factory()
  console.log('OK', typeof def.afterRender)
} catch (err) {
  console.log('FAIL:', err.message)
  // 找出错误行
  const lines = normalized.split('\n')
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].includes('&&')) {
      console.log(`L${k}: ${lines[k]}`)
      console.log(`  prev: ${lines[k-1]}`)
    }
  }
}
