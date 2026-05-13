# 数据同步详细设计参考

本文档是 [SKILL.md](SKILL.md) 的详细参考补充。

## IPC 通信接口

### 主进程 IPC Handlers (electron-main.js)

```javascript
// 数据库操作
ipcMain.handle('db:createNote', async (event, note) => { /* ... */ })
ipcMain.handle('db:getNote', async (event, id) => { /* ... */ })
ipcMain.handle('db:getNotes', async (event, options) => { /* ... */ })
ipcMain.handle('db:updateNote', async (event, id, updates) => { /* ... */ })
ipcMain.handle('db:deleteNote', async (event, id) => { /* ... */ })
ipcMain.handle('db:getNoteByDocGuid', async (event, docGuid) => { /* ... */ })
ipcMain.handle('db:getStats', async () => { /* ... */ })

// 同步管理
ipcMain.handle('db:getPendingSyncNotes', async () => { /* ... */ })
ipcMain.handle('db:getConflictNotes', async () => { /* ... */ })
ipcMain.handle('db:markAsConflict', async (event, id) => { /* ... */ })
ipcMain.handle('db:logSyncAction', async (event, noteId, action, direction) => { /* ... */ })

// GUID 映射
ipcMain.handle('db:getGuidMapping', async (event, localId) => { /* ... */ })
ipcMain.handle('db:createGuidMapping', async (event, localId, serverGuid, service) => { /* ... */ })

// 重置
ipcMain.handle('db:resetDatabase', async () => { /* ... */ })
```

### 渲染进程 IPC 调用

```javascript
// src/services/DatabaseService.js
class DatabaseService {
  createNote(note = {}) {
    return ipcRenderer.invoke('db:createNote', note)
  }

  getNoteById(id) {
    return ipcRenderer.invoke('db:getNote', id)
  }

  getNoteByDocGuid(docGuid) {
    return ipcRenderer.invoke('db:getNoteByDocGuid', docGuid)
  }

  updateNote(id, updates) {
    return ipcRenderer.invoke('db:updateNote', id, updates)
  }
  // ...
}
```

## 完整同步流程图

```
用户登录/触发同步
     │
     ▼
┌─────────────────┐
│   sync() 调用   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ Step 1: pullFromCloud() - 拉取云端变更                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ for each 云端笔记 doc:                               │ │
│ │   docGuid = doc.docGuid || doc.guid                 │ │
│ │                                                      │ │
│ │   if 本地存在 docGuid:                               │ │
│ │     continue  // 跳过，避免覆盖本地修改               │ │
│ │                                                      │ │
│ │   if 同标题+同分类本地笔记 exists:                   │ │
│ │     if 本地笔记无 doc_guid:                          │ │
│ │       合并：更新本地笔记关联到云端                    │ │
│ │     continue                                        │ │
│ │                                                      │ │
│ │   创建新本地笔记                                      │ │
│ │   创建 guid_mapping                                 │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ Step 2: pushToCloud() - 上传本地变更                    │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ pendingNotes = getPendingSyncNotes()                │ │
│ │ for each pending note:                              │ │
│ │                                                      │ │
│ │   if doc_guid.startsWith('local_'):                 │ │
│ │     // 离线笔记，需要在云端定位                       │ │
│ │     sameFolderDocs = searchByTitleAndCategory()     │ │
│ │                                                      │ │
│ │     if sameFolderDocs.length === 1:                 │ │
│ │       api.updateDoc(targetGuid, content)            │ │
│ │       updateNote(doc_guid=targetGuid, status=synced)│ │
│ │     else:                                            │ │
│ │       newGuid = api.createDoc(content)              │ │
│ │       updateNote(doc_guid=newGuid, status=synced)  │ │
│ │                                                      │ │
│ │   else if doc_guid:                                 │ │
│ │     // 已同步笔记，直接更新                          │ │
│ │     api.updateDoc(doc_guid, content)               │ │
│ │     updateNote(status=synced)                       │ │
│ │                                                      │ │
│ │   else:                                              │ │
│ │     // 无 doc_guid，创建新笔记                       │ │
│ │     newGuid = api.createDoc(content)                │ │
│ │     updateNote(doc_guid=newGuid, status=synced)    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ Step 3: 检测并处理冲突                                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ conflictNotes = getConflictNotes()                  │ │
│ │ if conflictNotes.length > 0:                        │ │
│ │   显示 ConflictResolveDialog                        │ │
│ │   用户选择解决方式                                   │ │
│ │   调用 resolveConflict()                            │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 冲突备份机制

当检测到冲突时，内容会备份到 `conflict_backup` 表：

```javascript
// 标记冲突时
await db.run(`
  INSERT INTO conflict_backup 
  (note_id, local_content, server_content, local_modified, server_modified, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`, [
  note.id,
  note.content,
  serverData.content,
  note.local_modified,
  serverData.data_modified,
  Date.now()
])

