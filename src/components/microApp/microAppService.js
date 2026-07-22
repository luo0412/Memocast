import DatabaseClient from 'src/utils/DatabaseClient'

/**
 * 微应用（聊天弹框里的 wujie 子应用）辅助工具
 *
 * 负责：
 *  - 默认应用列表（首次启动 / key 不存在时）
 *  - devUrl / url 解析（开发模式用 devUrl，打包后用 url）
 *
 * 数据存于 SQLite `app_state` key = 'setting/microApps'
 */

export const MICRO_APPS_STORAGE_KEY = 'setting/microApps'
const MICRO_APPS_PRESET_VERSION_KEY = 'setting/microApps/presetVersion'
const MICRO_APPS_PRESET_VERSION = 1

function parsePresetVersion (value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    const version = Number(parsed)
    return Number.isFinite(version) ? version : 0
  } catch (_) {
    return 0
  }
}

/**
 * 是否处于开发模式（dev-server 启着的状态）
 * - quasar dev 或 yarn run dev 都是 true
 * - 打包后 / electron 内置 production 时是 false
 */
export function isDevEnv () {
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.NODE_ENV === 'development') return true
      if (process.env.MODE === 'development') return true
      if (process.env.DEV === true || process.env.DEV === 'true') return true
    }
  } catch (_) { /* ignore */ }
  return false
}

/**
 * 构建默认微应用列表。
 * 第一个默认应用「box-im」对应原聊天图标使用的 IM 应用（提取自老代码 microAppDrawer.vue 的硬编码 url）。
 */
export function buildDefaultMicroApps () {
  return [
    {
      id: 'box-im',
      name: '聊天',
      icon: 'el-icon-chat-dot-round',
      url: 'https://luo0412.github.io/box-im/#/',
      devUrl: 'http://localhost:18080/',
      isDefault: true,
      enabled: true,
      isMobile: false
    },
    {
      id: 'coolma',
      name: 'coolma',
      icon: 'el-icon-cloudy',
      url: 'https://static-59728804-d890-4267-8e45-393e10b3c780.bspapp.com/',
      devUrl: '',
      isDefault: false,
      enabled: true,
      isMobile: false
    }
  ]
}

/**
 * 归一化一条微应用记录，补齐缺失字段，过滤掉完全没用的残缺记录。
 */
export function normalizeMicroApp (raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || '').trim()
  if (!id) return null
  return {
    id,
    name: String(raw.name || id),
    icon: String(raw.icon || 'el-icon-chat-dot-round'),
    url: String(raw.url || ''),
    devUrl: String(raw.devUrl || ''),
    isDefault: Boolean(raw.isDefault),
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    isMobile: raw.isMobile === true
  }
}

/**
 * 将微应用列表整体归一化（自动剔除坏数据）。
 */
export function normalizeMicroApps (rawList) {
  if (!Array.isArray(rawList)) return []
  const list = rawList.map(normalizeMicroApp).filter(Boolean)
  // 保证最多一个 isDefault
  let seenDefault = false
  return list.map(item => {
    if (item.isDefault) {
      if (seenDefault) return { ...item, isDefault: false }
      seenDefault = true
    }
    return item
  })
}

/**
 * 把 buildDefaultMicroApps 里不在 currentList 的项目追加进去。
 * 重复 id（用户已有同 id）一律不动用户那一份，仅添加缺失的预置项。
 * 默认应用（isDefault）一律保持现状，不被预置覆盖。
 */
export function mergeDefaultMicroApps (currentList) {
  const base = normalizeMicroApps(currentList)
  const defaults = normalizeMicroApps(buildDefaultMicroApps())
  const existingIds = new Set(base.map(a => a.id))
  const additions = defaults.filter(d => !existingIds.has(d.id))
  return normalizeMicroApps([...base, ...additions])
}

/**
 * 若 SQLite 尚未写入当前预置版本对应的默认项，则把缺失的预置项追加进去。
 * 用于已经初始化过老默认列表的旧用户也能拿到新预置（如新增 coolma）。
 */
export async function ensureDefaultMicroAppsMigrated () {
  try {
    const raw = await DatabaseClient.appState.get(MICRO_APPS_PRESET_VERSION_KEY)
    const current = parsePresetVersion(raw)
    if (current >= MICRO_APPS_PRESET_VERSION) return false

    const stored = await DatabaseClient.microApps.getAll()
    const merged = mergeDefaultMicroApps(stored)
    if (Array.isArray(stored) && stored.length !== merged.length) {
      await DatabaseClient.microApps.saveAll(merged)
    }
    await DatabaseClient.appState.set(
      MICRO_APPS_PRESET_VERSION_KEY,
      JSON.stringify(MICRO_APPS_PRESET_VERSION)
    )
    return Array.isArray(stored) && stored.length !== merged.length
  } catch (err) {
    console.warn('[microApp] ensureDefaultMicroAppsMigrated failed:', err)
    return false
  }
}

/**
 * 解析"实际访问哪个 url"：dev 时用 devUrl，否则用 url；都没有时给空串。
 */
export function resolveActiveUrl (app) {
  if (!app) return ''
  if (isDevEnv() && app.devUrl) return app.devUrl
  return app.url || app.devUrl || ''
}

/**
 * 从已启用应用中找出默认应用；没有默认时退回第一个。
 */
export function pickDefaultApp (apps) {
  const list = normalizeMicroApps(apps).filter(a => a.enabled !== false)
  if (!list.length) return null
  return list.find(a => a.isDefault) || list[0]
}

/**
 * 判断两条微应用记录在"影响 wujie 挂载"的字段上是否等价。
 * 涉及字段：url / devUrl / icon（icon 影响左侧 tab 但不影响 wujie；为严谨起见不参与）
 */
function microAppMountKey (app) {
  if (!app) return ''
  return `${app.url || ''}::${app.devUrl || ''}`
}

/**
 * 对比两份微应用列表，返回需要重新挂载（destroy + 重新 start）的 id 集合：
 *  - 内容字段（url/devUrl/name）变化了的
 *  - 被删的（只在老列表里有的 id）
 */
export function diffMicroAppsForReload (oldList, newList) {
  const oldNorm = normalizeMicroApps(oldList)
  const newNorm = normalizeMicroApps(newList)
  const dirty = new Set()

  const oldById = new Map(oldNorm.map(a => [a.id, a]))
  const newById = new Map(newNorm.map(a => [a.id, a]))

  // 被删的 id
  for (const [id, oldItem] of oldById.entries()) {
    if (!newById.has(id)) dirty.add(id)
    else {
      const newItem = newById.get(id)
      if (microAppMountKey(oldItem) !== microAppMountKey(newItem)) {
        dirty.add(id)
      }
    }
  }
  return Array.from(dirty)
}
