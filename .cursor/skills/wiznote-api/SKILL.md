---
name: wiznote-api
description: 为知笔记（WizNote）API集成指南。用于在Memocast中实现为知笔记的数据同步功能，包括：账号登录认证、笔记CRUD操作、文件夹管理、资源上传下载、标签操作、离线优先策略。本skill涵盖REST API调用规范、Token认证机制、错误处理，以及本地数据库与远程API的同步验证。
---

# 为知笔记 API 操作指南

## 快速参考

### API 入口
```javascript
import api from 'src/utils/api'
// api.AccountServerApi - 账户相关（登录、登出）
// api.KnowledgeBaseApi - 笔记操作（CRUD、文件夹、标签）
```

### 认证机制
- Token 存储：`ServerFileStorage.getValueFromLocalStorage('token')`
- kbGuid：知识库唯一标识，登录后从响应获取
- 自定义服务器：需先调用 `api.AccountServerApi.setBaseUrl(url)`

## 账户操作 (AccountServerApi)

### 登录
```javascript
await api.AccountServerApi.Login({ userId, password })
// 返回: { token, kbGuid, kbServer, userGuid, ... }
// 注意: kbServer 会自动设置为 KnowledgeBaseBaseUrl
```

### 登出
```javascript
await api.AccountServerApi.Logout()
```

### Token 续期
```javascript
await api.AccountServerApi.keepTokenAlive()
```

## 笔记操作 (KnowledgeBaseApi)

### 获取笔记列表
```javascript
await api.KnowledgeBaseApi.getCategoryNotes({
  kbGuid,
  data: {
    category: '',        // 空=根目录
    start: 0,
    count: 100,
    withAbstract: true,
    orderBy: 'modified', // or 'created'
    ascending: 'desc'
  }
})
// 返回: [{ guid, title, category, dataCreated, dataModified, ... }]
```

### 获取笔记内容
```javascript
await api.KnowledgeBaseApi.getNoteContent({
  kbGuid,
  docGuid,
  data: { downloadInfo: 1, downloadData: 1 }
})
// 返回: { info: {...}, html: '...', resources: [...] }
```

### 创建笔记（需用 embedMDNote 包装内容）
```javascript
import helper from 'src/utils/helper'

const html = helper.embedMDNote(markdownContent, resources, {
  wrapWithPreTag: false,
  kbGuid,
  docGuid: ''
})

await api.KnowledgeBaseApi.createNote({
  kbGuid,
  data: {
    title: '笔记标题',
    category: '/我的文件夹/',
    owner: userId,
    html,
    type: 'document'  // 或 'lite/markdown'
  }
})
// 返回: { guid: '...', returnCode: 200 }
```

### 更新笔记
```javascript
await api.KnowledgeBaseApi.updateNote({
  kbGuid,
  docGuid,
  data: {
    html: '更新的内容',
    title: '新标题',
    type: 'document'
  }
})
// 注意: 不传 category 避免触发移动/删除文件夹逻辑
```

### 删除笔记
```javascript
await api.KnowledgeBaseApi.deleteNote({ kbGuid, docGuid })
```

### 搜索笔记
```javascript
await api.KnowledgeBaseApi.searchNote({
  kbGuid,
  data: { ss: '搜索关键词' }
})
// 返回: [{ guid, title, category, ... }]
```

## 文件夹操作

### 获取文件夹列表
```javascript
await api.KnowledgeBaseApi.getCategories({ kbGuid })
// 返回: { result: [...], pos: [...] }
```

### 创建文件夹
```javascript
await api.KnowledgeBaseApi.createCategory({
  kbGuid,
  data: {
    parent: '/',           // 父文件夹
    child: '文件夹名',
    pos: Date.now().toString()
  }
})
```

### 删除文件夹
```javascript
await api.KnowledgeBaseApi.deleteCategory({
  kbGuid,
  data: { category: '/要删除的文件夹/' }
})
```

### 重命名文件夹
```javascript
await api.KnowledgeBaseApi.renameCategory({
  kbGuid,
  data: {
    category: '/旧路径/',
    newCategory: '/新路径/'
  }
})
```

## 标签操作

### 获取所有标签
```javascript
await api.KnowledgeBaseApi.getAllTags({ kbGuid })
// 返回: [{ tagGuid, name, ... }]
```

### 获取标签下的笔记
```javascript
await api.KnowledgeBaseApi.getTagNotes({
  kbGuid,
  data: {
    tag: tagGuid,
    start: 0,
    count: 100,
    withAbstract: true
  }
})
```

### 创建标签
```javascript
await api.KnowledgeBaseApi.createTag({
  kbGuid,
  data: { name: '标签名', parentTagGuid: '' }
})
```

### 删除标签
```javascript
await api.KnowledgeBaseApi.deleteTag({ kbGuid, tagGuid })
```

## 资源上传

### 上传图片
```javascript
const formData = new FormData()
formData.append('file', fileBlob, 'image.png')

await api.KnowledgeBaseApi.uploadImage({
  kbGuid,
  docGuid,
  formData,
  config: { headers: { 'Content-Type': 'multipart/form-data' } }
})
```

## Markdown 处理工具

### embedMDNote - 包装 Markdown 为 HTML
```javascript
import helper from 'src/utils/helper'

const html = helper.embedMDNote(markdownContent, resources, {
  wrapWithPreTag: false,  // true=Lite/Markdown 模式
  kbGuid,
  docGuid: ''  // 创建时为空
})
```

### extractMarkdownFromMDNote - 提取 Markdown
```javascript
const markdown = helper.extractMarkdownFromMDNote(
  htmlContent,
  kbGuid,
  docGuid,
  resources
)
```

## 离线笔记规范

### 离线根目录
```javascript
const OFFLINE_ROOT_CATEGORY = '/我的笔记/'
```

### normalizeCategory - 规范化分类路径
```javascript
function normalizeCategory(cat) {
  if (!cat || cat === OFFLINE_ROOT_CATEGORY) {
    return '/'  // 离线根目录转为云端根目录
  }
  return cat
}
```

### 离线笔记 GUID 前缀
```javascript
const localDocGuid = `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
// 例如: local_1715678901234_abc12345
```

## 错误处理

### 常见错误码
- `returnCode !== 200`: API 调用失败
- `kbGuid is not match`: 笔记不属于当前知识库
- 网络错误: 请求超时或无法连接

### 账户不匹配处理
```javascript
if (error.message.includes('kbGuid is not match')) {
  // 笔记被移动到其他账户，降级为本地笔记
  await DatabaseClient.updateNote(noteId, {
    doc_guid: null,
    sync_status: 'local_only'
  })
}
```

## 相关文件

- API 实现：`src/utils/api.js`
- SyncService：`src/services/SyncService.js`
- Vuex actions：`src/store/server/actions.js`
- 详细 API 参考：[references/api.md](references/api.md)
