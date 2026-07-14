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
  /^import \{ banner, handlerExampleDoc \} from '\.\/builtin-echo-shared'\s*\n/m,
  ''
)

// 2. 在文件最前面插入 require
src = "const { banner, handlerExampleDoc } = require('./builtin-echo-shared')\n\n" + src

// 3. createDefaultEchoAnnoSource 内联实现（避免跨目录 require）
const old = "const createDefaultEchoAnnoSource = (echoName = '回响') => createRuntimeDefaultAnnoSource(echoName)"
const neu = [
  "const createDefaultEchoAnnoSource = (echoName = '回响') => `export default {",
  "  kind: 'echo',",
  "  version: 1,",
  "  name: '${String(echoName || '回响').replace(/'/g, \"\\\\'\")}',",
  "  render (context = {}) {",
  "    const attrs = context.attrs || {}",
  "    const prompt = context.prompt || ''",
  "    const icon = attrs.icon || context.echo?.icon || 'graphic_eq'",
  "    const color = attrs.color || context.echo?.color || '#26A69A'",
  "    const title = attrs.title || context.echo?.name || '${String(echoName || '回响').replace(/'/g, \"\\\\'\")}'",
  "    const description = attrs.desc || context.echo?.desc || ''",
  "    return { type: 'card', icon, color, title, description, prompt, attrs, html: attrs.html || '' }",
  "  }",
  "}`"
].join('\n')
src = src.replace(old, neu)

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