// 更新笔记状态为冲突
await db.run(`
  UPDATE notes 
  SET sync_status = 'conflict'
  WHERE id = ?
`, [note.id])
```

## 同步统计查询

```javascript
// 获取同步统计
const stats = await db.get(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
    SUM(CASE WHEN sync_status IN ('local_only', 'pending_upload') THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN sync_status = 'conflict' THEN 1 ELSE 0 END) as conflict
  FROM notes
`)

// 返回格式
{
  total: 100,
  synced: 80,
  pending: 15,
  conflict: 5
}
```

## 数据库初始化流程

```javascript
// electron-main.js 中
async function initDatabase() {
  const SQL = await initSqlJs({
    locateFile: file => `https://sql.js.org/dist/${file}`
  })
  
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'memocast.db')
  
  let db
  if (fs.existsSync(dbPath)) {
    // 加载已有数据库
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    // 创建新数据库
    db = new SQL.Database()
    initTables(db)
  }
  
  // 定期保存到磁盘
  setInterval(() => {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(dbPath, buffer)
  }, 30000) // 每 30 秒
  
  return db
}

function initTables(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_guid TEXT,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT DEFAULT '',
      category TEXT DEFAULT '/',
      tags TEXT DEFAULT '',
      data_created INTEGER,
      data_modified INTEGER,
      sync_status TEXT DEFAULT 'local_only',
      local_modified INTEGER,
      server_modified INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    )
  `)
  
  db.run(`CREATE UNIQUE INDEX idx_notes_doc_guid ON notes(doc_guid) WHERE doc_guid IS NOT NULL`)
  db.run(`CREATE INDEX idx_notes_category ON notes(category)`)
  db.run(`CREATE INDEX idx_notes_sync_status ON notes(sync_status)`)
  
  // ... 其他表
}
```

## SyncService 监听器模式

SyncService 支持事件监听：

```javascript
const syncService = new SyncService()

// 添加监听器
syncService.addListener({
  type: 'sync:start',
  handler: () => {
    console.log('Sync started')
  }
})

syncService.addListener({
  type: 'sync:complete',
  handler: (stats) => {
    console.log('Sync completed:', stats)
  }
})

syncService.addListener({
  type: 'conflict:detected',
  handler: (noteId) => {
    console.log('Conflict detected for note:', noteId)
  }
})

syncService.addListener({
  type: 'error',
  handler: (error) => {
    console.error('Sync error:', error)
  }
})
```

## 迁移机制详解

### GUID 映射迁移

```javascript
// 场景：离线笔记同步到云端后
async onOfflineNoteSynced(noteId, newServerGuid) {
  // 1. 更新笔记的 doc_guid
  await DatabaseService.updateNote(noteId, {
    doc_guid: newServerGuid,
    sync_status: 'synced'
  })
  
  // 2. 创建 GUID 映射
  await DatabaseService.createGuidMapping(noteId, newServerGuid, 'wiznote')
  
  // 3. 通知 UI 更新
  bus.$emit('note:synced', { noteId, docGuid: newServerGuid })
}

// 场景：拉取云端笔记时
async onCloudNotePulled(doc) {
  // 1. 创建本地笔记
  const noteId = await DatabaseService.createNote({
    doc_guid: doc.guid,
    title: doc.title,
    content: doc.content,
    sync_status: 'synced'
  })
  
  // 2. 创建 GUID 映射
  await DatabaseService.createGuidMapping(noteId, doc.guid, 'wiznote')
}
```

## 数据库重置流程

```javascript
// 用户确认重置
async function resetDatabase() {
  // 1. 删除所有数据
  await db.run('DELETE FROM notes')
  await db.run('DELETE FROM guid_mapping')
  await db.run('DELETE FROM sync_log')
  await db.run('DELETE FROM conflict_backup')
  
  // 2. 保存到磁盘
  saveDatabase()
  
  // 3. 重新初始化
  await this.initOfflineStore()
  
  // 4. 触发全量同步
  await this.sync()
}

// 显示确认对话框
'resetSqliteConfirm': '确定要重置本地数据库吗？所有未同步的本地笔记将被删除！'
```
