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
  const width = String(
    token?.attrsParsed?.width ||
    token?.attrsParsed?.W ||
    '50px'
  ).trim()
  const height = String(
    token?.attrsParsed?.height ||
    token?.attrsParsed?.H ||
    '20px'
  ).trim()
  const summary = String(value || '').replace(/\s+/g, ' ').trim()
  const title = summary ? `${echoName}: ${summary}` : echoName
  const echoNodeId = createEchoNodeId(token, echoId, definitionId, echoName)

  // Set width/height directly on the host span (inline-flex supports them natively).
  return [
    h(`span.${className}.ag-echo-anno-token.${CLASS_OR_ID.AG_INLINE_RULE}`, {
      dataset: {
        start: token.range.start,
        end: token.range.end,
        raw: token.raw,
        echoName,
        echoId: echoId || '',
        echoDefinitionId: definitionId,
        echoNodeId,
        echoValue: value,
        echoWidth: width,
        echoHeight: height
      },
      attrs: {
        spellcheck: 'false',
        title,
        contenteditable: 'false'
      },
      style: { width, height }
    }, [
      h('span.ag-echo-placeholder-marker', {
        attrs: {
          contenteditable: 'false'
        }
      }, [
        h('span.ag-echo-anno-icon', {
          attrs: {
            contenteditable: 'false'
          }
        }, '🔊'),
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
