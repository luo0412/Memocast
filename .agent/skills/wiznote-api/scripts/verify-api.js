/**
 * 为知笔记 API 验证脚本
 * 用于测试本地与远程API的连通性和正确性
 *
 * 使用方法：
 *   node verify-api.js --user <email> --password <pwd>
 *   node verify-api.js --user <email> --password <pwd> --server <ks-server> --guid <kb-guid> --token <token>
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 配置
const AS_URL = 'https://as.wiz.cn';

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(type, message) {
  const prefix = {
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    info: `${colors.blue}ℹ${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`
  };
  console.log(`${prefix[type]} ${message}`);
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user') config.userId = args[++i];
    if (args[i] === '--password') config.password = args[++i];
    if (args[i] === '--server') config.kbServer = args[++i];
    if (args[i] === '--guid') config.kbGuid = args[++i];
    if (args[i] === '--token') config.token = args[++i];
  }

  return config;
}

// 通用请求封装
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

// 测试1: 登录并获取Token
async function testLogin(config) {
  log('info', '测试 1: 用户登录...');

  if (!config.userId || !config.password) {
    log('warn', '跳过登录测试（需要 --user 和 --password）');
    return null;
  }

  try {
    const result = await execRequest('POST', `${AS_URL}/as/user/login`, {
      userId: config.userId,
      password: config.password
    });

    log('success', `登录成功!`);
    log('info', `  - KB Server: ${result.kbServer}`);
    log('info', `  - KB GUID: ${result.kbGuid}`);
    log('info', `  - Token: ${result.token.substring(0, 20)}...`);

    // 保存到config供后续测试使用
    config.kbServer = result.kbServer;
    config.kbGuid = result.kbGuid;
    config.token = result.token;

    return result;
  } catch (err) {
    log('error', `登录失败: ${err.message} (${err.externCode || err.code})`);
    return null;
  }
}

// 测试2: 获取文件夹列表
async function testGetFolders(config) {
  log('info', '测试 2: 获取文件夹列表...');

  if (!config.kbServer || !config.kbGuid || !config.token) {
    log('warn', '跳过文件夹测试（需要先登录或提供 --server --guid --token）');
    return [];
  }

  try {
    const folders = await execRequest('GET',
      `${config.kbServer}/ks/category/all/${config.kbGuid}`,
      null, config.token);

    log('success', `获取成功! 共有 ${folders.length} 个文件夹`);
    folders.slice(0, 5).forEach(f => log('info', `  - ${f}`));
    if (folders.length > 5) log('info', `  ... 还有 ${folders.length - 5} 个`);

    return folders;
  } catch (err) {
    log('error', `获取文件夹失败: ${err.message}`);
    return [];
  }
}

// 测试3: 创建测试文件夹
async function testCreateFolder(config) {
  log('info', '测试 3: 创建测试文件夹...');

  if (!config.kbServer || !config.kbGuid || !config.token) {
    log('warn', '跳过创建文件夹测试');
    return false;
  }

  const testFolder = '/Memocast_API_Test_' + Date.now();

  try {
    await execRequest('POST',
      `${config.kbServer}/ks/category/create/${config.kbGuid}`,
      { parent: '/', child: 'Memocast_API_Test_' + Date.now() },
      config.token);

    log('success', `创建测试文件夹: ${testFolder}`);
    return true;
  } catch (err) {
    log('error', `创建文件夹失败: ${err.message}`);
    return false;
  }
}

// 测试4: 创建测试笔记
async function testCreateNote(config) {
  log('info', '测试 4: 创建测试笔记...');

  if (!config.kbServer || !config.kbGuid || !config.token) {
    log('warn', '跳过创建笔记测试');
    return null;
  }

  const noteHtml = `<!DOCTYPE html>
<html>
<head><title>Memocast API Test</title></head>
<body>
<h1>API测试笔记</h1>
<p>创建时间: ${new Date().toISOString()}</p>
<p>这是通过API创建的测试笔记。</p>
</body>
</html>`;

  try {
    const note = await execRequest('POST',
      `${config.kbServer}/ks/note/create/${config.kbGuid}`,
      {
        kbGuid: config.kbGuid,
        title: 'Memocast API测试笔记 ' + new Date().toLocaleString(),
        category: '/',
        html: noteHtml
      },
      config.token);

    log('success', `创建笔记成功!`);
    log('info', `  - Note GUID: ${note.guid || note.docGuid || 'N/A'}`);

    return note;
  } catch (err) {
    log('error', `创建笔记失败: ${err.message}`);
    return null;
  }
}

// 测试5: 获取笔记列表
async function testGetNotes(config) {
  log('info', '测试 5: 获取笔记列表...');

  if (!config.kbServer || !config.kbGuid || !config.token) {
    log('warn', '跳过获取笔记测试');
    return [];
  }

  try {
    const notes = await execRequest('GET',
      `${config.kbServer}/ks/note/list/category/${config.kbGuid}?category=/&start=0&count=5&orderBy=created&withAbstract=true`,
      null, config.token);

    log('success', `获取成功! 最近 ${notes.length} 篇笔记`);
    notes.forEach(n => log('info', `  - ${n.title || 'Untitled'} (${n.guid?.substring(0, 8)}...)`));

    return notes;
  } catch (err) {
    log('error', `获取笔记失败: ${err.message}`);
    return [];
  }
}

// 测试6: 删除测试笔记
async function testDeleteNote(config, note) {
  log('info', '测试 6: 删除测试笔记...');

  if (!note || !config.kbServer || !config.kbGuid || !config.token) {
    log('warn', '跳过删除测试');
    return false;
  }

  const docGuid = note.guid || note.docGuid;
  if (!docGuid) {
    log('warn', '笔记无GUID，无法删除');
    return false;
  }

  try {
    await execRequest('DELETE',
      `${config.kbServer}/ks/note/delete/${config.kbGuid}/${docGuid}`,
      null, config.token);

    log('success', `删除笔记成功`);
    return true;
  } catch (err) {
    log('error', `删除笔记失败: ${err.message}`);
    return false;
  }
}

// 测试7: 上传资源（可选）
async function testUploadResource(config, note) {
  log('info', '测试 7: 上传资源文件...');

  if (!note || !config.kbServer || !config.kbGuid || !config.token) {
    log('warn', '跳过资源上传测试');
    return false;
  }

  const docGuid = note.guid || note.docGuid;
  if (!docGuid) {
    log('warn', '笔记无GUID，无法上传资源');
    return false;
  }

  // 创建一个简单的测试图片（1x1红色像素PNG）
  const testPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64'
  );

  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('kbGuid', config.kbGuid);
    form.append('docGuid', docGuid);
    form.append('data', testPng, 'test.png');

    const result = await axios.post(
      `${config.kbServer}/ks/resource/upload/${config.kbGuid}/${docGuid}`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'X-Wiz-Token': config.token
        }
      }
    );

    if (result.data.returnCode === 200) {
      log('success', `上传资源成功: ${result.data.result.name}`);
      return true;
    } else {
      log('error', `上传资源失败: ${result.data.returnMessage}`);
      return false;
    }
  } catch (err) {
    log('error', `上传资源失败: ${err.message}`);
    return false;
  }
}

// 主函数
async function main() {
  console.log('\n' + colors.blue + '='.repeat(50));
  console.log('  为知笔记 API 验证工具');
  console.log('='.repeat(50) + colors.reset + '\n');

  const config = parseArgs();

  // 检查是否提供了足够的配置
  if (!config.kbServer && (!config.userId || !config.password)) {
    console.log('使用方法:');
    console.log('  node verify-api.js --user <email> --password <pwd>');
    console.log('  node verify-api.js --server <ks-server> --guid <kb-guid> --token <token>');
    console.log('');
    process.exit(1);
  }

  let allPassed = true;
  const results = [];

  // 1. 登录测试
  const loginResult = await testLogin(config);
  results.push({ name: '登录', passed: !!loginResult });
  allPassed = allPassed && !!loginResult;

  // 2. 获取文件夹
  const folders = await testGetFolders(config);
  results.push({ name: '获取文件夹', passed: folders.length >= 0 });
  allPassed = allPassed && folders.length >= 0;

  // 3. 创建文件夹
  const folderCreated = await testCreateFolder(config);
  results.push({ name: '创建文件夹', passed: folderCreated });

  // 4. 创建笔记
  const note = await testCreateNote(config);
  results.push({ name: '创建笔记', passed: !!note });

  // 5. 获取笔记
  const notes = await testGetNotes(config);
  results.push({ name: '获取笔记列表', passed: notes.length >= 0 });

  // 6. 上传资源
  if (note) {
    const uploaded = await testUploadResource(config, note);
    results.push({ name: '上传资源', passed: uploaded });

    // 7. 删除笔记
    const deleted = await testDeleteNote(config, note);
    results.push({ name: '删除笔记', passed: deleted });
  }

  // 输出总结
  console.log('\n' + colors.blue + '='.repeat(50));
  console.log('  测试总结');
  console.log('='.repeat(50) + colors.reset + '\n');

  results.forEach(r => {
    const status = r.passed ? `${colors.green}通过${colors.reset}` : `${colors.red}失败${colors.reset}`;
    console.log(`  ${status} - ${r.name}`);
  });

  // 保存配置供后续使用
  if (loginResult) {
    const configPath = path.join(__dirname, '..', 'test-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      kbServer: config.kbServer,
      kbGuid: config.kbGuid,
      token: config.token,
      userId: config.userId,
      savedAt: new Date().toISOString()
    }, null, 2));
    log('info', `配置已保存到 test-config.json`);
  }

  console.log('');
  if (allPassed) {
    log('success', '所有测试通过！API正常工作。');
  } else {
    log('error', '部分测试失败，请检查网络连接和配置。');
  }
  console.log('');

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  log('error', `发生错误: ${err.message}`);
  console.error(err);
  process.exit(1);
});
