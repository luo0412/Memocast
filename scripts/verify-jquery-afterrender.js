// Quick smoke: 用 verify 同样的方式,确认每个 anno_source 编译后没有遗留
// "if (domElement && domElement.classList)" 这种 native fallback
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../src/components/ui/editor/echo')

const source = fs.readFileSync(path.join(ROOT, 'builtinEchoes.js'), 'utf8')

const checks = [
  { name: 'safeDollarRef 已移除', re: /safeDollarRef/, shouldMatch: false },
  { name: 'nice afterRender 直接 $()', re: /afterRender[\s\S]*?\n\s*\$\(domElement\)\.addClass/, shouldMatch: true, src: source },
  { name: 'clock 不再写 __safeDollarInner', re: /__safeDollarInner/, shouldMatch: false },
  { name: 'twinbloom 不再写 querySelector', re: /querySelector\([^)]+\)/, shouldMatch: false },
  { name: 'twinbloom 不再写 getAttribute', re: /neighbor\.getAttribute|cloned\.getAttribute/, shouldMatch: false },
  { name: 'twinbloom 不再写 previousElementSibling', re: /previousElementSibling|nextElementSibling/, shouldMatch: false },
  { name: 'twinbloom 不再写 cloned\.style\.', re: /cloned\.style\./, shouldMatch: false },
  { name: 'twinbloom 不再写 textContent', re: /cloned\.textContent/, shouldMatch: false },
  { name: 'calamity 不再写 el\.textContent', re: /el\.textContent/, shouldMatch: false }
]

let fail = 0
for (const c of checks) {
  const target = c.src || source
  const match = c.re.test(target)
  const pass = (match === c.shouldMatch)
  console.log((pass ? '[OK]   ' : '[FAIL] ') + c.name + ' (match=' + match + ')')
  if (!pass) fail++
}

// EchoRuntime.js 检查
const runtimeSrc = fs.readFileSync(path.join(ROOT, 'EchoRuntime.js'), 'utf8')
const runtimeChecks = [
  { name: 'createDefaultChantAnnoSource afterRender 直接 $()', re: /afterRender\s*\(node,\s*domElement,\s*ancestors\)\s*\{\s*\$\(domElement\)\.addClass/, shouldMatch: true },
  { name: 'createDefaultChantAnnoSource 不再 fallback classList', re: /domElement\.classList\.add\('ag-echo-default-mounted'\)/, shouldMatch: false },
  { name: 'createDefaultChantAnnoSource handler 直接 $(chantNode)', re: /const \$chant = \$\(chantNode\)/, shouldMatch: true },
  { name: 'createDefaultChantAnnoSource 不再用 target\.style\.outline', re: /target\.style\.outline/, shouldMatch: false }
]
for (const c of runtimeChecks) {
  const match = c.re.test(runtimeSrc)
  const pass = (match === c.shouldMatch)
  console.log((pass ? '[OK]   ' : '[FAIL] ') + c.name + ' (match=' + match + ')')
  if (!pass) fail++
}

console.log('\n=== summary: ' + (fail === 0 ? 'pass' : 'fail=' + fail))
process.exit(fail === 0 ? 0 : 1)