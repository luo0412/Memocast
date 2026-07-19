// 验证 electron-main 内 seedBuiltinEchoes 强制覆盖逻辑的正确性。
// 用 sql.js 直接 simulate：
//   1. 创建 echoes 表 + 插入几条旧的内置回响（模拟"老版本 DB"），
//   2. 跑新版的"强制覆盖"逻辑，
//   3. 确认所有内置回响的 anno_source 都被最新 BUILTIN_ECHO_CARDS 内容覆盖。
const path = require('path')
const fs = require('fs')

async function main () {
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
  })
  const db = new SQL.Database()

  // schema
  db.run(`CREATE TABLE IF NOT EXISTS echoes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "desc" TEXT,
    color TEXT DEFAULT '#26A69A',
    icon TEXT DEFAULT 'graphic_eq',
    anno_source TEXT,
    render_type TEXT DEFAULT 'anno',
    category TEXT DEFAULT 'marker',
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  )`)

  // 用 require 直接拉 main 端的 builtin-echoes（CJS 版，含 16 个最新）
  const builtinEchoes = require('../src-electron/main-process/service/builtin-echoes.js')
  const BUILTIN_ECHO_CARDS = builtinEchoes.BUILTIN_ECHO_CARDS
  if (!Array.isArray(BUILTIN_ECHO_CARDS) || BUILTIN_ECHO_CARDS.length !== 16) {
    console.log('FAIL: BUILTIN_ECHO_CARDS count', BUILTIN_ECHO_CARDS && BUILTIN_ECHO_CARDS.length)
    process.exit(1)
  }

  // === 模拟"老 DB"：插入几条内置回响，但 anno_source 是老内容（不含 inheritFromPrevious）===
  const seededCount = {}
  for (const ec of BUILTIN_ECHO_CARDS) {
    const legacyAnno = `${ec.anno_source}\n// LEGACY_OLD_STAMP_AT_TEST_TIME`
    const t0 = 100
    db.run(
      `INSERT INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ec.id, ec.name + '_OLD', 'OLD_DESC', '#000000', 'block', legacyAnno, 'anno', 'marker', 999, t0, t0]
    )
    seededCount[ec.id] = 1
  }

  // === 跑新版"强制覆盖"逻辑（与 electron-main 同义）===
  function execAll (sql) {
    const stmt = db.prepare(sql)
    stmt.step()
    stmt.free()
  }
  function execOne (sql, params = []) {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const has = stmt.step()
    if (!has) { stmt.free(); return null }
    const row = stmt.getAsObject()
    stmt.free()
    return row
  }

  let insertedCount = 0
  let updatedCount = 0
  const now = Date.now()

  for (const builtinEcho of BUILTIN_ECHO_CARDS) {
    if (!builtinEcho || !builtinEcho.id) continue
    const builtinId = String(builtinEcho.id)
    // 2026-07：与 electron-main.js 同步，使用 builtinEcho.category 而不是硬编码 'builtin'
    const builtinCategory = builtinEcho.category || 'builtin'
    const existing = execOne('SELECT id, created_at FROM echoes WHERE id = ?', [builtinId])
    if (existing) {
      db.run(
        `UPDATE echoes SET
          name = ?, "desc" = ?, color = ?, icon = ?, anno_source = ?,
          render_type = ?, category = ?, sort_order = ?, updated_at = ?
        WHERE id = ?`,
        [
          builtinEcho.name,
          builtinEcho.desc || '',
          builtinEcho.color || '#26A69A',
          builtinEcho.icon || 'graphic_eq',
          builtinEcho.anno_source,
          'anno', builtinCategory,
          Number.isFinite(Number(builtinEcho.sort_order)) ? Number(builtinEcho.sort_order) : 0,
          now, builtinId
        ]
      )
      updatedCount += 1
    } else {
      db.run(
        `INSERT INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [builtinId, builtinEcho.name, builtinEcho.desc || '', builtinEcho.color || '#26A69A', builtinEcho.icon || 'graphic_eq', builtinEcho.anno_source, 'anno', builtinCategory, Number.isFinite(Number(builtinEcho.sort_order)) ? Number(builtinEcho.sort_order) : 0, now, now]
      )
      insertedCount += 1
    }
  }

  // === 验证覆盖结果 ===
  function check (name, cond, info) {
    if (cond) {
      console.log('[OK]   ' + name)
    } else {
      console.log('[FAIL] ' + name + (info ? ' info=' + JSON.stringify(info) : ''))
      process.exit(1)
    }
  }

  check('inserted=0（全部 16 个原本就存在）', insertedCount === 0, { insertedCount })
  check('updated=16', updatedCount === 16, { updatedCount })

  let inheritHit = 0
  let legacyMarker = 0
  let total = 0
  let createdAtKept = true
  let updatedAtRefreshed = true
  for (const ec of BUILTIN_ECHO_CARDS) {
    const row = execOne('SELECT name, anno_source, created_at, updated_at, category, icon, color FROM echoes WHERE id = ?', [ec.id])
    if (!row) { check(`row 缺失 ${ec.id}`, false); continue }
    total += 1
    if (row.anno_source === ec.anno_source) inheritHit += 1
    if (String(row.anno_source).indexOf('LEGACY_OLD_STAMP_AT_TEST_TIME') >= 0) legacyMarker += 1
    if (row.name !== ec.name) check(`name 没被覆盖 ${ec.id}`, false, { old: row.name, expect: ec.name })
    // 2026-07：与 BUILTIN_ECHO_CARDS 的 category 字段对齐（builtin 或 showy），不再统一校验为 'builtin'
    const expectedCategory = ec.category || 'builtin'
    if (row.category !== expectedCategory) check(`category 没被覆盖 ${ec.id}`, false, { got: row.category, expect: expectedCategory })
    if (row.icon !== (ec.icon || 'graphic_eq')) check(`icon 没被覆盖 ${ec.id}`, false, { got: row.icon, expect: ec.icon })
    if (row.color !== (ec.color || '#26A69A')) check(`color 没被覆盖 ${ec.id}`, false, { got: row.color, expect: ec.color })
    // created_at 应保留原 100（不应被覆盖为 now）
    if (row.created_at !== 100) createdAtKept = false
    // updated_at 应被刷新为 now
    if (row.updated_at !== now) updatedAtRefreshed = false
  }
  check('所有 16 个内置回响的 anno_source 与代码侧一致', inheritHit === 16, { inheritHit, total })
  check('所有 anno_source 都不含老 LEGACY_OLD_STAMP 残留', legacyMarker === 0, { legacyMarker })
  check('所有 created_at 都保留旧值 100', createdAtKept)
  check('所有 updated_at 都被刷成 now', updatedAtRefreshed)

  // === 二次覆盖：再跑一次，应该 inserted=0, updated=16（幂等） ===
  insertedCount = 0; updatedCount = 0
  for (const builtinEcho of BUILTIN_ECHO_CARDS) {
    const builtinId = String(builtinEcho.id)
    const existing = execOne('SELECT id FROM echoes WHERE id = ?', [builtinId])
    if (existing) { db.run(`UPDATE echoes SET anno_source = ?, updated_at = ? WHERE id = ?`, [builtinEcho.anno_source, now + 1, builtinId]); updatedCount += 1 }
    else { insertedCount += 1 }
  }
  check('二次覆盖：inserted=0, updated=16（幂等）', insertedCount === 0 && updatedCount === 16, { insertedCount, updatedCount })

  // === 再来一次走 INSERT 分支：删除一行后跑，应该 inserted=1, updated=15 ===
  db.run('DELETE FROM echoes WHERE id = ?', ['__builtin_nice__'])
  insertedCount = 0; updatedCount = 0
  for (const builtinEcho of BUILTIN_ECHO_CARDS) {
    const builtinId = String(builtinEcho.id)
    const existing = execOne('SELECT id FROM echoes WHERE id = ?', [builtinId])
    if (existing) { db.run(`UPDATE echoes SET anno_source = ?, updated_at = ? WHERE id = ?`, [builtinEcho.anno_source, now + 2, builtinId]); updatedCount += 1 }
    else {
      const builtinCategory = builtinEcho.category || 'builtin'
      db.run(
        `INSERT INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [builtinId, builtinEcho.name, builtinEcho.desc || '', builtinEcho.color || '#26A69A', builtinEcho.icon || 'graphic_eq', builtinEcho.anno_source, 'anno', builtinCategory, Number.isFinite(Number(builtinEcho.sort_order)) ? Number(builtinEcho.sort_order) : 0, now + 2, now + 2]
      )
      insertedCount += 1
    }
  }
  check('nice 被删后：inserted=1, updated=15', insertedCount === 1 && updatedCount === 15, { insertedCount, updatedCount })

  console.log('\n=== summary: pass')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
