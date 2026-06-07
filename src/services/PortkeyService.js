import Portkey from 'portkey-ai'
import DatabaseClient from 'src/utils/DatabaseClient'

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value

  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function toPortkeyClientConfig(modelConfig) {
  if (!modelConfig || modelConfig.provider_type !== 'portkey') {
    return null
  }

  return {
    apiKey: modelConfig.api_key || '',
    virtualKey: modelConfig.virtual_key || undefined,
    baseURL: modelConfig.base_url || undefined,
    defaultHeaders: parseJsonField(modelConfig.headers_json)
  }
}

const PortkeyService = {
  async getDefaultConfig () {
    const configs = await DatabaseClient.aiModels.getAll()
    const defaultConfig = configs.find(item => item.is_default && item.provider_type === 'portkey')

    if (!defaultConfig) {
      return null
    }

    return await DatabaseClient.aiModels.getById(defaultConfig.id)
  },

  async createClient () {
    const modelConfig = await this.getDefaultConfig()
    const clientConfig = toPortkeyClientConfig(modelConfig)

    if (!clientConfig || !clientConfig.apiKey || !clientConfig.virtualKey) {
      return null
    }

    return new Portkey(clientConfig)
  },

  async chat (messages, overrides = {}) {
    const modelConfig = await this.getDefaultConfig()
    const client = await this.createClient()

    if (!modelConfig || !client) {
      throw new Error('Portkey default model config is unavailable')
    }

    return await client.chat.completions.create({
      messages,
      model: overrides.model || modelConfig.model,
      ...parseJsonField(modelConfig.extra_config_json),
      ...overrides
    })
  }
}

export default PortkeyService
