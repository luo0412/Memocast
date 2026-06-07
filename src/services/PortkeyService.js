import Portkey from 'portkey-ai'
import DatabaseClient from 'src/utils/DatabaseClient'

const AI_MODEL_PROVIDER_OPENAI_COMPATIBLE = 'openai-compatible'
const AI_MODEL_PROVIDER_PORTKEY = 'portkey'

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value

  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function getProviderLabel(providerType) {
  if (providerType === AI_MODEL_PROVIDER_PORTKEY) {
    return 'Portkey'
  }

  return 'OpenAI-compatible'
}

function toPortkeyClientConfig(modelConfig) {
  if (!modelConfig || modelConfig.provider_type !== AI_MODEL_PROVIDER_PORTKEY) {
    return null
  }

  return {
    apiKey: modelConfig.api_key || '',
    virtualKey: modelConfig.virtual_key || undefined,
    baseURL: modelConfig.base_url || undefined,
    defaultHeaders: parseJsonField(modelConfig.headers_json)
  }
}

function toOpenAiCompatibleRequest(modelConfig, messages, overrides = {}) {
  const extraConfig = parseJsonField(modelConfig.extra_config_json)
  const headers = parseJsonField(modelConfig.headers_json)
  const requestBody = {
    messages,
    model: overrides.model || modelConfig.model,
    ...extraConfig,
    ...overrides
  }

  delete requestBody.baseURL
  delete requestBody.defaultHeaders
  delete requestBody.apiKey
  delete requestBody.virtualKey
  delete requestBody.headers

  return {
    url: `${String(modelConfig.base_url || '').replace(/\/$/, '')}/chat/completions`,
    body: requestBody,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${modelConfig.api_key || ''}`,
      ...headers,
      ...(overrides.headers || {})
    }
  }
}

async function runOpenAiCompatibleChat(modelConfig, messages, overrides = {}) {
  if (!modelConfig || modelConfig.provider_type !== AI_MODEL_PROVIDER_OPENAI_COMPATIBLE) {
    return null
  }

  if (!modelConfig.api_key || !modelConfig.base_url) {
    return null
  }

  const { url, body, headers } = toOpenAiCompatibleRequest(modelConfig, messages, overrides)
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  return await response.json()
}

const PortkeyService = {
  async getDefaultConfig () {
    const configs = await DatabaseClient.aiModels.getAll()
    const defaultConfig = configs.find(item => item.is_default)

    if (!defaultConfig) {
      return null
    }

    return await DatabaseClient.aiModels.getById(defaultConfig.id)
  },

  async createClient (modelConfig = null) {
    const resolvedConfig = modelConfig || await this.getDefaultConfig()
    const clientConfig = toPortkeyClientConfig(resolvedConfig)

    if (!clientConfig || !clientConfig.apiKey || !clientConfig.virtualKey) {
      return null
    }

    return new Portkey(clientConfig)
  },

  getMissingFields (modelConfig) {
    if (!modelConfig) {
      return ['provider_type', 'base_url', 'model', 'api_key']
    }

    const missingFields = []
    const providerType = String(modelConfig.provider_type || '').trim()
    const hasApiKey = Boolean(modelConfig.api_key || modelConfig.hasApiKey)
    const hasVirtualKey = Boolean(modelConfig.virtual_key || modelConfig.hasVirtualKey)

    if (!providerType) {
      missingFields.push('provider_type')
      return missingFields
    }

    if (!modelConfig.base_url) {
      missingFields.push('base_url')
    }

    if (!modelConfig.model) {
      missingFields.push('model')
    }

    if (!hasApiKey) {
      missingFields.push('api_key')
    }

    if (providerType === AI_MODEL_PROVIDER_PORTKEY && !hasVirtualKey) {
      missingFields.push('virtual_key')
    }

    return missingFields
  },

  isConfigUsable (modelConfig) {
    return this.getMissingFields(modelConfig).length === 0
  },

  getProviderLabel,

  async chat (messages, overrides = {}) {
    const modelConfig = await this.getDefaultConfig()

    if (!modelConfig) {
      throw new Error('Default AI model config is unavailable')
    }

    if (modelConfig.provider_type === AI_MODEL_PROVIDER_PORTKEY) {
      const client = await this.createClient(modelConfig)

      if (!client) {
        throw new Error('Default Portkey model config is incomplete')
      }

      return await client.chat.completions.create({
        messages,
        model: overrides.model || modelConfig.model,
        ...parseJsonField(modelConfig.extra_config_json),
        ...overrides
      })
    }

    if (modelConfig.provider_type === AI_MODEL_PROVIDER_OPENAI_COMPATIBLE) {
      const response = await runOpenAiCompatibleChat(modelConfig, messages, overrides)

      if (!response) {
        throw new Error('Default OpenAI-compatible model config is incomplete')
      }

      return response
    }

    throw new Error(`Unsupported AI provider type: ${modelConfig.provider_type}`)
  }
}

export default PortkeyService
