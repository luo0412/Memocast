const fs = require('fs');
const file = 'e:/work-coolma/coolma/src/components/echo/builtinEchoes.js';
let text = fs.readFileSync(file, 'utf8')

const banner = (lines) => lines.map(l => `//   ${l}`).join('\n  ')
const handlerDoc = () => ''

// 用状态机逐个提取 createXxxAnnoSource 段
const out = []
let i = 0

while (i < text.length) {
  const fnStart = text.indexOf('const create', i)
  if (fnStart < 0) break
  const btStart = text.indexOf('`', fnStart)
  if (btStart < 0) break

  // 找配对 backtick
  let j = btStart + 1
  while (j < text.length) {
    if (text[j] === '\\') { j += 2; continue }
    if (text[j] === '`') break
    j++
  }

  const head = text.slice(i, btStart + 1)  // 到 backtick 之前
  const tpl = text.slice(btStart + 1, j)   // 模板字符串内容
  const tail = text[j]                     // '`'
  i = j + 1

  // 评估模板，得到 evaluated anno_source 字符串
  let evaluated
  try {
    evaluated = eval('`' + tpl.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`')
  } catch (err) {
    console.log('eval FAIL on', head.slice(-30), ':', err.message.slice(0, 100))
    out.push(head)
    out.push(tpl)
    out.push(tail)
    continue
  }

  // 关键修复：检查 evaluated 是否包含 afterRender。
  // 如果没有：说明这条 echo 的 handler body 没有经过我们之前的脚本；
  // 这时我们需要手工在模板中插入 afterRender。
  if (evaluated.includes('afterRender (node, domElement, ancestors)')) {
    out.push(head)
    out.push(tpl)
    out.push(tail)
    continue
  }

  // 现在 tpl 里是：
  //   ...
  //   ${handlerDoc(['xxx'])}
  //     body（4空格缩进）
  //   }
  // 我们要找 handlerDoc 段，重写为 banner + afterRender
  const hdMatch = tpl.match(/(\s*)(\${handlerDoc\(\[[\s\S]*?\]\)})\s*\n([\s\S]+?)\n(\s+)\}/)
  if (!hdMatch) {
    console.log('no handlerDoc pattern in', head.slice(-30))
    out.push(head)
    out.push(tpl)
    out.push(tail)
    continue
  }

  const hdIndent = hdMatch[1]
  const hdText = hdMatch[2]
  const body = hdMatch[3]
  const closeIndent = hdMatch[4]

  // 提取 handlerDoc 内的字符串数组字面
  const innerMatch = hdText.match(/handlerDoc\(\[\s*([\s\S]*?)\s*\]\)/)
  if (!innerMatch) { out.push(head); out.push(tpl); out.push(tail); continue }
  const inner = innerMatch[1]
  // 提取 '...', '...' 多行字符串为数组
  const strs = []
  const strRe = /'((?:[^'\\]|\\.)*)'/g
  let sm
  while ((sm = strRe.exec(inner)) !== null) {
    strs.push(sm[1].replace(/\\'/g, "'").replace(/\\"/g, '"'))
  }

  // 把 body 行规范化到 4 空格缩进
  const bodyLines = body.split('\n').map(line => {
    if (!line.trim()) return ''
    return '    ' + line.replace(/^\s*/, '')
  }).filter(l => l.length).join('\n')

  // 构建新段：headIndent + banner + ', \n  afterRender (...) {\n  body\n  }'
  const bannerOut = banner(strs.length ? strs : ['afterRender'])
  const replacement = `${hdIndent}${bannerOut},\n${hdIndent}afterRender (node, domElement, ancestors) {\n${bodyLines}\n${closeIndent}}`

  // 替换
  const newTpl = tpl.replace(hdMatch[0], replacement)
  out.push(head)
  out.push(newTpl)
  out.push(tail)
}

fs.writeFileSync(file, out.join(''), 'utf8')
console.log('done. output total length:', out.join('').length)
