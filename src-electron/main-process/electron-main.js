import { app, BrowserWindow, nativeTheme, dialog, shell, protocol, Menu, ipcMain } from 'electron'
import Api from './api'
import windowStateKeeper from 'electron-window-state'
import unhandled from 'electron-unhandled'
import path from 'path'
import fs from 'fs'
import packageJSON from '../../package.json'
import configureMenu from './menu/templates'
import osLocale from 'os-locale'
import { openNewGitHubIssue, debugInfo, enforceMacOSAppLocation } from 'electron-util'
import KeyBindings from './keyboard/shortcut'
import { registerMemocastProtocol } from './utlis/resource-loader'
import ThemeManager from './utlis/theme-manager'
import Store from 'electron-store'
import i18n from './i18n'
import log from 'electron-log'

// sql.js 数据库
let db = null
let dbPath = null

/**
 * sql.js 查询辅助函数：将 exec 结果转为对象数组
 */
function execToObjects(sql, params = []) {
  try {
    if (params.length > 0) {
      const stmt = db.prepare(sql)
      stmt.bind(params)
      const results = []
      while (stmt.step()) {
        results.push(stmt.getAsObject())
      }
      stmt.free()
      return results
    } else {
      const result = db.exec(sql)
      if (result.length === 0) return []
      const { columns, values } = result[0]
      return values.map(row => {
        const obj = {}
        columns.forEach((col, i) => obj[col] = row[i])
        return obj
      })
    }
  } catch (error) {
    console.error('[DB] execToObjects error:', sql, error)
    return []
  }
}

/**
 * sql.js 单行查询
 */
function execOne(sql, params = []) {
  const results = execToObjects(sql, params)
  return results.length > 0 ? results[0] : null
}

/**
 * sql.js 执行语句
 */
async function execRun(sql, params = []) {
  try {
    await db.run(sql, params)
    saveDatabase()
    return { changes: db.getRowsModified(), lastInsertRowid: getLastInsertRowid() }
  } catch (error) {
    console.error('[DB] execRun error:', sql, error)
    return null
  }
}

/**
 * 获取最后插入的行ID
 */
function getLastInsertRowid() {
  const result = db.exec('SELECT last_insert_rowid() as id')
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0][0]
  }
  return null
}

/**
 * 保存数据库到文件
 */
function saveDatabase() {
  if (db && dbPath) {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(dbPath, buffer)
  }
}

/**
 * 初始化本地 SQLite 数据库
 */
async function initDatabase() {
  console.log('[Main] initDatabase() called')
  try {
    // 动态导入 sql.js
    const initSqlJs = (await import('sql.js')).default
    console.log('[Main] sql.js loaded:', typeof initSqlJs)
    
    dbPath = path.join(app.getPath('userData'), 'memocast.db')
    console.log('[Main] Database path:', dbPath)
    log.info(`[Main] Initializing SQLite database at: ${dbPath}`)

    // 初始化 sql.js
    const SQL = await initSqlJs()
    
    // 尝试加载已有数据库
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath)
      db = new SQL.Database(fileBuffer)
      console.log('[Main] Loaded existing database')
    } else {
      db = new SQL.Database()
      console.log('[Main] Created new database')
    }

    // 创建表结构
    initSchema()
    console.log('[Main] Schema initialized')

    // 保存数据库到文件
    saveDatabase()
    
    log.info('[Main] Database initialized successfully')

    // 注册数据库 IPC 处理器
    registerDatabaseHandlers()
    console.log('[Main] Handlers registered')
  } catch (error) {
    console.error('[Main] Failed to initialize database:', error)
    log.error('[Main] Failed to initialize database:', error)
    throw error
  }
}

/**
 * 初始化数据库表结构
 */
