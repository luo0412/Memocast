// scripts/transform-main-builtin-echoes.js
// 把 renderer 端 echoBuiltins.js 转译为 main 端 builtin-echoes.js（CommonJS）。
// 用法： node scripts/transform-main-builtin-echoes.js
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'components', 'echo', 'echoBuiltins.js')
const DST = path.join(__dirname, '..', 'src-electron', 'main-process', 'service', 'builtin-echoes.js')

let src = fs.readFileSync(SRC, 'utf8')

// 1. 替换 ES import -> CommonJS require
src = src.replace(
  /^import \{ banner, handlerDoc \} from '\.\/echoBuiltinsShared\.js'\s*\n/m,
  ''
)

src = "const { banner, handlerDoc } = require('./builtin-echo-shared')\n\n" + src

// 2. ES export -> CommonJS
src = src.replace(/^export const BUILTIN_ECHO_CARDS = /m, 'const BUILTIN_ECHO_CARDS = ')
src = src.replace(/^export const BUILTIN_ECHO_CHANT_IDS = /m, 'const BUILTIN_ECHO_CHANT_IDS = ')
src = src.replace(/^export const isBuiltinEchoChantId = /m, 'const isBuiltinEchoChantId = ')

// 3. 末尾追加 module.exports
src = src.trimEnd() + '\n\nmodule.exports = {\n  BUILTIN_ECHO_CARDS,\n  BUILTIN_ECHO_CHANT_IDS,\n  isBuiltinEchoChantId\n}\n'

fs.writeFileSync(DST, src)
console.log('OK:', DST, 'bytes:', src.length)