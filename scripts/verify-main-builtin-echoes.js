// 验证 main 端 builtin-echoes.js 中所有 anno_source 可编译。
//
// 期望结构（v2026-07-28 起固定）：
//   export default {
//     type: 'echo' | 'echo-chant' | 'echo-tbd',
//     field, title, version, props, render, afterRender
//   }
const path = require('path')
const { BUILTIN_ECHO_CARDS } = require('../src-electron/main-process/service/builtin-echoes.js')

// main 进程跑的是 Node，没有 window / jQuery。
// anno_source 在 main 端仅作"字符串镜像"塞 SQLite，不会被执行。
// 但本脚本要执行它来验证语法正确性，所以这里给 $ 一个安全的 fallback 让编译通过。
const HANDLER_PRELUDE_SOURCE = "const __safeDollar = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null\nconst $ = __safeDollar\n"

let pass = 0
let fail = 0
const errors = []

for (const card of BUILTIN_ECHO_CARDS) {
  const src = card.anno_source
  try {
    const normalized = String(src || '').replace(/export\s+default/, 'return ')
    const fn = new Function(HANDLER_PRELUDE_SOURCE + normalized)
    const obj = fn()
    if (!obj || typeof obj !== 'object') throw new Error('not an object')
    if (typeof obj.render !== 'function') throw new Error('render missing or not function')

    const validTypes = new Set(['echo', 'echo-chant', 'echo-tbd'])
    if (!validTypes.has(obj.type)) throw new Error('顶层 type 必须是 echo / echo-chant / echo-tbd，实际=' + obj.type)
    if ('kind' in obj) throw new Error('definition 不应再含顶层 kind 字段（已合并到 type）')

    const hasAfterRender = typeof obj.afterRender === 'function'
    if (obj.type === 'echo-chant' && !hasAfterRender) {
      throw new Error('echo-chant 必须有 afterRender')
    }

    // render() 必须返回 string
    const rendered = obj.render({})
    if (typeof rendered !== 'string') throw new Error('render() 必须返回 string，实际=' + typeof rendered)

    console.log(`[OK]   ${card.id.padEnd(30)}  type=${obj.type}  afterRender=${hasAfterRender ? 'fn' : '—'}`)
    pass++
  } catch (err) {
    console.log(`[FAIL] ${card.id.padEnd(30)}  ${err.message}`)
    errors.push({ id: card.id, error: err.message })
    fail++
  }
}

console.log(`\n=== summary: pass=${pass}, fail=${fail}, total=${BUILTIN_ECHO_CARDS.length}`)
if (fail > 0) process.exit(1)