function initSchema() {
  // Notes 表
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_guid TEXT,
      kb_guid TEXT,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT DEFAULT '',
      category TEXT DEFAULT '/',
      tags TEXT DEFAULT '',
      data_created INTEGER,
      data_modified INTEGER,
      sync_status TEXT DEFAULT 'local_only' CHECK(sync_status IN ('local_only', 'synced', 'pending_upload', 'pending_download', 'conflict', 'syncing', 'deleted')),
      local_modified INTEGER,
      server_modified INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    )
  `)

  // 索引
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_doc_guid ON notes(doc_guid) WHERE doc_guid IS NOT NULL AND doc_guid NOT LIKE 'local_%'`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_notes_kb_guid ON notes(kb_guid)`)
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_kb_doc_unique ON notes(kb_guid, doc_guid) WHERE kb_guid IS NOT NULL AND doc_guid IS NOT NULL AND doc_guid NOT LIKE 'local_%'`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_notes_sync_status ON notes(sync_status)`)

  // 检查是否需要添加 kb_guid 列（数据库迁移）
  try {
    const tableInfo = db.exec("PRAGMA table_info(notes)")
    const columns = tableInfo[0].values.map(row => row[1])
    if (!columns.includes('kb_guid')) {
      console.log('[DB] Migrating: adding kb_guid column to notes table')
      db.run("ALTER TABLE notes ADD COLUMN kb_guid TEXT")
      saveDatabase()
    }

    // ✅ 检查是否需要升级 CHECK 约束（添加 'syncing' 或 'deleted' 状态）
    // SQLite 不支持直接修改 CHECK 约束，需要重建表
    try {
      const tableSql = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='notes'`)
      if (tableSql.length > 0 && tableSql[0].values.length > 0) {
        const currentCreateSQL = tableSql[0].values[0][0]
        if (currentCreateSQL && (!currentCreateSQL.includes("'syncing'") || !currentCreateSQL.includes("'deleted'"))) {
          console.log('[DB] Migrating: upgrading notes table CHECK constraint to include "syncing" and "deleted" status')

          // 步骤 1: 创建新表（带更新的 CHECK 约束）
          db.run(`
            CREATE TABLE notes_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              doc_guid TEXT,
              kb_guid TEXT,
              title TEXT NOT NULL DEFAULT 'Untitled',
              content TEXT DEFAULT '',
              category TEXT DEFAULT '/',
              tags TEXT DEFAULT '',
              data_created INTEGER,
              data_modified INTEGER,
              sync_status TEXT DEFAULT 'local_only' CHECK(sync_status IN ('local_only', 'synced', 'pending_upload', 'pending_download', 'conflict', 'syncing', 'deleted')),
              local_modified INTEGER,
              server_modified INTEGER,
              created_at INTEGER,
              updated_at INTEGER
            )
          `)

          // ✅ 步骤 1.5: 迁移前清理重复数据（避免 UNIQUE constraint 冲突）
          console.log('[DB] Pre-migration: cleaning up duplicate (kb_guid, doc_guid) combinations...')
          try {
            const duplicateCheck = db.exec(`
              SELECT kb_guid, doc_guid, COUNT(*) as cnt 
              FROM notes 
              WHERE kb_guid IS NOT NULL 
                AND doc_guid IS NOT NULL 
                AND doc_guid NOT LIKE 'local_%'
              GROUP BY kb_guid, doc_guid 
              HAVING cnt > 1
            `)
            
            if (duplicateCheck.length > 0 && duplicateCheck[0].values.length > 0) {
              console.log(`[DB] ⚠️ Found ${duplicateCheck[0].values.length} duplicate (kb_guid, doc_guid) groups before migration`)
              
              for (const dup of duplicateCheck[0].values) {
                const dupKbGuid = dup[0]
                const dupDocGuid = dup[1]
                
                console.log(`[DB] Cleaning duplicates: kb_guid=${dupKbGuid}, doc_guid=${dupDocGuid}`)
                
                // 找出该组合的所有记录，保留最新的（按 server_modified DESC），删除其余
                db.run(`
                  DELETE FROM notes 
                  WHERE kb_guid = ? 
                    AND doc_guid = ? 
                    AND id NOT IN (
                      SELECT id FROM notes 
                      WHERE kb_guid = ? AND doc_guid = ? 
                      ORDER BY COALESCE(server_modified, 0) DESC, id DESC 
                      LIMIT 1
                    )
                `, [dupKbGuid, dupDocGuid, dupKbGuid, dupDocGuid])
              }
              
              console.log('[DB] ✅ Duplicate cleanup completed before migration')
            } else {
              console.log('[DB] ✅ No duplicates found, migration can proceed')
            }
          } catch (cleanupError) {
            console.warn('[DB] ⚠️ Pre-migration cleanup failed (non-critical):', cleanupError.message)
            console.warn('[DB] Attempting to continue migration anyway...')
          }

          // 步骤 2: 复制数据到新表
          db.run(`
            INSERT INTO notes_new (
              id, doc_guid, kb_guid, title, content, category, tags,
              data_created, data_modified, sync_status, local_modified,
              server_modified, created_at, updated_at
            )
            SELECT 
              id, doc_guid, kb_guid, title, content, category, tags,
              data_created, data_modified, sync_status, local_modified,
              server_modified, created_at, updated_at
            FROM notes
          `)

          // 步骤 3: 删除旧表
          db.run('DROP TABLE notes')

          // 步骤 4: 重命名新表
          db.run('ALTER TABLE notes_new RENAME TO notes')

          // 步骤 5: 重建索引
          db.run(`CREATE INDEX IF NOT EXISTS idx_notes_doc_guid ON notes(doc_guid)`)
          db.run(`CREATE INDEX IF NOT EXISTS idx_notes_kb_guid ON notes(kb_guid)`)
          db.run(`CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)`)
          db.run(`CREATE INDEX IF NOT EXISTS idx_notes_sync_status ON notes(sync_status)`)

          saveDatabase()
          console.log('[DB] Migration completed: CHECK constraint upgraded successfully')
        }
      }
    } catch (migrationError) {
      console.error('[DB] Migration failed (CHECK constraint upgrade):', migrationError.message)
      console.warn('[DB] Note: If you see "CHECK constraint failed" errors, please delete the database file and restart the app')
    }
  } catch (e) {
    console.warn('[DB] Migration check failed:', e.message)
  }

  // Tags 表
  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#1890ff',
      created_at INTEGER
    )
  `)

  // Note-Tag 关联表
  db.run(`
    CREATE TABLE IF NOT EXISTS note_tags (
      note_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (note_id, tag_id),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `)

  // 同步日志表
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER,
      action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
      direction TEXT NOT NULL CHECK(direction IN ('local_to_server', 'server_to_local')),
      timestamp INTEGER,
      synced INTEGER DEFAULT 0,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    )
  `)

  // GUID 映射表
  db.run(`
    CREATE TABLE IF NOT EXISTS guid_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id INTEGER NOT NULL,
      server_guid TEXT NOT NULL,
      service TEXT DEFAULT 'wiznote',
      created_at INTEGER,
      UNIQUE(local_id, server_guid),
      FOREIGN KEY (local_id) REFERENCES notes(id) ON DELETE CASCADE
    )
  `)

  // 冲突备份表
  db.run(`
    CREATE TABLE IF NOT EXISTS conflict_backup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      local_content TEXT,
      server_content TEXT,
      local_modified INTEGER,
      server_modified INTEGER,
      created_at INTEGER,
      resolved INTEGER DEFAULT 0,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    )
  `)

  // 用户配置表
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER
    )
  `)

  // 符文卡片表
  db.run(`
    CREATE TABLE IF NOT EXISTS runes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "desc" TEXT,
      power INTEGER DEFAULT 50,
      color TEXT DEFAULT '#7E57C2',
      icon TEXT DEFAULT 'auto_awesome',
      template TEXT,
      created_at INTEGER,
      updated_at INTEGER
    )
  `)

  // 初始化默认符文数据（仅当表为空时）
  const count = execOne('SELECT COUNT(*) as count FROM runes')
  if (count && count.count === 0) {
    const now = Date.now()
    const defaultRunes = [
      { id: 'rune-1', name: '火焰之魂', desc: '释放灼烧伤害，持续灼烧敌人', power: 85, color: '#FF6B35', icon: 'whatshot' },
      { id: 'rune-2', name: '寒冰护盾', desc: '生成冰霜护盾，减免30%伤害', power: 72, color: '#4FC3F7', icon: 'ac_unit' },
      { id: 'rune-3', name: '雷霆一击', desc: '召唤雷电攻击，造成群体眩晕', power: 95, color: '#AB47BC', icon: 'flash_on' },
      { id: 'rune-4', name: '生命汲取', desc: '攻击时恢复自身生命值', power: 60, color: '#66BB6A', icon: 'favorite' },
      { id: 'rune-5', name: '暗影之刃', desc: '提升暴击率与移动速度', power: 78, color: '#7E57C2', icon: 'nights_stay' },
      { id: 'rune-6', name: '圣光庇护', desc: '免疫一次负面效果并治疗', power: 88, color: '#FFD54F', icon: 'wb_sunny' }
    ]
    for (const r of defaultRunes) {
      db.run(`INSERT INTO runes (id, name, "desc", power, color, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.name, r.desc, r.power, r.color, r.icon, now, now])
    }
    saveDatabase()
    log.info('[DB] Default runes seeded')
  }

  log.info('[Main] Database schema initialized')
}

