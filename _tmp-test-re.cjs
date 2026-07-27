const fs = require('fs');
const code = fs.readFileSync('e:/work-coolma/coolma/src/components/echo/builtinEchoes.js', 'utf8')

const re = /\s*\${handlerDoc\(\[\s*([\s\S]*?)\s*\]\)\}\s*\n\s+([\s\S]+?)\n\s+\}\n\}/g

let m = re.exec(code)
while (m) {
  const full = m[0]
  const inner = m[1]
  const body = m[2]
  console.log('--- match ---')
  console.log('inner:', inner.slice(0, 100))
  console.log('body first 100:', body.slice(0, 100))
  m = re.exec(code)
}
