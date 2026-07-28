// 直接验证 require.context 正则在不同命名风格下的命中情况。
// 历史背景：项目文件名约定是小驼峰（camelCase），所以 require.context 用
// /[A-Z]\w+Util\.js$/ 这类 PascalCase 正则会**全部漏掉**。
// 正确写法是 /^[a-z]\w*Util\.js$/。

const oldRegex = /[A-Z]\w+Util\.js$/
console.log('re:', oldRegex)
console.log('re.source:', oldRegex.source)
console.log('test EmptyUtil.js:', oldRegex.test('EmptyUtil.js'))
console.log('test emptyUtil.js:', oldRegex.test('emptyUtil.js'))
console.log('test Utilxx.js:', oldRegex.test('Utilxx.js'))
console.log('test xxUtil.js:', oldRegex.test('xxUtil.js'))

console.log('\n详细匹配过程 EmptyUtil.js:')
const target = 'EmptyUtil.js'
for (let i = 0; i <= target.length; i++) {
  const s = target.slice(i)
  const r = new RegExp(oldRegex.source)
  console.log(`  slice(${i})="${s}":`, r.test(s))
}