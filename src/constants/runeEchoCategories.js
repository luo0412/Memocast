// 符文 / 回响的分类定义。
// - 符文分类:通用 + 行业场景
// - 回响分类:内置 + 标记 + 排版
//
// 分类使用 i18n key 作为内部标识，避免硬编码中文，便于多语言切换。
// 中文显示字符串通过 i18n 在 SettingsDialog.js 中翻译。
// 列表顺序即在垂直 tab 中的展示顺序。

export const RUNE_CATEGORIES = Object.freeze([
  { value: 'general', i18nKey: 'runeCategoryGeneral' },
  { value: 'education', i18nKey: 'runeCategoryEducation' },
  { value: 'research', i18nKey: 'runeCategoryResearch' },
  { value: 'legal', i18nKey: 'runeCategoryLegal' },
  { value: 'government', i18nKey: 'runeCategoryGovernment' },
  { value: 'entertainment', i18nKey: 'runeCategoryEntertainment' },
  { value: 'gaming', i18nKey: 'runeCategoryGaming' },
  { value: 'consulting', i18nKey: 'runeCategoryConsulting' },
  { value: 'community', i18nKey: 'runeCategoryCommunity' },
  { value: 'social', i18nKey: 'runeCategorySocial' },
  { value: 'medical', i18nKey: 'runeCategoryMedical' },
  { value: 'finance', i18nKey: 'runeCategoryFinance' },
  { value: 'insurance', i18nKey: 'runeCategoryInsurance' },
  { value: 'manufacturing', i18nKey: 'runeCategoryManufacturing' },
  { value: 'construction', i18nKey: 'runeCategoryConstruction' },
  { value: 'realEstate', i18nKey: 'runeCategoryRealEstate' },
  { value: 'lodging', i18nKey: 'runeCategoryLodging' },
  { value: 'catering', i18nKey: 'runeCategoryCatering' },
  { value: 'travel', i18nKey: 'runeCategoryTravel' },
  { value: 'business', i18nKey: 'runeCategoryBusiness' },
  { value: 'transportation', i18nKey: 'runeCategoryTransportation' },
  { value: 'warehousing', i18nKey: 'runeCategoryWarehousing' },
  { value: 'sales', i18nKey: 'runeCategorySales' },
  { value: 'trading', i18nKey: 'runeCategoryTrading' },
  { value: 'agriculture', i18nKey: 'runeCategoryAgriculture' },
  { value: 'energy', i18nKey: 'runeCategoryEnergy' },
  { value: 'environment', i18nKey: 'runeCategoryEnvironment' }
])

export const ECHO_CATEGORIES = Object.freeze([
  { value: 'builtin', i18nKey: 'echoCategoryBuiltin' },
  { value: 'marker', i18nKey: 'echoCategoryMarker' },
  { value: 'typography', i18nKey: 'echoCategoryTypography' }
])

export const DEFAULT_RUNE_CATEGORY = 'general'
export const DEFAULT_ECHO_CATEGORY = 'marker'

export const RUNE_CATEGORY_VALUES = Object.freeze(RUNE_CATEGORIES.map(c => c.value))
export const ECHO_CATEGORY_VALUES = Object.freeze(ECHO_CATEGORIES.map(c => c.value))

export const getRuneCategoryValue = (raw) => {
  const value = String(raw || '').trim()
  if (RUNE_CATEGORY_VALUES.includes(value)) return value
  return DEFAULT_RUNE_CATEGORY
}

export const getEchoCategoryValue = (raw, isBuiltin = false) => {
  const value = String(raw || '').trim()
  if (ECHO_CATEGORY_VALUES.includes(value)) return value
  // 内置 echo 强制归属到 builtin 分类
  if (isBuiltin) return 'builtin'
  return DEFAULT_ECHO_CATEGORY
}

export const getRuneCategoryLabel = (value) => {
  const found = RUNE_CATEGORIES.find(c => c.value === value)
  return found ? found.i18nKey : 'runeCategoryGeneral'
}

export const getEchoCategoryLabel = (value) => {
  const found = ECHO_CATEGORIES.find(c => c.value === value)
  return found ? found.i18nKey : 'echoCategoryMarker'
}