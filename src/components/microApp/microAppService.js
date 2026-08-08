/**
 * 微应用（聊天弹框里的 wujie 子应用 + 全屏删除特效 overlay）辅助工具
 *
 * 负责：
 *  - 默认应用列表（首次启动 / key 不存在时）
 *  - devUrl / url 解析（开发模式用 devUrl，打包后用 url）
 *  - displayMode 区分抽屉 / 全屏两种展示形态
 *  - isBuiltIn 标记内置条目，内置条目由代码注入、不可被用户删除
 *
 * 数据存于 SQLite `app_state` key = 'setting/microApps'
 *
 * v2026-08-08 演进：
 *   - 新增字段 displayMode: 'drawer'（默认，聊天抽屉右侧）/ 'fullscreen'（全屏 dialog，
 *     用于删除特效等业务一次性唤起）
 *   - 新增字段 isBuiltIn: boolean，标记内置条目；用户编辑弹框看不到该字段，
 *     微应用列表的删除按钮在 isBuiltIn=true 时隐藏
 *   - 新增 BUILTIN_ECHO_MONSTER_DELETER_ID = 'echo-monster-deleter'：内置小怪兽特效 id，
 *     NoteList.deleteCategoryHandler 通过这个 id 找到对应微应用条目，触发全屏 overlay
 */

export const MICRO_APPS_STORAGE_KEY = 'setting/microApps'

/**
 * 全屏 displayMode 的合法值
 */
export const MICRO_APP_DISPLAY_MODES = Object.freeze({
  DRAWER: 'drawer',
  FULLSCREEN: 'fullscreen'
})

/**
 * 内置条目 id 常量。
 * 注意：rename 整个 repo 时（如 _plugins/echo-monster-deleter 改名）一并更新这里。
 */
export const BUILTIN_ECHO_MONSTER_DELETER_ID = 'echo-monster-deleter'

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
 * 内置微应用列表。
 *
 * 设计要点：
 *   - **完全由代码控制**：用户在「设置 → 通用 → 微应用」面板看不到新增 / 删除按钮，
 *     编辑弹框里 isBuiltIn=true 时所有字段只读。
 *   - 内置条目的 url / devUrl 在 normalizeMicroApps 阶段被强制刷成 BUILTIN_APPS 里
 *     的最新值（除非用户已编辑过 url / devUrl 且保留 enabled 状态 —— 这种情况下保留
 *     用户修改，参见 mergeBuiltInApps）。
 *   - 业务方（如 NoteList.deleteCategoryHandler）通过 id 拿到对应内置条目，触发业务逻辑。
 */
export const BUILTIN_APPS = Object.freeze([
  {
    id: 'echo-monster-deleter',
    name: '小怪兽删除特效',
    icon: 'el-icon-magic-stick',
    url: '', // 由 normalizeMicroApps 在打包模式下回填 file://${appBasePath}_plugins/...
    devUrl: '', // 由 normalizeMicroApps 在 dev 模式下回填 http://localhost:5175/
    isDefault: false,
    enabled: false, // 默认关闭 —— 用户仍是简单二次确认；开启后才走怪兽特效 overlay
    isMobile: false,
    displayMode: MICRO_APP_DISPLAY_MODES.FULLSCREEN,
    isBuiltIn: true
  }
])

/**
 * 把内置条目注入默认列表。返回新数组（不修改入参）。
 * 注意：本函数只用于「首次初始化」—— 升级场景下不能用 buildDefaultMicroApps 覆盖用户已存的列表，
 * 而应该用 mergeBuiltInApps 把缺失的内置条目补进去（保留用户修改）。
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
      isMobile: false,
      displayMode: MICRO_APP_DISPLAY_MODES.DRAWER,
      isBuiltIn: false
    },
    {
      id: 'coolma',
      name: 'coolma',
      icon: 'el-icon-cloudy',
      url: 'https://static-59728804-d890-4267-8e45-393e10b3c780.bspapp.com/',
      devUrl: '',
      isDefault: false,
      enabled: true,
      isMobile: true,
      displayMode: MICRO_APP_DISPLAY_MODES.DRAWER,
      isBuiltIn: false
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
      isMobile: false,
      displayMode: MICRO_APP_DISPLAY_MODES.DRAWER,
      isBuiltIn: false
    },
    ...BUILTIN_APPS.map(app => ({ ...app }))
  ]
}

/**
 * 归一化一条微应用记录，补齐缺失字段，过滤掉完全没用的残缺记录。
 *
 * 内置条目（isBuiltIn=true）的 url / devUrl 在这里会被强制刷成最新代码值，
 * 因为内置子项目的 build 产物路径可能随仓库迁移而变化。如果不强制刷，用户改 enabled
 * 时拿到的还是旧 url，怪兽特效就走不到最新资源。
 *
 * 【注意】mergeBuiltInApps 是唯一允许「保留用户对内置条目的修改」的入口；
 * merge 阶段不再走 normalizeMicroApp 内置强制刷新逻辑（参见 mergeBuiltInApps 注释）。
 */
