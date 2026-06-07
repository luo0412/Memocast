import { CLASS_OR_ID } from '../../../config'

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

  return [
    h(`span.${CLASS_OR_ID.AG_INLINE_RULE}.ag-echo-anno-token`, {
      dataset: {
        start: token.range.start,
        end: token.range.end,
        raw: token.raw,
        echoName,
        echoId,
        echoDefinitionId: definitionId,
        echoValue: value
      },
      attrs: {
        spellcheck: 'false',
        title
      }
    }, [
      h('span.ag-echo-inline-chip__icon', [
        h('i.material-icons.ag-echo-placeholder-icon-font', ['graphic_eq'])
      ]),
      h('span.ag-echo-inline-chip__body', [
        h('span.ag-echo-inline-chip__title', [echoName]),
        summary ? h('span.ag-echo-inline-chip__desc', [summary]) : null
      ])
    ])
  ]
}
