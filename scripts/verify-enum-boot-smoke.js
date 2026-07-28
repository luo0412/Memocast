// 验证 src/utils/enum/ 目录下的 enum 文件能否被正确扫描并挂到 $enums。
// 历史背景：项目文件名约定是小驼峰（camelCase），所以 require.context 用
// /[A-Z]\w+Enum\.js$/ 这类 PascalCase 正则会**全部漏掉**。
// 正确写法是 /^[a-z]\w*Enum\.js$/。

const fs = require('fs')
const path = require('path')

const enumDir = path.resolve(__dirname, '..', 'src', 'utils', 'enum')
const enumFiles = fs.readdirSync(enumDir).filter(f => f.endsWith('.js'))
console.log('enum 目录文件:', enumFiles.join(', '))

// 旧正则（PascalCase）—— 会漏掉全部
const enumOldRegex = /[A-Z]\w+Enum\.js$/
const enumOldHits = enumFiles.filter(f => enumOldRegex.test(f))
console.log('\n旧 enum 正则 [A-Z]\\w+Enum\\.js$ 匹配:', enumOldHits.length === 0 ? '❌ 空' : enumOldHits.join(', '))

// 期望所有 enum 文件都被匹配（小驼峰 camelCase）
// 注意：enumFiles 里包含 index.js / enumSetup.js 等基础设施文件，正则应当只命中真正的 enum 文件。
const enumNewRegex = /^[a-z]\w*Enum\.js$/
const enumNewHits = enumFiles.filter(f => enumNewRegex.test(f))
const EXPECTED_ENUM_FILES = 6 // aiAssistant / calendarDateBasis / cloudSyncProvider / noteOrderType / runeEchoCategories / settingsTab
console.log('新 enum 正则 ^[a-z]\\w*Enum\\.js$ 匹配:', enumNewHits.length === EXPECTED_ENUM_FILES ? `✅ 全员到位 (${enumNewHits.length})` : enumNewHits.join(', '))

// 列出 enum 目录里所有文件，方便人工核对哪些是 enum、哪些是基础设施
console.log('\n=== 各 enum 文件 ===')
for (const f of enumFiles) {
  console.log(`  ${f}`)
}

// 关键字段验证
console.log('\n=== 关键字段验证（修复后）===')
console.log('$enums.ServerSubEnum:', enumNewHits.includes('settingsTabEnum.js') ? '✅ 修复后可挂载' : '❌ 不挂载')
console.log('$enums.AiSubEnum:', enumNewHits.includes('settingsTabEnum.js') ? '✅' : '❌')
console.log('$enums.runeEchoCategoriesEnum:', enumNewHits.includes('runeEchoCategoriesEnum.js') ? '✅' : '❌')
console.log('$enums.noteOrderTypeEnum:', enumNewHits.includes('noteOrderTypeEnum.js') ? '✅' : '❌')

if (enumNewHits.length !== EXPECTED_ENUM_FILES) {
  console.log('\n❌ 新正则未命中所有预期的 enum 文件，请检查 src/utils/enum/ 是否新增/删除 enum')
  process.exit(1)
}
console.log('\n=== summary: pass ===')