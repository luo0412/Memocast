import EchoRuntime from './EchoRuntime.js'

const normalizeEchoName = (value = '') => String(value || '').trim()
const normalizeEchoId = (value = '') => String(value || '').trim()

export default class EchoRegistry {
  constructor (echoCards = []) {
    this.runtime = new EchoRuntime({ registry: this })
    this.refresh(echoCards)
  }

  refresh (echoCards = []) {
    this.echoCards = Array.isArray(echoCards) ? echoCards : []
    this.echoIdMap = new Map()
    this.echoMap = this.echoCards.reduce((acc, echo) => {
      const name = normalizeEchoName(echo?.name)
      const id = normalizeEchoId(echo?.id)
      const normalizedEcho = {
        ...echo,
        id,
        name,
        anno_source: echo?.anno_source || echo?.template || ''
      }
      if (id) {
        this.echoIdMap.set(id, normalizedEcho)
      }
      if (name) {
        acc.set(name, normalizedEcho)
      }
      return acc
    }, new Map())
    this.runtime.invalidate()
  }

  canDelete (id = '') {
    const normalizedId = normalizeEchoId(id)
    if (!normalizedId) return false
    const echo = this.echoIdMap.get(normalizedId)
    return echo && !echo.isBuiltin
  }

  isBuiltin (name = '') {
    const normalizedName = normalizeEchoName(name)
    const echo = this.echoMap.get(normalizedName)
    return Boolean(echo && echo.isBuiltin)
  }

  getAll () {
    return Array.from(this.echoMap.values())
  }

  getById (id = '') {
    return this.echoIdMap.get(normalizeEchoId(id)) || null
  }

  getByName (name = '') {
    return this.echoMap.get(normalizeEchoName(name)) || null
  }

  has (name = '') {
    return this.echoMap.has(normalizeEchoName(name))
  }

  render (token = {}) {
    const definitionId = String(token?.attrsParsed?.definitionId || token?.definitionId || '').trim()
    const matchedEcho = definitionId ? this.getById(definitionId) : this.getByName(token.echoName)
    return this.runtime.render(token, matchedEcho)
  }

  renderToHtml (token = {}) {
    const definitionId = String(token?.attrsParsed?.definitionId || token?.definitionId || '').trim()
    const matchedEcho = definitionId ? this.getById(definitionId) : this.getByName(token.echoName)
    return this.runtime.renderToHtml(token, matchedEcho)
  }
}
