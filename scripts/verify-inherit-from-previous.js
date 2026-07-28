// 验证「上一节点 value 继承」helper。
// 这些 helper 当前散落在 echoInherit.js / echoPayloadCodec.js / echoCore.js 里，
// 我们走 echoCore 聚合入口拿。
const path = require('path')

async function main () {
  const echoCoreUrl = `file:///${path.resolve('src/components/echo/echoCore.js').replace(/\\/g, '/')}`
  const mod = await import(echoCoreUrl)
  const {
    isInheritFromPreviousEnabled,
    echoInheritFromPrevious,
    extractPrevEchoTokenValue,
    encodeEchoPayload,
    decodeEchoPayload,
    createEchoPlaceholderPayload
  } = mod

  let pass = 0
  let fail = 0
  const fails = []

  function check (name, cond, info) {
    if (cond) {
      console.log(`[OK]   ${name}`)
      pass += 1
    } else {
      console.log(`[FAIL] ${name}${info ? ' info=' + JSON.stringify(info) : ''}`)
      fails.push({ name, info })
      fail += 1
    }
  }

  // --- 1. isInheritFromPreviousEnabled 各种 truthy 形式 ---
  check('isInheritFromPreviousEnabled 默认 false（空对象）', isInheritFromPreviousEnabled({}) === false)
  check('isInheritFromPreviousEnabled({value: "abc"}) === false', isInheritFromPreviousEnabled({ value: 'abc' }) === false)
  check('isInheritFromPreviousEnabled({inheritFromPrevious: true})', isInheritFromPreviousEnabled({ inheritFromPrevious: true }) === true)
  check('isInheritFromPreviousEnabled({inheritFromPrevious: "true"})', isInheritFromPreviousEnabled({ inheritFromPrevious: 'true' }) === true)
  check('isInheritFromPreviousEnabled({inheritFromPrevious: "yes"})', isInheritFromPreviousEnabled({ inheritFromPrevious: 'yes' }) === true)
  check('isInheritFromPreviousEnabled({inheritFromPrevious: "false"})', isInheritFromPreviousEnabled({ inheritFromPrevious: 'false' }) === false)
  check('isInheritFromPreviousEnabled({inherit_from_previous: true})', isInheritFromPreviousEnabled({ inherit_from_previous: true }) === true)

  // --- 2. echoInheritFromPrevious 多挂载位置（顶层 + echo.props）---
  check('echoInheritFromPrevious 顶层字段', echoInheritFromPrevious({ inheritFromPrevious: true }) === true)
  check('echoInheritFromPrevious echo.props 字段', echoInheritFromPrevious({ props: { inheritFromPrevious: true } }) === true)
  check('echoInheritFromPrevious 顶层 + props 双 false', echoInheritFromPrevious({ props: {} }) === false)

  // --- 3. extractPrevEchoTokenValue 提取上一节点 value ---
  const md = [
    '前面一段普通 markdown。',
    '',
    '@笔记摘录{value: "今天读了浪潮之巅", definitionId: "d1", id: "a"}(这是 prompt A)',
    '',
    '@笔记摘录{id: "b"}(这是 prompt B)',
    '',
    '末尾段。'
  ].join('\n')

  const target = '@笔记摘录{id: "b"}'
  const targetIdx = md.indexOf(target)
  const prevA = extractPrevEchoTokenValue(md, targetIdx)
  check('prev 提取任意 echo token (id=b 之前)', prevA === '今天读了浪潮之巅', { prevA })

  const prevByName = extractPrevEchoTokenValue(md, targetIdx, { echoName: '笔记摘录' })
  check('prev 按 echoName 过滤', prevByName === '今天读了浪潮之巅', { prevByName })

  const prevUnknown = extractPrevEchoTokenValue(md, targetIdx, { echoName: '不存在的' })
  check('prev echoName 不匹配返回空', prevUnknown === '', { prevUnknown })

  // --- 4. encode/decode payload round-trip（新结构：解出 { version, prompt, props }）---
  const enc = encodeEchoPayload({ prompt: 'prompt X', props: { value: 'v1', n: 2 } })
  const dec = decodeEchoPayload(enc)
  check('encode/decode round-trip prompt', dec.prompt === 'prompt X', { dec })
  check('encode/decode round-trip props.value', dec.props && dec.props.value === 'v1', { dec })

  // --- 5. createEchoPlaceholderPayload echo 名片层声明开启 + 传入 inheritedValue ---
  const echo = { id: 'd1', name: '笔记摘录', inheritFromPrevious: true }
  const ph = createEchoPlaceholderPayload(echo, { inheritFromPrevious: true, inheritedValue: '继承段落前文' })
  const decoded = decodeEchoPayload(ph)
  check(
    'createEchoPlaceholderPayload inherit=true + prevValue 注入 props.value/prompt',
    decoded.prompt === '继承段落前文' && decoded.props.value === '继承段落前文' && decoded.props.inheritFromPrevious === true,
    { decoded }
  )
  check(
    'createEchoPlaceholderPayload output 携带 definitionId',
    decoded.props.definitionId === 'd1',
    { decoded }
  )

  // --- 6. echo 名片层未声明时，createEchoPlaceholderPayload 默认不开启 ---
  const plain = { id: 'd2', name: 'nice' }
  const ph2 = createEchoPlaceholderPayload(plain)
  const decoded2 = decodeEchoPayload(ph2)
  check(
    'createEchoPlaceholderPayload 默认未开启（inheritFromPrevious !== true）',
    decoded2.props.inheritFromPrevious === false && decoded2.props.value === '',
    { decoded2 }
  )

  console.log(`\n=== summary: pass=${pass}, fail=${fail}, total=${pass + fail}`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
