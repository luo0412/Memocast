import { CLASS_OR_ID } from '../../../config'

const createEchoNodeId = (token, echoId, definitionId, echoName) => {
  const start = token?.range?.start ?? ''
  const end = token?.range?.end ?? ''
  const raw = String(token?.raw || '')
  return `echo-${echoId || definitionId || echoName}-${start}-${end}-${raw.length}`
}

export default function echoAnno (h, cursor, block, token, outerClass) {
  const className = this.getClassName(outerClass, block, token, cursor)
  const echoName = String(token.echoName || '').trim() || '回响'
  const value = String(
    typeof token?.attrsParsed?.value === 'string'
      ? token.attrsParsed.value
      : token.prompt || ''
  )
  const echoId = String(
    token.echoId ||
    token?.attrsParsed?.id ||
    (token.echoName ? echoName : '')
  ).trim()
  const definitionId = String(
    token.definitionId ||
    token?.attrsParsed?.definitionId ||
    ''
  ).trim()
  const hasExplicitWidth = token?.attrsParsed?.width !== undefined || token?.attrsParsed?.W !== undefined
  const hasExplicitHeight = token?.attrsParsed?.height !== undefined || token?.attrsParsed?.H !== undefined
  const width = String(
    token?.attrsParsed?.width ||
    token?.attrsParsed?.W ||
    ''
  ).trim()
  const height = String(
    token?.attrsParsed?.height ||
    token?.attrsParsed?.H ||
    ''
  ).trim()
  const summary = String(value || '').replace(/\s+/g, ' ').trim()
  const title = summary ? `${echoName}: ${summary}` : echoName
  const echoNodeId = createEchoNodeId(token, echoId, definitionId, echoName)

  const hostStyle = {}
  if (hasExplicitWidth) hostStyle.width = width
  if (hasExplicitHeight) hostStyle.height = height

  const dataset = {
    start: token.range.start,
    end: token.range.end,
    raw: token.raw,
    echoName,
    echoId: echoId || '',
    echoDefinitionId: definitionId,
    echoNodeId,
    echoValue: value,
    // 永远为 "true"：echoAnno.js 渲染的是 inline placeholder，没有 block 级自定义 HTML
    echoInline: 'true'
  }
  if (hasExplicitWidth) dataset.echoWidth = width
  if (hasExplicitHeight) dataset.echoHeight = height
  // 把 token 的 attrsParsed（@离析{density:'very-loose'} 这种）原样写到 host.dataset，
  // 让 EchoRuntime._readChantAttrs() 在 afterRender() 时能拿到实例参数。
  const parsedAttrs = (token && token.attrsParsed && typeof token.attrsParsed === 'object')
    ? token.attrsParsed
    : null
  let echoAttrsJson = ''
  if (parsedAttrs) {
    try {
      // 把 value/width/height 这种已知字段合并到 props，再补 kind/runeId 让 handler 能 fallback 用上
      const merged = { ...parsedAttrs, value, echoName, echoId, definitionId }
      echoAttrsJson = JSON.stringify(merged)
      dataset.echoAttrsJson = echoAttrsJson
    } catch (error) { /* ignore */ }
  }

  return [
    h(`span.${className}.ag-echo-anno-token.${CLASS_OR_ID.AG_INLINE_RULE}`, {
      dataset,
      attrs: Object.assign(
        {
          spellcheck: 'false',
          title,
          contenteditable: 'false'
        },
        echoAttrsJson ? { 'data-echo-attrs-json': echoAttrsJson } : {}
      ),
      style: hostStyle
    }, [
      h('span.ag-echo-placeholder-marker', {
        attrs: {
          contenteditable: 'false'
        }
      }, [
        h('i.ag-echo-anno-icon.material-icons', {
          attrs: {
            contenteditable: 'false'
          }
        }, 'play_arrow'),
        h('span.ag-echo-anno-name', {
          attrs: {
            contenteditable: 'false'
          }
        }, echoName),
        summary ? h('span.ag-echo-anno-value', {
          attrs: {
            contenteditable: 'false'
          }
        }, `: ${summary}`) : null
      ].filter(Boolean))
    ])
  ]
}
