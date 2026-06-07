import { CLASS_OR_ID } from '../../../config'
import { encodeEchoPayload } from '../../../../../../components/ui/editor/echo/EchoRuntime'

const escapeHtmlAttribute = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const createEchoHostMarkup = (token = {}) => {
  const echoName = String(token.echoName || '').trim() || '回响'
  const payload = encodeEchoPayload({
    prompt: typeof token?.attrsParsed?.value === 'string' ? token.attrsParsed.value : token.prompt || '',
    attrs: {
      ...(token.attrsParsed || {}),
      value: typeof token?.attrsParsed?.value === 'string' ? token.attrsParsed.value : token.prompt || ''
    }
  })
  return `<span class="ag-echo-inline-host" data-echo-name="${escapeHtmlAttribute(echoName)}" data-echo-id="${escapeHtmlAttribute(echoName)}" data-echo-node-id="${escapeHtmlAttribute(`echo-inline-${token.range?.start || 0}-${token.range?.end || 0}`)}" data-echo-payload="${escapeHtmlAttribute(payload)}" contenteditable="false"></span>`
}

export default function echoAnno (h, cursor, block, token, outerClass) {
  const className = this.getClassName(outerClass, block, token, cursor)
  const hostMarkup = createEchoHostMarkup(token)

  return [
    h(`span.${className}.${CLASS_OR_ID.AG_INLINE_RULE}.ag-echo-anno-token`, {
      dataset: {
        start: token.range.start,
        end: token.range.end,
        raw: token.raw,
        echoName: token.echoName || ''
      },
      attrs: {
        contenteditable: 'false'
      },
      props: {
        innerHTML: hostMarkup
      }
    })
  ]
}
