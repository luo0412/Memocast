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

async function ensureLoaded (force = false) {
  if (force) invalidate()
  if (isFresh()) {
    console.log(`[RUNE-TPL] ensureLoaded cache-hit list=${cache.list.length}`)
    return cache
  }
  const list = await DatabaseClient.runeTemplates.getAll()
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

function clearCache () {
  invalidate()
}

const runeTemplateService = {
  listFlat,
  listGroupedByCategory,
  save,
  remove,
  fetchFromGithub,
  clearCache
}

export default runeTemplateService