/**
 * 注册数据库 IPC 处理器
 */
function registerDatabaseHandlers() {
  // 获取所有笔记
  ipcMain.handle('db:getNotes', async (event, options = {}) => {
    try {
      let query = 'SELECT * FROM notes WHERE 1=1'
      const params = []

      if (options.category) {
        query += ' AND category = ?'
        params.push(options.category)
      }
      if (options.syncStatus) {
        query += ' AND sync_status = ?'
        params.push(options.syncStatus)
      }
      if (options.search) {
        query += ' AND (title LIKE ? OR content LIKE ?)'
        params.push(`%${options.search}%`, `%${options.search}%`)
      }

      query += ' ORDER BY data_modified DESC'

      if (options.limit) {
        query += ' LIMIT ?'
        params.push(options.limit)
      }
      if (options.offset) {
        query += ' OFFSET ?'
        params.push(options.offset)
      }

      return execToObjects(query, params)
    } catch (error) {
      log.error('[DB] getNotes error:', error)
      return []
    }
  })

  // 获取单个笔记
  ipcMain.handle('db:getNote', async (event, id) => {
    try {
      return execOne('SELECT * FROM notes WHERE id = ?', [id])
    } catch (error) {
      log.error('[DB] getNote error:', error)
      return null
    }
  })

  // 根据 doc_guid 获取单个笔记
  ipcMain.handle('db:getNoteByDocGuid', async (event, docGuid) => {
    try {
      return execOne('SELECT * FROM notes WHERE doc_guid = ?', [docGuid])
    } catch (error) {
      log.error('[DB] getNoteByDocGuid error:', error)
      return null
    }
  })

  // 根据 doc_guid 获取笔记（按本地修改时间取最新版本）
  ipcMain.handle('db:getNoteByDocGuidWithPriority', async (event, docGuid) => {
    try {
      // ✅ 核心原则：local_modified 最大的 = 用户最后操作的 = 应该显示的
      return execOne(`
        SELECT * FROM notes 
        WHERE doc_guid = ? 
        ORDER BY 
          CASE WHEN local_modified IS NULL OR local_modified = 0 THEN 0 ELSE local_modified END DESC,
          id DESC
        LIMIT 1
      `, [docGuid])
    } catch (error) {
      log.error('[DB] getNoteByDocGuidWithPriority error:', error)
      return null
    }
  })

  // 创建笔记
  ipcMain.handle('db:createNote', async (event, note) => {
    try {
      const now = Date.now()
      const toStr = (v) => (v == null) ? '' : (typeof v === 'string') ? v : (typeof v === 'number') ? String(v) : JSON.stringify(v)
      const toNum = (v) => (v == null) ? now : (typeof v === 'number') ? v : parseInt(v, 10) || now
      const toStrOrNull = (v) => (v == null) ? null : (typeof v === 'string') ? v : (typeof v === 'number') ? String(v) : JSON.stringify(v)
      await db.run(`
        INSERT INTO notes (doc_guid, kb_guid, title, content, category, tags, data_created, data_modified, sync_status, local_modified, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        toStrOrNull(note.doc_guid),
        toStrOrNull(note.kb_guid),
        toStr(note.title) || 'Untitled',
        toStr(note.content),
        toStr(note.category) || '/',
        toStr(note.tags),
        toNum(note.data_created),
        toNum(note.data_modified),
        toStr(note.sync_status) || 'local_only',
        toNum(note.local_modified),
        now,
        now
      ])
      // 保存到文件（sql.js 是 auto-commit，不需要手动 COMMIT）
      saveDatabase()
      const lastId = getLastInsertRowid()

      // ✅ 改进的 ID 验证逻辑
      if (lastId === null || lastId === undefined) {
        log.error('[DB] createNote: getLastInsertRowid returned null/undefined')
        return null
      }

      console.log('[DB] createNote: lastInsertRowid =', lastId, 'doc_guid =', note?.doc_guid)

      let createdNote = null

      // 尝试 1：通过 ID 查询（最可靠）
      if (lastId && lastId > 0) {
        createdNote = execOne('SELECT * FROM notes WHERE id = ?', [lastId])
      }

      // 尝试 2：如果 ID 查询失败或 lastId=0，通过 doc_guid 回退查询
      if (!createdNote && note.doc_guid) {
        log.warn(`[DB] createNote: lastId=${lastId}, falling back to doc_guid query:`, note.doc_guid)
        createdNote = execOne('SELECT * FROM notes WHERE doc_guid = ?', [note.doc_guid])
      }

      // 尝试 3：如果还是没有，尝试按最新创建时间查询（最后手段）
      if (!createdNote) {
        log.warn('[DB] createNote: falling back to latest created_at query')
        createdNote = execOne(`
          SELECT * FROM notes 
          WHERE created_at = (SELECT MAX(created_at) FROM notes)
          ORDER BY id DESC LIMIT 1
        `)
      }

      if (!createdNote) {
        log.error('[DB] createNote: all query methods failed for note:', {
          lastId,
          doc_guid: note?.doc_guid,
          title: note?.title,
          sync_status: note?.sync_status
        })
        return null
      }

      console.log('[DB] createNote: successfully created note, id =', createdNote.id)
      return createdNote
    } catch (error) {
      log.error('[DB] createNote error:', error)
      log.error('[DB] createNote note object keys:', Object.keys(note || {}))
      log.error('[DB] createNote doc_guid:', note?.doc_guid, 'sync_status:', note?.sync_status)
      return null
    }
  })

  // 更新笔记
  ipcMain.handle('db:updateNote', async (event, { id, updates, isSystemUpdate = false }) => {
    try {
      const fields = []
      const values = []
      const now = Date.now()
      const toStr = (v) => (v == null) ? '' : (typeof v === 'string') ? v : (typeof v === 'number') ? String(v) : JSON.stringify(v)
      const toNum = (v) => (v == null) ? now : (typeof v === 'number') ? v : parseInt(v, 10) || now

      if (updates.title !== undefined) {
        fields.push('title = ?')
        values.push(toStr(updates.title))
      }
      if (updates.content !== undefined) {
        fields.push('content = ?')
        values.push(toStr(updates.content))
      }
      if (updates.category !== undefined) {
        fields.push('category = ?')
        values.push(toStr(updates.category))
      }
      if (updates.tags !== undefined) {
        fields.push('tags = ?')
        values.push(Array.isArray(updates.tags) ? updates.tags.join(',') : toStr(updates.tags))
      }
      if (updates.doc_guid !== undefined) {
        fields.push('doc_guid = ?')
        values.push(updates.doc_guid == null ? null : toStr(updates.doc_guid))
      }
      if (updates.kb_guid !== undefined) {
        fields.push('kb_guid = ?')
        values.push(updates.kb_guid == null ? null : toStr(updates.kb_guid))
      }
      if (updates.sync_status !== undefined) {
        fields.push('sync_status = ?')
        values.push(toStr(updates.sync_status))
      }
      if (updates.server_modified !== undefined) {
        fields.push('server_modified = ?')
        values.push(toNum(updates.server_modified))
      }

      // 关键改进：根据 isSystemUpdate 区分用户编辑和系统自动更新
      if (!isSystemUpdate) {
        // 用户主动编辑 → 更新所有时间戳
        fields.push('data_modified = ?', 'local_modified = ?', 'updated_at = ?')
        values.push(now, now, now)
      } else {
        // 系统自动更新（如同步完成）→ 只更新 updated_at，保留 local_modified 不变
        fields.push('updated_at = ?')
        values.push(now)
      }

      values.push(id)

      // ✅ 冲突预检：如果更新 kb_guid 或 doc_guid，检查是否会导致 UNIQUE constraint 冲突
      if (updates.kb_guid !== undefined || updates.doc_guid !== undefined) {
        const newKbGuid = updates.kb_guid !== undefined ? (updates.kb_guid == null ? null : toStr(updates.kb_guid)) : null
        const newDocGuid = updates.doc_guid !== undefined ? (updates.doc_guid == null ? null : toStr(updates.doc_guid)) : null
        
        // 只在两者都不为空且不是 local_ 开头时才检查（符合唯一索引的 WHERE 条件）
        if (newKbGuid && newDocGuid && !newDocGuid.startsWith('local_')) {
          try {
            const conflictCheck = execOne(`
              SELECT id, title, sync_status FROM notes 
              WHERE kb_guid = ? AND doc_guid = ? AND id != ?
              LIMIT 1
            `, [newKbGuid, newDocGuid, id])
            
            if (conflictCheck && conflictCheck.id) {
              log.warn(`[DB] ⚠️ UNIQUE constraint conflict detected before update:`)
              log.warn(`  - Current note: id=${id}, updating to kb_guid=${newKbGuid}, doc_guid=${newDocGuid}`)
              log.warn(`  - Conflicting note: id=${conflictCheck.id}, title=${conflictCheck.title}, status=${conflictCheck.sync_status}`)
              
              // 删除冲突的旧记录（保留当前正在更新的笔记）
              await db.run('DELETE FROM notes WHERE id = ?', [conflictCheck.id])
              
              // 同时删除关联的 guid_mapping
              await db.run('DELETE FROM guid_mapping WHERE note_id = ?', [conflictCheck.id])
              
              log.warn(`[DB] ✅ Deleted conflicting note ${conflictCheck.id} to resolve UNIQUE constraint`)
              saveDatabase()
            }
          } catch (conflictError) {
            log.warn('[DB] Conflict check failed (non-critical):', conflictError.message)
          }
        }
      }

      const query = `UPDATE notes SET ${fields.join(', ')} WHERE id = ?`
      await db.run(query, values)
      saveDatabase()

      // 记录同步日志
      if (updates.sync_status !== undefined) {
        await db.run(`INSERT INTO sync_log (note_id, action, direction, timestamp, synced) VALUES (?, 'update', 'local_to_server', ?, 0)`, [id, now])
        saveDatabase()
      }

      return execOne('SELECT * FROM notes WHERE id = ?', [id])
    } catch (error) {
      log.error('[DB] updateNote error:', error)
      log.error('[DB] updateNote updates keys:', Object.keys(updates || {}))
      return null
    }
  })

  // 删除笔记
  ipcMain.handle('db:deleteNote', async (event, id) => {
    try {
      await db.run(`INSERT INTO sync_log (note_id, action, direction, timestamp, synced) VALUES (?, 'delete', 'local_to_server', ?, 0)`, [id, Date.now()])
      await db.run('DELETE FROM notes WHERE id = ?', [id])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] deleteNote error:', error)
      return false
    }
  })

  // 获取冲突笔记
  ipcMain.handle('db:getConflictNotes', async () => {
    try {
      return execToObjects("SELECT * FROM notes WHERE sync_status = 'conflict'")
    } catch (error) {
      log.error('[DB] getConflictNotes error:', error)
      return []
    }
  })

  // 获取同步状态统计
  ipcMain.handle('db:getStats', async () => {
    try {
      const total = execOne('SELECT COUNT(*) as count FROM notes')
      const synced = execOne("SELECT COUNT(*) as count FROM notes WHERE sync_status = 'synced'")
      const pending = execOne(`
        SELECT COUNT(*) as count FROM notes
        WHERE (sync_status = 'pending_upload'
           OR (sync_status = 'local_only' AND (doc_guid LIKE 'local_%' OR doc_guid IS NULL)))
          AND sync_status != 'syncing'
      `)
      const syncing = execOne("SELECT COUNT(*) as count FROM notes WHERE sync_status = 'syncing'")
      const conflict = execOne("SELECT COUNT(*) as count FROM notes WHERE sync_status = 'conflict'")
      return {
        total: total?.count || 0,
        synced: synced?.count || 0,
        pending: pending?.count || 0,
        syncing: syncing?.count || 0,
        conflict: conflict?.count || 0
      }
    } catch (error) {
      log.error('[DB] getStats error:', error)
      return { total: 0, synced: 0, pending: 0, conflict: 0 }
    }
  })

  // 获取所有标签
  ipcMain.handle('db:getTags', async () => {
    try {
      return execToObjects('SELECT * FROM tags ORDER BY name')
    } catch (error) {
      log.error('[DB] getTags error:', error)
      return []
    }
  })

  // 创建标签
  ipcMain.handle('db:createTag', async (event, tag) => {
    try {
      const now = Date.now()
      await db.run(`INSERT INTO tags (name, color, created_at) VALUES (?, ?, ?)`, [tag.name, tag.color || '#1890ff', now])
      saveDatabase()
      const lastId = getLastInsertRowid()
      return { id: lastId, name: tag.name, color: tag.color || '#1890ff', created_at: now }
    } catch (error) {
      log.error('[DB] createTag error:', error)
      return null
    }
  })

  // 删除标签
  ipcMain.handle('db:deleteTag', async (event, id) => {
    try {
      await db.run('DELETE FROM tags WHERE id = ?', [id])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] deleteTag error:', error)
      return false
    }
  })

  // 标记笔记为冲突状态
  ipcMain.handle('db:markAsConflict', async (event, { id, serverData = {} }) => {
    try {
      const note = execOne('SELECT * FROM notes WHERE id = ?', [id])
      if (!note) return false

      // 备份到冲突表
      await db.run(`
        INSERT INTO conflict_backup (note_id, local_content, server_content, local_modified, server_modified)
        VALUES (?, ?, ?, ?, ?)
      `, [id, note.content, serverData.content || '', note.local_modified, serverData.data_modified || null])

      // 更新状态为冲突
      await db.run(`UPDATE notes SET sync_status = 'conflict', updated_at = ? WHERE id = ?`, [Date.now(), id])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] markAsConflict error:', error)
      return false
    }
  })

  // 记录同步操作日志
  ipcMain.handle('db:logSyncAction', async (event, { noteId, action, direction }) => {
    try {
      await db.run(`INSERT INTO sync_log (note_id, action, direction, timestamp, synced) VALUES (?, ?, ?, ?, 0)`,
        [noteId, action, direction, Date.now()])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] logSyncAction error:', error)
      return false
    }
  })

  // 获取待同步的笔记
  ipcMain.handle('db:getPendingSyncNotes', async () => {
    try {
      return execToObjects(`
        SELECT * FROM notes
        WHERE (sync_status = 'pending_upload'
           OR (sync_status = 'local_only' AND (doc_guid LIKE 'local_%' OR doc_guid IS NULL)))
          AND sync_status != 'syncing'
        ORDER BY local_modified ASC
      `)
    } catch (error) {
      log.error('[DB] getPendingSyncNotes error:', error)
      return []
    }
  })

  // 获取 GUID 映射
  ipcMain.handle('db:getGuidMapping', async (event, serverGuid) => {
    try {
      return execOne('SELECT * FROM guid_mapping WHERE server_guid = ?', [serverGuid])
    } catch (error) {
      log.error('[DB] getGuidMapping error:', error)
      return null
    }
  })

  // 创建 GUID 映射
  ipcMain.handle('db:createGuidMapping', async (event, { localId, serverGuid, service = 'wiznote' }) => {
    try {
      // ✅ 参数验证：防止 undefined 导致 sql.js 报错
      if (localId == null || localId === undefined) {
        log.error('[DB] createGuidMapping: localId is required', { localId, serverGuid, service })
        return false
      }
      if (serverGuid == null || serverGuid === undefined || serverGuid === '') {
        log.error('[DB] createGuidMapping: serverGuid is required', { localId, serverGuid, service })
        return false
      }

      // ✅ 确保所有参数都是有效类型
      const safeLocalId = typeof localId === 'number' ? localId : parseInt(localId, 10) || 0
      const safeServerGuid = String(serverGuid || '')
      const safeService = String(service || 'wiznote')

      console.log('[DB] createGuidMapping:', {
        localId: safeLocalId,
        serverGuid: safeServerGuid.substring(0, 8) + '...',  // 只显示前8位，避免日志过长
        service: safeService
      })

      await db.run(`INSERT OR REPLACE INTO guid_mapping (local_id, server_guid, service, created_at) VALUES (?, ?, ?, ?)`,
        [safeLocalId, safeServerGuid, safeService, Date.now()])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] createGuidMapping error:', error)
      log.error('[DB] createGuidMapping params:', { localId, serverGuid, service })
      return false
    }
  })

  // 根据本地 ID 查询 GUID 映射（用于幂等性检查）
  ipcMain.handle('db:getGuidMappingByLocalId', async (event, { localId }) => {
    try {
      const result = db.exec(`SELECT * FROM guid_mapping WHERE local_id = ?`, [localId])
      if (result.length > 0 && result[0].values.length > 0) {
        const columns = result[0].columns
        const values = result[0].values[0]
        const mapping = {}
        columns.forEach((col, idx) => {
          mapping[col] = values[idx]
        })
        return mapping
      }
      return null
    } catch (error) {
      log.error('[DB] getGuidMappingByLocalId error:', error)
      return null
    }
  })

  // ✅ 查找相同标题+分类的已同步笔记（用于去重）
  ipcMain.handle('db:findDuplicateSyncedNote', async (event, { title, category }) => {
    try {
      // 规范化 category：'/My Notes/' 或 '/我的笔记/' → '/' （统一使用英文，排除国际化影响）
      const normalizedCat = (!category || 
                             category === '/My Notes/' || 
                             category === '/我的笔记/') ? '/' : (category || '')
      
      const result = execToObjects(`
        SELECT id, doc_guid, kb_guid, title, category, sync_status
        FROM notes 
        WHERE title = ? 
          AND (
            (category = ? OR category IS NULL)
            OR (category = '/My Notes/' AND ? = '/')
            OR (category = '/我的笔记/' AND ? = '/')
          )
          AND sync_status = 'synced'
          AND doc_guid IS NOT NULL
          AND doc_guid NOT LIKE 'local_%'
        ORDER BY server_modified DESC
        LIMIT 1
      `, [title, normalizedCat, normalizedCat, normalizedCat])
      
      return result && result.length > 0 ? result[0] : null
    } catch (error) {
      log.error('[DB] findDuplicateSyncedNote error:', error)
      return null
    }
  })

  // ✅ 获取所有已同步的笔记（用于同步后清理重复笔记）
  ipcMain.handle('db:getAllSyncedNotesForCleanup', async () => {
    try {
      const result = execToObjects(`
        SELECT id, doc_guid, kb_guid, title, category, sync_status,
               local_modified, server_modified
        FROM notes 
        WHERE sync_status = 'synced'
          AND title IS NOT NULL 
          AND title != ''
        ORDER BY category, title, server_modified DESC
      `)
      
      return result || []
    } catch (error) {
      log.error('[DB] getAllSyncedNotesForCleanup error:', error)
      return []
    }
  })

  // ✅ 规范化笔记 GUID（同步成功后用实际 GUID 替换临时 ID）
  ipcMain.handle('db:normalizeNoteGuids', async () => {
    try {
      console.log('[DB] Starting note GUID normalization...')

      // 步骤 1：查找所有已同步但 doc_guid 仍为临时格式的笔记
      const tempNotes = execToObjects(`
        SELECT id, doc_guid, kb_guid, sync_status, title
        FROM notes
        WHERE (doc_guid LIKE 'local_%' OR doc_guid IS NULL)
          AND sync_status = 'synced'
          AND kb_guid IS NOT NULL
      `)

      console.log(`[DB] Found ${tempNotes.length} synced notes with temporary doc_guid`)

      let updatedCount = 0
      for (const note of tempNotes) {
        // 查找 guid_mapping 中是否有对应的云端 GUID
        const mapping = db.exec(`
          SELECT server_guid FROM guid_mapping WHERE local_id = ?
        `, [note.id])

        if (mapping.length > 0 && mapping[0].values.length > 0) {
          const serverGuid = mapping[0].values[0][0]
          if (serverGuid && !serverGuid.startsWith('local_')) {
            // 用实际的云端 GUID 替换临时的 local_xxx
            await db.run(`
              UPDATE notes SET doc_guid = ?, updated_at = ? WHERE id = ?
            `, [serverGuid, Date.now(), note.id])

            console.log(`[DB] Normalized note ${note.id}: ${note.doc_guid} → ${serverGuid}`)
            updatedCount++
          }
        } else {
          // 如果没有映射，尝试基于 kb_guid + title 生成一个稳定的 GUID
          // 使用 kb_guid 的前半部分 + 时间戳确保唯一性
          const normalizedGuid = `${(note.kb_guid || '').substring(0, 16)}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
          await db.run(`
            UPDATE notes SET doc_guid = ?, updated_at = ? WHERE id = ?
          `, [normalizedGuid, Date.now(), note.id])

          console.log(`[DB] Generated normalized GUID for note ${note.id}: ${normalizedGuid}`)
          updatedCount++
        }
      }

      // 步骤 2：清理无效数据（sync_status=synced 但 kb_guid 为 NULL）
      const invalidNotes = execToObjects(`
        SELECT id, doc_guid, kb_guid, sync_status
        FROM notes
        WHERE sync_status = 'synced'
          AND (kb_guid IS NULL OR kb_guid = '')
      `)

      if (invalidNotes.length > 0) {
        console.warn(`[DB] Found ${invalidNotes.length} synced notes with missing kb_guid, marking as conflict`)
        for (const note of invalidNotes) {
          await db.run(`
            UPDATE notes SET sync_status = 'conflict', updated_at = ? WHERE id = ?
          `, [Date.now(), note.id])
        }
      }

      saveDatabase()

      const result = {
        normalized: updatedCount,
        markedAsConflict: invalidNotes.length,
        totalProcessed: tempNotes.length + invalidNotes.length
      }

      console.log('[DB] GUID normalization completed:', result)
      return result

    } catch (error) {
      log.error('[DB] normalizeNoteGuids error:', error)
      return { error: error.message, normalized: 0, markedAsConflict: 0 }
    }
  })

  // ✅ 清理重复的笔记（基于 kb_guid + title 去重）
  ipcMain.handle('db:cleanupDuplicateNotes', async () => {
    try {
      console.log('[DB] Starting duplicate notes cleanup...')

      // 查找潜在的重复记录（相同 kb_guid + 相同标题，排除本地临时笔记）
      const duplicates = execToObjects(`
        SELECT kb_guid, title, COUNT(*) as count, GROUP_CONCAT(id) as ids, GROUP_CONCAT(doc_guid) as doc_guids
        FROM notes
        WHERE kb_guid IS NOT NULL
          AND doc_guid IS NOT NULL
          AND doc_guid NOT LIKE 'local_%'
          AND sync_status = 'synced'
        GROUP BY kb_guid, title
        HAVING count > 1
      `)

      console.log(`[DB] Found ${duplicates.length} groups of potential duplicates`)

      let removedCount = 0
      for (const dup of duplicates) {
        const ids = dup.ids.split(',').map(id => parseInt(id.trim()))
        const docGuids = dup.doc_guids.split(',')

        // 保留第一个（ID 最小的），删除其余的
        const keepId = ids[0]
        const removeIds = ids.slice(1)

        console.log(`[DB] Keeping note ${keepId}, removing duplicates: ${removeIds.join(', ')}`)

        for (const removeId of removeIds) {
          await db.run('DELETE FROM notes WHERE id = ?', [removeId])
          await db.run('DELETE FROM guid_mapping WHERE local_id = ?', [removeId])
          removedCount++
        }
      }

      saveDatabase()

      const result = {
        duplicateGroups: duplicates.length,
        removedNotes: removedCount
      }

      console.log('[DB] Duplicate cleanup completed:', result)
      return result

    } catch (error) {
      log.error('[DB] cleanupDuplicateNotes error:', error)
      return { error: error.message, duplicateGroups: 0, removedNotes: 0 }
    }
  })

  // 重置数据库（清空所有本地笔记，重置同步状态）
  ipcMain.handle('db:resetDatabase', async () => {
    try {
      await db.run('DELETE FROM notes')
      await db.run('DELETE FROM guid_mapping')
      await db.run('DELETE FROM sync_log')
      saveDatabase()
      log.info('[DB] Database reset successfully')
      return true
    } catch (error) {
      log.error('[DB] resetDatabase error:', error)
      return false
    }
  })

  // 获取所有符文
  ipcMain.handle('db:getRunes', async () => {
    try {
      return execToObjects('SELECT * FROM runes ORDER BY created_at ASC')
    } catch (error) {
      log.error('[DB] getRunes error:', error)
      return []
    }
  })

  // 创建或更新符文
  ipcMain.handle('db:saveRune', async (event, rune) => {
    try {
      const now = Date.now()
      const existing = execOne('SELECT id FROM runes WHERE id = ?', [rune.id])
      if (existing) {
        await db.run(`UPDATE runes SET name = ?, "desc" = ?, power = ?, color = ?, icon = ?, template = ?, updated_at = ? WHERE id = ?`, [
          rune.name, rune.desc || '', rune.power || 50, rune.color || '#7E57C2', rune.icon || 'auto_awesome', rune.template || '', now, rune.id
        ])
      } else {
        await db.run(`INSERT INTO runes (id, name, "desc", power, color, icon, template, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [rune.id, rune.name, rune.desc || '', rune.power || 50, rune.color || '#7E57C2', rune.icon || 'auto_awesome', rune.template || '', now, now])
      }
      saveDatabase()
      return execOne('SELECT * FROM runes WHERE id = ?', [rune.id])
    } catch (error) {
      log.error('[DB] saveRune error:', error)
      return null
    }
  })

  // 删除符文
  ipcMain.handle('db:deleteRune', async (event, id) => {
    try {
      await db.run('DELETE FROM runes WHERE id = ?', [id])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] deleteRune error:', error)
      return false
    }
  })

  // 批量保存符文（用于排序更新）
  ipcMain.handle('db:saveRunes', async (event, runes) => {
    try {
      const now = Date.now()
      for (const rune of runes) {
        await db.run(`INSERT OR REPLACE INTO runes (id, name, "desc", power, color, icon, template, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [rune.id, rune.name, rune.desc || '', rune.power || 50, rune.color || '#7E57C2', rune.icon || 'auto_awesome', rune.template || '', rune.created_at || now, now])
      }
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] saveRunes error:', error)
      return false
    }
  })

  log.info('[Main] Database IPC handlers registered')
}

