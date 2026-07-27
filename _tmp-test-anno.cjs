// 模拟 builtin-echo-shared.handlerDoc
const handlerDoc = (docLines = []) => {
  const banner = (Array.isArray(docLines) ? docLines : [])
    .map(line => '//   ' + line)
    .join('\n  ')
  return `${banner}\n  afterRender (node, attrs = {}) {`
}

const source = `export default {
  // some banner,
  kind: 'echo-chant',
  id: 'nice',
  render (context = {}) {
    return { html: '<span>nice</span>' }
  },
  ${handlerDoc([
    '【handler】把 block 内除 @nice 之外的节点用 <mark> 包起来；cleanup 时解包'
  ])}
    const $rune = $('hello')
    return () => {}
  }
}`

console.log('--- SOURCE ---')
console.log(source)
console.log('--- COMPILE ---')
try {
  const f = new Function(source.replace(/export\s+default/, 'return '))
  const def = f()
  console.log('compile OK; keys:', Object.keys(def))
  console.log('afterRender:', typeof def.afterRender)
} catch (e) {
  console.log('compile FAILED:', e.message)
}