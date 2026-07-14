// 把 renderer 端 builtinEchoes.js 转译为 main 端 builtin-echoes.js（CommonJS）。
// 用法： node scripts/transform-main-builtin-echoes.js
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'components', 'ui', 'editor', 'echo', 'builtinEchoes.js')
const DST = path.join(__dirname, '..', 'src-electron', 'main-process', 'service', 'builtin-echoes.js')

let src = fs.readFileSync(SRC, 'utf8')

// 1. 替换 ES import -> CommonJS require
src = src.replace(
  /^import \{ createDefaultEchoAnnoSource as createRuntimeDefaultAnnoSource \} from '\.\/EchoRuntime'\s*\n/m,
  ''
)
src = src.replace(
  /^import \{ banner, handlerExampleDoc, handlerAndExampleDoc, handlerPrelude \} from '\.\/builtin-echo-shared'\s*\n/m,
  ''
)

// 2. 在文件最前面插入 require
src = "const { banner, handlerExampleDoc, handlerAndExampleDoc, handlerPrelude } = require('./builtin-echo-shared')\n\n" + src

// 3. createDefaultEchoAnnoSource 内联实现（避免跨目录 require）
//   直接用与 renderer 端 EchoRuntime.createDefaultEchoAnnoSource 等价的字符串。
//   ⚠️ 任何对 EchoRuntime.createDefaultEchoAnnoSource 的语义修改都应同步本段。
const DEFAULT_ECHO_ICON_INLINED = 'graphic_eq'
const DEFAULT_ECHO_COLOR_INLINED = '#26A69A'
const inlinedImpl = [
  "const createDefaultEchoAnnoSource = (echoName = '回响') => `export default {",
  "  kind: 'echo',",
  "  version: 1,",
  "  name: '${String(echoName || '回响').replace(/'/g, \"\\\\'\")}',",
  "  namespace: '回响',",
  "",
  "  // === 新模板签名 === render(node, ancestors) + afterRender(node, domElement, ancestors)",
  "  render (node, ancestors) {",
  "    const attrs = (node && node.attrsParsed) || {}",
  "    const prompt = (node && node.prompt) || ''",
  "    const echoMeta = (ancestors && ancestors.echo) || {}",
  "    return {",
  "      type: 'card',",
  "      icon: attrs.icon || echoMeta.icon || " + JSON.stringify(DEFAULT_ECHO_ICON_INLINED) + ",",
  "      color: attrs.color || echoMeta.color || " + JSON.stringify(DEFAULT_ECHO_COLOR_INLINED) + ",",
  "      title: attrs.title || echoMeta.name || '${String(echoName || '回响').replace(/'/g, \"\\\\'\")}',",
  "      description: attrs.desc || echoMeta.desc || '',",
  "      prompt,",
  "      attrs,",
  "      html: attrs.html || ''",
  "    }",
  "  },",
  "",
  "  afterRender (node, domElement, ancestors) {",
  "    if (domElement && domElement.classList) {",
  "      domElement.classList.add('ag-echo-default-mounted')",
  "    }",
  "  }",
  "}`"
].join('\n')
const old = "const createDefaultEchoAnnoSource = (echoName = '回响') => createRuntimeDefaultAnnoSource(echoName)"
src = src.replace(old, inlinedImpl)

// 4. ES export -> CommonJS
src = src.replace(/^export const BUILTIN_ECHO_CARDS = /m, 'const BUILTIN_ECHO_CARDS = ')
src = src.replace(/^export const getDefaultEchoAnnoSource = /m, 'const getDefaultEchoAnnoSource = ')
src = src.replace(/^export const isBuiltinEcho = /m, 'const isBuiltinEcho = ')
src = src.replace(/^export const BUILTIN_RUNE_IDS = /m, 'const BUILTIN_RUNE_IDS = ')
src = src.replace(/^export const isBuiltinRuneId = /m, 'const isBuiltinRuneId = ')

// 5. 末尾追加 module.exports
src = src.trimEnd() + '\n\nmodule.exports = {\n  BUILTIN_ECHO_CARDS,\n  getDefaultEchoAnnoSource,\n  isBuiltinEcho,\n  BUILTIN_RUNE_IDS,\n  isBuiltinRuneId,\n  createDefaultEchoAnnoSource\n}\n'

fs.writeFileSync(DST, src)
console.log('OK:', DST, 'bytes:', src.length)