/**
 * 关闭数据库
 */
function closeDatabase() {
  if (db) {
    saveDatabase()
    db.close()
    db = null
    log.info('[Main] Database closed')
  }
}

console.log = log.log
console.error = log.error
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'logs', new Date().getFullYear().toString(), (new Date().getMonth() + 1).toString(), 'main.log')

const ClientStorage = new Store({
  name: 'ClientFileStorage'
})
const { registerApiHandler } = Api

osLocale().then(locale => {
  const cur = ClientStorage.get('language')
  console.log(locale.toLocaleLowerCase(), cur)
  if (!cur) {
    ClientStorage.set('language', locale.toLocaleLowerCase() || 'en-us')
  }
})

unhandled({
  reportButton: error => {
    openNewGitHubIssue({
      user: 'TankNee',
      repo: 'Neeto-Vue',
      body: `\`\`\`\n${error.stack}\n\`\`\`\n\n---\n\n${debugInfo()}`
    })
  },
  showDialog: true
})

try {
  if (
    process.platform === 'win32' &&
    nativeTheme.shouldUseDarkColors === true
  ) {
    require('fs').unlinkSync(
      require('path').join(app.getPath('userData'), 'DevTools Extensions')
    )
  }
} catch (_) {
}

/**
 * Set `__statics` path to static files in production;
 * The reason we are setting it here is that the path needs to be evaluated at runtime
 */