export function normalizeMicroApp (raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || '').trim()
  if (!id) return null
  const builtinDef = BUILTIN_APPS.find(a => a.id === id)
  const isBuiltIn = builtinDef ? true : Boolean(raw.isBuiltIn)
  const baseDisplayMode = builtinDef
    ? builtinDef.displayMode
    : (raw.displayMode === MICRO_APP_DISPLAY_MODES.FULLSCREEN
        ? MICRO_APP_DISPLAY_MODES.FULLSCREEN
        : MICRO_APP_DISPLAY_MODES.DRAWER)
  return {
    id,
    name: String(raw.name || id),
    icon: String(raw.icon || 'el-icon-chat-dot-round'),
    url: isBuiltIn && builtinDef ? String(builtinDef.url || '') : String(raw.url || ''),
    devUrl: isBuiltIn && builtinDef ? String(builtinDef.devUrl || '') : String(raw.devUrl || ''),
    isDefault: Boolean(raw.isDefault),
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    isMobile: raw.isMobile === true,
    displayMode: baseDisplayMode,
    isBuiltIn
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
 * 涉及字段：url / devUrl / displayMode（displayMode 影响宿主壳是 drawer 还是 fullscreen）。
 */
function microAppMountKey (app) {
  if (!app) return ''
  return `${app.url || ''}::${app.devUrl || ''}::${app.displayMode || 'drawer'}`
}

/**
 * 对比两份微应用列表，返回需要重新挂载（destroy + 重新 start）的 id 集合：
 *  - 内容字段（url/devUrl/displayMode）变化了的
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

/**
 * 把 BUILTIN_APPS 合并进现有列表（用于升级场景）：
 *   - 内置条目在列表里**已存在** → 完全不动（保留用户的 enabled / url / devUrl / name 等）
 *   - 内置条目**不在列表里** → 追加（用户首次升级时拿到新内置条目，默认 isBuiltIn=true / enabled=false）
 *   - 普通条目原样保留
 *
 * 注意：本函数不走 normalizeMicroApp（避免对已存在的内置条目强制刷 url / devUrl
 * 把用户已修改的值吃掉）；只对新增条目走 normalize 以补齐默认值。
 *
 * 用于 boot 阶段的「一次性迁移」：从旧版本升级上来的用户，microApps 列表里可能没
 * echo-monster-deleter；这里补进去。返回新数组。
 */
export function mergeBuiltInApps (rawList) {
  const existing = Array.isArray(rawList) ? rawList.filter(Boolean) : []
  const existingIds = new Set(existing.map(a => a.id))
  const builtinIds = new Set(BUILTIN_APPS.map(a => a.id))
  const missing = BUILTIN_APPS.filter(a => !existingIds.has(a.id))
  if (!missing.length) {
    // 不增不减；对每个条目按以下规则归一化：
    //   - id 在 BUILTIN_APPS 里（内置条目）→ 完全保留用户原值（不动 url/devUrl/enabled 等）
    //   - 其他条目 → 走 normalizeMicroApp 补齐默认值 / 合法化 displayMode
    return existing.map(a => {
      if (a && builtinIds.has(a.id)) {
        // 内置条目：仅补字段，不动关键 url / devUrl / enabled
        return {
          id: a.id,
          name: String(a.name || a.id),
          icon: String(a.icon || 'el-icon-chat-dot-round'),
          url: typeof a.url === 'string' ? a.url : '',
          devUrl: typeof a.devUrl === 'string' ? a.devUrl : '',
          isDefault: Boolean(a.isDefault),
          enabled: a.enabled === undefined ? true : Boolean(a.enabled),
          isMobile: a.isMobile === true,
          displayMode: a.displayMode === MICRO_APP_DISPLAY_MODES.FULLSCREEN
            ? MICRO_APP_DISPLAY_MODES.FULLSCREEN
            : MICRO_APP_DISPLAY_MODES.DRAWER,
          isBuiltIn: true
        }
      }
      return normalizeMicroApp(a)
    })
  }
  // 有缺失内置条目：已有列表（同样按 builtinIds 区分处理）+ 新追加的内置条目
  return [
    ...existing.map(a => {
      if (a && builtinIds.has(a.id)) {
        return {
          id: a.id,
          name: String(a.name || a.id),
          icon: String(a.icon || 'el-icon-chat-dot-round'),
          url: typeof a.url === 'string' ? a.url : '',
          devUrl: typeof a.devUrl === 'string' ? a.devUrl : '',
          isDefault: Boolean(a.isDefault),
          enabled: a.enabled === undefined ? true : Boolean(a.enabled),
          isMobile: a.isMobile === true,
          displayMode: a.displayMode === MICRO_APP_DISPLAY_MODES.FULLSCREEN
            ? MICRO_APP_DISPLAY_MODES.FULLSCREEN
            : MICRO_APP_DISPLAY_MODES.DRAWER,
          isBuiltIn: true
        }
      }
      return normalizeMicroApp(a)
    }),
    ...missing.map(a => normalizeMicroApp(a))
  ]
}
