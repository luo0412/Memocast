// _temp/blog/cyrb53.js
// 双重 cyrb53 + Base36 ID 算法（参考 §2.2 / §2.3）
'use strict'

function cyrb53 (str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

function toBase36 (num) {
  return num.toString(36)
}

function normalizeForHash (value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .toLowerCase()
}

function cyrb53Base36Id (basename, dir) {
  const norm = normalizeForHash(`${dir.replace(/[\\/]+$/, '')}/${basename}`)
  const a = cyrb53(norm, 0)
  const b = cyrb53(norm, a)
  return toBase36(a) + toBase36(b)
}

function shortlinkId (dir, base) {
  return cyrb53Base36Id(base, dir)
}

function permalinkFor (dir, base) {
  return `/${shortlinkId(dir, base)}.html`
}

module.exports = {
  cyrb53,
  toBase36,
  normalizeForHash,
  cyrb53Base36Id,
  shortlinkId,
  permalinkFor
}