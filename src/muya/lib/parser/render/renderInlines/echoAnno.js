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
  const instProps = (token && token.propsParsed && typeof token.propsParsed === 'object')
    ? token.propsParsed
    : {}
  const value = String(
    typeof instProps.value === 'string'
      ? instProps.value
      : token.prompt || ''
  )
  const echoId = String(
    token.echoId ||
    instProps.id ||
    (token.echoName ? echoName : '')
  ).trim()
  const definitionId = String(
    token.definitionId ||
    instProps.definitionId ||
    ''
  ).trim()
  const hasExplicitWidth = instProps.width !== undefined || instProps.W !== undefined
  const hasExplicitHeight = instProps.height !== undefined || instProps.H !== undefined
  const width = String(instProps.width || instProps.W || '').trim()
  const height = String(instProps.height || instProps.H || '').trim()
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
  // 把 token 的 propsParsed（@离析{density:'very-loose'} 这种）原样写到 host.dataset，
  // 让 EchoRuntime._readEchoProps() 在 afterRender() 时能拿到实例参数。
  let echoPropsJson = ''
  if (instProps) {
    try {
      // 把 value/width/height 这种已知字段合并到 props，让 _readEchoProps 的 dataset 回退分支能直接读到实例参数。
      const merged = { ...instProps, value, echoName, echoId, definitionId }
      echoPropsJson = JSON.stringify(merged)
      dataset.echoPropsJson = echoPropsJson
    } catch (error) { /* ignore */ }
  }

  const isHideSelf = instProps.isHideSelf === true || instProps.isHideSelf === 'true'

  return [
    h(`span.${className}.ag-echo-anno-token.${CLASS_OR_ID.AG_INLINE_RULE}`, {
      dataset,
      attrs: Object.assign(
        {
          spellcheck: 'false',
          title,
          contenteditable: 'false'
        },
        echoPropsJson ? { 'data-echo-props-json': echoPropsJson } : {}
      ),
      style: hostStyle
    }, isHideSelf ? [] : [
      h('span.ag-echo-placeholder-marker', {
        attrs: {
          contenteditable: 'false'
        }
      }, [
        h('span.ag-echo-anno-at', {
          attrs: {
            contenteditable: 'false'
          }
        }, '@'),
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