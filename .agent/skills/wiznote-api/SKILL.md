---
name: wiznote-api
description: 为知笔记（WizNote）API集成指南。用于在Memocast中实现为知笔记的数据同步功能，包括：账号登录认证、笔记CRUD操作、文件夹管理、资源上传下载、标签操作、离线优先策略。本skill涵盖REST API调用规范、Token认证机制、错误处理，以及本地数据库与远程API的同步验证。
---

# 为知笔记 API 集成指南

## 核心架构

为知笔记服务分为两个部分：
- **账号服务 (AS)**: `https://as.wiz.cn` - 负责登录、用户信息、获取知识库列表
- **数据服务 (KS)**: `https://xxx.wiz.cn/ks/...` - 负责笔记的CRUD操作

登录返回信息包含：`kbServer`（数据服务器地址）、`kbGuid`（知识库GUID）、`token`（认证令牌）

## API 调用规范

### 认证 Token

除少数公开接口外，所有API都需要通过HTTP Header传递Token：
```
X-Wiz-Token: <token>
```

### 请求/响应格式

**请求封装示例：**

```javascript
async function execRequest(method, url, body, token) {
  const options = { url, method, data: body };
  if (token) {
    options.headers = { 'X-Wiz-Token': token };
  }
  const res = await axios(options);
  const data = res.data;
  if (data.returnCode !== 200) {
    const err = new Error(data.returnMessage);
    err.code = data.returnCode;
    err.externCode = data.externCode;
    throw err;
  }
  return data.result;
}
```

**响应格式：**
```json
{
  "returnCode": 200,
  "returnMessage": "OK",
  "externCode": "",
  "result": {}
}
```

### 常见错误码

| returnCode | 说明 |
|------------|------|
| 200 | 成功 |
| 301 | Token无效或缺失 |
| 31002 | 密码错误 |
| 2000 | 参数错误 |
| 2001 | 内部错误 |
| 2003 | 数据逻辑错误 |
| 2004 | 数据不存在 |
| 2005 | 权限不足 |

## 主要 API 接口

### 1. 账号服务 (AS)

#### 登录
```
POST /as/user/login
body: { userId, password }
```

#### 获取用户头像
```
GET /as/user/avatar/:userGuid
```

### 2. 知识库服务 (KS)

#### 获取文件夹列表
```
GET /ks/category/all/:kbGuid
```

#### 创建文件夹
```
POST /ks/category/create/:kbGuid
body: { parent, child }
```

#### 获取笔记列表（分页）
```
GET /ks/note/list/category/:kbGuid?category=:folder&start=0&count=50&orderBy=created
```

#### 创建笔记
```
POST /ks/note/create/:kbGuid
body: { kbGuid, title, category, html }
```

#### 保存笔记
```
PUT /ks/note/save/:kbGuid/:docGuid
body: { kbGuid, docGuid, html, url, tags, author, keywords, resources }
```

#### 获取笔记详情
```
GET /ks/note/info/:kbGuid/:docGuid
```

#### 获取笔记HTML
```
GET /ks/note/view/:kbGuid/:docGuid/
```

#### 删除笔记
```
DELETE /ks/note/delete/:kbGuid/:docGuid/
```

#### 上传资源（图片）
```
POST /ks/resource/upload/:kbGuid/:docGuid
Content-Type: multipart/form-data
body: { kbGuid, docGuid, data }
```

#### 获取笔记缩略图
```
GET /ks/note/abstract/:kbGuid/:docGuid
```

#### 获取附件列表
```
GET /ks/note/attachments/:kbGuid/:docGuid
```

#### 下载附件
```
GET /ks/object/download/:kbGuid/:docGuid?objId=:attGuid&objType=attachment
```

#### 按标签获取笔记
```
GET /ks/note/list/tag/:kbGuid?tag=:tagGuid&start=0&count=50
```

## 与本地数据库同步策略

详细API参数和示例见 [references/api.md](references/api.md)

### 同步流程

1. **登录获取Token** - 保存kbServer、kbGuid、token
2. **本地数据库操作** - 优先操作本地sql.js数据库
3. **标记同步状态** - 本地记录待同步的数据
4. **后台同步** - 网络可用时调用API同步
5. **冲突处理** - 记录冲突，等待用户确认或按时间戳合并

### 离线优先策略

- 所有操作先写入本地数据库
- 维护`sync_queue`表记录待同步操作
- 网络恢复后按顺序执行队列中的操作
- 使用乐观锁（version字段）检测冲突

## 验证脚本

使用提供的验证脚本测试API连通性：
```bash
node scripts/verify-api.js --user <email> --password <pwd>
```

详细验证脚本使用说明见 [references/verification.md](references/verification.md)
