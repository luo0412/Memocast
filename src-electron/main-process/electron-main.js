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
import CryptoJS from 'crypto-js'
import Portkey from 'portkey-ai'
const { DEFAULT_ROOT_CATEGORY } = require('./constants')
const createRuneTemplateService = require('./service/rune-template-service')
const BUILTIN_ECHO_CARDS = require('./service/builtin-echoes')

// rune 预设模板服务（schema + CRUD）。仅在 initSchema 阶段真正调用 createRuneTemplateService，
// registerDatabaseHandlers 阶段直接复用 module 级 runeTemplateService，避免重复闭包。
let runeTemplateService = null

// sql.js 数据库
let db = null
let dbPath = null

const AI_MODEL_PROVIDER_OPENAI_COMPATIBLE = 'openai-compatible'
const AI_MODEL_PROVIDER_PORTKEY = 'portkey'

function getAiConfigEncryptionSecret() {
  const secretSeed = [
    packageJSON.name,
    packageJSON.version,
    app.getPath('userData'),
    process.platform,
    process.arch,
    require('os').hostname()
  ].join('|')

  return CryptoJS.SHA256(secretSeed).toString()
}

function encryptAiConfigApiKey(apiKey) {
  if (!apiKey) return ''
  return CryptoJS.AES.encrypt(apiKey, getAiConfigEncryptionSecret()).toString()
}

function decryptAiConfigApiKey(encryptedValue) {
  if (!encryptedValue) return ''

  try {
    const bytes = CryptoJS.AES.decrypt(encryptedValue, getAiConfigEncryptionSecret())
    return bytes.toString(CryptoJS.enc.Utf8) || ''
  } catch (error) {
    log.error('[DB] decryptAiConfigApiKey error:', error)
    return ''
  }
}

function maskAiConfigApiKey(apiKey) {
  if (!apiKey) return ''
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}***`
  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`
}

function normalizeAiModelConfigRow(row, { includeApiKey = false } = {}) {
  if (!row) return null

  const decryptedApiKey = decryptAiConfigApiKey(row.api_key_encrypted)
  const decryptedVirtualKey = decryptAiConfigApiKey(row.virtual_key_encrypted || '')

  return {
    ...row,
    is_default: Number(row.is_default) === 1,
    enabled: Number(row.enabled) === 1,
    hasApiKey: Boolean(decryptedApiKey),
    apiKeyMasked: maskAiConfigApiKey(decryptedApiKey),
    headers_json: row.headers_json || '{}',
    extra_config_json: row.extra_config_json || '{}',
    virtual_key: includeApiKey ? decryptedVirtualKey : '',
    api_key: includeApiKey ? decryptedApiKey : '',
    portkeyVirtualKeyMasked: maskAiConfigApiKey(decryptedVirtualKey),
    hasVirtualKey: Boolean(decryptedVirtualKey)
  }
}

function normalizeAiSkillRow(row) {
  if (!row) return null
  return {
    ...row,
    builtin: Number(row.builtin) === 1,
    enabled: Number(row.enabled) === 1,
    sort_order: Number(row.sort_order) || 0
  }
}

