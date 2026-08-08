/**
 * 怪兽摧毁微应用（EchoMonsterDeleter）专属 bus 桥
 *
 * 这个桥做两件事：
 *
 * 1) 子应用 → 主项目：
 *    监听下面这些事件，把子应用的状态透出到主项目：
 *      - 'microapp:monster:ready'       子应用 mount 完成，上报 version / capabilities
 *      - 'microapp:monster:click-at'    子应用把鼠标点击坐标透传回来（overlay 透传用）
 *      - 'microapp:monster:choice'      子应用转发的对话泡选择（"是的" / "不是"）
 *      - 'microapp:monster:completed'   怪兽剧场结束（含 outcome）
 *      - 'microapp:monster:request'     子应用发起的能力请求（get-cursor-pos / get-screen-info）
 *
 * 2) 主项目 → 子应用：
 *    提供 imperative API 让 overlay.vue 直接调：
 *      - summon({ target, mousePos })       召唤怪兽对准目标
 *      - teardown()                         主动销毁 overlay
 *      - onCompleted(handler)               订阅怪兽结束事件（一次性 / 多次性由 handler 内部决定）
 *      - onReady(handler)                   订阅子应用 ready 事件
 *
 * 设计原则：
 *   - 通用 IPC（vue-sfc:parse / get-app-path 等）走 genericMicroAppIpcBridge.js
 *   - 怪兽专属业务事件（召唤 / 完成 / 鼠标坐标透传）走这个文件
 *   - 桥的生命周期跟 EchoMonsterDeleterOverlay 绑定：overlay mount 时 install，
 *     beforeDestroy 时 uninstall；不在 App 启动时 install，避免无意义监听
 */

import WujieVue from 'wujie-vue2'
import debugLogger from 'src/utils/debugLogger'

export const MONSTER_READY_EVENT = 'microapp:monster:ready'
export const MONSTER_CLICK_EVENT = 'microapp:monster:click-at'
export const MONSTER_CHOICE_EVENT = 'microapp:monster:choice'
export const MONSTER_COMPLETED_EVENT = 'microapp:monster:completed'
export const MONSTER_REQUEST_EVENT = 'microapp:monster:request'
export const MONSTER_RESPONSE_EVENT = 'microapp:monster:response'
export const MONSTER_SUMMON_EVENT = 'microapp:monster:summon'
export const MONSTER_TEARDOWN_EVENT = 'microapp:monster:teardown'

let installed = false
let uninstallRef = null

/**
 * 安装怪兽专属桥（幂等）。
 * @param {Object} [opts]
 * @param {(click:{x:number,y:number,targetGuid?:string})=>void} [opts.onClickAt]
 * @param {(choice:{label:string,targetGuid?:string})=>void} [opts.onChoice]
 * @param {(payload:{outcome:string,targetGuid?:string,targetName?:string,ts?:number})=>void} [opts.onCompleted]
 * @param {(payload:{version:string,capabilities:string[],ts:number})=>void} [opts.onReady]
 * @param {(req:{requestId:string,kind:string,payload:any})=>any|Promise<any>} [opts.resolveRequest]
 *        子应用发起的 microapp:monster:request 由这个回调处理；
 *        不传则走默认 fallback（只支持 get-cursor-pos / get-screen-info）。
 * @returns {() => void} uninstall 句柄
 */
export function installEchoMonsterDeleterBridge (opts = {}) {
  if (installed && uninstallRef) {
    debugLogger.Info('[echoMonsterDeleterBridge] 已安装，跳过重复注册')
    return uninstallRef
  }
  if (!WujieVue || !WujieVue.bus) {
    debugLogger.Info('[echoMonsterDeleterBridge] WujieVue.bus 不可用，跳过注册')
    return () => {}
  }

  const bus = WujieVue.bus
  const onReady = typeof opts.onReady === 'function' ? opts.onReady : null
  const onClickAt = typeof opts.onClickAt === 'function' ? opts.onClickAt : null
  const onChoice = typeof opts.onChoice === 'function' ? opts.onChoice : null
  const onCompleted = typeof opts.onCompleted === 'function' ? opts.onCompleted : null
  const resolveRequest = typeof opts.resolveRequest === 'function'
    ? opts.resolveRequest
    : defaultResolveRequest

  // --- 子 → 主 ---
  const readyHandler = (payload) => { safeCall(onReady, payload) }
  const clickHandler = (payload) => { safeCall(onClickAt, payload) }
  const choiceHandler = (payload) => { safeCall(onChoice, payload) }
  const completedHandler = (payload) => { safeCall(onCompleted, payload) }
  const requestHandler = async (envelope = {}) => {
    const { requestId, kind, payload } = envelope
    if (!requestId) return
    try {
      const result = await resolveRequest({ requestId, kind, payload: payload || {} })
      bus.$emit(MONSTER_RESPONSE_EVENT, {
        requestId,
        ok: true,
        result: result === undefined ? null : result
      })
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      const code = err && err.code ? err.code : 'MONSTER_REQUEST_FAILED'
      bus.$emit(MONSTER_RESPONSE_EVENT, {
        requestId,
        ok: false,
        error: { code, message }
      })
    }
  }

  bus.$on(MONSTER_READY_EVENT, readyHandler)
  bus.$on(MONSTER_CLICK_EVENT, clickHandler)
  bus.$on(MONSTER_CHOICE_EVENT, choiceHandler)
  bus.$on(MONSTER_COMPLETED_EVENT, completedHandler)
  bus.$on(MONSTER_REQUEST_EVENT, requestHandler)

  installed = true
  uninstallRef = function uninstall () {
    if (!installed) return
    try {
      bus.$off(MONSTER_READY_EVENT, readyHandler)
      bus.$off(MONSTER_CLICK_EVENT, clickHandler)
      bus.$off(MONSTER_CHOICE_EVENT, choiceHandler)
      bus.$off(MONSTER_COMPLETED_EVENT, completedHandler)
      bus.$off(MONSTER_REQUEST_EVENT, requestHandler)
    } catch (_) { /* noop */ }
    installed = false
    uninstallRef = null
    debugLogger.Info('[echoMonsterDeleterBridge] 已注销')
  }
  debugLogger.Info('[echoMonsterDeleterBridge] 已注册')

  return uninstallRef
}

