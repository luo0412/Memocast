/**
 * 路径 hash ID 生成 —— 与 E:\work-前端\note\gulpfile.js 的 cyrb53 + base36 行为对齐
 *
 * 关键约束：
 *   1) 算法确定性：相同输入必产生相同输出 → 二次构建产物可 byte-identical
 *   2) hash 输入会剥离 ❤ / ❤️ / 变体选择符，避免展示符号影响短链 ID
 *   3) 输出 ≈ 26 字符 Base36，含字母数字
 *
 * 不要轻易改算法；改了就破坏了与参考项目的 ID 兼容性与现有外部链接。
 */

'use strict'

// 与参考项目保持完全一致的字符集
const BASE36_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'

// ❤ (U+2764) 与变体选择符 (U+FE0F) 在 hash 输入中需要忽略
const HEART_HASH_REGEX = /[\u2764\uFE0F]/g

function normalizeForHash(value) {
  return String(value || '').replace(HEART_HASH_REGEX, '')
}

// 参考 gulpfile.js 的 cyrb53：两个 32 位 hash 拼成 64 位
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  // 用 Number 直接保存，参考项目也是这种做法
  // 返回 53 位有效数字内的伪 64 位整数
  // eslint-disable-next-line no-undef
  return h2 * 4294967296 + (h1 >>> 0)
}

function toBase36(num) {
  let n = Math.floor(num)
  if (n <= 0) return '0'
  let result = ''
  while (n > 0) {
    result = BASE36_CHARS[n % 36] + result
    n = Math.floor(n / 36)
  }
  return result
}

/**
 * 生成稳定的短链 ID
 * @param {string} origBasename 原始 basename（不含扩展名）
 * @param {string} dir 文件所在目录（建议用正斜杠）
 * @returns {string} ≈ 26 字符 Base36 ID
 */
function genId(origBasename, dir) {
  const hashInput = normalizeForHash(origBasename) + '|' + normalizeForHash(dir)
  const h1 = cyrb53(hashInput, 0)
  const h2 = cyrb53(hashInput, 1)
  return toBase36(h1) + toBase36(h2)
}

/**
 * 从文件名（如 `01-foo.md`）中提取原始序号。
 * 不匹配则返回 null（表示无序号，排序时排到末尾）。
 * @param {string} basename
 * @returns {number|null}
 */
function extractSeq(basename) {
  const m = String(basename || '').match(/^(\d+)-/)
  return m ? parseInt(m[1], 10) : null
}

module.exports = {
  genId,
  extractSeq,
  normalizeForHash,
  cyrb53,
  toBase36
}