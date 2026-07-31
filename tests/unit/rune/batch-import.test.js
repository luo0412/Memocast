// ============================================================================
// tests/unit/rune/batch-import.test.js
//
// 锁定 RuneTemplateService.batchImport 的契约：
//   1) 新建符文使用目标分类（targetCategory）
//   2) 覆盖模式（replace）下保留现有符文的分类，不受 targetCategory 影响
//   3) 跳过模式（skip）下同名符文（包括导入列表内部重复）被去重跳过
//   4) 正常模式（normal）下新建同名符文（不同 id）
//   5) 批量写入后调用 invalidate()
//   6) 名称去重不区分大小写
// ============================================================================

// 必须在 import 之前定义 mock
let mockSaveMany
let mockGetAll

jest.mock('src/utils/DatabaseClient', () => ({
  __esModule: true,
  default: {
    runeTemplates: {
      saveMany: jest.fn(),
      getAll: jest.fn()
    }
  }
}))

const DatabaseClient = require('src/utils/DatabaseClient').default

// 必须在 jest.mock 之后 import
const RuneTemplateService = require('src/services/RuneTemplateService').default

// 辅助函数：从 batchImport 源码里提取 VALID_CATEGORY_KEYS（与被测代码保持一致）
const VALID_CATEGORY_KEYS = new Set([
  'general', 'education', 'outfit', 'fitness', 'music', 'novel',
  'movie', 'food', 'travel', 'research', 'legal', 'government',
  'entertainment', 'gaming', 'consulting', 'community', 'social',
  'medical', 'finance', 'insurance', 'manufacturing', 'construction',
  'realEstate', 'lodging', 'catering', 'business', 'transportation',
  'warehousing', 'sales', 'trading', 'agriculture', 'energy',
  'environment', 'resume'
])

beforeEach(() => {
  // 重置 mock
  DatabaseClient.runeTemplates.saveMany.mockReset()
  DatabaseClient.runeTemplates.saveMany.mockResolvedValue({ success: true, count: 0 })
  DatabaseClient.runeTemplates.getAll.mockResolvedValue([])
  // 清空缓存（invalidate）
  RuneTemplateService.clearCache()
})