function parseAiModelJsonField(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value

  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function getAiModelMissingFields(modelConfig) {
  if (!modelConfig) {
    return ['provider_type', 'base_url', 'model', 'api_key']
  }

  const missingFields = []
  const providerType = String(modelConfig.provider_type || '').trim()
  const hasApiKey = Boolean(modelConfig.api_key || modelConfig.hasApiKey)
  const hasVirtualKey = Boolean(modelConfig.virtual_key || modelConfig.hasVirtualKey)

  if (!providerType) {
    missingFields.push('provider_type')
    return missingFields
  }

  if (!modelConfig.base_url) {
    missingFields.push('base_url')
  }

  if (!modelConfig.model) {
    missingFields.push('model')
  }

  if (!hasApiKey) {
    missingFields.push('api_key')
  }

  if (providerType === AI_MODEL_PROVIDER_PORTKEY && !hasVirtualKey) {
    missingFields.push('virtual_key')
  }

  return missingFields
}

function buildAiModelTestMessages() {
  return [
    {
      role: 'user',
      content: 'Reply with exactly: ok'
    }
  ]
}

function normalizeAiModelTestError(error) {
  const message = String(error && error.message ? error.message : error || '')
  if (!message) return 'Connection test failed'
  return message.length > 300 ? `${message.slice(0, 300)}...` : message
}

async function testOpenAiCompatibleModelConfig(modelConfig) {
  const headers = parseAiModelJsonField(modelConfig.headers_json)
  const extraConfig = parseAiModelJsonField(modelConfig.extra_config_json)
  const url = `${String(modelConfig.base_url || '').replace(/\/$/, '')}/chat/completions`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${modelConfig.api_key || ''}`,
      ...headers
    },
    body: JSON.stringify({
      messages: buildAiModelTestMessages(),
      model: modelConfig.model,
      temperature: 0,
      max_tokens: 8,
      ...extraConfig,
      stream: false
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  await response.json()
  return true
}

async function testPortkeyModelConfig(modelConfig) {
  const client = new Portkey({
    apiKey: modelConfig.api_key || '',
    virtualKey: modelConfig.virtual_key || undefined,
    baseURL: modelConfig.base_url || undefined,
    defaultHeaders: parseAiModelJsonField(modelConfig.headers_json)
  })

  await client.chat.completions.create({
    messages: buildAiModelTestMessages(),
    model: modelConfig.model,
    temperature: 0,
    max_tokens: 8,
    ...parseAiModelJsonField(modelConfig.extra_config_json)
  })

  return true
}

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
  const BUILTIN_RUNE_IDS = new Set(['rune-1', 'rune-2', 'rune-3', 'rune-4', 'rune-5', 'rune-6'])
  const createDefaultRuneTemplate = () => `<template>
  <div class="blank-page">
    <!-- HTML 结构区域 -->
    <p>Vue2 空白组件</p>
  </div>
</template>

<script>
export default {
  name: 'BlankDemo',
  // 接收父组件参数
  props: {},
  data() {
    return {
      // 响应式数据
    }
  },
  computed: {
    // 计算属性
  },
  watch: {
    // 数据监听
  },
  methods: {
    // 业务方法
  },
  // 生命周期钩子
  created() {},
  mounted() {},
  updated() {},
  destroyed() {}
}
<\/script>

<style lang="less" scoped>

</style>`
  const createDefaultEchoAnnoSource = (echoName = '回响') => `export default {
    kind: 'echo',
    version: 1,
    name: '${String(echoName || '回响').replace(/'/g, "\\'")}',
    render (context = {}) {
      const attrs = context.attrs || {}
      const prompt = context.prompt || ''
      const icon = attrs.icon || context.echo?.icon || 'graphic_eq'
      const color = attrs.color || context.echo?.color || '#26A69A'
      const title = attrs.title || context.echo?.name || '${String(echoName || '回响').replace(/'/g, "\\'")}'
      const description = attrs.desc || context.echo?.desc || ''

      return {
        type: 'card',
        icon,
        color,
        title,
        description,
        prompt,
        attrs,
        html: attrs.html || ''
      }
    }
  }`

  // Notes 表（本地优先架构：使用 dirty 字段跟踪同步状态）
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
      local_modified INTEGER,
      server_modified INTEGER,
      created_at INTEGER,
      updated_at INTEGER,
      dirty INTEGER DEFAULT 0
    )
  `)

  // 索引
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_doc_guid ON notes(doc_guid) WHERE doc_guid IS NOT NULL AND doc_guid NOT LIKE 'local_%'`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_notes_kb_guid ON notes(kb_guid)`)
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_kb_doc_unique ON notes(kb_guid, doc_guid) WHERE kb_guid IS NOT NULL AND doc_guid IS NOT NULL AND doc_guid NOT LIKE 'local_%'`)
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_category_title_kb ON notes(category, title, kb_guid) WHERE category IS NOT NULL AND title IS NOT NULL AND kb_guid IS NOT NULL`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_notes_dirty ON notes(dirty)`)

  // 数据库迁移：检查并创建唯一索引
  try {
    const indexList = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='notes'")
    const existingIndexes = indexList.length > 0 ? indexList[0].values.map(row => row[0]) : []

    if (!existingIndexes.includes('idx_notes_category_title_kb')) {
      console.log('[DB] Migrating: adding unique index on (category, title, kb_guid)')
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_category_title_kb ON notes(category, title, kb_guid) WHERE category IS NOT NULL AND title IS NOT NULL AND kb_guid IS NOT NULL`)
      saveDatabase()
    }
  } catch (idxError) {
    console.warn('[DB] Index migration check failed:', idxError.message)
  }

  // 数据库迁移：添加缺失的列
  try {
    const tableInfo = db.exec("PRAGMA table_info(notes)")
    const columns = tableInfo[0].values.map(row => row[1])

    if (!columns.includes('kb_guid')) {
      console.log('[DB] Migrating: adding kb_guid column to notes table')
      db.run("ALTER TABLE notes ADD COLUMN kb_guid TEXT")
      saveDatabase()
    }

    if (!columns.includes('dirty')) {
      console.log('[DB] Migrating: adding dirty column to notes table (local-first architecture)')
      db.run("ALTER TABLE notes ADD COLUMN dirty INTEGER DEFAULT 0")
      saveDatabase()
      console.log('[DB] ✅ dirty column added - local-first sync architecture enabled')
    }

    // ✅ 如果存在 sync_status 列，需要移除它（通过重建表）
    if (columns.includes('sync_status')) {
      console.log('[DB] Migrating: removing deprecated sync_status column, using dirty instead')

      try {
        // 创建新表（不包含 sync_status）
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
            local_modified INTEGER,
            server_modified INTEGER,
            created_at INTEGER,
            updated_at INTEGER,
            dirty INTEGER DEFAULT 0
          )
        `)

        // 迁移数据（排除 sync_status 列）
        db.run(`
          INSERT INTO notes_new (
            id, doc_guid, kb_guid, title, content, category, tags,
            data_created, data_modified, local_modified,
            server_modified, created_at, updated_at, dirty
          )
          SELECT
            id, doc_guid, kb_guid, title, content, category, tags,
            data_created, data_modified, local_modified,
            server_modified, created_at, updated_at,
            CASE WHEN sync_status IN ('local_only', 'pending_upload') THEN 1 ELSE 0 END as dirty
          FROM notes
        `)

        // 替换旧表
        db.run('DROP TABLE notes')
        db.run('ALTER TABLE notes_new RENAME TO notes')

        // 重建索引
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_doc_guid ON notes(doc_guid) WHERE doc_guid IS NOT NULL AND doc_guid NOT LIKE 'local_%'`)
        db.run(`CREATE INDEX IF NOT EXISTS idx_notes_kb_guid ON notes(kb_guid)`)
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_kb_doc_unique ON notes(kb_guid, doc_guid) WHERE kb_guid IS NOT NULL AND doc_guid IS NOT NULL AND doc_guid NOT LIKE 'local_%'`)
        db.run(`CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)`)
        db.run(`CREATE INDEX IF NOT EXISTS idx_notes_dirty ON notes(dirty)`)

        saveDatabase()
        console.log('[DB] ✅ Migration completed: sync_status removed, dirty architecture active')
      } catch (migrationError) {
        console.error('[DB] Migration failed:', migrationError.message)
      }
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

  // 离线文件夹表（支持离线模式创建和管理文件夹）
  db.run(`
    CREATE TABLE IF NOT EXISTS local_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL UNIQUE,
      parent TEXT DEFAULT '',
      kb_guid TEXT DEFAULT '',
      local_only INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS idx_local_categories_kb ON local_categories(kb_guid)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_local_categories_parent ON local_categories(parent)`)

  db.run(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER
    )
  `)

  // 同步日志表
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER,
      action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
      direction TEXT NOT NULL CHECK(direction IN ('local_to_server', 'server_to_local')),
      doc_guid TEXT,
      kb_guid TEXT,
      timestamp INTEGER,
      synced INTEGER DEFAULT 0,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    )
  `)

  try {
    db.run('ALTER TABLE sync_log ADD COLUMN doc_guid TEXT')
  } catch (error) {}

  try {
    db.run('ALTER TABLE sync_log ADD COLUMN kb_guid TEXT')
  } catch (error) {}

  // runes / echoes 兼容:为已有行补 category / sort_order 默认值
  try {
    db.run("UPDATE runes SET category = 'general' WHERE category IS NULL OR trim(category) = ''")
  } catch (error) {}
  try {
    db.run('UPDATE runes SET sort_order = 0 WHERE sort_order IS NULL')
  } catch (error) {}
  try {
    db.run("UPDATE echoes SET category = 'builtin' WHERE (id LIKE '\\_\\_builtin\\_%' ESCAPE '\\') AND (category IS NULL OR trim(category) = '')")
  } catch (error) {}
  try {
    db.run("UPDATE echoes SET category = 'marker' WHERE (id NOT LIKE '\\_\\_builtin\\_%' ESCAPE '\\') AND (category IS NULL OR trim(category) = '')")
  } catch (error) {}
  try {
    db.run('UPDATE echoes SET sort_order = 0 WHERE sort_order IS NULL')
  } catch (error) {}

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
      category TEXT DEFAULT 'general',
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    )
  `)

  // 兼容旧库:为已存在的 runes 表补充 category / sort_order 列
  try {
    db.run('ALTER TABLE runes ADD COLUMN category TEXT DEFAULT \'general\'')
  } catch (error) {}
  try {
    db.run('ALTER TABLE runes ADD COLUMN sort_order INTEGER DEFAULT 0')
  } catch (error) {}

  // 符文名称全局唯一（不区分大小写，去除首尾空白）
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_runes_name_unique ON runes(LOWER(TRIM(name)))`)

  // 回响卡片表
  db.run(`
    CREATE TABLE IF NOT EXISTS echoes (
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
    )
  `)

  // 兼容旧库:为已存在的 echoes 表补充 category / sort_order 列
  try {
    db.run('ALTER TABLE echoes ADD COLUMN category TEXT DEFAULT \'marker\'')
  } catch (error) {}
  try {
    db.run('ALTER TABLE echoes ADD COLUMN sort_order INTEGER DEFAULT 0')
  } catch (error) {}

  // 回响名称全局唯一（不区分大小写，去除首尾空白）
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_echoes_name_unique ON echoes(LOWER(TRIM(name)))`)

  // AI 模型配置表
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_model_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL DEFAULT 'openai-compatible',
      base_url TEXT NOT NULL DEFAULT '',
      api_key_encrypted TEXT NOT NULL DEFAULT '',
      virtual_key_encrypted TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      is_default INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      headers_json TEXT DEFAULT '{}',
      extra_config_json TEXT DEFAULT '{}',
      created_at INTEGER,
      updated_at INTEGER
    )
  `)
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_model_configs_name ON ai_model_configs(name)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_model_configs_default ON ai_model_configs(is_default)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_model_configs_provider ON ai_model_configs(provider_type)`)

  try {
    const aiModelColumnsResult = db.exec("PRAGMA table_info(ai_model_configs)")
    const aiModelColumns = aiModelColumnsResult.length > 0 ? aiModelColumnsResult[0].values.map(row => row[1]) : []

    if (!aiModelColumns.includes('virtual_key_encrypted')) {
      db.run("ALTER TABLE ai_model_configs ADD COLUMN virtual_key_encrypted TEXT NOT NULL DEFAULT ''")
      saveDatabase()
    }

    if (!aiModelColumns.includes('headers_json')) {
      db.run("ALTER TABLE ai_model_configs ADD COLUMN headers_json TEXT DEFAULT '{}'")
      saveDatabase()
    }

    if (!aiModelColumns.includes('extra_config_json')) {
      db.run("ALTER TABLE ai_model_configs ADD COLUMN extra_config_json TEXT DEFAULT '{}'")
      saveDatabase()
    }

    if (!aiModelColumns.includes('enabled')) {
      db.run('ALTER TABLE ai_model_configs ADD COLUMN enabled INTEGER DEFAULT 1')
      saveDatabase()
    }
  } catch (error) {
    console.warn('[DB] AI model config migration check failed:', error.message)
  }

  // AI 技能表（用户管理 title + content，可在 AI 生成场景中选用）
  // 通过 builtin 字段区分内置与自定义：1 = 内置（用户不可见，仅供开发调试），0 = 自定义
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      builtin INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    )
  `)
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_skills_name ON ai_skills(name)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_skills_builtin ON ai_skills(builtin)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_skills_sort ON ai_skills(sort_order)`)

  // 初始化内置技能（仅当没有任何内置技能时写入；用户不可见，仅供开发侧调试）
  const builtinSkillCount = execOne('SELECT COUNT(*) as count FROM ai_skills WHERE builtin = 1')
  if (builtinSkillCount && builtinSkillCount.count === 0) {
    const now = Date.now()
    const builtinSkills = [
      {
        name: '__builtin_summarize__',
        title: '总结',
        content: '请阅读以下内容，给出一段不超过 200 字的中文摘要，保留关键事实与结论，使用列表形式输出要点。'
      },
      {
        name: '__builtin_polish__',
        title: '润色',
        content: '请保留原文事实与风格，将以下中文内容润色为更流畅、更易读的版本，不引入额外信息，不缩短为过短的版本。'
      },
      {
        name: '__builtin_translate_en__',
        title: '英译中',
        content: '请将以下内容翻译为地道、简洁的中文，保留专有名词原文，必要时给出脚注式说明。'
      }
    ]
    for (const skill of builtinSkills) {
      db.run(
        `INSERT INTO ai_skills (name, title, content, builtin, enabled, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, 0, ?, ?)`,
        [skill.name, skill.title, skill.content, now, now]
      )
    }
    saveDatabase()
    log.info('[DB] Built-in AI skills seeded')
  }

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
      db.run(`INSERT INTO runes (id, name, "desc", power, color, icon, template, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.name, r.desc, r.power, r.color, r.icon, createDefaultRuneTemplate(r.name), 'general', now, now])
    }
    saveDatabase()
    log.info('[DB] Default runes seeded')
  }

  const emptyTemplateRunes = execToObjects(`SELECT id, name FROM runes WHERE template IS NULL OR trim(template) = ''`)
  if (emptyTemplateRunes.length > 0) {
    const now = Date.now()
    const newRuneIds = emptyTemplateRunes
      .filter(rune => rune && rune.id && !BUILTIN_RUNE_IDS.has(rune.id))
      .map(rune => rune.id)

    for (const runeId of newRuneIds) {
      db.run('UPDATE runes SET template = ?, updated_at = ? WHERE id = ?', [createDefaultRuneTemplate(), now, runeId])
    }

    if (newRuneIds.length > 0) {
      saveDatabase()
      log.info(`[DB] Backfilled default templates for ${newRuneIds.length} new rune(s)`)
    }
  }

  // 初始化默认回响数据（仅当表为空时）
  const echoCount = execOne('SELECT COUNT(*) as count FROM echoes')
  if (echoCount && echoCount.count === 0) {
    const now = Date.now()
    const defaultEchoes = [
      // { id: 'echo-1', name: '晨星批注', desc: '适合在正文中插入强调型提示卡片', color: '#26A69A', icon: 'graphic_eq', anno_source: createDefaultEchoAnnoSource('晨星批注') },
      // { id: 'echo-2', name: '折光回声', desc: '把段落转成带说明的注解块', color: '#5C6BC0', icon: 'auto_fix_high', anno_source: createDefaultEchoAnnoSource('折光回声') },
      // { id: 'echo-3', name: '边界低语', desc: '适合提示风险、注意事项与旁白信息', color: '#EC407A', icon: 'campaign', anno_source: createDefaultEchoAnnoSource('边界低语') }
    ]
    for (const echo of defaultEchoes) {
      db.run(`INSERT INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [echo.id, echo.name, echo.desc, echo.color, echo.icon, echo.anno_source, 'anno', 'marker', now, now])
    }
    saveDatabase()
    log.info('[DB] Default echoes seeded')
  }

  try {
    const echoTableInfo = db.exec("PRAGMA table_info(echoes)")
    const echoColumns = echoTableInfo.length > 0 ? echoTableInfo[0].values.map(row => row[1]) : []

    if (!echoColumns.includes('anno_source')) {
      db.run("ALTER TABLE echoes ADD COLUMN anno_source TEXT")
    }
    if (!echoColumns.includes('render_type')) {
      db.run("ALTER TABLE echoes ADD COLUMN render_type TEXT DEFAULT 'anno'")
    }
    if (echoColumns.includes('template')) {
      const legacyEchoes = execToObjects(`SELECT id, name, template, anno_source FROM echoes`)
      const now = Date.now()
      for (const echo of legacyEchoes) {
        const annoSource = echo.anno_source || echo.template || createDefaultEchoAnnoSource(echo.name)
        db.run('UPDATE echoes SET anno_source = COALESCE(anno_source, ?), render_type = COALESCE(render_type, ?), updated_at = ? WHERE id = ?', [annoSource, 'anno', now, echo.id])
      }
    }
    saveDatabase()
  } catch (echoMigrationError) {
    console.warn('[DB] Echo schema migration failed:', echoMigrationError.message)
  }

  const emptyAnnoSourceEchoes = execToObjects(`SELECT id, name FROM echoes WHERE anno_source IS NULL OR trim(anno_source) = ''`)
  if (emptyAnnoSourceEchoes.length > 0) {
    const now = Date.now()
    for (const echo of emptyAnnoSourceEchoes) {
      db.run('UPDATE echoes SET anno_source = ?, updated_at = ?, render_type = COALESCE(render_type, ?) WHERE id = ?', [createDefaultEchoAnnoSource(echo.name), now, 'anno', echo.id])
    }
    saveDatabase()
    log.info(`[DB] Backfilled default anno sources for ${emptyAnnoSourceEchoes.length} echo(es)`)
  }

  // === Sync 内置回响到 SQLite（强制覆盖） ===
  // 11 个 __builtin_* 回响以 BUILTIN_ECHO_CARDS 为权威源：每次启动都会把 DB row 的
  // name / desc / color / icon / anno_source / render_type / category / sort_order / updated_at
  // 强制覆盖到代码当前版本（id / created_at 保留）。
  // 这样：
  //   1. 升级时改动了 BUILTIN_ECHO_CARDS（例如给内置回响加上 inheritFromPrevious: false），
  //      下次启动 DB 自动同步，不再需要手动清表；
  //   2. 内置回响在前端 isBuiltin=true 始终只读，但代码侧的演进仍能落到 DB。
  try {
    const now = Date.now()
    let insertedCount = 0
    let updatedCount = 0
    for (const builtinEcho of BUILTIN_ECHO_CARDS) {
      if (!builtinEcho || !builtinEcho.id) continue
      const builtinId = String(builtinEcho.id)
      const existing = execOne('SELECT id, created_at FROM echoes WHERE id = ?', [builtinId])
      if (existing) {
        // 已存在 → 强制覆盖，保留 id / created_at
        db.run(
          `UPDATE echoes SET
            name = ?,
            "desc" = ?,
            color = ?,
            icon = ?,
            anno_source = ?,
            render_type = ?,
            category = ?,
            sort_order = ?,
            updated_at = ?
          WHERE id = ?`,
          [
            builtinEcho.name,
            builtinEcho.desc || '',
            builtinEcho.color || '#26A69A',
            builtinEcho.icon || 'graphic_eq',
            builtinEcho.anno_source,
            'anno',
            'builtin',
            Number.isFinite(Number(builtinEcho.sort_order)) ? Number(builtinEcho.sort_order) : 0,
            now,
            builtinId
          ]
        )
        updatedCount += 1
      } else {
        // 不存在 → INSERT；created_at 一律用 now（首建时间由本机时钟决定）
        db.run(
          `INSERT INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            builtinId,
            builtinEcho.name,
            builtinEcho.desc || '',
            builtinEcho.color || '#26A69A',
            builtinEcho.icon || 'graphic_eq',
            builtinEcho.anno_source,
            'anno',
            'builtin',
            Number.isFinite(Number(builtinEcho.sort_order)) ? Number(builtinEcho.sort_order) : 0,
            now,
            now
          ]
        )
        insertedCount += 1
      }
    }
    if (insertedCount > 0 || updatedCount > 0) {
      saveDatabase()
      log.info(`[DB] Synced builtin echoes (inserted=${insertedCount}, updated=${updatedCount})`)
    }
  } catch (builtinEchoSeedError) {
    log.error('[DB] Failed to sync builtin echoes:', builtinEchoSeedError)
  }

  // === rune 预设模板 (rune_templates) ===
  // 单独的服务（service/rune-template-service.js）只负责 schema + CRUD。
  // 用 module 级变量保存实例，供后续 registerDatabaseHandlers 复用，避免重复建闭包。
  runeTemplateService = createRuneTemplateService({ db, execToObjects, execOne, saveDatabase, log })
  runeTemplateService.ensureSchema()
  const runeTplCount = execOne('SELECT COUNT(*) as count FROM rune_templates')
  if (runeTplCount && runeTplCount.count === 0) {
    try {
      const seedModule = require('./service/builtin-rune-templates')
      const list = (seedModule && seedModule.BUILTIN_RUNE_TEMPLATES) || []
      if (list.length) {
        const now = Date.now()
        const rows = list.map((it, idx) => ({
          id: it.id,
          category_key: it.category_key,
          name: it.name,
          desc: it.desc,
          color: it.color,
          icon: it.icon,
          template: it.template,
          source_url: '',
          is_builtin: 1,
          sort_order: idx,
          created_at: now,
          updated_at: now
        }))
        const result = runeTemplateService.saveMany(rows)
        if (result && result.success) {
          saveDatabase()
          log.info(`[DB] Seeded ${result.count} built-in rune templates into rune_templates`)
        }
      }
    } catch (seedError) {
      console.warn('[DB] seedRuneTemplates skipped:', seedError && seedError.message)
    }
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
      if (options.dirty !== undefined) {
        query += ' AND dirty = ?'
        params.push(options.dirty)
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

  // ✅ 获取所有笔记的基本信息（用于同步去重检查）
  ipcMain.handle('db:getAllNotesBasic', async () => {
    try {
      return execToObjects(`
        SELECT title, category, kb_guid
        FROM notes
        WHERE title IS NOT NULL AND title != ''
          AND kb_guid IS NOT NULL AND kb_guid != ''
      `)
    } catch (error) {
      log.error('[DB] getAllNotesBasic error:', error)
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

  // 创建笔记（严格去重：永远更新同一条记录，绝不创建副本）
  ipcMain.handle('db:createNote', async (event, note) => {
    try {
      const now = Date.now()
      const toStr = (v) => (v == null) ? '' : (typeof v === 'string') ? v : (typeof v === 'number') ? String(v) : JSON.stringify(v)
      const toNum = (v) => (v == null) ? now : (typeof v === 'number') ? v : parseInt(v, 10) || now
      const toStrOrNull = (v) => (v == null) ? null : (typeof v === 'string') ? v : (typeof v === 'number') ? String(v) : JSON.stringify(v)

      const title = toStr(note.title) || 'Untitled'
      const category = toStr(note.category) || DEFAULT_ROOT_CATEGORY
      const kbGuid = toStrOrNull(note.kb_guid)
      const docGuid = toStrOrNull(note.doc_guid)

      // ✅ 调试日志：显示 createNote 的所有参数（便于排查 category 问题）
      console.log(`[DB] createNote called: title="${title}", category="${category}", kbGuid=${kbGuid}, docGuid=${docGuid}`)

      // ✅ 警告：如果 category 是错误的根目录 "/"，记录详细信息
      if (category === '/' || (category && !category.endsWith('/'))) {
        console.warn(`[DB] ⚠️ INVALID CATEGORY: title="${title}", raw_category="${note.category}", normalized="${category}", should be "${DEFAULT_ROOT_CATEGORY}"`)
      }

      let existingNote = null

      // ✅ 优先级 1：按 doc_guid 精确匹配（最强）
      if (docGuid && !docGuid.startsWith('local_')) {
        existingNote = execOne(`SELECT * FROM notes WHERE doc_guid = ? LIMIT 1`, [docGuid])
      }

      // ✅ 优先级 2：按 (category, title, kb_guid) 匹配（标准去重）
      if (!existingNote && kbGuid && title && title !== 'Untitled') {
        existingNote = execOne(`
          SELECT * FROM notes
          WHERE category = ? AND title = ? AND kb_guid = ?
          ORDER BY local_modified DESC, id DESC
          LIMIT 1
        `, [category, title, kbGuid])

        if (existingNote) {
          console.log(`[DB] createNote: Matched by (category, title, kb_guid)=(${category}, ${title}, ${kbGuid}), id=${existingNote.id}`)
        }
      }

      // ✅ 优先级 3：按 (category, title) 匹配（kbGuid 为空时的兜底）
      if (!existingNote && title && title !== 'Untitled') {
        existingNote = execOne(`
          SELECT * FROM notes
          WHERE category = ? AND title = ?
          ORDER BY local_modified DESC, id DESC
          LIMIT 1
        `, [category, title])

        if (existingNote) {
          console.log(`[DB] createNote: Matched by (category, title)=(${category}, ${title}), id=${existingNote.id} (kbGuid was missing)`)
        }
      }

      // ✅ 如果找到已有记录 → 更新它（永不创建副本）
      if (existingNote && existingNote.id) {
        console.log(`[DB] createNote: ✅ Updating EXISTING note id=${existingNote.id} instead of creating new`)

        await db.run(`
          UPDATE notes
          SET doc_guid = COALESCE(?, doc_guid),
              kb_guid = COALESCE(?, kb_guid),
              title = ?,
              content = ?,
              category = ?,
              tags = ?,
              data_modified = COALESCE(?, data_modified),
              local_modified = ?,
              updated_at = ?,
              dirty = 1
          WHERE id = ?
        `, [
          docGuid,
          kbGuid,
          title,
          toStr(note.content),
          category,
          toStr(note.tags),
          toNum(note.data_modified),
          toNum(note.local_modified) || now,
          now,
          existingNote.id
        ])

        saveDatabase()
        return execOne('SELECT * FROM notes WHERE id = ?', [existingNote.id])
      }

      // ✅ 没有找到 → 才 INSERT 新记录
      await db.run(`
        INSERT INTO notes (doc_guid, kb_guid, title, content, category, tags, data_created, data_modified, local_modified, created_at, updated_at, dirty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        docGuid,
        kbGuid,
        title,
        toStr(note.content),
        category,
        toStr(note.tags),
        toNum(note.data_created),
        toNum(note.data_modified),
        toNum(note.local_modified),
        now,
        now,
        1  // 新建笔记默认 dirty=1（待同步）
      ])

      console.log(`[DB] createNote: id=?, dirty=1 (pending sync)`)
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
          title: note?.title
        })
        return null
      }

      console.log('[DB] createNote: successfully created note, id =', createdNote.id)
      return createdNote
    } catch (error) {
      log.error('[DB] createNote error:', error)
      log.error('[DB] createNote note object keys:', Object.keys(note || {}))
      log.error('[DB] createNote doc_guid:', note?.doc_guid, 'dirty:', note?.dirty)
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
      if (updates.server_modified !== undefined) {
        fields.push('server_modified = ?')
        values.push(toNum(updates.server_modified))
      }

      // 关键改进：根据 isSystemUpdate 区分用户编辑和系统自动更新
      if (!isSystemUpdate) {
        // 用户主动编辑 → 更新所有时间戳 + 标记为脏（待同步）
        fields.push('data_modified = ?', 'local_modified = ?', 'updated_at = ?', 'dirty = ?')
        values.push(now, now, now, 1)
        console.log(`[DB] ✅ User edit: note ${id} marked as dirty=1`)
      } else {
        // 系统自动更新（同步完成）→ 清除 dirty 标记
        fields.push('updated_at = ?', 'dirty = ?')
        values.push(now, 0)
        console.log(`[DB] ✅ Sync completed: note ${id} marked as dirty=0`)
      }

      values.push(id)

      // 不再在数据库层静默删除冲突记录；若发生 GUID 冲突，应由上层同步逻辑显式处理。
      const query = `UPDATE notes SET ${fields.join(', ')} WHERE id = ?`
      await db.run(query, values)
      saveDatabase()

      const updatedNote = execOne('SELECT * FROM notes WHERE id = ?', [id])

      if (updatedNote) {
        console.log(`[DB] ✅ Update verified: id=${updatedNote.id}, dirty=${updatedNote.dirty}, local_modified=${updatedNote.local_modified}`)
      } else {
        console.error(`[DB] ❌ Failed to retrieve updated note ${id} after update`)
      }

      return updatedNote
    } catch (error) {
      log.error('[DB] updateNote error:', error)
      log.error('[DB] updateNote updates keys:', Object.keys(updates || {}))
      return null
    }
  })

  // 删除笔记
  ipcMain.handle('db:deleteNote', async (event, payload) => {
    try {
      const noteId = typeof payload === 'object' && payload !== null ? payload.id : payload
      await db.run('DELETE FROM notes WHERE id = ?', [noteId])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] deleteNote error:', error)
      return false
    }
  })

  // 获取同步状态统计（仅统计当前账号 dirty 笔记，避免与右上角待同步数量不一致）
  ipcMain.handle('db:getStats', async () => {
    try {
      const currentKbGuid = ClientStorage.get('kbGuid')
      const total = execOne('SELECT COUNT(*) as count FROM notes')
      let pending

      if (currentKbGuid) {
        pending = execOne(
          `SELECT COUNT(*) as count
           FROM notes
           WHERE dirty = 1 AND kb_guid = ?`,
          [currentKbGuid]
        )
      } else {
        pending = execOne(
          `SELECT COUNT(*) as count
           FROM notes
           WHERE dirty = 1 AND (kb_guid IS NULL OR kb_guid = '')`
        )
      }

      const stats = {
        total: total?.count || 0,
        synced: Math.max((total?.count || 0) - (pending?.count || 0), 0),
        pending: pending?.count || 0,
        syncing: 0
      }

      console.log(`[DB] 📊 Stats: total=${stats.total}, pending=${stats.pending}, kbGuid=${currentKbGuid || 'offline'}`)

      return stats
    } catch (error) {
      log.error('[DB] getStats error:', error)
      return { total: 0, synced: 0, pending: 0 }
    }
  })

  // 获取所有标签
  ipcMain.handle('db:getTags', async (event, { noteId } = {}) => {
    try {
      let query = `
        SELECT
          t.id,
          t.name,
          t.color,
          t.created_at,
          'local_tag_' || t.id AS tagGuid
        FROM tags t
      `
      const params = []

      if (noteId) {
        query += ' INNER JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ?'
        params.push(noteId)
      }

      query += ' ORDER BY t.name'
      return execToObjects(query, params)
    } catch (error) {
      log.error('[DB] getTags error:', error)
      return []
    }
  })

  // 创建标签
  ipcMain.handle('db:createTag', async (event, tag) => {
    try {
      const now = Date.now()
      const name = (tag?.name || '').trim()
      if (!name) return null

      const existing = execOne('SELECT id, name, color, created_at FROM tags WHERE name = ?', [name])
      if (existing) {
        return { ...existing, tagGuid: `local_tag_${existing.id}` }
      }

      await db.run(`INSERT INTO tags (name, color, created_at) VALUES (?, ?, ?)`, [name, tag.color || '#1890ff', now])
      saveDatabase()
      const lastId = getLastInsertRowid()
      return { id: lastId, name, color: tag.color || '#1890ff', created_at: now, tagGuid: `local_tag_${lastId}` }
    } catch (error) {
      log.error('[DB] createTag error:', error)
      return null
    }
  })

  ipcMain.handle('db:getNoteTags', async (event, { noteId }) => {
    try {
      if (!noteId) return []
      return execToObjects(
        `SELECT t.id, t.name, t.color, t.created_at, 'local_tag_' || t.id AS tagGuid
         FROM tags t
         INNER JOIN note_tags nt ON nt.tag_id = t.id
         WHERE nt.note_id = ?
         ORDER BY t.name`,
        [noteId]
      )
    } catch (error) {
      log.error('[DB] getNoteTags error:', error)
      return []
    }
  })

  ipcMain.handle('db:getTagByName', async (event, { name }) => {
    try {
      if (!name) return null
      const row = execOne('SELECT id, name, color, created_at FROM tags WHERE name = ?', [name])
      return row ? { ...row, tagGuid: `local_tag_${row.id}` } : null
    } catch (error) {
      log.error('[DB] getTagByName error:', error)
      return null
    }
  })

  ipcMain.handle('db:attachTagToNote', async (event, { noteId, tagId }) => {
    try {
      if (!noteId || !tagId) return false
      await db.run('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', [noteId, tagId])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] attachTagToNote error:', error)
      return false
    }
  })

  ipcMain.handle('db:removeTagFromNote', async (event, { noteId, tagId }) => {
    try {
      if (!noteId || !tagId) return false
      await db.run('DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?', [noteId, tagId])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] removeTagFromNote error:', error)
      return false
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

  // ============================================================
  // 离线文件夹（categories）CRUD - 支持离线模式创建文件夹
  // ============================================================

  // 获取所有本地文件夹
  ipcMain.handle('db:getCategories', async (event, { kbGuid } = {}) => {
    try {
      let query = 'SELECT * FROM local_categories WHERE 1=1'
      const params = []
      if (kbGuid) {
        query += ' AND (kb_guid = ? OR kb_guid = "")'
        params.push(kbGuid)
      }
      query += ' ORDER BY category ASC'
      return execToObjects(query, params)
    } catch (error) {
      log.error('[DB] getCategories error:', error)
      return []
    }
  })

  // 创建本地文件夹（支持离线创建）
  ipcMain.handle('db:createCategory', async (event, { category, parent, kbGuid, localOnly }) => {
    try {
      const now = Date.now()
      // 规范化路径：确保以 / 开头和结尾
      let normalizedCategory = category
      if (!normalizedCategory.startsWith('/')) normalizedCategory = '/' + normalizedCategory
      if (!normalizedCategory.endsWith('/')) normalizedCategory = normalizedCategory + '/'

      const normalizedParent = parent || ''
      const normalizedKbGuid = kbGuid || ''
      const normalizedLocalOnly = localOnly ? 1 : 0

      // 幂等：同一路径若已存在，则按当前目标状态升级/回退，而不是重复插入
      const existing = execOne('SELECT * FROM local_categories WHERE category = ?', [normalizedCategory])
      if (existing) {
        const needsUpdate =
          (existing.parent || '') !== normalizedParent ||
          (existing.kb_guid || '') !== normalizedKbGuid ||
          Number(existing.local_only || 0) !== normalizedLocalOnly

        if (needsUpdate) {
          await db.run(
            'UPDATE local_categories SET parent = ?, kb_guid = ?, local_only = ?, updated_at = ? WHERE category = ?',
            [normalizedParent, normalizedKbGuid, normalizedLocalOnly, now, normalizedCategory]
          )
          saveDatabase()
          return execOne('SELECT * FROM local_categories WHERE category = ?', [normalizedCategory])
        }

        log.info(`[DB] createCategory: category "${normalizedCategory}" already exists, skipping`)
        return existing
      }

      await db.run(
        `INSERT INTO local_categories (category, parent, kb_guid, local_only, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [normalizedCategory, normalizedParent, normalizedKbGuid, normalizedLocalOnly, now, now]
      )
      saveDatabase()
      const lastId = getLastInsertRowid()
      return execOne('SELECT * FROM local_categories WHERE id = ?', [lastId])
    } catch (error) {
      log.error('[DB] createCategory error:', error)
      return null
    }
  })

  // 删除本地文件夹
  ipcMain.handle('db:deleteCategory', async (event, { category }) => {
    try {
      await db.run('DELETE FROM local_categories WHERE category = ?', [category])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] deleteCategory error:', error)
      return false
    }
  })

  // 将本地文件夹同步到云端（createCategory 同步版）
  // category 参数格式: { category, parent, kbGuid }
  ipcMain.handle('db:syncCategoryToCloud', async (event, { category, parent, kbGuid }) => {
    try {
      // 已在云端创建过了（local_only=0），跳过
      const existing = execOne('SELECT * FROM local_categories WHERE category = ? AND local_only = 0', [category])
      if (existing) {
        return { success: true, skipped: true }
      }

      // 标记为已同步（local_only=0）
      await db.run('UPDATE local_categories SET local_only = 0, updated_at = ? WHERE category = ?', [Date.now(), category])
      saveDatabase()
      return { success: true }
    } catch (error) {
      log.error('[DB] syncCategoryToCloud error:', error)
      return { success: false, error: error.message }
    }
  })

  // 将 kb_guid=null/空 的离线文件夹迁移到当前账号（登录时调用）
  ipcMain.handle('db:migrateOfflineCategories', async (event, currentKbGuid) => {
    try {
      if (!currentKbGuid) {
        log.warn('[DB] migrateOfflineCategories: currentKbGuid is required')
        return 0
      }
      const result = await db.run(
        "UPDATE local_categories SET kb_guid = ?, updated_at = ? WHERE kb_guid IS NULL OR kb_guid = ''",
        [currentKbGuid, Date.now()]
      )
      saveDatabase()
      log.info(`[DB] Migrated ${result?.changes || 0} offline categories to kbGuid=${currentKbGuid}`)
      return result?.changes || 0
    } catch (error) {
      log.error('[DB] migrateOfflineCategories error:', error)
      return 0
    }
  })

  // 确保离线根目录存在（初始化时调用）
  ipcMain.handle('db:ensureOfflineRoot', async () => {
    try {
      const rootCat = DEFAULT_ROOT_CATEGORY
      const existing = execOne('SELECT * FROM local_categories WHERE category = ?', [rootCat])
      if (existing) return existing

      await db.run(
        `INSERT INTO local_categories (category, parent, kb_guid, local_only, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [rootCat, '/', '', 1, Date.now(), Date.now()]
      )
      saveDatabase()
      return execOne('SELECT * FROM local_categories WHERE category = ?', [rootCat])
    } catch (error) {
      log.error('[DB] ensureOfflineRoot error:', error)
      return null
    }
  })

  ipcMain.handle('db:getAppState', async (event, key) => {
    try {
      if (!key) return null
      const row = execOne('SELECT value FROM app_state WHERE key = ?', [key])
      if (!row) return null
      try {
        return JSON.parse(row.value)
      } catch (parseError) {
        return row.value
      }
    } catch (error) {
      log.error('[DB] getAppState error:', error)
      return null
    }
  })

  ipcMain.handle('db:getAiModelConfigs', async () => {
    try {
      const rows = execToObjects('SELECT * FROM ai_model_configs ORDER BY is_default DESC, updated_at DESC, id DESC')
      return rows.map(row => normalizeAiModelConfigRow(row))
    } catch (error) {
      log.error('[DB] getAiModelConfigs error:', error)
      return []
    }
  })

  ipcMain.handle('db:getAiModelConfig', async (event, id) => {
    try {
      if (!id) return null
      const row = execOne('SELECT * FROM ai_model_configs WHERE id = ?', [id])
      return normalizeAiModelConfigRow(row, { includeApiKey: true })
    } catch (error) {
      log.error('[DB] getAiModelConfig error:', error)
      return null
    }
  })

  ipcMain.handle('db:saveAiModelConfig', async (event, payload = {}) => {
    try {
      const now = Date.now()
      const id = payload.id ? Number(payload.id) : null
      const name = String(payload.name || '').trim()
      const providerType = String(payload.provider_type || AI_MODEL_PROVIDER_OPENAI_COMPATIBLE).trim() || AI_MODEL_PROVIDER_OPENAI_COMPATIBLE
      const baseUrl = String(payload.base_url || '').trim()
      const model = String(payload.model || '').trim()
      const headersJson = typeof payload.headers_json === 'string' ? payload.headers_json : JSON.stringify(payload.headers_json || {})
      const extraConfigJson = typeof payload.extra_config_json === 'string' ? payload.extra_config_json : JSON.stringify(payload.extra_config_json || {})
      const enabled = payload.enabled === false ? 0 : 1
      const isDefault = payload.is_default ? 1 : 0
      const clearApiKey = Boolean(payload.clear_api_key)
      const clearVirtualKey = Boolean(payload.clear_virtual_key)
      const incomingApiKey = typeof payload.api_key === 'string' ? payload.api_key.trim() : ''
      const incomingVirtualKey = typeof payload.virtual_key === 'string' ? payload.virtual_key.trim() : ''

      if (!name || !baseUrl || !model) {
        return { success: false, code: 'AI_MODEL_REQUIRED_FIELDS' }
      }

      const existing = id ? execOne('SELECT * FROM ai_model_configs WHERE id = ?', [id]) : null
      if (id && !existing) {
        return { success: false, code: 'AI_MODEL_NOT_FOUND' }
      }

      const duplicateNameRow = execOne(
        'SELECT id FROM ai_model_configs WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND (? IS NULL OR id != ?)',
        [name, id, id]
      )
      if (duplicateNameRow) {
        return { success: false, code: 'AI_MODEL_DUPLICATE_NAME' }
      }

      let encryptedApiKey = existing?.api_key_encrypted || ''
      if (clearApiKey) {
        encryptedApiKey = ''
      } else if (incomingApiKey) {
        encryptedApiKey = encryptAiConfigApiKey(incomingApiKey)
      }

      let encryptedVirtualKey = existing?.virtual_key_encrypted || ''
      if (clearVirtualKey) {
        encryptedVirtualKey = ''
      } else if (incomingVirtualKey) {
        encryptedVirtualKey = encryptAiConfigApiKey(incomingVirtualKey)
      }

      const requiresVirtualKey = providerType === AI_MODEL_PROVIDER_PORTKEY
      const hasRequiredSecret = requiresVirtualKey
        ? encryptedApiKey && encryptedVirtualKey
        : encryptedApiKey

      if (!existing && !hasRequiredSecret) {
        return { success: false, code: 'AI_MODEL_SECRET_REQUIRED' }
      }

      if (isDefault) {
        if (id) {
          await db.run('UPDATE ai_model_configs SET is_default = 0, updated_at = ? WHERE id != ?', [now, id])
        } else {
          await db.run('UPDATE ai_model_configs SET is_default = 0, updated_at = ?', [now])
        }
      }

      if (existing) {
        await db.run(
          `UPDATE ai_model_configs
           SET name = ?, provider_type = ?, base_url = ?, api_key_encrypted = ?, virtual_key_encrypted = ?, model = ?, is_default = ?, enabled = ?, headers_json = ?, extra_config_json = ?, updated_at = ?
           WHERE id = ?`,
          [name, providerType, baseUrl, encryptedApiKey, encryptedVirtualKey, model, isDefault, enabled, headersJson, extraConfigJson, now, id]
        )
        saveDatabase()
        return { success: true, data: normalizeAiModelConfigRow(execOne('SELECT * FROM ai_model_configs WHERE id = ?', [id]), { includeApiKey: true }) }
      }

      await db.run(
        `INSERT INTO ai_model_configs (name, provider_type, base_url, api_key_encrypted, virtual_key_encrypted, model, is_default, enabled, headers_json, extra_config_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, providerType, baseUrl, encryptedApiKey, encryptedVirtualKey, model, isDefault, enabled, headersJson, extraConfigJson, now, now]
      )
      saveDatabase()
      return { success: true, data: normalizeAiModelConfigRow(execOne('SELECT * FROM ai_model_configs WHERE id = ?', [getLastInsertRowid()]), { includeApiKey: true }) }
    } catch (error) {
      log.error('[DB] saveAiModelConfig error:', error)
      if (/UNIQUE constraint failed:\s*ai_model_configs\.name/i.test(String(error && error.message ? error.message : error))) {
        return { success: false, code: 'AI_MODEL_DUPLICATE_NAME' }
      }
      return {
        success: false,
        code: 'AI_MODEL_SAVE_FAILED',
        message: error && error.message ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('db:deleteAiModelConfig', async (event, id) => {
    try {
      if (!id) return false
      await db.run('DELETE FROM ai_model_configs WHERE id = ?', [id])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] deleteAiModelConfig error:', error)
      return false
    }
  })

  ipcMain.handle('db:setDefaultAiModelConfig', async (event, id) => {
    try {
      if (!id) return false
      const now = Date.now()
      await db.run('UPDATE ai_model_configs SET is_default = 0, updated_at = ?', [now])
      await db.run('UPDATE ai_model_configs SET is_default = 1, updated_at = ? WHERE id = ?', [now, id])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] setDefaultAiModelConfig error:', error)
      return false
    }
  })

  // ==================== AI 技能管理 ====================
  // 用户可见的列表：排除 builtin=1 的记录，内置仅供开发侧调试
  ipcMain.handle('db:getAiSkills', async () => {
    try {
      const rows = execToObjects(
        'SELECT * FROM ai_skills WHERE builtin = 0 ORDER BY sort_order ASC, updated_at DESC, id DESC'
      )
      return rows.map(row => normalizeAiSkillRow(row))
    } catch (error) {
      log.error('[DB] getAiSkills error:', error)
      return []
    }
  })

  // 开发调试：列出所有 AI 技能（含内置），与内置回响一致
  ipcMain.handle('db:getAllAiSkills', async () => {
    try {
      const rows = execToObjects(
        'SELECT * FROM ai_skills ORDER BY builtin DESC, sort_order ASC, updated_at DESC, id DESC'
      )
      return rows.map(row => normalizeAiSkillRow(row))
    } catch (error) {
      log.error('[DB] getAllAiSkills error:', error)
      return []
    }
  })

  ipcMain.handle('db:getAiSkill', async (event, id) => {
    try {
      if (!id) return null
      const row = execOne('SELECT * FROM ai_skills WHERE id = ?', [id])
      return normalizeAiSkillRow(row)
    } catch (error) {
      log.error('[DB] getAiSkill error:', error)
      return null
    }
  })

  // 仅保存 / 创建 / 更新自定义技能（builtin=0）；内置技能在设置弹框不可编辑
  ipcMain.handle('db:saveAiSkill', async (event, payload = {}) => {
    try {
      const now = Date.now()
      const id = payload.id ? Number(payload.id) : null
      const name = String(payload.name || '').trim()
      const title = String(payload.title || '').trim()
      const content = String(payload.content || '')
      const enabled = payload.enabled === false ? 0 : 1
      const sortOrder = Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 0

      if (!name || !title || !content.trim()) {
        return { success: false, code: 'AI_SKILL_REQUIRED_FIELDS' }
      }

      const existing = id ? execOne('SELECT * FROM ai_skills WHERE id = ?', [id]) : null
      if (id && !existing) {
        return { success: false, code: 'AI_SKILL_NOT_FOUND' }
      }
      if (existing && Number(existing.builtin) === 1) {
        // 防御性保护：内置技能不允许通过渲染层编辑
        return { success: false, code: 'AI_SKILL_BUILTIN_READONLY' }
      }

      const duplicateNameRow = execOne(
        'SELECT id FROM ai_skills WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND (? IS NULL OR id != ?)',
        [name, id, id]
      )
      if (duplicateNameRow) {
        return { success: false, code: 'AI_SKILL_DUPLICATE_NAME' }
      }

      if (existing) {
        await db.run(
          `UPDATE ai_skills SET name = ?, title = ?, content = ?, enabled = ?, sort_order = ?, updated_at = ?
           WHERE id = ?`,
          [name, title, content, enabled, sortOrder, now, id]
        )
        saveDatabase()
        return { success: true, data: normalizeAiSkillRow(execOne('SELECT * FROM ai_skills WHERE id = ?', [id])) }
      }

      await db.run(
        `INSERT INTO ai_skills (name, title, content, builtin, enabled, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
        [name, title, content, enabled, sortOrder, now, now]
      )
      saveDatabase()
      return { success: true, data: normalizeAiSkillRow(execOne('SELECT * FROM ai_skills WHERE id = ?', [getLastInsertRowid()])) }
    } catch (error) {
      log.error('[DB] saveAiSkill error:', error)
      if (/UNIQUE constraint failed:\s*ai_skills\.name/i.test(String(error && error.message ? error.message : error))) {
        return { success: false, code: 'AI_SKILL_DUPLICATE_NAME' }
      }
      return {
        success: false,
        code: 'AI_SKILL_SAVE_FAILED',
        message: error && error.message ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('db:deleteAiSkill', async (event, id) => {
    try {
      if (!id) return false
      const existing = execOne('SELECT builtin FROM ai_skills WHERE id = ?', [id])
      if (!existing) return false
      if (Number(existing.builtin) === 1) {
        // 内置技能不通过渲染层删除
        return false
      }
      await db.run('DELETE FROM ai_skills WHERE id = ?', [id])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] deleteAiSkill error:', error)
      return false
    }
  })

  ipcMain.handle('db:testAiModelConfig', async (event, id) => {
    try {
      if (!id) {
        return { success: false, code: 'AI_MODEL_NOT_FOUND' }
      }

      const row = execOne('SELECT * FROM ai_model_configs WHERE id = ?', [id])
      const modelConfig = normalizeAiModelConfigRow(row, { includeApiKey: true })
      if (!modelConfig) {
        return { success: false, code: 'AI_MODEL_NOT_FOUND' }
      }

      const missingFields = getAiModelMissingFields(modelConfig)
      if (missingFields.length > 0) {
        return { success: false, code: 'AI_MODEL_INCOMPLETE', missingFields }
      }

      if (modelConfig.provider_type === AI_MODEL_PROVIDER_PORTKEY) {
        await testPortkeyModelConfig(modelConfig)
      } else if (modelConfig.provider_type === AI_MODEL_PROVIDER_OPENAI_COMPATIBLE) {
        await testOpenAiCompatibleModelConfig(modelConfig)
      } else {
        return { success: false, code: 'AI_MODEL_UNSUPPORTED_PROVIDER' }
      }

      return { success: true }
    } catch (error) {
      log.error('[DB] testAiModelConfig error:', error)
      return {
        success: false,
        code: 'AI_MODEL_TEST_FAILED',
        message: normalizeAiModelTestError(error)
      }
    }
  })

  ipcMain.handle('db:setAppState', async (event, { key, value }) => {
    try {
      if (!key) return false
      const now = Date.now()
      const serialized = JSON.stringify(value)
      await db.run(
        `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, serialized, now]
      )
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] setAppState error:', error)
      return false
    }
  })

  ipcMain.handle('db:getAppStates', async (event, keys = []) => {
    try {
      if (!Array.isArray(keys) || keys.length === 0) return {}
      const placeholders = keys.map(() => '?').join(', ')
      const rows = execToObjects(`SELECT key, value FROM app_state WHERE key IN (${placeholders})`, keys)
      const result = {}
      for (const row of rows) {
        try {
          result[row.key] = JSON.parse(row.value)
        } catch (parseError) {
          result[row.key] = row.value
        }
      }
      return result
    } catch (error) {
      log.error('[DB] getAppStates error:', error)
      return {}
    }
  })

  ipcMain.handle('db:removeAppState', async (event, key) => {
    try {
      if (!key) return false
      await db.run('DELETE FROM app_state WHERE key = ?', [key])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] removeAppState error:', error)
      return false
    }
  })

  // 记录待同步的删除日志
  ipcMain.handle('db:logPendingDelete', async (event, { noteId, docGuid = null, kbGuid = null }) => {
    try {
      await db.run(`INSERT INTO sync_log (note_id, action, direction, doc_guid, kb_guid, timestamp, synced) VALUES (?, 'delete', 'local_to_server', ?, ?, ?, 0)`,
        [noteId, docGuid, kbGuid, Date.now()])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] logPendingDelete error:', error)
      return false
    }
  })

  ipcMain.handle('db:getPendingDeleteLogs', async () => {
    try {
      return execToObjects(`
        SELECT id, note_id, doc_guid, kb_guid, timestamp
        FROM sync_log
        WHERE action = 'delete'
          AND direction = 'local_to_server'
          AND synced = 0
        ORDER BY timestamp ASC
      `)
    } catch (error) {
      log.error('[DB] getPendingDeleteLogs error:', error)
      return []
    }
  })

  ipcMain.handle('db:markSyncLogSynced', async (event, { id }) => {
    try {
      await db.run('UPDATE sync_log SET synced = 1 WHERE id = ?', [id])
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] markSyncLogSynced error:', error)
      return false
    }
  })

  ipcMain.handle('db:cleanupSyncedDeleteLogs', async () => {
    try {
      await db.run(`
        DELETE FROM sync_log
        WHERE action = 'delete'
          AND direction = 'local_to_server'
          AND synced = 1
      `)
      saveDatabase()
      return true
    } catch (error) {
      log.error('[DB] cleanupSyncedDeleteLogs error:', error)
      return false
    }
  })

  // 获取待同步的笔记（纯 dirty 架构：只查 dirty=1）
  ipcMain.handle('db:getPendingSyncNotes', async () => {
    try {
      return execToObjects(`
        SELECT * FROM notes
        WHERE dirty = 1
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
        SELECT id, doc_guid, kb_guid, title, category, dirty
        FROM notes
        WHERE title = ?
          AND (
            (category = ? OR category IS NULL)
            OR (category = '/My Notes/' AND ? = '/')
            OR (category = '/我的笔记/' AND ? = '/')
          )
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
        SELECT id, doc_guid, kb_guid, title, category,
               local_modified, server_modified
        FROM notes
        WHERE doc_guid IS NOT NULL
          AND doc_guid NOT LIKE 'local_%'
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

      // 步骤 1：查找所有 doc_guid 仍为临时格式的笔记
      const tempNotes = execToObjects(`
        SELECT id, doc_guid, kb_guid, title
        FROM notes
        WHERE (doc_guid LIKE 'local_%' OR doc_guid IS NULL)
          AND kb_guid IS NOT NULL
      `)

      console.log(`[DB] Found ${tempNotes.length} notes with temporary doc_guid`)

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

      // 步骤 2：清理无效数据（doc_guid 存在但 kb_guid 为 NULL）
      const invalidNotes = execToObjects(`
        SELECT id, doc_guid, kb_guid
        FROM notes
        WHERE doc_guid IS NOT NULL
          AND doc_guid NOT LIKE 'local_%'
          AND (kb_guid IS NULL OR kb_guid = '')
      `)

      if (invalidNotes.length > 0) {
        console.warn(`[DB] Found ${invalidNotes.length} notes with missing kb_guid, marking as dirty`)
        for (const note of invalidNotes) {
          await db.run(`
            UPDATE notes SET dirty = 1, updated_at = ? WHERE id = ?
          `, [Date.now(), note.id])
        }
      }

      saveDatabase()

      const result = {
        normalized: updatedCount,
        markedDirty: invalidNotes.length,
        totalProcessed: tempNotes.length + invalidNotes.length
      }

      console.log('[DB] GUID normalization completed:', result)
      return result

    } catch (error) {
      log.error('[DB] normalizeNoteGuids error:', error)
      return { error: error.message, normalized: 0, markedDirty: 0 }
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
          AND title IS NOT NULL
          AND title != ''
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

  // 重置数据库（清空所有本地笔记和文件夹，重置同步状态）
  ipcMain.handle('db:resetDatabase', async () => {
    try {
      await db.run('DELETE FROM notes')
      await db.run('DELETE FROM guid_mapping')
      await db.run('DELETE FROM sync_log')
      await db.run('DELETE FROM local_categories')
      // 重建离线根目录
      await db.run(
        `INSERT INTO local_categories (category, parent, kb_guid, local_only, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [DEFAULT_ROOT_CATEGORY, '/', '', 1, Date.now(), Date.now()]
      )
      saveDatabase()
      log.info('[DB] Database reset successfully')
      return true
    } catch (error) {
      log.error('[DB] resetDatabase error:', error)
      return false
    }
  })

  // 按 kb_guid 删除所有笔记（用于 logout 时清理旧账号数据，防止多租户污染）
  ipcMain.handle('db:deleteNotesByKbGuid', async (event, kbGuid) => {
    try {
      if (!kbGuid) {
        log.warn('[DB] deleteNotesByKbGuid: kbGuid is required')
        return 0
      }
      const result = await db.run('DELETE FROM notes WHERE kb_guid = ?', [kbGuid])
      await db.run('DELETE FROM guid_mapping WHERE local_id IN (SELECT id FROM notes WHERE kb_guid = ?)', [kbGuid])
      saveDatabase()
      log.info(`[DB] Deleted all notes for kbGuid=${kbGuid}`)
      return result?.changes || 0
    } catch (error) {
      log.error('[DB] deleteNotesByKbGuid error:', error)
      return 0
    }
  })

  // 清空指定 kbGuid 的笔记的 kb_guid 和 dirty 标记（用于退出登录时不删除本地笔记，仅断开关联）
  // 会更新该 kbGuid 下所有笔记：kb_guid=NULL, dirty=1（本地修改待重新同步）
  ipcMain.handle('db:clearNotesByKbGuid', async (event, kbGuid) => {
    try {
      if (!kbGuid) {
        log.warn('[DB] clearNotesByKbGuid: kbGuid is required')
        return 0
      }
      const now = Date.now()
      const result = await db.run(
        'UPDATE notes SET kb_guid = NULL, dirty = 1, local_modified = ?, updated_at = ? WHERE kb_guid = ?',
        [now, now, kbGuid]
      )
      saveDatabase()
      log.info(`[DB] Cleared kb_guid for ${result?.changes || 0} notes (kbGuid=${kbGuid}), marked as dirty`)
      return result?.changes || 0
    } catch (error) {
      log.error('[DB] clearNotesByKbGuid error:', error)
      return 0
    }
  })

  // 获取指定账号的待同步笔记（仅返回当前 kbGuid 的 dirty=1 笔记，防止跨账号数据污染）
  ipcMain.handle('db:getPendingSyncNotesByKbGuid', async (event, kbGuid) => {
    try {
      if (!kbGuid) {
        log.warn('[DB] getPendingSyncNotesByKbGuid: kbGuid is required')
        return []
      }
      return execToObjects(`
        SELECT * FROM notes
        WHERE dirty = 1 AND kb_guid = ?
        ORDER BY local_modified ASC
      `, [kbGuid])
    } catch (error) {
      log.error('[DB] getPendingSyncNotesByKbGuid error:', error)
      return []
    }
  })

  // 将所有 kb_guid=null 的离线笔记迁移到当前账号
  // 用于：用户离线创建笔记后登录，已创建的笔记应该关联到当前账号并同步
  ipcMain.handle('db:migrateOfflineNotes', async (event, currentKbGuid) => {
    try {
      if (!currentKbGuid) {
        log.warn('[DB] migrateOfflineNotes: currentKbGuid is required')
        return 0
      }
      const result = await db.run(
        "UPDATE notes SET kb_guid = ?, dirty = 1 WHERE kb_guid IS NULL OR kb_guid = ''",
        [currentKbGuid]
      )
      saveDatabase()
      log.info(`[DB] Migrated ${result?.changes || 0} offline notes to kbGuid=${currentKbGuid}`)
      return result?.changes || 0
    } catch (error) {
      log.error('[DB] migrateOfflineNotes error:', error)
      return 0
    }
  })

  // 获取所有符文
  ipcMain.handle('db:getRunes', async () => {
    try {
      return execToObjects('SELECT * FROM runes ORDER BY COALESCE(sort_order, 0) ASC, created_at ASC')
    } catch (error) {
      log.error('[DB] getRunes error:', error)
      return []
    }
  })

  // 创建或更新符文
  ipcMain.handle('db:saveRune', async (event, rune) => {
    try {
      if (!rune || !rune.id) {
        return { success: false, code: 'RUNE_INVALID', message: 'rune.id is required' }
      }
      const name = typeof rune.name === 'string' ? rune.name.trim() : ''
      if (!name) {
        return { success: false, code: 'RUNE_NAME_REQUIRED', message: 'rune.name is required' }
      }

      // 同名校验:不区分大小写、去首尾空白,且允许 id 自身(更新时)
      const dup = execOne(
        'SELECT id FROM runes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?',
        [name, rune.id]
      )
      if (dup) {
        return { success: false, code: 'RUNE_DUPLICATE_NAME' }
      }

      const now = Date.now()
      const existing = execOne('SELECT id FROM runes WHERE id = ?', [rune.id])
      const template = rune.template || (existing ? '' : createDefaultRuneTemplate())
      const category = typeof rune.category === 'string' && rune.category.trim() ? rune.category.trim() : 'general'
      const sortOrder = Number.isFinite(Number(rune.sort_order)) ? Number(rune.sort_order) : 0
      if (existing) {
        await db.run(`UPDATE runes SET name = ?, "desc" = ?, power = ?, color = ?, icon = ?, template = ?, category = ?, sort_order = ?, updated_at = ? WHERE id = ?`, [
          name, rune.desc || '', rune.power || 50, rune.color || '#7E57C2', rune.icon || 'auto_awesome', template, category, sortOrder, now, rune.id
        ])
      } else {
        await db.run(`INSERT INTO runes (id, name, "desc", power, color, icon, template, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [rune.id, name, rune.desc || '', rune.power || 50, rune.color || '#7E57C2', rune.icon || 'auto_awesome', template, category, sortOrder, now, now])
      }
      saveDatabase()
      return { success: true, data: execOne('SELECT * FROM runes WHERE id = ?', [rune.id]) }
    } catch (error) {
      log.error('[DB] saveRune error:', error)
      if (/UNIQUE constraint failed:\s*index\s*"?idx_runes_name_unique"?/i.test(String(error && error.message ? error.message : error))
        || /UNIQUE constraint failed:\s*runes\.name/i.test(String(error && error.message ? error.message : error))) {
        return { success: false, code: 'RUNE_DUPLICATE_NAME' }
      }
      return {
        success: false,
        code: 'RUNE_SAVE_FAILED',
        message: error && error.message ? error.message : String(error)
      }
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
      const list = Array.isArray(runes) ? runes : []
      // 批量前先做一次集合内的同名检测，避免依赖数据库 UNIQUE 中断
      const seen = new Map()
      for (const item of list) {
        if (!item || !item.id) continue
        const key = String(item.name || '').trim().toLowerCase()
        if (!key) continue
        if (seen.has(key) && seen.get(key) !== item.id) {
          return { success: false, code: 'RUNE_DUPLICATE_NAME' }
        }
        seen.set(key, item.id)
      }
      const now = Date.now()
      for (const rune of list) {
        const category = typeof rune.category === 'string' && rune.category.trim() ? rune.category.trim() : 'general'
        const sortOrder = Number.isFinite(Number(rune.sort_order)) ? Number(rune.sort_order) : 0
        await db.run(`INSERT OR REPLACE INTO runes (id, name, "desc", power, color, icon, template, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [rune.id, rune.name, rune.desc || '', rune.power || 50, rune.color || '#7E57C2', rune.icon || 'auto_awesome', rune.template || '', category, sortOrder, rune.created_at || now, now])
      }
      saveDatabase()
      return { success: true }
    } catch (error) {
      log.error('[DB] saveRunes error:', error)
      if (/UNIQUE constraint failed:\s*index\s*"?idx_runes_name_unique"?/i.test(String(error && error.message ? error.message : error))
        || /UNIQUE constraint failed:\s*runes\.name/i.test(String(error && error.message ? error.message : error))) {
        return { success: false, code: 'RUNE_DUPLICATE_NAME' }
      }
      return {
        success: false,
        code: 'RUNE_SAVE_FAILED',
        message: error && error.message ? error.message : String(error)
      }
    }
  })

  // === rune 预设模板（独立 rune_templates 表）===
  // 与 runes（用户实际保存的符文卡片）解耦：rune_templates 只承担"下拉选项 / 远端导入"。
  // 复用 initSchema 阶段创建的 runeTemplateService，避免重复闭包。
  if (!runeTemplateService) {
    runeTemplateService = createRuneTemplateService({ db, execToObjects, execOne, saveDatabase, log })
    runeTemplateService.ensureSchema()
  }

  ipcMain.handle('db:getRuneTemplates', async () => {
    try {
      return runeTemplateService.listAll()
    } catch (error) {
      log.error('[DB] getRuneTemplates error:', error)
      return []
    }
  })

  ipcMain.handle('db:saveRuneTemplate', async (event, row) => {
    return runeTemplateService.saveOne(row || {})
  })

  ipcMain.handle('db:saveRuneTemplates', async (event, rows) => {
    return runeTemplateService.saveMany(rows || [])
  })

  ipcMain.handle('db:deleteRuneTemplate', async (event, id) => {
    return runeTemplateService.remove(id)
  })

  ipcMain.handle('rune-template:fetchRemote', async (event, payload) => {
    return await runeTemplateService.importFromRemote(payload || {})
  })

  // 获取所有回响
  ipcMain.handle('db:getEchoes', async () => {
    try {
      return execToObjects('SELECT * FROM echoes ORDER BY COALESCE(sort_order, 0) ASC, created_at ASC')
    } catch (error) {
      log.error('[DB] getEchoes error:', error)
      return []
    }
  })

  // 创建或更新回响
  ipcMain.handle('db:saveEcho', async (event, echo) => {
    try {
      if (!echo || !echo.id) {
        return { success: false, code: 'ECHO_INVALID', message: 'echo.id is required' }
      }
      const name = typeof echo.name === 'string' ? echo.name.trim() : ''
      if (!name) {
        return { success: false, code: 'ECHO_NAME_REQUIRED', message: 'echo.name is required' }
      }

      // 内置回响 id 以 __builtin_ 开头，强制归类到 builtin；其它回响默认 marker
      const isBuiltin = typeof echo.id === 'string' && echo.id.startsWith('__builtin_')

      // 同名校验：不区分大小写、去首尾空白，且允许 id 自身（更新时）
      const dup = execOne(
        'SELECT id FROM echoes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?',
        [name, echo.id]
      )
      if (dup) {
        return { success: false, code: 'ECHO_DUPLICATE_NAME' }
      }

      const now = Date.now()
      const existing = execOne('SELECT id, created_at FROM echoes WHERE id = ?', [echo.id])
      const annoSource = echo.anno_source || echo.template || createDefaultEchoAnnoSource(name)
      const renderType = echo.render_type || 'anno'
      const category = isBuiltin
        ? 'builtin'
        : (typeof echo.category === 'string' && echo.category.trim() ? echo.category.trim() : 'marker')
      const sortOrder = Number.isFinite(Number(echo.sort_order)) ? Number(echo.sort_order) : 0
      if (existing) {
        await db.run(`UPDATE echoes SET name = ?, "desc" = ?, color = ?, icon = ?, anno_source = ?, render_type = ?, category = ?, sort_order = ?, updated_at = ? WHERE id = ?`, [
          name, echo.desc || '', echo.color || '#26A69A', echo.icon || 'graphic_eq', annoSource, renderType, category, sortOrder, now, echo.id
        ])
      } else {
        await db.run(`INSERT INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [echo.id, name, echo.desc || '', echo.color || '#26A69A', echo.icon || 'graphic_eq', annoSource, renderType, category, sortOrder, existing?.created_at || now, now])
      }
      saveDatabase()
      return { success: true, data: execOne('SELECT * FROM echoes WHERE id = ?', [echo.id]) }
    } catch (error) {
      log.error('[DB] saveEcho error:', error)
      if (/UNIQUE constraint failed:\s*index\s*"?idx_echoes_name_unique"?/i.test(String(error && error.message ? error.message : error))
        || /UNIQUE constraint failed:\s*echoes\.name/i.test(String(error && error.message ? error.message : error))) {
        return { success: false, code: 'ECHO_DUPLICATE_NAME' }
      }
      return {
        success: false,
        code: 'ECHO_SAVE_FAILED',
        message: error && error.message ? error.message : String(error)
      }
    }
  })

  // 删除回响
  ipcMain.handle('db:deleteEcho', async (event, id) => {
    try {
      // 内置回响（id 以 __builtin_ 开头）不可删除：它们由 BUILTIN_ECHO_CARDS 权威定义，
      // 若误删，下次启动 sync seed 会重新插入（保证状态可恢复），但仍拒绝显式删除操作。
      if (typeof id === 'string' && id.startsWith('__builtin_')) {
        log.warn(`[DB] deleteEcho blocked: builtin echo ${id} cannot be removed`)
        return { success: false, code: 'ECHO_BUILTIN_DELETE_FORBIDDEN', message: '内置回响不可删除' }
      }
      await db.run('DELETE FROM echoes WHERE id = ?', [id])
      saveDatabase()
      return { success: true }
    } catch (error) {
      log.error('[DB] deleteEcho error:', error)
      return { success: false, code: 'ECHO_DELETE_FAILED', message: error && error.message ? error.message : String(error) }
    }
  })

  // 批量保存回响（用于排序更新）
  ipcMain.handle('db:saveEchoes', async (event, echoes) => {
    try {
      const list = Array.isArray(echoes) ? echoes : []
      // 批量前先做一次集合内的同名检测
      const seen = new Map()
      for (const item of list) {
        if (!item || !item.id) continue
        const key = String(item.name || '').trim().toLowerCase()
        if (!key) continue
        if (seen.has(key) && seen.get(key) !== item.id) {
          return { success: false, code: 'ECHO_DUPLICATE_NAME' }
        }
        seen.set(key, item.id)
      }
      const now = Date.now()
      for (const echo of list) {
        const annoSource = echo.anno_source || echo.template || createDefaultEchoAnnoSource(echo.name)
        const isBuiltin = typeof echo.id === 'string' && echo.id.startsWith('__builtin_')
        const category = isBuiltin
          ? 'builtin'
          : (typeof echo.category === 'string' && echo.category.trim() ? echo.category.trim() : 'marker')
        const sortOrder = Number.isFinite(Number(echo.sort_order)) ? Number(echo.sort_order) : 0
        await db.run(`INSERT OR REPLACE INTO echoes (id, name, "desc", color, icon, anno_source, render_type, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [echo.id, echo.name, echo.desc || '', echo.color || '#26A69A', echo.icon || 'graphic_eq', annoSource, echo.render_type || 'anno', category, sortOrder, echo.created_at || now, now])
      }
      saveDatabase()
      return { success: true }
    } catch (error) {
      log.error('[DB] saveEchoes error:', error)
      if (/UNIQUE constraint failed:\s*index\s*"?idx_echoes_name_unique"?/i.test(String(error && error.message ? error.message : error))
        || /UNIQUE constraint failed:\s*echoes\.name/i.test(String(error && error.message ? error.message : error))) {
        return { success: false, code: 'ECHO_DUPLICATE_NAME' }
      }
      return {
        success: false,
        code: 'ECHO_SAVE_FAILED',
        message: error && error.message ? error.message : String(error)
      }
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
    mainWindow.webContents.openDevTools({ mode: 'detach' })
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
