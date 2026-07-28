#!/usr/bin/env node
// ============================================================================
// verify-runner.js —— 一键跑全部 verify 脚本
//
//   用法：node scripts/verify-runner.js [filter]
//     filter 可选：只跑名字含 filter 子串的脚本（不区分大小写）
//
//   设计目标：
//     - 让 rune / echo / 云函数的 verify 脚本有统一入口
//     - 按"AI 时代测试即护城河"的定位，每条用例都是契约
//     - 失败明细全打到 stdout，不静默吞错
//
//   当前覆盖（v2026-07-28）：
//     scripts/verify-echo-runtime-props.js         EchoRuntime props / fallback / graceful skip
//     scripts/verify-jquery-echo-compile.js        16 张内置 anno_source 顶层结构 + render 返回 string
//     scripts/verify-jquery-afterrender.js         handlerBody jQuery 直用 + 历史包袱清理
//     scripts/verify-main-builtin-echoes.js        main 端镜像编译 + 与 renderer 一致
//     scripts/verify-builtin-echo-upsert.js        DB 落库幂等性 + anno_source 一致性
//     scripts/verify-echo-schema-formcreate-align.js  echo propsSchema 贴合 form-create rule
//                                                       （禁止 default/placeholder 顶层字段、规则透传一致性）
//     scripts/verify-rune-templates.js             14 个 rune SFC 模板：源转义 / script 可编译 / props.value / $emit
//     scripts/verify-inherit-from-previous.js      inheritFromPrevious helper 全套语义
//     scripts/verify-enum-boot-smoke.js            $enums 挂载完整性
//     scripts/verify-util-boot-smoke.js            $utils 挂载完整性
//     scripts/verify-enum-util-regex.js            文件名命名规范 regex 自检
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