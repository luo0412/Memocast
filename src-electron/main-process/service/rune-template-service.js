/**
 * rune-template-service - 符文预设模板 DB 持久化服务
 *
 * 提供：
 *   - ensureSchema()          建表 rune_templates + 两条索引；幂等可反复调用
 *   - listAll()               按 sort_order 排序返回所有 row（内置 + 用户导入）
 *   - saveOne(row)            upsert 单条，按 id 主键冲突则 UPDATE
 *   - saveMany(rows)          批量 upsert（首次 seed 用），返回 { success, count }
 *   - remove(id)              删除单条
 *   - importFromRemote({ sourceUrl, categoryKey })
 *                            GitHub URL → raw URL → 抓内容 → 解析 → 写入表
 *
 * 工厂模式：createRuneTemplateService({ db, execToObjects, execOne, execRun, saveDatabase })
 *   - db           sql.js Database 实例
 *   - execToObjects(sql, params?)   返回对象数组
 *   - execOne(sql, params?)         返回单个对象或 null
 *   - execRun(sql, params?)         返回 { changes, lastInsertRowid } 或 null
 *   - saveDatabase()                落盘函数
 *   - log           可选 logger，console 兜底
 */

const https = require('https')
const http = require('http')
const { URL } = require('url')

const MAX_REDIRECTS = 8
const MAX_BODY_BYTES = 1 * 1024 * 1024  // 1 MB
const VALID_CATEGORY_KEYS = new Set([
  'general', 'education', 'outfit', 'fitness', 'music', 'novel',
  'movie', 'food', 'travel', 'research', 'legal', 'government',
  'entertainment', 'gaming', 'consulting', 'community', 'social',
  'medical', 'finance', 'insurance', 'manufacturing', 'construction',
  'realEstate', 'lodging', 'catering', 'business', 'transportation',
  'warehousing', 'sales', 'trading', 'agriculture', 'energy',
  'environment', 'resume'
])

function toRawGithubUrl (input) {
  if (typeof input !== 'string' || !input.trim()) return null
  let u
  try {
    u = new URL(input.trim())
  } catch (_) {
    return null
  }
  const host = (u.hostname || '').toLowerCase()
  // 已经是 raw 形式
  if (host === 'raw.githubusercontent.com' || host === 'gist.githubusercontent.com') {
    return u.toString()
  }
  if (host !== 'github.com') return null
  // github.com/<u>/<r>/blob/<b>/<p>  → raw.githubusercontent.com/<u>/<r>/<b>/<p>
  // github.com/<u>/<r>/raw/<b>/<p>  → 同上
  const parts = (u.pathname || '').split('/').filter(Boolean)
  if (parts.length < 5) return null
  const owner = parts[0]
  const repo = parts[1]
  const segment = parts[2]
  if (segment !== 'blob' && segment !== 'raw') return null
  const branch = parts[3]
  const restPath = parts.slice(4).join('/')
  if (!owner || !repo || !branch || !restPath) return null
  return 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/' + restPath
}

function fetchTextWithRedirects (targetUrl, redirectsLeft, accum, logger) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) {
      reject(new Error('Too many redirects'))
      return
    }
    let parsed
    try {
      parsed = new URL(targetUrl)
    } catch (e) {
      reject(new Error('Invalid URL: ' + targetUrl))
      return
    }
    const isHttps = parsed.protocol === 'https:'
    const client = isHttps ? https : http
    const req = client.request({
      method: 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'memocast-rune-template-importer',
        'Accept': 'text/plain, text/html;q=0.9, */*;q=0.5'
      }
    }, (res) => {
      const status = res.statusCode || 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        const next = new URL(res.headers.location, parsed).toString()
        fetchTextWithRedirects(next, redirectsLeft - 1, accum, logger).then(resolve, reject)
        return
      }
      if (status < 200 || status >= 300) {
        res.resume()
        reject(new Error('HTTP ' + status + ' from ' + targetUrl))
        return
      }
      const contentLength = parseInt(res.headers['content-length'] || '0', 10)
      if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        res.resume()
        reject(new Error('Response too large: ' + contentLength + ' bytes'))
        return
      }
      res.setEncoding('utf8')
      res.on('data', chunk => {
        accum.push(chunk)
        const total = accum.reduce((s, c) => s + c.length, 0)
        if (total > MAX_BODY_BYTES) {
          req.destroy(new Error('Response exceeded 1 MB limit'))
        }
      })
      res.on('end', () => resolve(accum.join('')))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

