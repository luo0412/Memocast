// _temp/blog/run-smoke.js
// 一次性烟雾测试入口：先跑 positive，断言 0 unresolved + frontmatter 通过；
// 再跑 negative，断言 verify-paths 抛错。
// 不向工作树外写任何东西；所有产物限定在传入的 --workdir。
'use strict'

const path = require('path')
const fse = require('fs-extra')

const argv = process.argv.slice(2)
const flag = (k) => argv.includes(k)
const arg  = (k, def) => {
  const i = argv.indexOf(k)
  return i >= 0 ? argv[i + 1] : def
}

async function run () {
  const root = path.resolve(arg('--workdir', path.join(process.cwd(), '_temp', 'smoke-out')))
  await fse.remove(root)              // 清空本沙箱子目录,绝不触及 src/ / .git/
  await fse.ensureDir(root)

  const { runSmokeTest } = require('./blog-config-writer')

  console.log('=== POSITIVE ===')
  const posRoot = path.join(root, 'positive')
  const pos = await runSmokeTest({ workdir: posRoot, positive: true })
  console.log('  sidebar._posts count =', (pos.sidebar['_posts/'] || []).length)
  console.log('  nav groups          =', pos.nav.length)
  console.log('  verify              =', pos.verify)
  console.log('  fmErrors            =', pos.fmErrors.length)
  const posOk =
    (pos.sidebar['_posts/'] || []).length === 4 &&
    !pos.verify.error &&
    (pos.verify.total === pos.verify.resolved) &&
    pos.fmErrors.length === 0
  console.log('  POSITIVE_RESULT     =', posOk ? 'PASS' : 'FAIL')

  console.log()
  console.log('=== NEGATIVE ===')
  const negRoot = path.join(root, 'negative')
  const neg = await runSmokeTest({ workdir: negRoot, positive: false })
  console.log('  sidebar._posts count =', (neg.sidebar['_posts/'] || []).length)
  console.log('  verify              =', neg.verify)
  // negative: id-mappings 有 4 条,但 _posts/ 实际不写文件,verify-paths 应该抛错
  const negOk = !!neg.verify.error
  console.log('  NEGATIVE_RESULT     =', negOk ? 'PASS (expected throw)' : 'FAIL (expected throw)')

  console.log()
  console.log('=== SUMMARY ===')
  console.log('  positive =', posOk ? 'PASS' : 'FAIL')
  console.log('  negative =', negOk ? 'PASS' : 'FAIL')
  if (!posOk || !negOk) process.exit(1)
}

run().catch((e) => {
  console.error('FATAL', e)
  process.exit(2)
})