const fs = require('fs');
const code = fs.readFileSync('e:/work-coolma/coolma/src/components/echo/builtinEchoes.js', 'utf8')

const banner = (lines) => lines.map(l => `//   ${l}`).join('\n  ')
const handlerDoc = () => ''

const indices = []
let i = 0
while (i < code.length) {
  const fnStart = code.indexOf('const create', i)
  if (fnStart < 0) break
  const btStart = code.indexOf('`', fnStart)
  if (btStart < 0) break
  let j = btStart + 1
  while (j < code.length) {
    if (code[j] === '\\') { j += 2; continue }
    if (code[j] === '`') break
    j++
  }
  if (j >= code.length) break

  const fnNameMatch = code.slice(fnStart, fnStart + 30).match(/const (create\w+AnnoSource)/)
  if (!fnNameMatch) { i = fnStart + 1; continue }
  const fnName = fnNameMatch[1]

  const tpl = code.slice(btStart + 1, j)
  let evaluated
  try {
    evaluated = eval('`' + tpl.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`')
  } catch (err) {
    console.log('  EVAL FAIL', fnName, ':', err.message.slice(0, 150))
    i = j + 1
    continue
  }

  const normalized = 'const $ = window.jQuery\n' + evaluated.replace(/export\s+default/, 'return ')
  try {
    const factory = new Function(normalized)
    const def = factory()
    if (!def || typeof def.afterRender !== 'function') {
      console.log('  FAIL', fnName, 'afterRender:', typeof def?.afterRender)
    } else {
      console.log('  PASS', fnName)
    }
  } catch (err) {
    console.log('  PARSE FAIL', fnName, ':', err.message.slice(0, 200))
  }

  indices.push(fnName)
  i = j + 1
}

console.log('---')
console.log('tested:', indices.length)
