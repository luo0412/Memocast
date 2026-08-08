/**
 * 子应用 ↔ 主应用 bus 双向通信封装
 *
 * 设计：
 *   - 子应用通过 window.$wujie.bus（wujie-vue2 注入）收发事件
 *   - emit / on / off 三个最基本方法直接代理到 bus
 *   - request(kind, payload) 走 requestId 配对，主项目回包走同一通道
 *     - 子应用发出 'microapp:delete-effect:request' { requestId, kind, payload }
 *     - 主项目回 'microapp:delete-effect:response' { requestId, ok, result | error }
 *
 * 使用：
 *   import microAppBus from './utils/microAppBus.js'
 *   microAppBus.on('foo', handler)
 *   microAppBus.emit('bar', { ... })
 *   const result = await microAppBus.request('get-cursor-pos', { ... })
 *
 * 独立运行（无 wujie）时：
 *   - isAvailable() 返回 false
 *   - on / off 是 noop
 *   - emit 走 console.log（方便 demo 模式调试）
 *   - request 走本地 fallback：get-cursor-pos 返回窗口中心；其它 kind 抛错
 */

const REQUEST_EVENT = 'microapp:delete-effect:request'
const RESPONSE_EVENT = 'microapp:delete-effect:response'

function getBus () {
  if (typeof window === 'undefined') return null
  // wujie-vue2 在子应用里把 bus 挂到 window.$wujie.bus
  const wj = window.$wujie
  if (wj && wj.bus) return wj.bus
  // 兼容：某些场景直接挂 window.bus
  if (window.__WUJIE_BUS__) return window.__WUJIE_BUS__
  return null
}

function genId () {
  return 'mr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

const pendingRequests = new Map()

const microAppBus = {
  isAvailable () {
    return Boolean(getBus())
  },

  on (event, handler) {
    const bus = getBus()
    if (!bus) return
    try { bus.$on(event, handler) } catch (_) { /* noop */ }
  },

  off (event, handler) {
    const bus = getBus()
    if (!bus) return
    try { bus.$off(event, handler) } catch (_) { /* noop */ }
  },

  emit (event, payload) {
    const bus = getBus()
    if (bus) {
      try { bus.$emit(event, payload) } catch (e) { console.warn('[microAppBus] emit failed:', e) }
      return
    }
    // 独立模式 fallback：仅 console，方便排查
    if (typeof console !== 'undefined') {
      console.info('[microAppBus] (standalone) emit', event, payload)
    }
  },

  /**
   * 异步请求主项目处理某个 kind（kind 由主项目侧的 echoMonsterDeleterBridge 解释）
   * @returns {Promise<any>}
   */
  request (kind, payload, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 3000
    const bus = getBus()
    if (!bus) {
      // 独立模式兜底
      return this._standaloneFallback(kind, payload)
    }
    const requestId = genId()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId)
        reject(new Error(`microAppBus.request('${kind}') timeout after ${timeoutMs}ms`))
      }, timeoutMs)
      pendingRequests.set(requestId, { resolve, reject, timer, kind })

      const onResponse = (envelope = {}) => {
        const entry = pendingRequests.get(envelope.requestId)
        if (!entry) return
        pendingRequests.delete(envelope.requestId)
        clearTimeout(entry.timer)
        if (envelope.ok) entry.resolve(envelope.result)
        else {
          const err = new Error(envelope.error?.message || `microAppBus.request('${entry.kind}') failed`)
          if (envelope.error?.code) err.code = envelope.error.code
          entry.reject(err)
        }
      }

      // 一次性 listener：每次注册一个新的（避免同时多个 request 串台）
      // —— 注意：wujie bus 的 $on 会重复注册，所以用 $once 语义
      bus.$once(RESPONSE_EVENT, onResponse)

      bus.$emit(REQUEST_EVENT, {
        requestId,
        kind,
        payload,
        ts: Date.now()
      })
    })
  },

  /**
   * 独立模式（无 wujie）下的最小兜底实现。
   * 只支持 get-cursor-pos / get-screen-info 这两个简单 kind；
   * 其它 kind 抛错，让上层 catch 走默认行为。
   */
  _standaloneFallback (kind, payload) {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
    if (kind === 'get-cursor-pos') {
      return Promise.resolve({ x: window.innerWidth / 2, y: window.innerHeight / 2, source: 'fallback-center' })
    }
    if (kind === 'get-screen-info') {
      return Promise.resolve({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0,
        source: 'fallback'
      })
    }
    return Promise.reject(new Error(`microAppBus: unknown kind '${kind}' in standalone mode`))
  }
}

export default microAppBus
export { REQUEST_EVENT, RESPONSE_EVENT }
