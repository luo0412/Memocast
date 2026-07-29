// Quick smoke: 校验新结构（v2026-07-28 起）echo 体系：
//   - echoBuiltins.js 里每个 handlerBody 都通过 $(node) 拿到 jQuery 句柄
//   - 不再出现 native DOM 兜底（domElement.classList / querySelector / previousElementSibling 等）
//   - echoRuntime.js 把 $ 注入到 handler 体内（confirm $ is defined）
//   - 不再使用 safeDollarRef / __safeDollarInner / createDefaultChantAnnoSource 这类历史命名
const fs = require('fs')
const path = require('path')

const ROOT_BUILTINS = path.resolve(__dirname, '../src/components/echo/echoBuiltins.js')
const ROOT_RUNTIME = path.resolve(__dirname, '../src/components/echo/echoRuntime.js')

const source = fs.readFileSync(ROOT_BUILTINS, 'utf8')
const runtimeSrc = fs.readFileSync(ROOT_RUNTIME, 'utf8')

const checks = []

// --- 历史包袱清理（不应再出现）---
checks.push({ name: 'safeDollarRef 已全部移除', re: /safeDollarRef/, shouldMatch: false, src: source })
checks.push({ name: '__safeDollarInner 已全部移除', re: /__safeDollarInner/, shouldMatch: false, src: source })
checks.push({ name: 'createDefaultChantAnnoSource 已重命名/移除', re: /createDefaultChantAnnoSource/, shouldMatch: false, src: source })
checks.push({ name: '$(domElement) 历史三参签名已废弃', re: /\$\(domElement\)/, shouldMatch: false, src: source })
checks.push({ name: '$(chantNode) 历史命名已废弃', re: /\$\(chantNode\)/, shouldMatch: false, src: source })

// --- handlerBody 直接走 jQuery $(node) ---
const handlerBodyPattern = /handlerBody:\s*`([\s\S]*?)`/g
let m
let handlerCount = 0
while ((m = handlerBodyPattern.exec(source)) !== null) {
  handlerCount += 1
  const body = m[1]
  // 每个 handlerBody 至少出现一次 $(node) 调用
  checks.push({
    name: `handlerBody[#${handlerCount}] 使用 $(node) jQuery 化`,
    re: /\$\(node\)/,
    shouldMatch: true,
    src: body
  })
}

// --- 没有 native DOM 兜底 ---
const nativeFallbackPatterns = [
  { name: 'handlerBody 不再使用 document.querySelector', re: /document\.querySelector/ },
  { name: 'handlerBody 不再使用 .classList.add', re: /\.classList\.add/ },
  { name: 'handlerBody 不再使用 previousElementSibling', re: /\.previousElementSibling|\.nextElementSibling/ },
  // 注意：jQuery $.fn.filter(callback) 里 this.getAttribute 是合法用法，
  // 且 $root[0].getAttribute(...) 也是从 jQuery 集合回到 DOM 节点的合法用法。
  // 这里只查\"明明已经在用 jQuery、却直接走 node.style.x = ... 这种明显能 jQuery 化的 fallback\"。
  { name: 'handlerBody 不再直接 .style.x = 赋值', re: /\.style\.[a-zA-Z]+\s*=/ }
]
for (const p of nativeFallbackPatterns) {
  checks.push({ name: p.name, re: p.re, shouldMatch: false, src: source })
}

// --- EchoRuntime 不再依赖 safeDollarRef ---
checks.push({
  name: 'EchoRuntime 不再使用 safeDollarRef',
  re: /safeDollarRef/,
  shouldMatch: false,
  src: runtimeSrc
})

// --- HANDLER_PRELUDE 注入 $ 到 handler 体内（confirm $ is defined）---
const annoSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/echo/echoAnnoSource.js'), 'utf8')
checks.push({
  name: 'echoAnnoSource.js 暴露 HANDLER_PRELUDE（含 const $ = window.jQuery）',
  re: /HANDLER_PRELUDE\s*=\s*['"`].*\bwindow\.jQuery\b/,
  shouldMatch: true,
  src: annoSrc
})
checks.push({
  name: 'echoAnnoSource.js 导出 createDefaultEchoAnnoSource（新）',
  re: /export\s+const\s+createDefaultEchoAnnoSource\b/,
  shouldMatch: true,
  src: annoSrc
})
checks.push({
  name: 'echoAnnoSource.js 已移除旧 createDefaultChantAnnoSource',
  re: /createDefaultChantAnnoSource/,
  shouldMatch: false,
  src: annoSrc
})

let fail = 0
for (const c of checks) {
  const target = c.src || source
  const match = c.re.test(target)
  const pass = (match === c.shouldMatch)
  console.log((pass ? '[OK]   ' : '[FAIL] ') + c.name)
  if (!pass) {
    fail++
    console.log('       re=' + c.re + '  match=' + match)
  }
}

console.log(`\n=== summary: ${fail === 0 ? 'pass' : 'fail=' + fail}  (handlerBody=${handlerCount})`)
process.exit(fail === 0 ? 0 : 1)
