// 直接验证正则
const re = /[A-Z]\w+Util\.js$/
console.log('re:', re)
console.log('re.source:', re.source)
console.log('test EmptyUtil.js:', re.test('EmptyUtil.js'))
console.log('test emptyUtil.js:', re.test('emptyUtil.js'))
console.log('test Utilxx.js:', re.test('Utilxx.js'))
console.log('test xxUtil.js:', re.test('xxUtil.js'))

console.log('\n详细匹配过程 EmptyUtil.js:')
const target = 'EmptyUtil.js'
for (let i = 0; i <= target.length; i++) {
  const s = target.slice(i)
  const r = new RegExp(re.source)
  console.log(`  slice(${i})="${s}":`, r.test(s))
}