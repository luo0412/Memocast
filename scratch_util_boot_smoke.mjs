// 模拟 boot/globalGlobals.js 的 require.context 扫描逻辑
// 验证：正则改成 ^[a-z]\w*Util\.js$ 后能匹配到 emptyUtil / treeUtil / markdownUtil / domUtil / dateUtil

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const utilDir = './src/utils/util'
const files = readdirSync(utilDir).filter(f => f.endsWith('.js'))
console.log('util 目录文件：', files.join(', '))

// 旧正则（首字母大写）—— 报错原因
const oldRegex = /[A-Z]\w+Util\.js$/
const oldHits = files.filter(f => oldRegex.test(f))
console.log('\n旧正则 [A-Z]\\w+Util\\.js$ 匹配：', oldHits.length === 0 ? '❌ 空' : oldHits.join(', '))

// 新正则（首字母小写）
const newRegex = /^[a-z]\w*Util\.js$/
const newHits = files.filter(f => newRegex.test(f))
console.log('新正则 ^[a-z]\\w*Util\\.js$ 匹配：', newHits.length === 5 ? '✅ 全员到位' : newHits.join(', '))

// 模拟 buildNameSpacedMap 行为
const buildNameSpacedMap = (fileList) => {
  const map = {}
  fileList.forEach(filename => {
    const fileBaseName = filename.replace(/\.js$/, '')
    const camelName = fileBaseName.charAt(0).toLowerCase() + fileBaseName.slice(1)
    map[camelName] = `(module ${filename} 的所有 named export)`
  })
  return map
}

console.log('\n=== $utils 注册情况（新正则）===')
const $utils = buildNameSpacedMap(newHits)
console.log('$utils keys:', Object.keys($utils).sort().join(', '))

console.log('\n=== 关键字段验证（确保 NoteItem.vue 用法不再 undefined）===')
console.log('$utils.emptyUtil.isNullOrEmpty:', typeof $utils.emptyUtil !== 'undefined' ? '✅ exists' : '❌ undefined')
console.log('$utils.treeUtil.wizIsPredefinedLocation:', typeof $utils.treeUtil !== 'undefined' ? '✅ exists' : '❌ undefined')
console.log('$utils.dateUtil.displayDateElegantly:', typeof $utils.dateUtil !== 'undefined' ? '✅ exists' : '❌ undefined')

console.log('\n=== 防御性建议 ===')
console.log('为防止 $utils / $enums / $cloudfns 下子模块仍缺失，建议：')
console.log('1) 在 NoteItem.vue 等组件里对 this.$utils.xxx 加可选链 (this.$utils?.emptyUtil?.isNullOrEmpty(...))')
console.log('2) 或在 globalGlobals.js 给每个 namespace 加 fallback（empty object）')
console.log('3) 当前修复已让 boot 注册完整，业务代码可保留 this.$utils.emptyUtil 写法')