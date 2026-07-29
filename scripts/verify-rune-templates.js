// ============================================================================
// verify-rune-templates.js —— rune-templates.js 的护城河
//
// 13 个内置 rune 模板是字符串形式的 Vue SFC（template / script / style）。
// 必须保证：
//   1) 每个模板的 <script> 块语法可编译（new Function 不抛错）
//   2) 每个 SFC 都声明了 props.value（mountRuneVueHosts 的硬约定）
//   3) 模板字符串里的 </script> 都被转义成 <\/script>
//      （否则放在 .vue 文件的 <script> 块里会被 Vue 编译器截断）
//   4) SFC 的回写通道：$emit('input', ...) 必须存在
// ============================================================================
const path = require('path')

const TEMPLATE_NAMES = [
  'createBlankTemplate',
  'createInheritDemoTemplate',
  'createInputTemplate',
  'createHolyShieldTemplate',
  'createFireflyTemplate',
  'createJsxGraphTemplate',
  'createElInputTemplate',
  'createElSelectTemplate',
  'createElDatePickerTemplate',
  'createResumeBasicInfoTemplate',
  'createResumeTitleTemplate',
  'createResumeExperienceTemplate',
  'createResumeTextTemplate',
  'createResumeSkillTemplate'
]

let pass = 0
let fail = 0
const fails = []

function check (name, cond, info) {
  if (cond) { console.log('[OK]   ' + name); pass += 1 }
  else {
    console.log('[FAIL] ' + name + (info ? ' info=' + JSON.stringify(info) : ''))
    fails.push({ name, info })
    fail += 1
  }
}

