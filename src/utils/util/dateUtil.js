/**
 * 时间格式化工具
 *
 * 从 src/utils/helper.js 抽出 `displayDateElegantly`，作为"友好时间表达"通用工具。
 * 任何 .vue / .js 中都可以通过 `this.$utils.dateUtil.displayDateElegantly(...)` 调用。
 */

/**
 * 友好时间表达
 * @param {number} date 毫秒数
 * @returns {string} just now / 10m ago / 2h ago / 3d ago / 2024/1/1
 */
export function displayDateElegantly (date) {
  let currentTime = new Date().getTime()
  currentTime = (currentTime - date) / 1000

  if (currentTime < 60 * 10) {
    return 'just now'
  }
  if (currentTime < 60 * 60 && currentTime >= 60 * 10) {
    const n = Math.floor(currentTime / 60)
    return `${n}m ago`
  }
  if (currentTime < 60 * 60 * 24 && currentTime >= 60 * 60) {
    const n = Math.floor(currentTime / 60 / 60)
    return `${n}h ago`
  }
  if (currentTime < 60 * 60 * 24 * 7 && currentTime >= 60 * 60 * 24) {
    const n = Math.floor(currentTime / 60 / 60 / 24)
    return `${n}d ago`
  }
  const d = new Date(date)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}