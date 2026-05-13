# 为知笔记 API 详细参考

## 目录
- [Account Server API](#account-server-api)
- [Knowledge Server API](#knowledge-server-api)
- [完整调用示例](#完整调用示例)

---

## Account Server API

### 登录
```
POST /as/user/login
```

**请求体：**
```json
{
  "userId": "user@example.com",
  "password": "your_password"
}
```

**成功响应：**
```json
{
  "returnCode": 200,
  "returnMessage": "OK",
  "result": {
    "token": "xxx-xxx-xxx",
    "kbServer": "https://ks1.wiz.cn",
    "kbGuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "userGuid": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
    "userId": "user@example.com",
    "kbName": "个人知识库",
    "syncServer": "https://as.wiz.cn"
  }
}
```

**错误码：**
- `31002` / `WizErrorInvalidPassword`: 密码错误
- `WizErrorUserNotExists`: 用户不存在

---

### 获取用户头像
```
GET /as/user/avatar/:userGuid
```

**响应：** 图片二进制数据（Content-Type: image/*）

---

## Knowledge Server API

### 文件夹操作

#### 获取所有文件夹
```
GET /ks/category/all/:kbGuid
```

**响应：** 文件夹路径数组
```json
{
  "returnCode": 200,
  "result": ["/", "/My Notes/", "/Work/", "/Work/Projects/"]
}
```

#### 创建文件夹
```
POST /ks/category/create/:kbGuid
```

**请求体：**
```json
{
  "parent": "/Work/",
  "child": "NewProject"
}
```

**说明：**
- `parent`: 父文件夹路径，根目录用 `/`
- `child`: 新文件夹名称（不含斜杠）

---

### 笔记操作

#### 创建笔记
```
POST /ks/note/create/:kbGuid
```

**请求体：**
```json
{
  "kbGuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "title": "笔记标题",
  "category": "/My Notes/",
  "html": "<html>...</html>"
}
```

**说明：**
- `html`: 笔记内容，需要是完整的HTML文档
- `category`: 文件夹路径，必须以 `/` 开头和结尾

#### 保存笔记
```
PUT /ks/note/save/:kbGuid/:docGuid
```

**请求体：**
```json
{
  "kbGuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "docGuid": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
  "html": "<html>...</html>",
  "url": "https://source.url",
  "tags": "tagGuid1*tagGuid2",
  "author": "Author Name",
  "keywords": "keyword1, keyword2",
  "resources": ["image1.png", "image2.jpg"]
}
```

**说明：**
- `resources`: 笔记中包含的资源文件名列表
- 上传资源后才能正确显示图片

#### 获取笔记信息
```
GET /ks/note/info/:kbGuid/:docGuid
```

**响应：**
```json
{
  "returnCode": 200,
  "result": {
    "guid": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
    "title": "笔记标题",
    "category": "/My Notes/",
    "created": "2024-01-01T00:00:00Z",
    "modified": "2024-01-02T00:00:00Z",
    "tags": ["tag1", "tag2"],
    "author": "Author",
    "url": "https://source.url",
    "abstract": "笔记摘要..."
  }
}
```

#### 获取笔记HTML（浏览器直接显示）
```
GET /ks/note/view/:kbGuid/:docGuid/
```

#### 删除笔记
```
DELETE /ks/note/delete/:kbGuid/:docGuid/
```

**成功响应：**
```json
{
  "returnCode": 200,
  "returnMessage": "OK"
}
```

---

### 分页获取笔记

#### 按文件夹获取
```
GET /ks/note/list/category/:kbGuid?category=:folder&start=0&count=50&orderBy=created&ascending=desc&withAbstract=true
```

**参数：**
- `category`: 文件夹路径（URL编码）
- `start`: 起始偏移
- `count`: 每页数量
- `orderBy`: 排序字段（title/created/modified）
- `ascending`: 排序方向（asc/desc）
- `withAbstract`: 是否返回摘要（true/false）

#### 按标签获取
```
GET /ks/note/list/tag/:kbGuid?tag=:tagGuid&start=0&count=50
```

---

### 资源操作

#### 上传图片/资源
```
POST /ks/resource/upload/:kbGuid/:docGuid
Content-Type: multipart/form-data
```

**请求体：**
- `kbGuid`: 知识库GUID
- `docGuid`: 笔记GUID
- `data`: 文件二进制数据

**响应：**
```json
{
  "returnCode": 200,
  "result": {
    "name": "image.png",
    "md5": "abc123...",
    "size": 12345
  }
}
```

#### 获取笔记缩略图
```
GET /ks/note/abstract/:kbGuid/:docGuid
```

**响应：** 图片数据

#### 下载笔记资源
```
GET /ks/object/download/:kbGuid/:docGuid?objId=:resName&objType=resource
```

#### 下载附件
```
GET /ks/object/download/:kbGuid/:docGuid?objId=:attGuid&objType=attachment
```

#### 获取附件列表
```
GET /ks/note/attachments/:kbGuid/:docGuid
```

**响应：**
```json
{
  "returnCode": 200,
  "result": [
    {
      "guid": "attachment-guid",
      "name": "document.pdf",
      "size": 102400,
      "created": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

## 完整调用示例

```javascript
const axios = require('axios');

const AS_URL = 'https://as.wiz.cn';

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

// 登录
async function login(userId, password) {
  return await execRequest('POST', `${AS_URL}/as/user/login`, { userId, password });
}

// 获取文件夹
async function getFolders(kbServer, kbGuid, token) {
  return await execRequest('GET', `${kbServer}/ks/category/all/${kbGuid}`, null, token);
}

// 创建文件夹
async function createFolder(kbServer, kbGuid, parent, child, token) {
  return await execRequest('POST', `${kbServer}/ks/category/create/${kbGuid}`,
    { parent, child }, token);
}

// 创建笔记
async function createNote(kbServer, kbGuid, title, folder, html, token) {
  return await execRequest('POST', `${kbServer}/ks/note/create/${kbGuid}`, {
    kbGuid, title, category: folder, html
  }, token);
}

// 获取笔记列表
async function getNotes(kbServer, kbGuid, folder, start, count, token) {
  const folderEnc = encodeURIComponent(folder);
  return await execRequest('GET',
    `${kbServer}/ks/note/list/category/${kbGuid}?category=${folderEnc}&start=${start}&count=${count}&orderBy=created`,
    null, token);
}

// 上传资源
async function uploadResource(kbServer, kbGuid, docGuid, fileBuffer, fileName, token) {
  const formData = new FormData();
  formData.append('kbGuid', kbGuid);
  formData.append('docGuid', docGuid);
  formData.append('data', fileBuffer, fileName);

  return await execRequest('POST',
    `${kbServer}/ks/resource/upload/${kbGuid}/${docGuid}`,
    formData, token);
}

// 使用示例
async function main() {
  const userId = 'your@email.com';
  const password = 'your_password';

  try {
    // 1. 登录
    const loginResult = await login(userId, password);
    const { kbServer, kbGuid, token } = loginResult;
    console.log('登录成功:', kbServer);

    // 2. 获取文件夹
    const folders = await getFolders(kbServer, kbGuid, token);
    console.log('文件夹:', folders);

    // 3. 创建笔记
    const noteHtml = `<!doctype html><html><head><title>Test</title></head><body><p>Hello WizNote</p></body></html>`;
    const newNote = await createNote(kbServer, kbGuid, 'API测试笔记', '/', noteHtml, token);
    console.log('创建笔记:', newNote);

  } catch (err) {
    console.error('错误:', err.message, err.externCode);
  }
}

main();
```

---

## 私有化部署

如果使用私有化部署的为知笔记服务端：
- 将 `as.wiz.cn` 替换为你的私有服务器地址
- 确保服务端开启了API访问权限
- 某些功能可能需要在服务端配置
