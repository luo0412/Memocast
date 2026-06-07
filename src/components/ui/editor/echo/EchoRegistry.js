import EchoRuntime from './EchoRuntime'

const normalizeEchoName = (value = '') => String(value || '').trim()

export default class EchoRegistry {
  constructor (echoCards = []) {
    this.runtime = new EchoRuntime({ registry: this })
    this.refresh(echoCards)
  }

  refresh (echoCards = []) {
    this.echoCards = Array.isArray(echoCards) ? echoCards : []
    this.echoMap = this.echoCards.reduce((acc, echo) => {
      const name = normalizeEchoName(echo?.name)
      if (name) {
        acc.set(name, {
          ...echo,
          name,
          anno_source: echo?.anno_source || echo?.template || ''
        })
      }
      return acc
    }, new Map())
    this.runtime.invalidate()
  }

  getAll () {
    return Array.from(this.echoMap.values())
  }

  getByName (name = '') {
    return this.echoMap.get(normalizeEchoName(name)) || null
  }

  has (name = '') {
    return this.echoMap.has(normalizeEchoName(name))
  }

  render (token = {}) {
    return this.runtime.render(token, this.getByName(token.echoName))
  }

  renderToHtml (token = {}) {
    return this.runtime.renderToHtml(token, this.getByName(token.echoName))
  }
}