if (process.env.PROD) {
  global.__statics = __dirname
}

let mainWindow, forceQuit
const isMac = process.platform === 'darwin'

function createWindow () {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 900,
    defaultHeight: 600
  })
  /**
   * Initial window options
   */
  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width < 600 ? 600 : mainWindowState.width,
    height: mainWindowState.height < 400 ? 400 : mainWindowState.height,
    useContentSize: true,
    // transparent: true,
    vibrancy: ThemeManager.colorMode, // 'light', 'medium-light' etc
    webPreferences: {
      // Change from /quasar.conf.js > electron > nodeIntegration;
      // More info: https://quasar.dev/quasar-cli/developing-electron-apps/node-integration
      nodeIntegration: true,
      contextIsolation: false,
      nodeIntegrationInWorker: process.env.QUASAR_NODE_INTEGRATION,
      webSecurity: false,
      allowRunningInsecureContent: true,
      experimentalFeatures: false
      // Note: enableRemoteModule has been removed since Electron 28
      // @electron/remote now handles this automatically

      // More info: /quasar-cli/developing-electron-apps/electron-preload-script
      // preload: path.resolve(__dirname, 'electron-preload.js')
    },
    frame: false,
    titleBarStyle: 'hiddenInset'
  })

  protocol.interceptFileProtocol('file', (req, callback) => {
    const url = req.url.substr(8)
    callback(decodeURI(url))
  }, (error) => {
    if (error) {
      console.error('Failed to register protocol')
    }
  })

  registerMemocastProtocol()

  if (!process.env.PROD) {
    mainWindow.webContents.openDevTools()
  }
  const menu = Menu.buildFromTemplate(configureMenu(new KeyBindings(), mainWindow))
  Menu.setApplicationMenu(menu)

  mainWindow.isMainWindow = true
  mainWindowState.manage(mainWindow)

  mainWindow.loadURL(process.env.APP_URL).then()
  // mainWindow.on('closed', () => {
  //   mainWindow = null
  // })
  mainWindow.on('close', (event) => {
    if (!forceQuit) {
      event.preventDefault() // This will cancel the close
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('new-window', (event, linkUrl) => {
    event.preventDefault()
    if (linkUrl.startsWith('http://localhost:') || linkUrl.startsWith('file://')) {
      // dialog.showErrorBox('Unsupported Url Protocol', `Memocast cannot resolve this protocol: ${linkUrl}, please copy it to browser manually!`)
      return
    }
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: i18n.t('openLinkHint'),
      message: i18n.t('openLinkHint'),
      detail: linkUrl,
      buttons: [i18n.t('confirm'), i18n.t('cancel')]
    }).then((res) => {
      if (!res.response) {
        shell.openExternal(linkUrl).then()
      }
    })
  })
  registerApiHandler()
  global.themeManager = ThemeManager
  if (isMac) {
    enforceMacOSAppLocation()
  }

  require('@electron/remote/main').initialize()
  require('@electron/remote/main').enable(mainWindow.webContents)

  // Reliable window control via IPC — avoids getFocusedWindow() returning null
  ipcMain.on('window-minimize', () => mainWindow.minimize())
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window-close', () => mainWindow.close())
  ipcMain.handle('window-is-maximized', () => mainWindow.isMaximized())

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false))
}

app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')

app.on('ready', async () => {
  // 初始化数据库
  await initDatabase()
  // 创建主窗口
  createWindow()
})

app.on('window-all-closed', () => {
  // 关闭数据库
  closeDatabase()
  if (!isMac) {
    app.quit()
  }
})

app.on('before-quit', () => {
  forceQuit = true
  closeDatabase()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  } else if (isMac) {
    mainWindow.show()
  }
})

app.setAboutPanelOptions({
  applicationName: 'coolma',
  copyright: 'luo0412',
  website: 'https://github.com/luo0412/coolma',
  iconPath: path.resolve('src-electron/icons', 'linux-512x512.png'),
  applicationVersion: packageJSON.version
})

if (!isMac) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })
}