/**
 * 调试 / 测试用。
 */
export function isEchoMonsterDeleterBridgeInstalled () {
  return installed
}

/**
 * 主项目侧的 imperative API：主动召唤怪兽。
 * @param {Object} payload
 * @param {Object} payload.target    { guid, name, icon?, size?, corrupt? }
 * @param {Object} [payload.mousePos] { x, y }
 */
export function summonMonster (payload = {}) {
  const bus = WujieVue && WujieVue.bus
  if (!bus) {
    debugLogger.Info('[echoMonsterDeleterBridge] summonMonster: bus 不可用')
    return false
  }
  bus.$emit(MONSTER_SUMMON_EVENT, {
    target: payload.target || null,
    mousePos: payload.mousePos || null,
    ts: Date.now()
  })
  return true
}

/**
 * 主项目侧的 imperative API：主动销毁 overlay。
 */
export function teardownMonster () {
  const bus = WujieVue && WujieVue.bus
  if (!bus) return false
  bus.$emit(MONSTER_TEARDOWN_EVENT, { ts: Date.now() })
  return true
}

// ===== internal =====
function safeCall (fn, arg) {
  if (!fn) return
  try { fn(arg) } catch (e) {
    debugLogger.Info('[echoMonsterDeleterBridge] handler threw:', e)
  }
}

/**
 * 默认的 request resolver：支持 get-cursor-pos / get-screen-info 两个 kind。
 * 子项目没拿到主项目侧的定制 resolver 时，至少这两个基础能力可用。
 *
 * get-cursor-pos 返回鼠标在屏幕上的坐标（基于 Electron 主窗口 webContents）：
 *   - 这里只能用「最后已知的 mousemove 坐标」缓存，渲染进程内监听 mousemove 后写入缓存
 *   - 由 EchoMonsterDeleterOverlay 在 mounted 时挂 mousemove listener
 *
 * get-screen-info 直接返回当前 webContents 的 innerWidth/innerHeight/dpr。
 */
export function defaultResolveRequest (envelope) {
  const { kind, payload } = envelope
  if (kind === 'get-cursor-pos') {
    return getCachedCursorPos(payload)
  }
  if (kind === 'get-screen-info') {
    return getScreenInfo()
  }
  throw Object.assign(new Error(`unknown kind '${kind}'`), { code: 'UNKNOWN_KIND' })
}

// 鼠标坐标缓存：模块级 Map，按 webContentsId 区分
const cursorPosCache = new Map() // webContentsId -> { x, y, updatedAt }

export function updateCursorPosCache (webContentsId, x, y) {
  cursorPosCache.set(webContentsId || 0, { x, y, updatedAt: Date.now() })
}

function getCachedCursorPos (payload = {}) {
  // 默认取"最近一次"；如果 caller 显式指定 webContentsId 就用那个
  const targetId = payload.webContentsId || 0
  const cached = cursorPosCache.get(targetId)
  if (cached) return cached
  // 兜底：返回窗口中心
  return {
    x: (typeof window !== 'undefined' ? window.innerWidth : 0) / 2,
    y: (typeof window !== 'undefined' ? window.innerHeight : 0) / 2,
    fallback: true,
    updatedAt: Date.now()
  }
}

function getScreenInfo () {
  if (typeof window === 'undefined') return {}
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    scrollX: window.scrollX || 0,
    scrollY: window.scrollY || 0,
    webContentsId: (typeof window !== 'undefined' && window.process && window.process.electron_binding) ? null : null
  }
}
