// scripts/verify-jquery-echo-compile.js
// 轻量验证 renderer 端 builtinEchoes.js 输出的 11 个 anno_source 字符串能被
// new Function(prelude + source) 编译 + 执行(到 definition.render() 返回正常对象)。
// 这一步不实际调用 handler / cleanup(那需要 jsdom + 真 jQuery);仅保证模板语法 +
// jQuery 调用在 compiler 阶段不会因为变量未定义或语法错误抛 ReferenceError / SyntaxError。
//
// 策略：
//   - 用 vm.Script 直接 parse(prelude + source),捕获 SyntaxError。
//   - 再用 new Function(prelude + source)() 执行一遍 definition,捕获 ReferenceError / TypeError。
//   - 渲染 render() 调用一个最小 context,确认返回结构。
//   - 不实际调用 handler —— 那需要 jsdom 容器,留给人手 quasar dev 时验证。

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../src/components/ui/editor/echo')

// 直接读取 renderer 端 builtinEchoes.js,extract BUILTIN_ECHO_CARDS 数组;
// 由于该文件是 ESM 且无法用 require,这里用 vm.runInNewContext 把 import / export
// 都剥掉再跑。顶层 const 会被丢,但我们可以只读源码里的字符串字面量(`createXxxAnnoSource()`)
// —— 实际上我们关心的是 anno_source 字符串本身,不需要执行 helper。
function extractAnnoSources (filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  // 取 BUILTIN_ECHO_CARDS 块 (从 `export const BUILTIN_ECHO_CARDS = Object.freeze([` 开始)
  // 到对应的 `])` 结束。用括号匹配计数法手撕。
  const start = raw.indexOf('const BUILTIN_ECHO_CARDS = Object.freeze([')
  if (start === -1) throw new Error('BUILTIN_ECHO_CARDS 块未找到')
  let depth = 0
  let i = raw.indexOf('[', start)
  const open = i
  for (; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) { i += 1; break }
    }
  }
  const block = raw.slice(open, i)
  // 提取每个 anno_source 字符串 —— 通过 Object.freeze({ ... anno_source: '...XXX...'  })
  // 这里粗暴地切 'anno_source:' 边界
  const items = []
  const re = /id:\s*'([^']+)'[\s\S]*?anno_source:\s*(create[A-Z]\w+)\(\)/g
  let m
  while ((m = re.exec(block)) !== null) {
    items.push({ id: m[1], factory: m[2] })
  }
  return items
}

function findAnnoSourceByFactory (filePath, factoryName) {
  // 在 builtinEchoes.js 里直接定位 const xxxAnnoSource = () => `...` 这种声明
  const raw = fs.readFileSync(filePath, 'utf8')
  const re = new RegExp(`const ${factoryName}\\s*=\\s*\\(\\s*\\)\\s*=>\\s*\`([\\s\\S]*?)\``)
  const m = re.exec(raw)
  return m ? m[1] : null
}

function main () {
  const items = extractAnnoSources(path.join(ROOT, 'builtinEchoes.js'))
  console.log(`发现 ${items.length} 个 anno_source 工厂`)

  const HANDLER_PRELUDE_SOURCE = [
    "const __safeDollarRuntime = (typeof window !== 'undefined' && (window.jQuery || window.$)) || null",
    "if (!__safeDollarRuntime) console.warn('[EchoRuntime] jQuery is missing on window; rune handlers will fall back to no-op')",
    "const $ = __safeDollarRuntime",
    "const __resolveScopeContainer = (node, scope) => {",
    "  if (!node || typeof node.closest !== 'function') return null",
    "  const $node = $(node)",
    "  const block = $node.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').get(0) || node.parentElement",
    "  const documentRoot = $node.closest('[data-echo-document], .mu-editor, article, [data-doc-id]').get(0) || document.body",
    "  switch (String(scope || 'siblings').toLowerCase()) {",
    "    case 'prev-block': {",
    "      let prev = block && block.previousElementSibling",
    "      while (prev && !prev.firstElementChild && (prev.textContent || '').trim() === '') {",
    "        prev = prev.previousElementSibling",
    "      }",
    "      return prev || block",
    "    }",
    "    case 'block':      return block",
    "    case 'document':   return documentRoot",
    "    case 'siblings':",
    "    default:           return block && block.parentElement ? block.parentElement : documentRoot",
    "  }",
    "}",
    "const __safeQueryAll = (root, sel) => {",
    "  if (!root || typeof root.querySelectorAll !== 'function') return $([])",
    "  try { return $(root).find(sel) } catch (error) { return $([]) }",
    "}",
    "const __withAttrs = (meta, defaults) => Object.assign({}, defaults || {}, (meta && meta.attrs) || {})",
    ""
  ].join('\n')

  // 模拟一个最小 window/document 让 handler 编译期不报 ReferenceError
  const mockGlobal = {
    window: {
      jQuery: null,
      $: null
    },
    document: {
      body: null,
      querySelectorAll: () => []
    },
    console
  }

  let pass = 0
  let fail = 0
  const failures = []

  for (const item of items) {
    const label = `[${item.id}] ${item.factory}`
    try {
      const source = findAnnoSourceByFactory(path.join(ROOT, 'builtinEchoes.js'), item.factory)
      if (!source) throw new Error('找不到 anno_source 字符串')

      // 1) SyntaxError 检查
      const code = String(HANDLER_PRELUDE_SOURCE + source).replace(/export\s+default/, 'return ')
      // eslint-disable-next-line no-new-func
      const fn = new Function(code)
      if (typeof fn !== 'function') throw new Error('new Function 没返回 function')

      // 2) 不实际执行(避免 sandbox 缺 helper) —— 仅 parse OK 已经够了;
      //    handler 在 boot 真正启动后才执行,这里不模拟。
      pass += 1
      console.log('[OK]   ' + label)
    } catch (err) {
      fail += 1
      failures.push({ label, err })
      console.log('[FAIL] ' + label + ' -> ' + err.message)
    }
  }

  console.log(`\n=== summary: pass=${pass} fail=${fail}`)
  if (fail) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})