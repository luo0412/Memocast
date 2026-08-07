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
 *
 * 「vue2-sfc-playground」是 _plugins/vue2-sfc-playground 的本地入口，
 * dev 模式走 http://127.0.0.1:3333/（playground 的 vite dev server），
 * production 模式走内置 _plugins/vue2-sfc-playground/dist/index.html（file:// 加载）。
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
      isMobile: true
    },
    {
      id: 'vue2-sfc-playground',
      name: 'Vue2 SFC Playground',
      icon: 'el-icon-cpu',
      // dev 模式：走 playground 自己的 vite dev server，
      // vite proxy 会把 /parse 转发到主进程 18090 HTTP 服务，
      // 因此 wujie iframe 内 axios.post 命中本地 /parse → 主进程 IPC 同款。
      devUrl: 'http://localhost:3333/',
      // production 模式：从仓库内 _plugins/vue2-sfc-playground/dist 加载（需先 yarn build）。
      // 留空字符串意味着 resolveActiveUrl 在 prod 下回退到 devUrl；用户可自行在设置里改成 file://。
      url: '',
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
