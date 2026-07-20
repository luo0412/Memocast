/**
 * cdn-deps boot file —— 根据用户配置的 cdnDeps，在页面 <head> 中动态注入 CDN 资源
 *
 * 支持的资源类型：
 * - .js  → <script> 标签
 * - .css → <link rel="stylesheet">
 * - .woff2 / .woff / .ttf / .otf / .eot → <link rel="stylesheet"> (font-face 自动生成)
 * - 其他扩展名 → 尝试作为样式表加载
 */
import bus from 'src/components/common/bus'

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
 * 注入脚本
 */
function injectScript (dep) {
  const url = dep.url
  const existing = document.querySelector(`head script[src="${url}"]`)
  if (existing) {
    console.log('[CdnDepsBoot] Already injected script:', url)
    return
  }

  const script = document.createElement('script')
  script.src = url
  script.async = true
  script.defer = true
  setCommonAttrs(script, dep)

  script.onload = () => console.log('[CdnDepsBoot] Script loaded:', url)
  script.onerror = () => console.error('[CdnDepsBoot] Script failed:', url)

  document.head.appendChild(script)
  console.log('[CdnDepsBoot] Injected script:', dep.name, '->', url)
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
 * 根据类型注入资源
 */
function injectResource (dep) {
  const type = getResourceType(dep.url)

  switch (type) {
    case 'script':
      injectScript(dep)
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
}

/**
 * 加载并注入已启用的 CDN 依赖
 */
function loadAndInjectCdnDeps () {
  try {
    const raw = localStorage.getItem(CDN_DEPS_STORAGE_KEY)
    if (!raw) {
      console.log('[CdnDepsBoot] No CDN deps configured')
      return
    }

    const deps = JSON.parse(raw)
    if (!Array.isArray(deps) || deps.length === 0) {
      console.log('[CdnDepsBoot] Empty CDN deps array')
      return
    }

    const enabledDeps = deps.filter(dep => dep.enabled && dep.url)
    if (enabledDeps.length === 0) {
      console.log('[CdnDepsBoot] No enabled CDN deps')
      return
    }

    console.log('[CdnDepsBoot] Injecting', enabledDeps.length, 'CDN deps...')
    enabledDeps.forEach(injectResource)
  } catch (err) {
    console.error('[CdnDepsBoot] Error loading CDN deps:', err)
  }
}

export default () => {
  // 启动时注入 CDN 资源
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