async function main () {
  // v2026-07-29 拆分后，原 file 已经被拆成 14 个独立文件（每个一份 rune 模板函数）。
  // 关键约束：每个文件**自身**的源代码里，</script> 必须转义成 <\/script>，
  // 因为这些 .js 文件最终会被某个 .vue 文件 import 进去；如果文件里是裸 </script>，
  // 会让 .vue 文件的 <script> 块被 Vue 编译器提前截断。
  // 运行时 createXxxTemplate() 返回的字符串里</script> 是合法的（SFC 内容），
  // 这一点是**有意为之**——源文件转义、运行时不解转义。
  const fs = require('fs')
  const SRC_DIR = path.resolve('src/components/rune/runeTemplates')
  const fileEntries = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.js'))
  // 把所有 .js 文件拼成"虚拟单一源"，TEMPLATE_NAMES 仍然按名字定位函数体
  const fileSrc = fileEntries
    .map(f => `// === ${f} ===\n` + fs.readFileSync(path.join(SRC_DIR, f), 'utf8'))
    .join('\n')
  // 入口（聚合模块）仍然从 src/components/rune/runeTemplates/runeTemplates.js require
  const url = `file:///${path.resolve('src/components/rune/runeTemplates/runeTemplates.js').replace(/\\/g, '/')}`
  const mod = await import(url)

  for (const name of TEMPLATE_NAMES) {
    if (typeof mod[name] !== 'function') {
      check(`${name} 必须导出`, false, { exported: typeof mod[name] })
      continue
    }

    const runtime = mod[name]()

    // === 1) 源文件级：拆分后每个 runeTemplate 都有一份独立 .js 文件，
    //    文件里 `export const runeTemplates<Name> = () => { ... }` 内部的
    //    SFC 闭合标签（</script>）必须写成 <\/script>，否则 .vue 文件 import 这个
    //    .js 时会被 Vue 编译器提前截断。
    //
    //    create*Template 名称 -> 文件内 runeTemplates* 导出名：
    //      例：createBlankTemplate           → runeTemplatesBlank（导出）
    //          createElDatePickerTemplate   → runeTemplatesElDatePicker
    //          createResumeBasicInfoTemplate→ runeTemplatesResumeBasicInfo
    if (!name.startsWith('create') || !name.endsWith('Template')) {
      check(`${name} 命名应符合 create*Template 模式`, false)
      continue
    }
    const exportName = 'runeTemplates' + name.slice('create'.length, -'Template'.length)
    const fnHeaderRegex = new RegExp(`(const|export\\s+const)\\s+${exportName}\\s*=\\s*\\(?\\s*\\)?\\s*=>\\s*\\{`, 'm')
    const headerMatch = fileSrc.match(fnHeaderRegex)
    if (!headerMatch) {
      check(`${name} 在源文件里能找到函数定义（导出名 ${exportName}）`, false)
      continue
    }
    check(`${name} 在源文件里能找到函数定义（导出名 ${exportName}）`, true)
    const fnBodyStart = headerMatch.index + headerMatch[0].length
    // 模板字符串字面量是 return `<template>...</template><script>...<\/script><style>...<\/style>`
    // 在源文件里，闭合标签必须写成 <\/script> / <\/template> / <\/style>
    const fnBody = fileSrc.slice(fnBodyStart, fnBodyStart + 30000)
    const hasEscapedScriptClose = /<\\\/script>/.test(fnBody)
    check(`${name} 源文件内 </script> 必须转义成 <\\/script>（避免被 .vue 文件 import 时误截断）`,
      hasEscapedScriptClose,
      { first200: fnBody.slice(0, 200) })

    // === 2) 运行时级：模板字符串本身 ===
    //    <template> / <script> / <style> 三段都要存在
    check(`${name} 运行时含 <template>`,
      /<template>/.test(runtime))
    check(`${name} 运行时含 <script>`,
      /<script>/.test(runtime) || /<script\b/.test(runtime))
    check(`${name} 运行时含 </style>`,
      /<\/style>/.test(runtime))

    // === 3) <script> 块语法可编译 ===
    const scriptMatch = runtime.match(/<script>([\s\S]*?)<\/script>/i)
    if (scriptMatch) {
      const scriptBody = scriptMatch[1]
      const defMatch = scriptBody.match(/export\s+default\s+(\{[\s\S]*?\n\})/m)
      if (defMatch) {
        // 编译 export default { ... } → return { ... }
        const compileBody = scriptBody.replace(/export\s+default\s+\{/m, 'return {')
        try {
          // eslint-disable-next-line no-new-func
          new Function(compileBody)
          check(`${name} <script> 块语法可编译`, true)
        } catch (err) {
          check(`${name} <script> 块语法可编译`, false, { err: err.message })
        }

        // === 4) props.value 必须声明（mountRuneVueHosts 硬约定）===
        //     createBlankTemplate 是字面意义上的"空白模板"——用户从空白开始写，
        //     props: {} 是设计意图，跳过这条断言。
        const SKIP_PROPS_VALUE = ['createBlankTemplate']
        if (SKIP_PROPS_VALUE.includes(name)) {
          console.log('[SKIP] ' + name + ' props.value 断言（空白 rune 设计意图）')
        } else {
          const hasValueProp = /props\s*:\s*\{[\s\S]*?\bvalue\b/.test(defMatch[1])
          check(`${name} SFC 声明了 props.value（mountRuneVueHosts 硬约定）`,
            hasValueProp)
        }

        // === 5) SFC 应当至少有一个 $emit('input', ...) 回写通道 ===
        //     简历系列 rune（BasicInfo / Title / Experience / TextContent / SkillBar）
        //     是纯展示型组件，没有 $emit('input'）。
        const SKIP_EMIT_INPUT = [
          'createBlankTemplate',
          'createResumeBasicInfoTemplate',
          'createResumeTitleTemplate',
          'createResumeExperienceTemplate',
          'createResumeTextTemplate',
          'createResumeSkillTemplate'
        ]
        if (SKIP_EMIT_INPUT.includes(name)) {
          console.log('[SKIP] ' + name + ' $emit(\'input\') 断言（纯展示型 rune）')
        } else {
          const hasEmitInput = /\$emit\(\s*['"]input['"]/.test(runtime)
          check(`${name} 含 $emit('input', ...) 回写通道`,
            hasEmitInput)
        }
      } else {
        check(`${name} 能找到 export default {...} 块`, false)
      }
    } else {
      check(`${name} 能提取 <script> 块`, false)
    }
  }

  console.log(`\n=== summary: pass=${pass}, fail=${fail}, total=${pass + fail}`)
  if (fail > 0) {
    console.log('\n--- 失败明细 ---')
    fails.forEach(f => console.log('  -', f.name, f.info ? JSON.stringify(f.info) : ''))
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})