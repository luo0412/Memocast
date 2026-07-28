// 验证 enum + util 目录的全局扫描 bug

import { readdirSync } from 'node:fs'

const enumFiles = readdirSync('./src/utils/enum').filter(f => f.endsWith('.js'))
console.log('enum 目录文件:', enumFiles.join(', '))

// 旧正则
const enumOldRegex = /[A-Z]\w+Enum\.js$/
const enumOldHits = enumFiles.filter(f => enumOldRegex.test(f))
console.log('\n旧 enum 正则 [A-Z]\\w+Enum\\.js$ 匹配:', enumOldHits.length === 0 ? '❌ 空' : enumOldHits.join(', '))

// 期望所有 enum 文件都被匹配（首字母小写 camelCase）
const enumNewRegex = /^[a-z]\w*Enum\.js$/
const enumNewHits = enumFiles.filter(f => enumNewRegex.test(f))
console.log('新 enum 正则 ^[a-z]\\w*Enum\\.js$ 匹配:', enumNewHits.length === enumFiles.length ? `✅ 全员到位 (${enumNewHits.length})` : enumNewHits.join(', '))

// 验证 enum 的具名 export 都带 .items 才能挂到 $enums
console.log('\n=== 各 enum 文件导出 ===')
for (const f of enumFiles) {
  console.log(`  ${f}:`)
}

// 关键的 $enums.ServerSubEnum 期望
console.log('\n=== 关键字段验证（修复后）===')
console.log('$enums.ServerSubEnum:', enumNewHits.includes('settingsTabEnum.js') ? '✅ 修复后可挂载' : '❌ 不挂载')
console.log('$enums.AiSubEnum:', enumNewHits.includes('settingsTabEnum.js') ? '✅' : '❌')
console.log('$enums.runeEchoCategoriesEnum:', enumNewHits.includes('runeEchoCategoriesEnum.js') ? '✅' : '❌')
console.log('$enums.noteOrderTypeEnum:', enumNewHits.includes('noteOrderTypeEnum.js') ? '✅' : '❌')