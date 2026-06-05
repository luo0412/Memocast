---
name: sync-design
description: Memocast 离线在线数据同步架构设计指南。用于分析、修改或扩展 Memocast 的同步机制，包括 sql.js 数据库、IPC 通信、离线优先策略、冲突检测与解决、同步日志。
---

# 数据同步设计

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        渲染进程 (Renderer)                       │
├─────────────────────────────────────────────────────────────────┤
│  DatabaseService.js          │  SyncService.js                 │
│  (IPC 封装层)                 │  (核心同步逻辑)                  │
└────────────────────────────────┬────────────────────────────────┘
                                 │ IPC 通信
┌────────────────────────────────▼────────────────────────────────┐
│                        主进程 (Main)                              │
├─────────────────────────────────────────────────────────────────┤
│                     sql.js SQLite Engine                         │
│  notes | guid_mapping | sync_log | conflict_backup | settings    │
└─────────────────────────────────────────────────────────────────┘
```

## 数据库表结构

### notes 表（主笔记表）

```sql
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_guid TEXT,                    -- 云端文档 GUID
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT DEFAULT '',
  category TEXT DEFAULT '/',
  tags TEXT DEFAULT '',
  data_created INTEGER,
  data_modified INTEGER,
  sync_status TEXT DEFAULT 'local_only',  -- 同步状态
  local_modified INTEGER,
  server_modified INTEGER,
  created_at INTEGER,
  updated_at INTEGER
)
```

### guid_mapping 表

```sql
CREATE TABLE IF NOT EXISTS guid_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_id INTEGER NOT NULL,
  server_guid TEXT NOT NULL,
  service TEXT DEFAULT 'wiznote',
  created_at INTEGER,
  UNIQUE(local_id, server_guid)
)
```

### sync_log 表

```sql
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER,
  action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
  direction TEXT NOT NULL CHECK(direction IN ('local_to_server', 'server_to_local')),
  timestamp INTEGER,
  synced INTEGER DEFAULT 0
)
```

### conflict_backup 表

```sql
CREATE TABLE IF NOT EXISTS conflict_backup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL,
  local_content TEXT,
  server_content TEXT,
  local_modified INTEGER,
  server_modified INTEGER,
  created_at INTEGER,
  resolved INTEGER DEFAULT 0
)
```

## 同步状态机

| 状态 | 含义 | 流转 |
|------|------|------|
| `local_only` | 本地新建，待上传 | → synced (上传成功后) |
| `synced` | 已同步 | → pending_upload (本地修改) |
| `pending_upload` | 待上传 | → synced (上传成功后) |
| `pending_download` | 待下载 | → synced (下载成功后) |
| `conflict` | 冲突 | → synced (解决后) |

## 同步策略

### 原则：本地优先

不覆盖本地修改，避免用户数据丢失。

### 拉取策略 (pullFromCloud)

```
1. 获取云端笔记列表 (分页)
2. 遍历检查本地是否已存在
3. 跳过已存在的笔记
4. 检查重复: 同标题+同分类 → 合并
5. 下载新笔记内容，创建本地记录
```

### 上传策略 (pushToCloud)

```
1. 获取 pending_upload/local_only 笔记
2. 离线笔记 (doc_guid 以 local_ 开头):
   - 搜索云端同名+同分类笔记
   - 找到1个 → 更新云端
   - 找到0个或多个 → 创建新笔记
3. 已同步笔记 → 直接更新云端
```

## DatabaseService API

```javascript
class DatabaseService {
  // 笔记 CRUD
  createNote(note = {})           // 创建笔记
  getNoteById(id)                // 按 ID 获取
  getNoteByDocGuid(docGuid)       // 按云端 GUID 获取
  getAllNotes()                   // 获取所有笔记
  updateNote(id, updates)         // 更新笔记
  deleteNote(id)                  // 删除笔记

  // 同步管理
  getPendingSyncNotes()           // 获取待同步笔记
  getConflictNotes()              // 获取冲突笔记
  markAsConflict(id)              // 标记冲突
  logSyncAction(noteId, action, direction)  // 记录同步日志

  // GUID 映射
  getGuidMapping(localId)        // 获取映射
  createGuidMapping(localId, serverGuid, service)

  // 统计
  getStats()                      // 获取同步统计

  // 符文系统
  getRunes(), saveRune(), deleteRune()
}
```

## SyncService 核心方法

```javascript
class SyncService {
  async sync() {
    await this.pullFromCloud()  // 拉取云端变更
    await this.pushToCloud()    // 上传本地变更
    await this.handleConflicts() // 处理冲突
  }

  async pullFromCloud() { /* ... */ }
  async pushToCloud() { /* ... */ }
  async handleConflicts() { /* ... */ }
}
```

## 冲突处理

### 冲突解决方式

| 方式 | 说明 |
|------|------|
| `local` | 用本地版本覆盖云端 |
| `server` | 用云端版本覆盖本地 |
| `merge` | 手动合并内容后上传 |

### 冲突解决流程

```javascript
async resolveConflict(noteId, resolution, mergedContent = null) {
  switch (resolution) {
    case 'local':
      // 上传本地内容
      await api.updateDoc(note.doc_guid, { content: note.content })
      await DatabaseService.updateNote(noteId, { sync_status: 'synced' })
      break

    case 'server':
      // 下载云端内容
      const serverData = await api.getDocs(null, note.doc_guid)
      await DatabaseService.updateNote(noteId, {
        content: serverData.content,
        sync_status: 'synced'
      })
      break

    case 'merge':
      // 合并后上传
      await DatabaseService.updateNote(noteId, {
        content: mergedContent,
        sync_status: 'pending_upload'
      })
      await this.pushToCloud()
      break
  }
}
```

## 离线存储

### 离线笔记标识

本地新建的笔记使用特殊 GUID 前缀：

```javascript
doc_guid: `local_${uuid.v4()}`
// 例如: local_a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Vuex Offline Store

```javascript
state: {
  notes: [],
  currentNote: null,
  tags: [],
  categories: [],
  syncStatus: {
    isSyncing: false,
    lastSyncTime: null,
    total: 0,
    synced: 0,
    pending: 0,
    conflict: 0
  },
  conflictNotes: [],
  isInitialized: false
}
```

## 账户不匹配处理

当笔记被移动到其他账户时，自动降级为本地笔记：

```javascript
if (error.message.includes('kbGuid is not match')) {
  await DatabaseService.updateNote(note.id, {
    doc_guid: null,
    sync_status: 'local_only'
  })
}
```

## 相关文件索引

| 文件 | 用途 |
|------|------|
| `src-electron/main-process/electron-main.js` | 主进程数据库初始化和 IPC handlers |
| `src/services/DatabaseService.js` | 渲染进程数据库服务门面 |
| `src/utils/DatabaseClient.js` | 渲染进程数据库客户端 |
| `src/services/SyncService.js` | 核心同步服务实现 |
| `src/store/offline/index.js` | Vuex 离线状态管理 |
| `src/store/server/actions.js` | 服务端操作 actions |
| `src/components/ui/dialog/ConflictResolveDialog.vue` | 冲突解决对话框 |

## 扩展阅读

详细设计文档见 [reference.md](reference.md)