function inferTemplateMeta (body, fallbackName) {
  const lines = String(body || '').split(/\r?\n/).slice(0, 20)
  let name = ''
  let desc = ''
  let category = ''
  // 先尝试"单行 front-matter"模式：<!-- name: foo, desc: bar, category: baz -->
  const singleLineRe = /<!--\s*(?:name|desc|category)\s*:/
  let consumed = false
  for (let i = 0; i < lines.length && !consumed; i++) {
    const line = lines[i].trim()
    if (!singleLineRe.test(line)) continue
    // 在这一行内继续找 name / desc / category, 直到 --> 停止
    const stopIdx = line.indexOf('-->')
    const scan = stopIdx >= 0 ? line.substring(0, stopIdx) : line
    const fieldRe = /(name|desc|category)\s*:\s*([^\n]*?)(?=(?:\s+name\s*:|\s+desc\s*:|\s+category\s*:|-->|$))/gi
    let m
    while ((m = fieldRe.exec(scan)) !== null) {
      const key = m[1].toLowerCase()
      let val = (m[2] || '').trim().replace(/-+>\s*$/, '').trim()
      // 去掉尾随分隔符：逗号 / 中英文分号
      val = val.replace(/[,;；]+\s*$/, '').trim()
      if (!val) continue
      if (key === 'name' && !name) name = val
      else if (key === 'desc' && !desc) desc = val
      else if (key === 'category' && !category) category = val
    }
    consumed = stopIdx >= 0
  }
  // 回退：如果单行模式没拿到，尝试"多行"模式：<!--\n  name: foo\n  desc: bar\n-->
  if (!name || !category) {
    let block = []
    let inBlock = false
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]
      const line = raw.trim()
      if (!inBlock) {
        if (line === '<!--' || line.startsWith('<!--')) {
          inBlock = true
          const rest = line.replace(/^<!--/, '')
          if (rest) block.push(rest)
          if (line.endsWith('-->')) {
            // 单行多字段，可能整段已被上面的 singleLineRe 处理；这里只兜底
            inBlock = false
          }
        }
        continue
      }
      if (line.endsWith('-->')) {
        block.push(line.replace(/-+>.*$/, ''))
        inBlock = false
        break
      }
      block.push(line)
    }
    for (const b of block) {
      const m = b.match(/^\s*(name|desc|category)\s*:\s*(.+?)\s*$/i)
      if (!m) continue
      const key = m[1].toLowerCase()
      const val = m[2].trim()
      if (key === 'name' && !name) name = val
      else if (key === 'desc' && !desc) desc = val
      else if (key === 'category' && !category) category = val
    }
  }
  if (!name) name = fallbackName || '来自 GitHub'
  if (!category || !VALID_CATEGORY_KEYS.has(category)) category = 'general'
  return { name, desc, category }
}

function generateTemplateId (sourceUrl) {
  const raw = String(sourceUrl || '') + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 8)
  let h = 0
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h) + raw.charCodeAt(i)
    h |= 0
  }
  const hex = (h >>> 0).toString(16)
  return 'remote-tpl-' + hex
}

