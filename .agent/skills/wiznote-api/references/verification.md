# 为知笔记 API 验证指南

## 概述

提供两个层级的API验证方案：
1. **在线验证** - 测试与为知笔记官方服务器的连接
2. **本地验证** - 测试本地数据库与模拟API的交互

---

## 在线验证

### 环境要求

- Node.js 12+
- axios 库

### 安装依赖

```bash
cd .cursor/skills/wiznote-api
yarn add axios form-data
# 或
npm install axios form-data
```

### 基本用法

```bash
# 完整登录测试
node scripts/verify-api.js --user your@email.com --password your_password

# 使用已有的token测试
node scripts/verify-api.js --server https://ks1.wiz.cn --guid <kb-guid> --token <token>
```

### 测试项目

脚本会按顺序执行以下测试：

| 步骤 | 测试内容 | 说明 |
|------|----------|------|
| 1 | 用户登录 | 调用 AS 登录接口获取 token |
| 2 | 获取文件夹 | 调用 KS 获取知识库文件夹列表 |
| 3 | 创建文件夹 | 在根目录创建测试文件夹 |
| 4 | 创建笔记 | 创建一篇HTML格式的测试笔记 |
| 5 | 获取笔记列表 | 分页获取笔记，验证列表功能 |
| 6 | 上传资源 | 上传一个测试图片文件 |
| 7 | 删除笔记 | 清理测试创建的笔记 |

### 输出示例

```
==================================================
  为知笔记 API 验证工具
==================================================

ℹ 测试 1: 用户登录...
✓ 登录成功!
  - KB Server: https://ks1.wiz.cn
  - KB GUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  - Token: a1b2c3d4-e5f6-7890...

ℹ 测试 2: 获取文件夹列表...
✓ 获取成功! 共有 12 个文件夹
  - /
  - /My Notes/
  - /Work/
  ...

==================================================
  测试总结
==================================================

  ✓ 通过 - 登录
  ✓ 通过 - 获取文件夹
  ✓ 通过 - 创建文件夹
  ✓ 通过 - 创建笔记
  ✓ 通过 - 获取笔记列表
  ✓ 通过 - 上传资源
  ✓ 通过 - 删除笔记

✓ 所有测试通过！API正常工作。
```

---

## 本地验证

### 本地数据库结构

在 sql.js 本地数据库中，建议包含以下表结构用于API同步：

```sql
-- 笔记表
CREATE TABLE notes (
  guid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  html_content TEXT,
  created TEXT,
  modified TEXT,
  synced INTEGER DEFAULT 0,      -- 0=未同步, 1=已同步
  synced_at TEXT,
  version INTEGER DEFAULT 1,      -- 乐观锁版本号
  local_only INTEGER DEFAULT 0   -- 是否仅本地存在
);

-- 同步队列
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT,              -- 'note', 'folder', 'resource'
  entity_guid TEXT,
  operation TEXT,                -- 'create', 'update', 'delete'
  payload TEXT,                  -- JSON payload
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'failed'
  retry_count INTEGER DEFAULT 0,
  created_at TEXT,
  processed_at TEXT
);

-- 文件夹表
CREATE TABLE folders (
  path TEXT PRIMARY KEY,
  parent TEXT,
  synced INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1
);

-- 冲突记录
CREATE TABLE sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT,
  entity_guid TEXT,
  local_version TEXT,
  remote_version TEXT,
  local_data TEXT,
  remote_data TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'resolved'
  resolved_at TEXT,
  resolution TEXT               -- 'local', 'remote', 'merged'
);
```

### 本地验证测试

在无网络环境下，可以使用本地数据库进行基础功能验证：

```javascript
// 本地数据库验证示例
async function testLocalSync() {
  const db = await initLocalDatabase();

  // 1. 创建本地笔记
  await db.run(`
    INSERT INTO notes (guid, title, category, html_content, created, modified, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [generateGUID(), '测试笔记', '/Test/', '<p>内容</p>',
      new Date().toISOString(), new Date().toISOString(), 0]);

  // 2. 添加到同步队列
  await db.run(`
    INSERT INTO sync_queue (entity_type, entity_guid, operation, payload, created_at)
    VALUES (?, ?, ?, ?, ?)
  `, ['note', noteGuid, 'create', JSON.stringify(noteData), new Date().toISOString()]);

  // 3. 模拟网络恢复后的同步
  const pending = await db.all(`
    SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at
  `);

  for (const item of pending) {
    try {
      // 调用API
      await syncToRemote(item);
      // 更新状态
      await db.run(`UPDATE sync_queue SET status = 'done' WHERE id = ?`, [item.id]);
    } catch (err) {
      // 记录失败
      await db.run(`UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1 WHERE id = ?`, [item.id]);
    }
  }
}
```

---

## 错误排查

### 常见错误

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 301 | Token无效 | 重新登录获取新token |
| 31002 | 密码错误 | 检查密码是否正确 |
| 2004 | 数据不存在 | 检查GUID是否正确 |
| 2005 | 权限不足 | 检查账号权限 |
| ECONNREFUSED | 网络连接失败 | 检查网络或代理设置 |

### 网络问题排查

```bash
# 测试网络连通性
curl -I https://as.wiz.cn

# 测试登录接口
curl -X POST https://as.wiz.cn/as/user/login \
  -H "Content-Type: application/json" \
  -d '{"userId":"test@email.com","password":"test"}'
```

### 调试模式

启用详细日志输出：

```javascript
// 在 verify-api.js 中添加
axios.interceptors.request.use(request => {
  console.log('请求:', request.method, request.url);
  return request;
});

axios.interceptors.response.use(response => {
  console.log('响应:', response.status, response.data);
  return response;
});
```
