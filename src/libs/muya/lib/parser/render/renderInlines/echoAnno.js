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
    echoValue: value
  }
  if (hasExplicitWidth) dataset.echoWidth = width
  if (hasExplicitHeight) dataset.echoHeight = height

  return [
    h(`span.${className}.ag-echo-anno-token.${CLASS_OR_ID.AG_INLINE_RULE}`, {
      dataset,
      attrs: {
        spellcheck: 'false',
        title,
        contenteditable: 'false'
      },
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