function createRuneTemplateService ({ db, execToObjects, execOne, saveDatabase, log } = {}) {
  if (!db) throw new Error('[rune-template-service] db is required')
  if (typeof execToObjects !== 'function') throw new Error('[rune-template-service] execToObjects is required')
  if (typeof execOne !== 'function') throw new Error('[rune-template-service] execOne is required')
  const logger = log || console

  function ensureSchema () {
    try {
      db.run(`
        CREATE TABLE IF NOT EXISTS rune_templates (
          id           TEXT PRIMARY KEY,
          category_key TEXT NOT NULL,
          name         TEXT NOT NULL,
          desc         TEXT,
          color        TEXT,
          icon         TEXT,
          template     TEXT NOT NULL,
          source_url   TEXT,
          is_builtin   INTEGER NOT NULL DEFAULT 0,
          sort_order   INTEGER NOT NULL DEFAULT 0,
          created_at   INTEGER NOT NULL,
          updated_at   INTEGER NOT NULL
        )
      `)
      db.run(`CREATE INDEX IF NOT EXISTS idx_rune_tpl_cat  ON rune_templates(category_key)`)
      db.run(`CREATE INDEX IF NOT EXISTS idx_rune_tpl_name ON rune_templates(name)`)
      logger.info && logger.info('[DB] rune_templates table ready')
    } catch (error) {
      logger.error && logger.error('[DB] ensureSchema(rune_templates) error:', error)
    }
  }

  function listAll () {
    try {
      return execToObjects(
        'SELECT * FROM rune_templates ORDER BY is_builtin DESC, sort_order ASC, created_at ASC'
      ) || []
    } catch (error) {
      logger.error && logger.error('[rune-template-service] listAll error:', error)
      return []
    }
  }

  function saveOne (row) {
    if (!row || !row.id) return { success: false, code: 'INVALID', message: 'id required' }
    try {
      const now = Date.now()
      const existing = execOne('SELECT id FROM rune_templates WHERE id = ?', [row.id])
      if (existing) {
        db.run(`UPDATE rune_templates SET category_key = ?, name = ?, desc = ?, color = ?, icon = ?, template = ?, source_url = ?, is_builtin = ?, sort_order = ?, updated_at = ? WHERE id = ?`, [
          row.category_key || 'general',
          row.name || '',
          row.desc || '',
          row.color || '',
          row.icon || '',
          row.template || '',
          row.source_url || '',
          row.is_builtin ? 1 : 0,
          Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
          now,
          row.id
        ])
        if (typeof saveDatabase === 'function') saveDatabase()
        return { success: true, data: execOne('SELECT * FROM rune_templates WHERE id = ?', [row.id]) }
      }
      db.run(`INSERT INTO rune_templates (id, category_key, name, desc, color, icon, template, source_url, is_builtin, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        row.id,
        row.category_key || 'general',
        row.name || '',
        row.desc || '',
        row.color || '',
        row.icon || '',
        row.template || '',
        row.source_url || '',
        row.is_builtin ? 1 : 0,
        Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        row.created_at || now,
        now
      ])
      if (typeof saveDatabase === 'function') saveDatabase()
      return { success: true, data: execOne('SELECT * FROM rune_templates WHERE id = ?', [row.id]) }
    } catch (error) {
      logger.error && logger.error('[rune-template-service] saveOne error:', error)
      return { success: false, code: 'SAVE_FAILED', message: error && error.message ? error.message : String(error) }
    }
  }

  function saveMany (rows) {
    const list = Array.isArray(rows) ? rows : []
    if (list.length === 0) return { success: true, count: 0 }
    let count = 0
    for (const row of list) {
      const r = saveOne(row)
      if (r && r.success) count++
    }
    return { success: true, count }
  }

  function remove (id) {
    if (!id) return false
    try {
      db.run('DELETE FROM rune_templates WHERE id = ?', [id])
      if (typeof saveDatabase === 'function') saveDatabase()
      return true
    } catch (error) {
      logger.error && logger.error('[rune-template-service] remove error:', error)
      return false
    }
  }

  async function importFromRemote ({ sourceUrl, categoryKey } = {}) {
    const raw = toRawGithubUrl(sourceUrl)
    if (!raw) {
      return {
        success: false,
        code: 'INVALID_URL',
        message: '只支持 github.com / raw.githubusercontent.com / gist.githubusercontent.com 形式的 URL'
      }
    }
    let body
    try {
      body = await fetchTextWithRedirects(raw, MAX_REDIRECTS, [], logger)
    } catch (error) {
      logger.error && logger.error('[rune-template-service] fetch error:', error)
      return { success: false, code: 'FETCH_FAILED', message: error && error.message ? error.message : String(error) }
    }
    if (!body || !body.trim()) {
      return { success: false, code: 'EMPTY_BODY', message: '远端返回内容为空' }
    }
    const fallbackName = (() => {
      try {
        const u = new URL(raw)
        const last = u.pathname.split('/').filter(Boolean).pop() || 'remote-template'
        return last.replace(/\.vue$/i, '')
      } catch (_) { return 'remote-template' }
    })()
    const meta = inferTemplateMeta(body, fallbackName)
    const id = generateTemplateId(sourceUrl || raw)
    const now = Date.now()
    const row = {
      id,
      category_key: VALID_CATEGORY_KEYS.has(String(categoryKey || '').trim()) ? String(categoryKey).trim() : meta.category,
      name: meta.name,
      desc: meta.desc,
      color: '#7E57C2',
      icon: 'cloud_download',
      template: body,
      source_url: sourceUrl || raw,
      is_builtin: 0,
      sort_order: 9999,
      created_at: now,
      updated_at: now
    }
    const r = saveOne(row)
    if (!r || !r.success) {
      return { success: false, code: 'SAVE_FAILED', message: (r && r.message) || '保存到数据库失败' }
    }
    return { success: true, data: r.data }
  }

  return {
    ensureSchema,
    listAll,
    saveOne,
    saveMany,
    remove,
    importFromRemote,
    toRawGithubUrl,
    inferTemplateMeta
  }
}

module.exports = createRuneTemplateService
module.exports.createRuneTemplateService = createRuneTemplateService
module.exports.toRawGithubUrl = toRawGithubUrl
module.exports.inferTemplateMeta = inferTemplateMeta
module.exports.VALID_CATEGORY_KEYS = VALID_CATEGORY_KEYS