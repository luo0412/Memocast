/**
 * enumToI18nOptions
 *
 * 把 enum-plus 枚举转成 el-select / a-select-option / q-option-group
 * / q-select 等需要的 `{ value, label }` 列表，自动用当前 Vue 实例的
 * $t 翻译 label。
 *
 *   enumToI18nOptions(this, NoteOrderTypeEnum)
 *   enumToI18nOptions(this, NoteOrderTypeEnum, { extraFields: ['tagType'] })
 *
 * options:
 *   - t:               自定义翻译函数，默认 vm.$t
 *   - valueField:      输出对象的 value 字段名，默认 'value'
 *   - labelField:      输出对象的 label 字段名，默认 'label'
 *   - extraFields:     透传到结果里的额外字段（来自枚举项原始定义）
 *   - fallbackLabel:   label 拿不到时的兜底，默认沿用 value 本身
 */

const I18N_KEY_LIKE = /^[A-Za-z][A-Za-z0-9_.\-:]*$/

export function enumToI18nOptions (vm, enumInst, options = {}) {
  if (!enumInst || typeof enumInst.toList !== 'function') {
    return []
  }
  const {
    t = (key) => (vm && typeof vm.$t === 'function' ? vm.$t(key) : key),
    valueField = 'value',
    labelField = 'label',
    extraFields = [],
    fallbackLabel = null
  } = options

  const items = Array.isArray(enumInst.items) ? enumInst.items : []
  return items.map((item) => {
    const rawLabel = item.label
    const isLikelyI18nKey =
      typeof rawLabel === 'string' && I18N_KEY_LIKE.test(rawLabel)

    const translated = isLikelyI18nKey ? t(rawLabel) : rawLabel
    const finalLabel =
      translated == null || (translated === rawLabel && isLikelyI18nKey && fallbackLabel != null)
        ? fallbackLabel
        : translated

    const out = {
      [valueField]: item.value,
      [labelField]: finalLabel != null ? finalLabel : rawLabel
    }

    if (extraFields && extraFields.length) {
      const raw = item.raw || {}
      extraFields.forEach((field) => {
        if (raw[field] !== undefined) out[field] = raw[field]
      })
    }
    return out
  })
}