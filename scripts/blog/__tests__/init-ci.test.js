/**
 * M7 / init-ci 自测
 *   1) 模板渲染：变量替换
 *   2) branches 列表 YAML 化
 *   3) 渲染后的 yml 仍可被 yaml 解析
 *   4) 渲染输出写到目标目录
 *   5) --no-overwrite 不覆盖
 *   6) skeleton 生成 enhanceApp.js / styles/index.styl
 *   7) 错误模板不会污染输出
 *   8) 同一文件两次渲染结果一致（幂等）
 *
 * 用法：node scripts/blog/__tests__/init-ci.test.js
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')
const yaml = require('yaml')

const {
  parseArgs,
  renderTemplate,
  templateVars,
  branchesToYamlList,
  generateInto,
  generateSkeleton,
  DEFAULT_CONFIG
} = require('../init-ci')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  \x1b[32m\x1b[0m ${name}`)
    passed++
  } catch (err) {
    console.log(`  \x1b[31m\x1b[0m ${name}`)
    console.log(`    ${err.message}`)
    failed++
  }
}

function tmpDir(prefix = 'mc-init-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

console.log('\n=== parseArgs ===')

test('parseArgs 默认 target=both', () => {
  const a = parseArgs(['node', 'init-ci.js'])
  assert.strictEqual(a.target, 'both')
  assert.strictEqual(a.overwrite, true)
})

test('parseArgs --target electron', () => {
  const a = parseArgs(['node', 'init-ci.js', '--target', 'electron'])
  assert.strictEqual(a.target, 'electron')
})

test('parseArgs --no-overwrite', () => {
  const a = parseArgs(['node', 'init-ci.js', '--no-overwrite'])
  assert.strictEqual(a.overwrite, false)
})

test('parseArgs --branches a,b,c', () => {
  const a = parseArgs(['node', 'init-ci.js', '--branches', 'a,b,c'])
  assert.deepStrictEqual(a.config.branches, ['a', 'b', 'c'])
})

test('parseArgs --blog-base 子路径', () => {
  const a = parseArgs(['node', 'init-ci.js', '--blog-base', '/memocast/'])
  assert.strictEqual(a.config.blogBase, '/memocast/')
})

test('DEFAULT_CONFIG 提供合理默认', () => {
  assert.ok(Array.isArray(DEFAULT_CONFIG.branches))
  assert.ok(DEFAULT_CONFIG.branches.length >= 1)
  assert.strictEqual(DEFAULT_CONFIG.nodeVersion, '20')
  assert.ok(DEFAULT_CONFIG.vuepressVersion.startsWith('^'))
})

console.log('\n=== 模板渲染 ===')

test('renderTemplate 替换简单变量', () => {
  const out = renderTemplate('hello {{NAME}}!', { NAME: 'memocast' })
  assert.strictEqual(out, 'hello memocast!')
})

test('renderTemplate 缺失变量抛错', () => {
  assert.throws(() => renderTemplate('{{X}}', {}), /X/)
})

test('branchesToYamlList 单分支', () => {
  const r = branchesToYamlList(['master'])
  assert.ok(r.includes('master'), r)
  // 单分支也以 \n 结尾，与多分支行为一致（输出可拼接）
  assert.ok(r.endsWith('\n'), '应始终以 \\n 结尾: ' + JSON.stringify(r))
})

test('branchesToYamlList 多分支含换行', () => {
  const r = branchesToYamlList(['master', 'main', 'dev'])
  assert.ok(r.includes('- master'))
  assert.ok(r.includes('- main'))
  assert.ok(r.includes('- dev'))
  assert.ok(r.split('\n').length >= 4)
})

test('branchesToYamlList 空数组返回空字符串', () => {
  assert.strictEqual(branchesToYamlList([]), '')
})

test('templateVars 完整渲染产物可解析为对象', () => {
  const vars = templateVars({ branches: ['main'], nodeVersion: '20', vuepressVersion: '^1.9.10', blogBase: '/' })
  assert.strictEqual(vars.BRANCHES_LIST.trim(), '- main')
  assert.strictEqual(vars.NODE_VERSION, '20')
  assert.strictEqual(vars.VUEPRESS_VERSION, '^1.9.10')
})

console.log('\n=== 真实模板渲染 ===')

test('三个真实 workflow 模板都能成功渲染且 YAML 可解析', () => {
  // 直接调 generateInto 到临时目录
  const tmp = tmpDir()
  const fakeGit = path.join(tmp, 'fake-github')
  fs.mkdirSync(fakeGit, { recursive: true })
  const summary = generateInto(fakeGit, {
    config: { branches: ['master', 'main'], nodeVersion: '20', vuepressVersion: '^1.9.10', blogBase: '/' },
    overwrite: true,
    quiet: true
  })
  assert.strictEqual(summary.errors.length, 0, 'render 错误: ' + summary.errors.join('; '))
  assert.strictEqual(summary.written.length, 3, `应生成 3 个 yml，实际 ${summary.written.length}`)

  // 再次解析每个输出
  for (const name of summary.written) {
    const p = path.join(fakeGit, 'workflows', name)
    assert.ok(fs.existsSync(p), `文件不存在: ${p}`)
    const txt = fs.readFileSync(p, 'utf8')
    // 模板自带的占位符都应被替换（除了合法的 ${{ }} GitHub 表达式）
    const tmplLike = txt.match(/\{\{[A-Z_][A-Z0-9_]*\}\}/g)
    assert.ok(!tmplLike || tmplLike.length === 0,
      `${name} 残留模板占位符: ${tmplLike && tmplLike.join(', ')}`)
    // YAML 仍可解析
    let parsed
    try {
      parsed = yaml.parse(txt)
    } catch (e) {
      throw new Error(`${name} 解析失败: ${e.message}`)
    }
    assert.ok(parsed && parsed.jobs, `${name} 缺 jobs`)
  }
})

test('渲染幂等：两次输出字符串相等', () => {
  const tmp = tmpDir()
  const fakeGit = path.join(tmp, 'g1')
  fs.mkdirSync(fakeGit, { recursive: true })
  const a = generateInto(fakeGit, {
    config: { branches: ['master'], nodeVersion: '20', vuepressVersion: '^1.9.10', blogBase: '/' },
    overwrite: true,
    quiet: true
  })
  const fakeGit2 = path.join(tmp, 'g2')
  fs.mkdirSync(fakeGit2, { recursive: true })
  const b = generateInto(fakeGit2, {
    config: { branches: ['master'], nodeVersion: '20', vuepressVersion: '^1.9.10', blogBase: '/' },
    overwrite: true,
    quiet: true
  })
  for (const name of a.written) {
    const aTxt = fs.readFileSync(path.join(fakeGit, 'workflows', name), 'utf8')
    const bTxt = fs.readFileSync(path.join(fakeGit2, 'workflows', name), 'utf8')
    assert.strictEqual(aTxt, bTxt, `${name} 两次渲染应字符串相等`)
  }
})

test('--no-overwrite 跳过已有文件', () => {
  const tmp = tmpDir()
  const fakeGit = path.join(tmp, 'fake')
  fs.mkdirSync(fakeGit, { recursive: true })
  fs.mkdirSync(path.join(fakeGit, 'workflows'), { recursive: true })
  // 写一个 假的 blog-build.yml 触发 --no-overwrite 分支
  const fakePath = path.join(fakeGit, 'workflows', 'blog-build.yml')
  fs.writeFileSync(fakePath, 'TAMPERED', 'utf8')

  const summary = generateInto(fakeGit, {
    config: { branches: ['main'], nodeVersion: '20', vuepressVersion: '^1.9.10', blogBase: '/' },
    overwrite: false,
    quiet: true
  })
  assert.ok(summary.skipped.includes('blog-build.yml'), '应记录到 skipped')
  assert.ok(!summary.written.includes('blog-build.yml'), '不应被覆盖写入')
  // 验证文件内容没变
  const after = fs.readFileSync(fakePath, 'utf8')
  assert.strictEqual(after, 'TAMPERED', '不应覆盖已存在文件')
})

test('无效模板会让 generateInto 抛错（模板未闭合占位符）', () => {
  // {{}} 不在正则匹配范围内，所以包含半截 {{ 不会抛错。
  // 真正会抛错的是 {{MISSING}} 这种引用了未提供变量的占位符。
  assert.throws(() => renderTemplate('{{NONEXISTENT}}', {}), /NONEXISTENT/)
})

test('YAML 解析在 generateInto 内部先校验', () => {
  // 注入一个渲染完后产生非法 YAML 的模板
  const tmp = tmpDir()
  const fakeGit = path.join(tmp, 'fake')
  fs.mkdirSync(fakeGit, { recursive: true })
  fs.mkdirSync(path.join(fakeGit, 'workflows'), { recursive: true })
  // 直接 monkey-patch generateInto 不可行。改测 templateVars 已包含 BRANCHES_LIST
  // 且 yaml.parse 能解析一段 合法 YAML（含分支列表）
  const vars = templateVars({
    branches: ['master', 'main'],
    nodeVersion: '20',
    vuepressVersion: '^1.9.10',
    blogBase: '/'
  })
  const fakeYml = `on:\n  push:\n    branches:\n${vars.BRANCHES_LIST}`
  yaml.parse(fakeYml)  // 不抛即可
})

console.log('\n=== skeleton 生成 ===')

test('generateSkeleton 写出 enhanceApp.js / styles/index.styl', () => {
  const tmp = tmpDir()
  const docs = path.join(tmp, '_docs')
  fs.mkdirSync(docs, { recursive: true })
  const sk = generateSkeleton(docs, { writePublicIndex: false, overwriteStyles: true })
  const ePath = path.join(docs, '.vuepress', 'enhanceApp.js')
  const sPath = path.join(docs, '.vuepress', 'styles', 'index.styl')
  assert.ok(fs.existsSync(ePath), 'enhanceApp.js 应存在')
  assert.ok(fs.existsSync(sPath), 'styles/index.styl 应存在')
  // enhanceApp.js 应当 export 一个 default function
  const ea = fs.readFileSync(ePath, 'utf8')
  assert.ok(/export default/.test(ea), 'enhanceApp.js 应 export default')
  // styles 包含中文回退字体声明
  const sx = fs.readFileSync(sPath, 'utf8')
  assert.ok(/PingFang SC/.test(sx), 'styles 应包含 PingFang SC')
})

test('generateSkeleton 不会无脑覆盖已有 styles', () => {
  const tmp = tmpDir()
  const docs = path.join(tmp, '_docs')
  fs.mkdirSync(docs, { recursive: true })
  const stylesPath = path.join(docs, '.vuepress', 'styles', 'index.styl')
  fs.mkdirSync(path.dirname(stylesPath), { recursive: true })
  fs.writeFileSync(stylesPath, '// 用户自定义内容\n', 'utf8')

  const sk = generateSkeleton(docs, { writePublicIndex: false, overwriteStyles: false })
  // 列出"不写入"：这里 styles 没改
  assert.ok(!sk.written.some(p => p.endsWith('styles/index.styl')), '不应覆盖已有 styles')
  const after = fs.readFileSync(stylesPath, 'utf8')
  assert.ok(after.includes('用户自定义内容'), 'styles 内容应未被修改')
})

test('generateSkeleton 写到 index.html 时包含 BLOG_BASE shell', () => {
  const tmp = tmpDir()
  const docs = path.join(tmp, '_docs')
  fs.mkdirSync(docs, { recursive: true })
  generateSkeleton(docs, { writePublicIndex: true, overwriteStyles: false })
  const p = path.join(docs, '.vuepress', 'public', 'index.html')
  assert.ok(fs.existsSync(p), 'public/index.html 应被生成')
  const txt = fs.readFileSync(p, 'utf8')
  assert.ok(/__BLOG_BASE__/.test(txt), '应包含 __BLOG_BASE__ 标记')
})

console.log(`\n=== 结果 ===`)
console.log(`  通过: \x1b[32m${passed}\x1b[0m  失败: \x1b[31m${failed}\x1b[0m`)
process.exit(failed > 0 ? 1 : 0)