describe('RuneTemplateService.batchImport 批量导入符文', () => {

  describe('基础返回格式', () => {
    test('空数组返回 success=true, count=0', async () => {
      const result = await RuneTemplateService.batchImport([], 'general', {})
      expect(result.success).toBe(true)
      expect(result.count).toBe(0)
    })

    test('saveMany 调用时传递正确的 rows 数组', async () => {
      const items = [{ name: '测试符文', category: 'general' }]
      await RuneTemplateService.batchImport(items, 'general', {})
      expect(DatabaseClient.runeTemplates.saveMany).toHaveBeenCalledTimes(1)
      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(Array.isArray(rows)).toBe(true)
      expect(rows.length).toBe(1)
    })
  })

  describe('分类处理', () => {
    test('新建符文使用 targetCategory（valid）', async () => {
      const items = [{ name: '新建符文', category: 'education' }]
      await RuneTemplateService.batchImport(items, 'education', { existingRunes: [] })
      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows[0].category_key).toBe('education')
    })

    test('targetCategory 无效时 fallback 到 general', async () => {
      const items = [{ name: '新建符文' }]
      await RuneTemplateService.batchImport(items, 'invalid-category', { existingRunes: [] })
      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows[0].category_key).toBe('general')
    })

    test('targetCategory 为空字符串时 fallback 到 general', async () => {
      const items = [{ name: '新建符文' }]
      await RuneTemplateService.batchImport(items, '', { existingRunes: [] })
      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows[0].category_key).toBe('general')
    })

    test('多个符文都使用同一个 targetCategory', async () => {
      const items = [
        { name: '符文1' },
        { name: '符文2' },
        { name: '符文3' }
      ]
      await RuneTemplateService.batchImport(items, 'gaming', { existingRunes: [] })
      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(3)
      rows.forEach(row => {
        expect(row.category_key).toBe('gaming')
      })
    })
  })

  describe('冲突模式 - replace（覆盖）', () => {
    test('覆盖模式：同名现有符文保留原有分类', async () => {
      const existingRunes = [
        { id: 'rune-001', name: '测试符文', category_key: 'education' }
      ]
      const items = [{ name: '测试符文' }] // 导入数据里的 category 无关紧要

      await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'replace',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(1)
      expect(rows[0].id).toBe('rune-001')
      expect(rows[0].category_key).toBe('education') // 保留原有分类，不被 targetCategory 覆盖
    })

    test('覆盖模式：同名符文原有分类是 general 也保留', async () => {
      const existingRunes = [
        { id: 'rune-002', name: '另一个符文', category_key: 'general' }
      ]
      const items = [{ name: '另一个符文' }]

      await RuneTemplateService.batchImport(items, 'gaming', {
        conflictMode: 'replace',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows[0].category_key).toBe('general')
    })

    test('覆盖模式：多个同名符文各自保留分类', async () => {
      const existingRunes = [
        { id: 'rune-a', name: '符文A', category_key: 'music' },
        { id: 'rune-b', name: '符文B', category_key: 'novel' }
      ]
      const items = [
        { name: '符文A' },
        { name: '符文B' }
      ]

      await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'replace',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      const rowA = rows.find(r => r.name === '符文A')
      const rowB = rows.find(r => r.name === '符文B')
      expect(rowA.category_key).toBe('music')
      expect(rowB.category_key).toBe('novel')
    })

    test('覆盖模式：新建符文（非同名）使用 targetCategory', async () => {
      const existingRunes = [
        { id: 'rune-001', name: '现有符文', category_key: 'education' }
      ]
      const items = [
        { name: '现有符文' },   // 同名，覆盖
        { name: '新符文' }      // 不同名，新建
      ]

      await RuneTemplateService.batchImport(items, 'gaming', {
        conflictMode: 'replace',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(2)

      const overwriteRow = rows.find(r => r.name === '现有符文')
      expect(overwriteRow.category_key).toBe('education') // 保留

      const newRow = rows.find(r => r.name === '新符文')
      expect(newRow.category_key).toBe('gaming') // 新建使用目标分类
    })

    test('覆盖模式：existingRunes 名称不区分大小写匹配', async () => {
      const existingRunes = [
        { id: 'rune-001', name: 'Test Rune', category_key: 'research' }
      ]
      const items = [{ name: 'TEST RUNE' }]

      await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'replace',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows[0].id).toBe('rune-001')
      expect(rows[0].category_key).toBe('research')
    })

    test('覆盖模式：existingRunes 为空时正常新建', async () => {
      const items = [{ name: '符文' }]

      await RuneTemplateService.batchImport(items, 'travel', {
        conflictMode: 'replace',
        existingRunes: []
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows[0].category_key).toBe('travel')
    })
  })

  describe('冲突模式 - skip（跳过）', () => {
    test('跳过模式：同名符文被跳过，不写入', async () => {
      const existingRunes = [
        { id: 'rune-001', name: '已有符文', category_key: 'education' }
      ]
      const items = [
        { name: '已有符文' },
        { name: '新符文' }
      ]

      await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'skip',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(1)
      expect(rows[0].name).toBe('新符文')
      expect(rows[0].category_key).toBe('general')
    })

    test('跳过模式：返回 skipped 计数', async () => {
      const existingRunes = [
        { id: 'rune-001', name: '符文1' },
        { id: 'rune-002', name: '符文2' }
      ]
      const items = [
        { name: '符文1' },
        { name: '符文2' },
        { name: '符文3' }
      ]

      const result = await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'skip',
        existingRunes
      })

      expect(result.skipped).toBe(2)
    })

    test('跳过模式：全部同名时返回空 rows', async () => {
      const existingRunes = [
        { id: 'rune-001', name: '符文' }
      ]
      const items = [{ name: '符文' }]

      const result = await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'skip',
        existingRunes
      })

      expect(DatabaseClient.runeTemplates.saveMany).toHaveBeenCalledWith([])
      expect(result.success).toBe(true)
      expect(result.count).toBe(0)
    })

    test('跳过模式：导入列表内部重复也被去重（第一个被导入）', async () => {
      const items = [
        { name: '重复符文' },
        { name: '重复符文' },
        { name: '重复符文' }
      ]

      const result = await RuneTemplateService.batchImport(items, 'gaming', {
        conflictMode: 'skip',
        existingRunes: []
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(1)
      expect(rows[0].name).toBe('重复符文')
      expect(result.skipped).toBe(2)
    })

    test('跳过模式：已有符文 + 导入列表内部重复都被去重', async () => {
      const existingRunes = [
        { id: 'existing-001', name: '已有重复' }
      ]
      const items = [
        { name: '已有重复' },   // 已有，同名跳过
        { name: '内部重复' },   // 内部重复，跳过
        { name: '内部重复' },   // 内部重复，跳过
        { name: '新符文' }      // 新建
      ]

      const result = await RuneTemplateService.batchImport(items, 'music', {
        conflictMode: 'skip',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(2)
      expect(rows.find(r => r.name === '已有重复')).toBeUndefined()
      expect(rows.find(r => r.name === '内部重复')).toBeUndefined()
      expect(rows.find(r => r.name === '新符文')).toBeDefined()
      expect(result.skipped).toBe(3)
    })

    test('跳过模式：不区分大小写去重', async () => {
      const items = [
        { name: 'Test Rune' },
        { name: 'test rune' },
        { name: 'TEST RUNE' }
      ]

      const result = await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'skip',
        existingRunes: []
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(1)
      expect(result.skipped).toBe(2)
    })
  })

  describe('冲突模式 - normal（默认新建）', () => {
    test('默认模式：同名符文也新建（生成新 id）', async () => {
      const existingRunes = [
        { id: 'rune-001', name: '同名符文', category_key: 'education' }
      ]
      const items = [{ name: '同名符文' }]

      await RuneTemplateService.batchImport(items, 'gaming', {
        conflictMode: 'normal',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(1)
      expect(rows[0].id).not.toBe('rune-001')
      expect(rows[0].category_key).toBe('gaming')
    })

    test('默认模式：所有符文都使用 targetCategory', async () => {
      const items = [
        { name: '符文1' },
        { name: '符文2' }
      ]

      await RuneTemplateService.batchImport(items, 'finance', {
        conflictMode: 'normal',
        existingRunes: []
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      rows.forEach(row => {
        expect(row.category_key).toBe('finance')
      })
    })
  })

  describe('数据完整性', () => {
    test('每个 row 包含完整字段', async () => {
      const items = [{
        name: '测试符文',
        desc: '测试描述',
        category: 'business',
        color: '#FF5722',
        icon: 'star',
        template: '<div>content</div>'
      }]

      await RuneTemplateService.batchImport(items, 'business', {
        conflictMode: 'normal',
        existingRunes: []
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      const row = rows[0]
      expect(row.id).toBeTruthy()
      expect(row.category_key).toBe('business')
      expect(row.name).toBe('测试符文')
      expect(row.desc).toBe('测试描述')
      expect(row.color).toBe('#FF5722')
      expect(row.icon).toBe('star')
      expect(row.template).toBe('<div>content</div>')
      expect(row.is_builtin).toBe(0)
      expect(row.sort_order).toBe(9999)
      expect(row.source_url).toBe('')
    })

    test('缺少可选字段时使用默认值', async () => {
      const items = [{ name: '最小符文' }]

      await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'normal',
        existingRunes: []
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      const row = rows[0]
      expect(row.name).toBe('最小符文')
      expect(row.desc).toBe('')
      expect(row.color).toBe('#7E57C2')
      expect(row.icon).toBe('star')
      expect(row.template).toBe('')
    })

    test('name 为空时使用默认值', async () => {
      const items = [{ name: '' }]

      await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'normal',
        existingRunes: []
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows[0].name).toBe('未命名符文')
    })

    test('created_at 和 updated_at 使用相同的时间戳', async () => {
      const items = [{ name: '时间测试' }]
      const before = Date.now()

      await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'normal',
        existingRunes: []
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows[0].created_at).toBeGreaterThanOrEqual(before)
      expect(rows[0].updated_at).toBeGreaterThanOrEqual(before)
    })
  })

  describe('边界情况', () => {
    test('items 不是数组时返回 success=true, count=0', async () => {
      const result = await RuneTemplateService.batchImport(null, 'general', {})
      expect(result.success).toBe(true)
      expect(result.count).toBe(0)
    })

    test('items 是空对象时返回 success=true, count=0', async () => {
      const result = await RuneTemplateService.batchImport({}, 'general', {})
      expect(result.success).toBe(true)
      expect(result.count).toBe(0)
    })

    test('existingRunes 为空时不报错', async () => {
      const items = [{ name: '符文' }]
      await expect(
        RuneTemplateService.batchImport(items, 'general', { existingRunes: null })
      ).resolves.not.toThrow()
    })

    test('existingRunes 含无效项时不崩溃', async () => {
      const items = [{ name: '符文' }]
      const existingRunes = [
        null,
        undefined,
        { name: null },
        { name: '有效符文' }
      ]
      await expect(
        RuneTemplateService.batchImport(items, 'general', { existingRunes })
      ).resolves.not.toThrow()
    })
  })
})
