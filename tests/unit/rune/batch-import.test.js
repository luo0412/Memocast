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
//   7) 覆盖模式（replace）的"真实 DB 校验"契约（v2026-08-01）：
//      - replace 模式的 id 必须以 DatabaseClient.runeTemplates.getAll() 返回的数据为准，
//        而不是 options.existingRunes.hint.id。
//      - 这是为了避免：弹框 split 用陈旧快照误判「未重名」，导致同名新行被 INSERT。
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

// v2026-08-01 replace 模式以真实 DB 为准：
//   老契约里 fixture 的 existingRunes 必须同步 mirror 到 DB mock 上，
//   否则新实现会把"DB 里没有"误判为"hint 残留"走新建路径。
function mirrorExistingToDb (existingRunes) {
  DatabaseClient.runeTemplates.getAll.mockResolvedValue(existingRunes || [])
}

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
      mirrorExistingToDb(existingRunes)

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
      mirrorExistingToDb(existingRunes)

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
      mirrorExistingToDb(existingRunes)

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
      mirrorExistingToDb(existingRunes)

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
      mirrorExistingToDb(existingRunes)

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

    test('跳过模式：全部同名时返回空 rows（不调用 saveMany）', async () => {
      const existingRunes = [
        { id: 'rune-001', name: '符文' }
      ]
      const items = [{ name: '符文' }]

      const result = await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'skip',
        existingRunes
      })

      expect(DatabaseClient.runeTemplates.saveMany).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.count).toBe(0)
      expect(result.skipped).toBe(1)
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
        { name: '内部重复' },   // 内部重复，第一次出现，保留
        { name: '内部重复' },   // 内部重复，第二次出现，跳过
        { name: '新符文' }      // 新建
      ]

      const result = await RuneTemplateService.batchImport(items, 'music', {
        conflictMode: 'skip',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(2)
      expect(rows.find(r => r.name === '已有重复')).toBeUndefined()
      expect(rows.find(r => r.name === '内部重复')).toBeDefined()
      expect(rows.find(r => r.name === '新符文')).toBeDefined()
      expect(result.skipped).toBe(2)
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

  // ====================================================================
  // v2026-08-01 新增契约：与 SettingsRunePanel 双栏勾选 UI 配套
  //   1) UI 已经把内置符文名剔除后，下传 items 只包含用户选择项；
  //   2) 当 items 同时含「未重名」与「重名」，父组件以 conflictMode='replace'
  //      提交，service 必须保留所有选项（包括未重名项）；
  //   3) 仅含「未重名」时父组件传 conflictMode='normal'；
  //   4) 未重名项也走新建路径（targetCategory），重名项走 replace 路径。
  // ====================================================================
  // ====================================================================
  // v2026-08-01 replace 模式"真实 DB 校验"契约（Bug 3 解耦）
  //   旧契约：replace 分支直接用 options.existingRunes[?].id 作为 row.id
  //   新契约：replace 分支必须以 DatabaseClient.runeTemplates.getAll() 返回的数据为准。
  //     这样无论 UI 传过来的 existingRunes 多陈旧、服务端永远拿到最新 id。
  // ====================================================================
  describe('replace 模式以真实 DB 为准（v2026-08-01 修复）', () => {
    test('DB 中存在同名 rune（不论 hint 是否命中）：用 DB 的 id 覆盖', async () => {
      // UI hint 与 DB 不一致：hint 指向老 id，DB 已是新 id
      const hintRunes = [
        { id: 'stale-id-001', name: 'X', category_key: 'education' }
      ]
      const dbRunes = [
        { id: 'live-id-007', name: 'X', category_key: 'music' }
      ]
      DatabaseClient.runeTemplates.getAll.mockResolvedValue(dbRunes)

      await RuneTemplateService.batchImport(
        [{ name: 'X' }],
        'general',
        { conflictMode: 'replace', existingRunes: hintRunes }
      )

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(1)
      // 必须用 live-id-007，不能用 stale-id-001
      expect(rows[0].id).toBe('live-id-007')
      // category 必须用 DB 的 'music'，不能用 hint 的 'education'，也不能用 targetCategory 'general'
      expect(rows[0].category_key).toBe('music')
    })

    test('DB 中无同名 rune 但 hint 命中：不复活 hint.id，走新建路径', async () => {
      // UI hint 指向一个已被删除的 id，DB 里没了
      const hintRunes = [
        { id: 'removed-id-001', name: 'Y', category_key: 'education' }
      ]
      // DB 里没有 Y，getAll 返回 []
      DatabaseClient.runeTemplates.getAll.mockResolvedValue([])

      await RuneTemplateService.batchImport(
        [{ name: 'Y' }],
        'general',
        { conflictMode: 'replace', existingRunes: hintRunes }
      )

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(1)
      // 必须是新 id，绝对不能用 removed-id-001
      expect(rows[0].id).toMatch(/^import-/)
      expect(rows[0].id).not.toBe('removed-id-001')
      expect(rows[0].category_key).toBe('general')
    })

    test('DB 与 hint 一致：行为不变（向后兼容）', async () => {
      const consistent = [
        { id: 'rune-001', name: 'Z', category_key: 'research' }
      ]
      DatabaseClient.runeTemplates.getAll.mockResolvedValue(consistent)

      await RuneTemplateService.batchImport(
        [{ name: 'Z' }],
        'general',
        { conflictMode: 'replace', existingRunes: consistent }
      )

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows[0].id).toBe('rune-001')
      expect(rows[0].category_key).toBe('research')
    })

    test('混合场景：hint 命中 A、B、C，DB 里只有 A、C（B 已被删），全部按 DB 走', async () => {
      const hintRunes = [
        { id: 'id-A', name: 'A', category_key: 'music' },
        { id: 'id-B', name: 'B', category_key: 'novel' },
        { id: 'id-C', name: 'C', category_key: 'legal' }
      ]
      // DB 里 B 已被删除
      const dbRunes = [
        { id: 'id-A', name: 'A', category_key: 'music' },
        { id: 'id-C', name: 'C', category_key: 'legal' }
      ]
      DatabaseClient.runeTemplates.getAll.mockResolvedValue(dbRunes)

      await RuneTemplateService.batchImport(
        [
          { name: 'A' },
          { name: 'B' },   // DB 没有 → 新建
          { name: 'C' },
          { name: 'D' }    // DB、hint 都没 → 新建
        ],
        'general',
        { conflictMode: 'replace', existingRunes: hintRunes }
      )

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(4)
      const a = rows.find(r => r.name === 'A')
      const b = rows.find(r => r.name === 'B')
      const c = rows.find(r => r.name === 'C')
      const d = rows.find(r => r.name === 'D')
      // A、C 走覆盖
      expect(a.id).toBe('id-A')
      expect(a.category_key).toBe('music')
      expect(c.id).toBe('id-C')
      expect(c.category_key).toBe('legal')
      // B、D 走新建（绝不能用 id-B 这种 hint id）
      expect(b.id).toMatch(/^import-/)
      expect(b.id).not.toBe('id-B')
      expect(b.category_key).toBe('general')
      expect(d.id).toMatch(/^import-/)
      expect(d.category_key).toBe('general')
    })

    test('replace 模式下，replace 路径必须调 getAll()（至少一次）', async () => {
      const hintRunes = [{ id: 'id-A', name: 'A', category_key: 'music' }]
      DatabaseClient.runeTemplates.getAll.mockResolvedValue([
        { id: 'id-A', name: 'A', category_key: 'music' }
      ])

      await RuneTemplateService.batchImport(
        [{ name: 'A' }],
        'general',
        { conflictMode: 'replace', existingRunes: hintRunes }
      )

      // 关键契约：replace 必须以 DB 为准，所以 getAll 必须被调
      expect(DatabaseClient.runeTemplates.getAll).toHaveBeenCalled()
    })

    test('normal 模式下不必调 getAll（沿用 hint 即可，新增没有 replace 语义）', async () => {
      const hintRunes = [{ id: 'id-A', name: 'A', category_key: 'music' }]
      DatabaseClient.runeTemplates.getAll.mockResolvedValue([
        { id: 'id-A', name: 'A', category_key: 'music' }
      ])

      await RuneTemplateService.batchImport(
        [{ name: 'A' }],
        'gaming',
        { conflictMode: 'normal', existingRunes: hintRunes }
      )

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      // normal 模式直接新建，不查 DB
      expect(rows[0].id).toMatch(/^import-/)
      expect(rows[0].category_key).toBe('gaming')
    })
  })

  describe('双栏勾选导入契约', () => {
    test('混合 new + replace：未重名项新建，重名项覆盖原分类', async () => {
      const existingRunes = [
        { id: 'rune-a', name: '旧符', category_key: 'music' },
        { id: 'rune-b', name: '旧符2', category_key: 'novel' }
      ]
      const items = [
        { name: '旧符' },     // 重名 → replace
        { name: '新符文A' },  // 未重名 → normal
        { name: '新符文B' },  // 未重名 → normal
        { name: '旧符2' }     // 重名 → replace
      ]
      mirrorExistingToDb(existingRunes)

      await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'replace',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(4)
      const replace1 = rows.find(r => r.name === '旧符')
      const replace2 = rows.find(r => r.name === '旧符2')
      const newA = rows.find(r => r.name === '新符文A')
      const newB = rows.find(r => r.name === '新符文B')
      expect(replace1.id).toBe('rune-a')
      expect(replace1.category_key).toBe('music')
      expect(replace2.id).toBe('rune-b')
      expect(replace2.category_key).toBe('novel')
      expect(newA.id).not.toBe('rune-a')
      expect(newA.id).not.toBe('rune-b')
      expect(newA.category_key).toBe('general')
      expect(newB.category_key).toBe('general')
    })

    test('只勾未重名项 + conflictMode=normal：全部使用 targetCategory', async () => {
      const existingRunes = [{ id: 'rune-x', name: '完全无关', category_key: 'finance' }]
      const items = [
        { name: '新符1' },
        { name: '新符2' }
      ]

      await RuneTemplateService.batchImport(items, 'gaming', {
        conflictMode: 'normal',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(2)
      rows.forEach(r => expect(r.category_key).toBe('gaming'))
    })

    test('只勾重名项 + conflictMode=replace：仅覆盖，分类保留', async () => {
      const existingRunes = [
        { id: 'rune-1', name: '覆盖A', category_key: 'research' },
        { id: 'rune-2', name: '覆盖B', category_key: 'legal' }
      ]
      const items = [
        { name: '覆盖A' },
        { name: '覆盖B' }
      ]
      mirrorExistingToDb(existingRunes)

      await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'replace',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(2)
      expect(rows[0].id).toBe('rune-1')
      expect(rows[0].category_key).toBe('research')
      expect(rows[1].id).toBe('rune-2')
      expect(rows[1].category_key).toBe('legal')
    })

    test('UI 已剔除内置名后，service 不再二次过滤（透传）', async () => {
      // 模拟 UI 已过滤：items 内不含任何 BUILTIN_RUNE_TEMPLATE_META.name。
      const existingRunes = []
      const items = [{ name: '用户自定符文' }]

      await RuneTemplateService.batchImport(items, 'general', {
        conflictMode: 'normal',
        existingRunes
      })

      const rows = DatabaseClient.runeTemplates.saveMany.mock.calls[0][0]
      expect(rows.length).toBe(1)
      expect(rows[0].name).toBe('用户自定符文')
    })
  })
})
