#!/usr/bin/env node
// ============================================================================
// verify-runner.js —— 【已迁移到 Jest 29 / v2026-07-29】
//
//   用法（推荐）：yarn verify      ← 直接走 jest
//                 yarn verify:echo ← jest tests/unit/echo
//                 yarn verify:rune ← jest tests/unit/rune
//                 yarn verify:boot ← jest tests/unit/boot
//
//   旧用法（保留 1 周作为过渡期，过后删除）：
//                 node scripts/verify-runner.js           —— 列出所有 verify 脚本
//                 node scripts/verify-runner.js echo     —— 跑名字含 echo 的子集
//                 node scripts/verify-runner.js ruler
//
//   设计目标：
//     - 让 rune / echo / 云函数的 verify 脚本有统一入口
//     - 按"AI 时代测试即护城河"的定位，每条用例都是契约
//     - 失败明细全打到 stdout，不静默吞错
//
//   当前覆盖（v2026-07-29 迁移到 Jest 之后）：
//     tests/unit/echo/jquery-echo-compile.test.js        16 张内置 anno_source 顶层结构 + render 返回 string
//     tests/unit/echo/jquery-afterrender.test.js         handlerBody jQuery 直用 + 历史包袱清理
//     tests/unit/echo/main-builtin-echoes.test.js        main 端镜像编译 + 与 renderer 一致
//     tests/unit/echo/schema-formcreate-align.test.js    echo propsSchema 贴合 form-create rule
//     tests/unit/echo/inherit-from-previous.test.js      inheritFromPrevious helper 全套语义
//     tests/unit/echo/runtime-props.test.js              EchoRuntime props / fallback / graceful skip
//     tests/unit/rune/templates.test.js                  14 个 rune SFC 模板：源转义 / script 可编译 / props.value / $emit
//     tests/unit/boot/enum-boot-smoke.test.js            $enums 挂载完整性
//     tests/unit/boot/util-boot-smoke.test.js            $utils 挂载完整性
//     tests/unit/boot/enum-util-regex.test.js            文件名命名规范 regex 自检
//     tests/smoke/vue-mount.test.js                      Jest+Vue 2.7+jsdom 工具链烟雾测试
//
//   过渡期安排：
//     - 9 个旧 verify-*.js 脚本保留在 scripts/ 下，1 周后删除
//     - 本 runner 仍能用，但跑的就是过时的旧脚本
//     - 推荐直接用 jest（yarn verify）
// ============================================================================
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const SCRIPTS_DIR = path.resolve(__dirname)
const filter = (process.argv[2] || '').trim().toLowerCase()

const allScripts = fs.readdirSync(SCRIPTS_DIR)
  .filter(f => /^verify-.*\.js$/.test(f) && f !== 'verify-runner.js')
  .sort()

const targets = filter
  ? allScripts.filter(f => f.toLowerCase().includes(filter))
  : allScripts

if (targets.length === 0) {
  console.error(`没有匹配的 verify 脚本（filter="${filter}"）`)
  console.error('可用的脚本：')
  allScripts.forEach(s => console.error('  - ' + s))
  process.exit(1)
}

console.log(`\n=== verify-runner: 即将跑 ${targets.length} 个脚本 ===`)
targets.forEach(s => console.log('  - ' + s))
console.log()

let totalPass = 0
let totalFail = 0
const failedScripts = []

for (const script of targets) {
  console.log(`\n${'='.repeat(72)}`)
  console.log(`>>> ${script}`)
  console.log('='.repeat(72))
  const res = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, script)], {
    stdio: 'inherit',
    encoding: 'utf8'
  })
  if (res.status !== 0) {
    totalFail += 1
    failedScripts.push(script)
  } else {
    totalPass += 1
  }
}

console.log(`\n${'='.repeat(72)}`)
console.log(`>>> runner summary: ${totalPass} 个脚本 PASS / ${totalFail} 个脚本 FAIL`)
if (failedScripts.length > 0) {
  console.log('失败的脚本：')
  failedScripts.forEach(s => console.log('  - ' + s))
  process.exit(1)
}
console.log('全部通过。')
process.exit(0)