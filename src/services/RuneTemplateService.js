/**
 * 渲染端 rune 预设模板服务（业务封装层）。
 *
 * 职责：
 *   - 暴露 listFlat / listGroupedByCategory / save / remove / fetchFromGithub / clearCache
 *   - 内部 60s 内存缓存（任何写入操作自动 invalidate）
 *   - 通过 DatabaseClient.runeTemplates 与主进程 IPC 通信
 *
 * 注意：
 *   - 本文件位于 src/services/，由渲染端引用。
 *   - 主进程同名 service (src-electron/main-process/service/rune-template-service.js) 负责
 *     schema + CRUD，本文件只做"业务外壳"。
 */

import DatabaseClient from 'src/utils/DatabaseClient'

const CACHE_TTL_MS = 60 * 1000

let cache = null
// cache: { list: [...], grouped: [...], cachedAt: number }

function isFresh () {
  return !!(cache && cache.list && (Date.now() - (cache.cachedAt || 0)) < CACHE_TTL_MS)
}

function invalidate () {
  cache = null
}

// 并发去重的 lazy seed 锁：避免多个并发调用 list* 时重复触发 seed。
let seedingPromise = null

async function ensureLoaded (force = false) {
  if (force) invalidate()
  if (isFresh()) {
    console.log(`[RUNE-TPL] ensureLoaded cache-hit list=${cache.list.length}`)
    return cache
  }
  // 注意：先把第一次读到的内容 cache 起来（即使为空数组），便于后续判断。
  let list
  try {
    list = await DatabaseClient.runeTemplates.getAll()
  } catch (err) {
    console.error('[RUNE-TPL] ensureLoaded read error:', err)
    list = []
  }
  const safeList = Array.isArray(list) ? list : []
  // 第一次（DB 为空）→ 触发一次 full-push seed（如果上一次的 push 已存在，则并发复用）。
  let needsReseed = safeList.length === 0
  if (safeList.length > 0) {
    // 即使 DB 里"看起来有内置行"，也得校验是否覆盖了 renderer 端 14 张。
    // 用户在 dev 模式下手动删空 DB 但保留其他行时，需要重建内置。
    // 简化策略：DB 为 0 张内置行时强制 reseed。
    const builtinCount = safeList.filter(r => r && (r.is_builtin === 1 || r.is_builtin === '1')).length
    if (builtinCount === 0) needsReseed = true
  }
  if (needsReseed) {
    if (!seedingPromise) {
      seedingPromise = (async () => {
        try {
          const result = await seedBuiltin()
          console.log(`[RUNE-TPL] ensureLoaded lazy-seed result=${result && result.success ? `ok count=${result.count}` : `fail code=${result && result.code}`}`)
        } catch (err) {
          console.warn('[RUNE-TPL] ensureLoaded lazy-seed error:', err)
        } finally {
          // seed 完毕后清掉锁，下一次再触发懒种（幂等，依赖 saveOne 的 upsert 语义）。
          seedingPromise = null
        }
      })()
    }
    try {
      await seedingPromise
    } catch (_) { /* noop */ }
    // seed 完了强制重读一次：saveOne 是 upsert，所以 DB 里现在至少有 renderer 端 14 行。
    try {
      list = await DatabaseClient.runeTemplates.getAll()
    } catch (err) {
      console.error('[RUNE-TPL] ensureLoaded re-read error:', err)
      list = []
    }
  }
  console.log(`[RUNE-TPL] ensureLoaded ipc-returned list=${Array.isArray(list) ? list.length : 'non-array'}`)
  cache = { list: Array.isArray(list) ? list : [], grouped: null, cachedAt: Date.now() }
  return cache
}

async function listFlat (force = false) {
  const c = await ensureLoaded(force)
  return c.list.slice()
}

function labelFromResolver (resolver, key) {
  if (typeof resolver === 'function') {
    try {
      const v = resolver(key)
      if (v) return v
    } catch (_) { /* noop */ }
  }
  return key
}

