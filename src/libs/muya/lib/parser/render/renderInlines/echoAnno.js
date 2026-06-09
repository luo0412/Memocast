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
  const echoId = String(token.echoId || token?.attrsParsed?.id || '').trim() || echoName
  const definitionId = String(token.definitionId || token?.attrsParsed?.definitionId || '').trim()
  const summary = String(value || '').replace(/\s+/g, ' ').trim()
  const title = summary ? `${echoName}: ${summary}` : echoName
  const echoNodeId = createEchoNodeId(token, echoId, definitionId, echoName)

  return [
    h(`span.${className}.ag-echo-anno-token.${CLASS_OR_ID.AG_INLINE_RULE}`, {
      dataset: {
        start: token.range.start,
        end: token.range.end,
        raw: token.raw,
        echoName,
        echoId,
        echoDefinitionId: definitionId,
        echoNodeId,
        echoValue: value
      },
      attrs: {
        spellcheck: 'false',
        title,
        contenteditable: 'false'
      }
    })
  ]
}
