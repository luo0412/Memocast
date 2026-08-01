/**
 * cdn-deps boot file —— 根据用户配置的 cdnDeps，在页面 <head> 中动态注入 CDN 资源
 *
 * 支持的资源类型：
 * - .js  → <script> 标签
 * - .css → <link rel="stylesheet">
 * - .woff2 / .woff / .ttf / .otf / .eot → <link rel="stylesheet"> (font-face 自动生成)
 * - 其他扩展名 → 尝试作为样式表加载
 *
 * 加载顺序：
 * - stylesheet 与 font（不阻塞 JS）并行注入，浏览器自行调度。
 * - script 之间保持 deps 数组的顺序依次注入：上一个 script onload 后再注入下一个，
 *   避免 city-picker.js 比 city-picker.data.js 先到达导致 IIFE 抛
 *   "The file city-picker.data.js must be included first!" 而 $.fn.citypicker 永远不注册。
 *   (async=true 会让浏览器按网络到达顺序执行，破坏依赖关系，故此处不用 async。)
 */
import bus from 'src/components/common/bus'
import DatabaseClient from 'src/utils/DatabaseClient'

const CDN_DEPS_STORAGE_KEY = 'v__2_client_cdnDeps'

/**
 * 根据 URL 判断资源类型
 */
function getResourceType (url) {
  const lower = url.toLowerCase()
  if (lower.endsWith('.js')) return 'script'
  if (lower.endsWith('.css')) return 'stylesheet'
  if (/\.(woff2?|ttf|otf|eot|svg)(\?|$)/.test(lower)) return 'font'
  // 默认作为样式表尝试
  return 'stylesheet'
}

/**
 * 移除已注入的 CDN 资源
 */
function removeInjectedResources () {
  // 移除 script
  document.querySelectorAll('head script[data-cdn-name]').forEach(el => el.remove())
  // 移除 link
  document.querySelectorAll('head link[data-cdn-name]').forEach(el => el.remove())
  // 移除内联 font-face style
  document.querySelectorAll('style[data-cdn-font-face]').forEach(el => el.remove())
}

/**
 * 注入脚本（同步、不 async，按 onload 链式调用）
 * 返回 Promise，resolve 表示脚本执行完毕（成功或失败都 resolve，避免中断链）
 */