function buildGrouped (list, resolver) {
  const map = new Map()
  for (const row of list) {
    const key = (row && row.category_key) || 'general'
    if (!map.has(key)) {
      map.set(key, {
        category_key: key,
        name: labelFromResolver(resolver, key),
        items: []
      })
    }
    map.get(key).items.push(row)
  }
  const groups = Array.from(map.values())
  groups.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  for (const g of groups) {
    g.items.sort((a, b) => {
      const sa = Number(a.sort_order || 0)
      const sb = Number(b.sort_order || 0)
      if (sa !== sb) return sa - sb
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
  }
  return groups
}

async function listGroupedByCategory (i18nResolver, force = false) {
  const c = await ensureLoaded(force)
  if (force || !c.grouped) {
    c.grouped = buildGrouped(c.list, i18nResolver)
  } else {
    // 已有缓存但 i18n 语言可能切换了，每次重新解析标签（不重拉数据）
    c.grouped = buildGrouped(c.list, i18nResolver)
  }
  return c.grouped.map(g => ({
    category_key: g.category_key,
    name: g.name,
    items: g.items.slice()
  }))
}

async function save (item) {
  const result = await DatabaseClient.runeTemplates.save(item)
  invalidate()
  return result
}

async function remove (id) {
  const result = await DatabaseClient.runeTemplates.remove(id)
  invalidate()
  return result
}

async function fetchFromGithub ({ sourceUrl, categoryKey }) {
  const result = await DatabaseClient.runeTemplates.fetchRemote({ sourceUrl, categoryKey })
  if (result && result.success) invalidate()
  return result
}

/**
 * 内置 rune 预设模板的 seed 推送入口（v2026-07-29 full-push）。
 *
 * 真相源：renderer 端 `src/components/rune/runeTemplates/runeTemplates.js` 的
 * `BUILTIN_RUNE_TEMPLATE_META` 导出（14 个元数据 + 对应 factory 引用）。
 *
 * 调用场景：
 *   - 应用启动期 renderer 加载完，DB `rune_templates` 为空时调用一次性灌种子。
 *   - 用户「设置 → 重置符文模板」走 `clearAll({ builtins })` 后，DB 会被清空，
 *     需要紧接着再次调用本接口（或由 reset 流程自己 push）。
 *
 * 不允许从 main 端再次维护内置模板列表，避免和 renderer 端漂移。
 */
async function seedBuiltin () {
  let mod
  try {
    mod = await import(/* webpackChunkName: "rune-template-builtins" */ 'src/components/rune/runeTemplates/runeTemplates.js')
  } catch (e) {
    console.warn('[RUNE-TPL] seedBuiltin: cannot import builtin templates', e)
    return { success: false, code: 'NO_BUILTIN_TEMPLATES', message: String(e) }
  }
  const meta = (mod && (mod.BUILTIN_RUNE_TEMPLATE_META || mod.BUILTIN_RUNE_TEMPLATE_META_LIST)) || []
  if (!Array.isArray(meta) || meta.length === 0) {
    return { success: false, code: 'NO_BUILTIN_TEMPLATES' }
  }
  const now = Date.now()
  const rows = []
  for (let i = 0; i < meta.length; i++) {
    const it = meta[i]
    const factory = (typeof it.factoryName === 'string' && typeof mod[it.factoryName] === 'function') ? mod[it.factoryName] : null
    if (!factory || !it.id) continue
    let templateStr
    try {
      templateStr = factory()
    } catch (e) {
      console.warn(`[RUNE-TPL] seedBuiltin: factory for ${it.id} threw`, e)
      continue
    }
    if (typeof templateStr !== 'string') continue
    rows.push({
      id: it.id,
      category_key: it.category_key || 'general',
      name: it.name || it.id,
      desc: it.desc || '',
      color: it.color || '#9C27B0',
      icon: it.icon || 'auto_fix_high',
      template: templateStr,
      source_url: '',
      is_builtin: 1,
      sort_order: Number.isFinite(it.sort_order) ? it.sort_order : i,
      created_at: now,
      updated_at: now
    })
  }
  if (!rows.length) {
    return { success: false, code: 'NO_BUILTIN_TEMPLATES' }
  }
  const result = await DatabaseClient.runeTemplates.saveMany(rows)
  if (result && result.success) invalidate()
  return result
}

/**
 * 把 `BUILTIN_RUNE_TEMPLATE_META` 拼装为 DB row 列表（与 seedBuiltin 同源，但只返回 rows）。
 * 主要用于「设置 → 重置符文模板」场景：renderer 端算好列表直接 push 给 main。
 */
async function buildBuiltinRows () {
  let mod
  try {
    mod = await import(/* webpackChunkName: "rune-template-builtins" */ 'src/components/rune/runeTemplates/runeTemplates.js')
  } catch (e) {
    console.warn('[RUNE-TPL] buildBuiltinRows: cannot import builtin templates', e)
    return []
  }
  const meta = (mod && (mod.BUILTIN_RUNE_TEMPLATE_META || mod.BUILTIN_RUNE_TEMPLATE_META_LIST)) || []
  if (!Array.isArray(meta) || meta.length === 0) return []
  const now = Date.now()
  const rows = []
  for (let i = 0; i < meta.length; i++) {
    const it = meta[i]
    const factory = (typeof it.factoryName === 'string' && typeof mod[it.factoryName] === 'function') ? mod[it.factoryName] : null
    if (!factory || !it.id) continue
    let templateStr
    try {
      templateStr = factory()
    } catch (e) { continue }
    if (typeof templateStr !== 'string') continue
    rows.push({
      id: it.id,
      category_key: it.category_key || 'general',
      name: it.name || it.id,
      desc: it.desc || '',
      color: it.color || '#9C27B0',
      icon: it.icon || 'auto_fix_high',
      template: templateStr,
      source_url: '',
      is_builtin: 1,
      sort_order: Number.isFinite(it.sort_order) ? it.sort_order : i,
      created_at: now,
      updated_at: now
    })
  }
  return rows
}

/**
 * 重置所有符文模板（保留用户自定义）。
 * payload.builtins 是 renderer 端的最新内置模板列表——main 端不再维护镜像。
 * payload 缺省 / 为空时直接拒绝，避免使用任何已不存在的兜底数据。
 */
async function clearAll (payload) {
  const result = await DatabaseClient.runeTemplates.clearAll(payload || {})
  if (result && result.success) invalidate()
  return result
}

/**
 * 批量导入符文（从 JSON 文件）。
 * @param {Array} items - 要导入的符文数组，格式与导出格式一致：{ name, desc, category, color, icon, template }
 * @param {string} targetCategory - 目标分类（强制使用此分类）
 * @param {Object} options - 可选配置
 * @param {string} options.conflictMode - 冲突处理模式: 'normal'(默认新建) | 'replace'(覆盖) | 'skip'(跳过)
 * @param {Array} options.existingRunes - 现有符文列表，用于查找同名符文的 ID
 * @returns {Promise<{ success: boolean, count: number, skipped?: number, message?: string }>}
 */
async function batchImport (items, targetCategory = '', options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, count: 0 }
  }
  const now = Date.now()
  const rows = []
  const skipped = []
  const VALID_CATEGORY_KEYS = new Set([
    'general', 'education', 'outfit', 'fitness', 'music', 'novel',
    'movie', 'food', 'travel', 'research', 'legal', 'government',
    'entertainment', 'gaming', 'consulting', 'community', 'social',
    'medical', 'finance', 'insurance', 'manufacturing', 'construction',
    'realEstate', 'lodging', 'catering', 'business', 'transportation',
    'warehousing', 'sales', 'trading', 'agriculture', 'energy',
    'environment', 'resume'
  ])
  const conflictMode = options.conflictMode || 'normal'
  const existingRunes = options.existingRunes || []
  // 验证目标分类是否有效
  const validTargetCategory = VALID_CATEGORY_KEYS.has(String(targetCategory || '').trim())
    ? String(targetCategory).trim()
    : 'general'
  // 构建现有符文 name -> id 的映射（不区分大小写）
  const existingNameMap = new Map()
  for (const rune of existingRunes) {
    if (rune && rune.name) {
      const key = String(rune.name).trim().toLowerCase()
      existingNameMap.set(key, rune.id)
    }
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const itemName = String(item && item.name || '').trim()
    const itemNameKey = itemName.toLowerCase()
    // 跳过模式下，如果存在同名则跳过
    if (conflictMode === 'skip' && existingNameMap.has(itemNameKey)) {
      skipped.push(itemName)
      continue
    }
    // 强制使用目标分类
    const category = validTargetCategory
    // 覆盖模式下，尝试找到现有符文的 ID
    let id
    if (conflictMode === 'replace' && existingNameMap.has(itemNameKey)) {
      id = existingNameMap.get(itemNameKey)
    } else {
      id = 'import-' + Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 6)
    }
    rows.push({
      id,
      category_key: category,
      name: item.name || '未命名符文',
      desc: item.desc || '',
      color: item.color || '#7E57C2',
      icon: item.icon || 'star',
      template: item.template || '',
      source_url: '',
      is_builtin: 0,
      sort_order: 9999,
      created_at: now,
      updated_at: now
    })
  }
  if (rows.length === 0) {
    return { success: true, count: 0, skipped: skipped.length }
  }
  const result = await DatabaseClient.runeTemplates.saveMany(rows)
  if (result && result.success) invalidate()
  return { ...result, skipped: skipped.length }
}

function clearCache () {
  invalidate()
}

const runeTemplateService = {
  listFlat,
  listGroupedByCategory,
  save,
  remove,
  fetchFromGithub,
  seedBuiltin,
  buildBuiltinRows,
  clearAll,
  batchImport,
  clearCache
}

export default runeTemplateService