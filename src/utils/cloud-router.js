import axios from 'axios'
import bus from 'components/common/bus'
import { EVENTS as events } from 'src/utils/const/eventsConst'
import NeetoError from 'app/share/error'

const DEFAULT_TIMEOUT = 30000

export class CloudFnError extends Error {
  constructor (message, code, externCode) {
    super(message)
    this.name = 'CloudFnError'
    this.code = code
    this.externCode = externCode
  }
}

function normalizeBaseUrl (url) {
  if (!url) return ''
  return url.replace(/\/+$/, '')
}

function readConfig () {
  try {
    const raw = localStorage.getItem('cloudfn.config')
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

function buildHeaders (extraHeaders) {
  const cfg = readConfig()
  const headers = {
    'content-type': 'application/json;charset=utf8',
    'vk-platform': cfg.platform || 'h5',
    ...(extraHeaders || {})
  }
  if (cfg.appId) headers['vk-appid'] = cfg.appId
  if (cfg.token) headers['uni-id-token'] = cfg.token
  if (cfg.locale) headers['vk-locale'] = cfg.locale
  return headers
}

function unwrap (data) {
  if (data && typeof data === 'object') {
    if ('result' in data && !('data' in data)) return data.result
    if ('returnCode' in data || 'code' in data) {
      const code = data.returnCode ?? data.code
      const message = data.returnMessage || data.message || '云函数请求失败'
      if (code === 0 || code === 200) {
        return 'result' in data ? data.result : data.data
      }
      throw new CloudFnError(message, code, data.externCode)
    }
  }
  return data
}

/**
 * 调用一个云函数（vk-router url 化形态）
 * @param {Object} opts
 * @param {String} opts.url       云函数相对路径，如 'user/kh/login'
 * @param {Object} [opts.data]    请求体
 * @param {Object} [opts.headers] 额外 header
 * @param {Number} [opts.timeout] 超时毫秒
 * @returns {Promise<any>}
 */
export async function callFunction ({ url, data = {}, headers = {}, timeout = DEFAULT_TIMEOUT }) {
  const cfg = readConfig()
  const baseUrl = normalizeBaseUrl(cfg.baseUrl)
  if (!baseUrl) {
    throw new CloudFnError('尚未配置云函数 baseUrl，请在设置中填写', 'NO_BASE_URL')
  }
  const fullUrl = `${baseUrl}/${url.replace(/^\/+/, '')}`

  let response
  try {
    response = await axios({
      method: 'POST',
      url: fullUrl,
      data,
      headers: buildHeaders(headers),
      timeout
    })
  } catch (e) {
    const message = (e && e.response && e.response.data && e.response.data.message)
      || (e && e.message)
      || '云函数网络异常'
    const code = (e && e.response && e.response.status) || 'NETWORK_ERROR'
    const err = new CloudFnError(message, code)
    bus.$emit(events.REQUEST_ERROR, new NeetoError(message, code))
    throw err
  }
  return unwrap(response.data)
}

/**
 * 以 FormData 形式上传到云函数
 * @param {Object} opts
 * @param {String} opts.url
 * @param {FormData|Blob} opts.payload
 * @param {String} [opts.fieldName='file'] 表单字段名
 * @param {Object} [opts.extraFields]      额外的非文件字段
 * @param {Object} [opts.headers]
 */
export async function uploadToFunction ({ url, payload, fieldName = 'file', extraFields = {}, headers = {} }) {
  const cfg = readConfig()
  const baseUrl = normalizeBaseUrl(cfg.baseUrl)
  if (!baseUrl) {
    throw new CloudFnError('尚未配置云函数 baseUrl', 'NO_BASE_URL')
  }
  const fullUrl = `${baseUrl}/${url.replace(/^\/+/, '')}`

  const form = new FormData()
  if (payload instanceof FormData) {
    for (const [k, v] of payload.entries()) form.append(k, v)
  } else {
    form.append(fieldName, payload)
  }
  Object.entries(extraFields || {}).forEach(([k, v]) => form.append(k, v))

  const merged = buildHeaders(headers)
  delete merged['content-type']

  const response = await axios({
    method: 'POST',
    url: fullUrl,
    data: form,
    headers: merged,
    timeout: DEFAULT_TIMEOUT * 2
  })
  return unwrap(response.data)
}

export const __testing = { normalizeBaseUrl, readConfig, buildHeaders, unwrap }