function injectScript (dep) {
  return new Promise((resolve) => {
    const url = dep.url
    const existing = document.querySelector(`head script[src="${url}"]`)
    if (existing) {
      console.log('[CdnDepsBoot] Already injected script:', url)
      // 已存在视为就绪，直接 resolve（不需要等待再次 onload）
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = url
    // 不设 async，让浏览器按 appendChild 顺序执行（defer 与 async 互斥，且 defer 也按顺序），
    // 但出于跨环境安全，配合下方 onload 链式调度确保严格顺序。
    setCommonAttrs(script, dep)

    const done = (ok) => {
      if (ok) {
        console.log('[CdnDepsBoot] Script loaded:', url)
      } else {
        console.error('[CdnDepsBoot] Script failed:', url)
      }
      resolve()
    }

    script.onload = () => done(true)
    script.onerror = () => done(false)

    document.head.appendChild(script)
    console.log('[CdnDepsBoot] Injected script:', dep.name, '->', url)
  })
}

/**
 * 注入样式表
 */
function injectStylesheet (dep) {
  const url = dep.url
  const existing = document.querySelector(`head link[href="${url}"]`)
  if (existing) {
    console.log('[CdnDepsBoot] Already injected stylesheet:', url)
    return
  }

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  setCommonAttrs(link, dep)

  link.onload = () => console.log('[CdnDepsBoot] Stylesheet loaded:', url)
  link.onerror = () => console.error('[CdnDepsBoot] Stylesheet failed:', url)

  document.head.appendChild(link)
  console.log('[CdnDepsBoot] Injected stylesheet:', dep.name, '->', url)
}

/**
 * 注入字体
 * 通过预连接 + @font-face 内联样式实现
 */
function injectFont (dep) {
  const url = dep.url
  const fontFamily = dep.name || 'CDNFont'
  const fontId = 'cdn-font-' + (dep.id || fontFamily).replace(/[^a-zA-Z0-9]/g, '_')

  // 避免重复注入
  if (document.getElementById(fontId)) {
    console.log('[CdnDepsBoot] Already injected font:', fontFamily)
    return
  }

  // 预连接加速
  const preconn = document.createElement('link')
  preconn.rel = 'preconnect'
  preconn.href = new URL(url).origin
  preconn.crossOrigin = 'anonymous'
  document.head.appendChild(preconn)

  // 提取文件名作为 font-face 的 src 格式
  const fileName = url.split('/').pop().split('?')[0]
  const ext = fileName.split('.').pop().toLowerCase()
  const formatMap = {
    woff2: 'woff2',
    woff: 'woff',
    ttf: 'truetype',
    otf: 'opentype',
    eot: 'embedded-opentype',
    svg: 'svg'
  }
  const format = formatMap[ext] || ext

  // 生成 @font-face 样式
  const style = document.createElement('style')
  style.id = fontId
  style.setAttribute('data-cdn-font-face', fontFamily)
  style.textContent = `
    @font-face {
      font-family: '${fontFamily}';
      src: url('${url}') format('${format}');
      font-display: swap;
    }
  `
  document.head.appendChild(style)
  console.log('[CdnDepsBoot] Injected font:', fontFamily, '->', url)
}

/**
 * 设置通用属性
 */
function setCommonAttrs (el, dep) {
  const safeId = 'cdn-dep-' + (dep.id || dep.name || '').replace(/[^a-zA-Z0-9]/g, '_')
  el.id = safeId
  el.setAttribute('data-cdn-name', dep.name || '')
}

/**
 * 按依赖顺序串行注入：script 之间保持 deps 数组顺序，stylesheet/font 与 script 并行。
 * 这样 city-picker.data.js 一定在 city-picker.js 之前到达并执行，
 * 避免 IIFE 因 ChineseDistricts 未定义抛错而使 $.fn.citypicker 永远不注册。
 */
async function injectResourceInOrder (deps, index) {
  if (index >= deps.length) return
  const dep = deps[index]
  const type = getResourceType(dep.url)

  switch (type) {
    case 'script':
      await injectScript(dep)
      break
    case 'stylesheet':
      injectStylesheet(dep)
      break
    case 'font':
      injectFont(dep)
      break
    default:
      injectStylesheet(dep)
  }

  return injectResourceInOrder(deps, index + 1)
}

/**
 * 确保 window.jQuery 和 window.$ 挂载
 */
function ensureJQueryGlobals () {
  if (typeof window.jQuery === 'undefined' && typeof window.$ !== 'undefined') {
    window.jQuery = window.$
    console.log('[CdnDepsBoot] Ensured window.jQuery = window.$')
  } else if (typeof window.jQuery !== 'undefined' && typeof window.$ === 'undefined') {
    window.$ = window.jQuery
    console.log('[CdnDepsBoot] Ensured window.$ = window.jQuery')
  }
  if (typeof window.jQuery !== 'undefined') {
    console.log('[CdnDepsBoot] jQuery version:', window.jQuery.fn.jquery)
  }
}

/**
 * 内置 CDN 依赖（首次启动时使用）
 */
const BUILT_IN_DEPS = [
  { name: 'jQuery', url: 'https://luo0412.github.io/cdn/jquery/jquery.min.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { name: 'jQuery Migrate', url: 'https://luo0412.github.io/cdn/jquery/jquery-migrate.min.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { name: 'layui CSS', url: 'https://luo0412.github.io/cdn/layui/css/layui.css', enabled: true, applyToBlog: false, isBuiltIn: true },
  { name: 'layui JS', url: 'https://luo0412.github.io/cdn/layui/layui.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  // v2026-08-01：city-picker 默认域名统一从 tshi0912.github.io 改为 luo0412.github.io/cdn
  { name: 'city-picker data', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.data.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { name: 'city-picker JS', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.js', enabled: true, applyToBlog: false, isBuiltIn: true },
  { name: 'city-picker CSS', url: 'https://luo0412.github.io/cdn/city-picker/city-picker.css', enabled: true, applyToBlog: false, isBuiltIn: true }
]

const builtInNames = BUILT_IN_DEPS.map(d => d.name)

function newId () {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
}

/**
 * 加载并注入已启用的 CDN 依赖
 * 优先级：SQLite > localStorage > 内置依赖
 */
async function loadAndInjectCdnDeps () {
  try {
    let deps = []

    // 1. 优先从 SQLite 读取
    try {
      const savedDeps = await DatabaseClient.cdnDeps.getAll()
      if (Array.isArray(savedDeps) && savedDeps.length > 0) {
        // 如果 SQLite 有数据，合并内置依赖和用户自定义依赖
        const customDeps = savedDeps.filter(d => !builtInNames.includes(d.name))
        const mergedBuiltIn = BUILT_IN_DEPS.map(bi => {
          const existing = savedDeps.find(d => d.name === bi.name)
          if (existing) return { ...existing, isBuiltIn: true, id: existing.id || newId() }
          return { ...bi, id: newId() }
        })
        deps = [...mergedBuiltIn, ...customDeps]
        console.log('[CdnDepsBoot] Loaded from SQLite:', deps.length, 'deps')
      }
    } catch (dbErr) {
      console.warn('[CdnDepsBoot] Failed to load from SQLite, trying localStorage:', dbErr)
    }

    // 2. 如果 SQLite 为空，尝试 localStorage（向后兼容）
    if (deps.length === 0) {
      const raw = localStorage.getItem(CDN_DEPS_STORAGE_KEY)
      if (raw) {
        try {
          deps = JSON.parse(raw)
          console.log('[CdnDepsBoot] Loaded from localStorage:', deps.length, 'deps')
        } catch (parseErr) {
          console.warn('[CdnDepsBoot] Failed to parse localStorage, using built-in:', parseErr)
        }
      }
    }

    // 3. 如果都为空，使用内置依赖
    if (deps.length === 0) {
      deps = BUILT_IN_DEPS.map(bi => ({ ...bi, id: newId() }))
      console.log('[CdnDepsBoot] Using built-in deps:', deps.length)
    }

    if (!Array.isArray(deps) || deps.length === 0) {
      console.log('[CdnDepsBoot] No CDN deps available')
      return
    }

    const enabledDeps = deps.filter(dep => dep.enabled && dep.url)
    if (enabledDeps.length === 0) {
      console.log('[CdnDepsBoot] No enabled CDN deps')
      return
    }

    // 优先加载 jQuery 和 jQuery Migrate（确保基础库就绪）
    const jqueryDeps = enabledDeps.filter(dep =>
      dep.name === 'jQuery' || dep.name === 'jQuery Migrate'
    )
    const otherDeps = enabledDeps.filter(dep =>
      dep.name !== 'jQuery' && dep.name !== 'jQuery Migrate'
    )

    console.log('[CdnDepsBoot] Injecting', enabledDeps.length, 'CDN deps...')

    // 1. 优先加载 jQuery 系列（串行）
    if (jqueryDeps.length > 0) {
      console.log('[CdnDepsBoot] Loading jQuery deps first...')
      await injectResourceInOrder(jqueryDeps, 0)
      ensureJQueryGlobals()
    }

    // 2. 再加载其他依赖
    if (otherDeps.length > 0) {
      console.log('[CdnDepsBoot] Loading other deps...')
      injectResourceInOrder(otherDeps, 0).catch(err => {
        console.error('[CdnDepsBoot] Error injecting CDN deps:', err)
      })
    }
  } catch (err) {
    console.error('[CdnDepsBoot] Error loading CDN deps:', err)
  }
}

export default async () => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAndInjectCdnDeps)
  } else {
    loadAndInjectCdnDeps()
  }

  // 监听配置变更事件，刷新 CDN 资源
  bus.$on('cdnDepsChanged', () => {
    console.log('[CdnDepsBoot] CDN deps changed, reloading...')
    removeInjectedResources()
    loadAndInjectCdnDeps()
  })
}
