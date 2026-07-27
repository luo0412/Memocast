const fs = require('fs');
const file = 'e:/work-coolma/coolma/src/components/echo/builtinEchoes.js';
let text = fs.readFileSync(file, 'utf8')

const banner = (lines) => lines.map(l => `//   ${l}`).join('\n  ')
const handlerDoc = () => ''

// 对每个 createXxxAnnoSource 段：
//   找到 `afterRender (node, domElement, ancestors) {` 开始，
//   到下一个 `  }` （缩进 2 空格的闭合）结束
//   把内部 body 规范化到 4 空格缩进（先 normalize 到 0，再加 4）
//
// 策略：对每个 createXxxAnnoSource 段，从模板字符串里手工 replace：
//   - 找到 'afterRender (node, domElement, ancestors) {' 行
//   - 找到下一个 '  }' 行
//   - 把中间所有非空行的左侧空格去掉，加 4 空格
//
// 然后，处理 banner 注释与 afterRender 之间的多余空行

const out = []
let i = 0

while (i < text.length) {
  const fnStart = text.indexOf('const create', i)
  if (fnStart < 0) break
  const btStart = text.indexOf('`', fnStart)
  if (btStart < 0) break

  let j = btStart + 1
  while (j < text.length) {
    if (text[j] === '\\') { j += 2; continue }
    if (text[j] === '`') break
    j++
  }

  const head = text.slice(i, btStart + 1)
  const tpl = text.slice(btStart + 1, j)
  const tail = text[j]
  i = j + 1

  out.push(head)

  // 修复策略：逐行处理 tpl
  const tplLines = tpl.split('\n')
  const newLines = []
  let inAfter = false
  let bodyIndent = 0  // 期望的 body 缩进（4）

  for (let li = 0; li < tplLines.length; li++) {
    const line = tplLines[li]
    newLines.push(line)
  }

  // 找到 afterRender 起始行和结束行（'  }' 缩进 2），把它们之间的内容 normalize
  // 这里用模式 '  afterRender (node, domElement, ancestors) {' 找起，'  }' 找闭
  const afterStart = newLines.findIndex(l => /^  afterRender \(node, domElement, ancestors\) \{$/.test(l))
  if (afterStart >= 0) {
    // 找下一个 '  }' 行
    let closeIdx = -1
    for (let k = afterStart + 1; k < newLines.length; k++) {
      if (newLines[k] === '  }' || newLines[k] === '  },') {
        closeIdx = k
        break
      }
    }
    if (closeIdx > afterStart) {
      // normalize: lines between (afterStart+1) and closeIdx 都规范到 4 空格缩进
      for (let k = afterStart + 1; k < closeIdx; k++) {
        const line = newLines[k]
        if (!line.trim()) {
          newLines[k] = ''
          continue
        }
        // 砍掉左侧所有空格，加 4 空格
        newLines[k] = '    ' + line.replace(/^\s*/, '')
      }
    }
  }

  // 清理 banner 与 afterRender 之间的多余空行：
  // 注释块 + 空行 + afterRender  → 注释块 + afterRender（只留一个空行）
  for (let k = 0; k < newLines.length - 1; k++) {
    if (newLines[k].startsWith('// ') && newLines[k + 1] === '' && newLines[k + 2] === '' && newLines[k + 3] && newLines[k + 3].startsWith('  afterRender')) {
      newLines.splice(k + 1, 1)
    }
  }

  out.push(newLines.join('\n'))
  out.push(tail)
}

fs.writeFileSync(file, out.join(''), 'utf8')
console.log('done')
