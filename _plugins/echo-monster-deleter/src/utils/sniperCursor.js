// ============================================================================
// sniperCursor.js —— 把 PyQt 里 QPainter 画的红色十字狙击光标
// 做成 SVG 资源文件路径，方便直接给目标元素 cursor 用。
// 参考：main.py:init_targeting_ui() —— 外圈 + 上下左右四个短线 + 中心点。
//
// 注意：EGG Electron 内嵌 Chromium 100% 支持 SVG cursor，过去用 inline
// dataURL 的方式在长 base64 嵌入时偶尔会被某些 GPU 驱动忽略 —— 改为
// 独立 SVG 文件由 Vite 静态处理，URL 路径更稳定。
// ============================================================================

const CENTER = 16
const RADIUS = 12
const GAP = 4
const SIZE = CENTER * 2

// Vite 会把这张 SVG 拷到 dist/assets/ 下，运行时拿到的是 /assets/sniper-XXXX.svg
const SNIPER_CURSOR_URL = new URL('../assets/cursor/sniper.svg', import.meta.url).href

// 备用 inline data URI（极简化版），以防静态资源加载失败时仍能保持基本光标
const FALLBACK_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='${SIZE}' height='${SIZE}' viewBox='0 0 ${SIZE} ${SIZE}'>` +
  `<circle cx='${CENTER}' cy='${CENTER}' r='${RADIUS}' stroke='red' stroke-width='2' fill='none'/>` +
  `<line x1='${CENTER}' y1='0' x2='${CENTER}' y2='${CENTER - GAP}' stroke='red' stroke-width='2'/>` +
  `<line x1='${CENTER}' y1='${CENTER + GAP}' x2='${CENTER}' y2='${SIZE}' stroke='red' stroke-width='2'/>` +
  `<line x1='0' y1='${CENTER}' x2='${CENTER - GAP}' y2='${CENTER}' stroke='red' stroke-width='2'/>` +
  `<line x1='${CENTER + GAP}' y1='${CENTER}' x2='${SIZE}' y2='${CENTER}' stroke='red' stroke-width='2'/>` +
  `</svg>`
)}`

export const SNIPER_CURSOR_URL_HREF = SNIPER_CURSOR_URL
export const SNIPER_CURSOR_DATA_URL = SNIPER_CURSOR_URL // 兼容旧名
export const SNIPER_CURSOR_FALLBACK = FALLBACK_DATA_URL
export const SNIPER_CURSOR_HOTSPOT = { x: CENTER, y: CENTER }
