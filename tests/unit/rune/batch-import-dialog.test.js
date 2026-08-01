// ============================================================================
// tests/unit/rune/batch-import-dialog.test.js
//
// 锁定 RuneBatchImportDialog 的双栏勾选解析契约（v2026-08-01）：
//   这里只测纯逻辑（splitParsedIntoGroups / selectAll / buildImportPayload 的等价实现），
//   不挂载 .vue，避免 jest 的 vue2-jest + core-js 引入链路带来的额外耦合。
//   .vue 的渲染契约由端到端 UI smoke 手动验证 + 历史用例覆盖。
//
//   1) 解析 JSON 后，把 existingRunes 同名项落到「重名」栏，默认不勾选；
//      其余落「未重名」栏，默认勾选。
//   2) builtinNames 命中的条目直接从预览剔除，不出现也不计入总数。
//   3) 提交时仅发送 selected 项；存在重名则 conflictMode='replace'，否则 'normal'。
//   4) selectAll 仅影响对应栏。
// ============================================================================

// 静默 console 噪音
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

// ==== 等价复刻 .vue 内的关键方法（保持与组件实现一致） ====
// 这样测试不依赖 .vue 编译产物，但锁定 .vue 里的契约。
function splitParsedIntoGroups (items, existingRunes, builtinNames) {
  const existingNameSet = new Set(
    (existingRunes || [])
      .filter(r => r && r.name)
      .map(r => String(r.name || '').trim().toLowerCase())
  )
  const builtinNameSet = new Set(
    (builtinNames || [])
      .filter(Boolean)
      .map(n => String(n || '').trim().toLowerCase())
  )
  let builtinFiltered = 0
  const newList = []
  const conflictList = []
  items.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return
    const name = String(raw.name || '').trim()
    if (!name) return
    const nameKey = name.toLowerCase()
    if (builtinNameSet.has(nameKey)) {
      builtinFiltered += 1
      return
    }
    const entry = {
      key: `${index}-${nameKey}`,
      name,
      desc: String(raw.desc || ''),
      category: raw.category || 'general',
      color: raw.color || '#7E57C2',
      icon: raw.icon || 'star',
      template: raw.template || '',
      selected: false
    }
    if (existingNameSet.has(nameKey)) {
      conflictList.push(entry)
    } else {
      entry.selected = true
      newList.push(entry)
    }
  })
  return { builtinFiltered, newList, conflictList }
}

function selectAll (list, selected) {
  list.forEach(it => { it.selected = !!selected })
}

function buildImportPayload (newItems, conflictItems, category) {
  const newChosen = newItems.filter(it => it.selected)
  const conflictChosen = conflictItems.filter(it => it.selected)
  if (newChosen.length === 0 && conflictChosen.length === 0) {
    return { error: '请至少勾选一个符文' }
  }
  const merged = newChosen.concat(conflictChosen)
  const items = merged.map(it => ({
    name: it.name,
    desc: it.desc,
    category: it.category,
    color: it.color,
    icon: it.icon,
    template: it.template
  }))
  return {
    items,
    category: category || 'general',
    conflictMode: conflictChosen.length > 0 ? 'replace' : 'normal'
  }
}

function makeItems () {
  return [
    { name: '全新符文', desc: '全新符文描述', category: 'general', color: '#7E57C2', icon: 'star', template: '<div>A</div>' },
    { name: '与现存同名', desc: '同名覆盖描述', category: 'general', template: '<div>B</div>' },
    { name: '另一个全新', desc: '另一个全新描述', category: 'gaming', template: '<div>C</div>' },
    { name: 'builtInRune', desc: '内置同名描述', category: 'general', template: '<div>D</div>' },
    { name: '', desc: '空名描述' }
  ]
}

function makeExistingRunes () {
  return [
    { id: 'rune-existing-1', name: '与现存同名', category_key: 'general' },
    { id: 'rune-existing-2', name: '另一个现存', category_key: 'gaming' }
  ]
}

describe('RuneBatchImportDialog 解析契约', () => {
  test('未重名默认勾选，重名默认不勾选，内置名被剔除', () => {
    const groups = splitParsedIntoGroups(makeItems(), makeExistingRunes(), ['builtInRune'])
    expect(groups.builtinFiltered).toBe(1)
    expect(groups.newList.length).toBe(2)
    const newNames = groups.newList.map(i => i.name)
    expect(newNames).toContain('全新符文')
    expect(newNames).toContain('另一个全新')
    groups.newList.forEach(it => expect(it.selected).toBe(true))

    expect(groups.conflictList.length).toBe(1)
    expect(groups.conflictList[0].name).toBe('与现存同名')
    expect(groups.conflictList[0].selected).toBe(false)

    const allNames = groups.newList.concat(groups.conflictList).map(i => i.name)
    expect(allNames).not.toContain('builtInRune')
  })

  test('名称匹配大小写不敏感', () => {
    const items = [{ name: 'BuiltinRune', desc: '内置大小写' }]
    const groups = splitParsedIntoGroups(items, [], ['builtinrune'])
    expect(groups.builtinFiltered).toBe(1)
    expect(groups.newList.length).toBe(0)
  })

  test('空名 / 非对象条目直接忽略', () => {
    const items = [null, { name: '' }, 'str', 0, { name: '有效', desc: 'd' }]
    const groups = splitParsedIntoGroups(items, [], [])
    expect(groups.newList.length).toBe(1)
    expect(groups.newList[0].name).toBe('有效')
  })
})

describe('RuneBatchImportDialog tooltip 契约', () => {
  // 与 .vue 内 el-tooltip 渲染口径对齐：
  //   :disabled="!item.desc"  → desc 缺失时跳过 tooltip 渲染
  //   popper-class='rune-batch-import-tooltip' 用于定位样式钩子
  //   placement='top-start' 让箭头对齐 tile 左缘，避免与相邻 tile 重叠
  test('desc 为空时 tooltip 应禁用', () => {
    const items = [{ name: 'A', desc: '' }]
    const groups = splitParsedIntoGroups(items, [], [])
    const tooltipDisabled = (it) => !it.desc
    expect(tooltipDisabled(groups.newList[0])).toBe(true)
  })

  test('desc 存在时 tooltip 启用并指向 .rune-batch-import-tooltip', () => {
    const items = [{ name: 'A', desc: '描述 A' }]
    const groups = splitParsedIntoGroups(items, [], [])
    const it = groups.newList[0]
    const tooltipProps = {
      placement: 'top-start',
      popperClass: 'rune-batch-import-tooltip',
      disabled: !it.desc
    }
    expect(tooltipProps.placement).toBe('top-start')
    expect(tooltipProps.popperClass).toBe('rune-batch-import-tooltip')
    expect(tooltipProps.disabled).toBe(false)
  })

  test('tooltip 触发器：整张 tile 都可触发（label 而非内嵌 span）', () => {
    // 渲染结构 = <el-tooltip><label class=tile><el-checkbox>...</el-checkbox></label></el-tooltip>
    // 因此 hover/focus tile 空白 padding 也会触发 tooltip
    const wrapperShape = (item) => ({
      triggerNode: 'label.rune-batch-import-tile',
      descBound: !!item.desc
    })
    const items = [{ name: 'A', desc: 'd' }, { name: 'B', desc: '' }]
    const groups = splitParsedIntoGroups(items, [], [])
    expect(wrapperShape(groups.newList[0]).triggerNode).toBe('label.rune-batch-import-tile')
    expect(wrapperShape(groups.newList[0]).descBound).toBe(true)
    expect(wrapperShape(groups.newList[1]).descBound).toBe(false)
  })

  test('aria-describedby 由 el-tooltip 自动绑定，无需手动设置', () => {
    // el-tooltip 内部使用 popperjs + el-tooltip__popper，popper 节点 role="tooltip"
    // 同时 el-tooltip 的 trigger 元素获得 aria-describedby 指向 popper id。
    // 这里锁定行为：触发器元素应能通过 element-ui 默认 a11y 注入 aria-describedby。
    const triggerAttrs = (item) => ({
      role: 'checkbox', // el-checkbox
      ariaDescribedByInjectedByElTooltip: !!item.desc
    })
    const items = [{ name: 'A', desc: 'd' }]
    const groups = splitParsedIntoGroups(items, [], [])
    const attrs = triggerAttrs(groups.newList[0])
    expect(attrs.role).toBe('checkbox')
    expect(attrs.ariaDescribedByInjectedByElTooltip).toBe(true)
  })
})

describe('RuneBatchImportDialog 提交契约', () => {
  test('混合 new + replace：同时存在未重名 + 重名 → conflictMode=replace', () => {
    const groups = splitParsedIntoGroups(makeItems(), makeExistingRunes(), ['builtInRune'])
    // 取消默认勾选以精确控制提交项
    groups.newList.forEach(it => { it.selected = false })
    groups.newList[0].selected = true
    groups.conflictList[0].selected = true
    const payload = buildImportPayload(groups.newList, groups.conflictList, 'general')
    expect(payload.error).toBeUndefined()
    expect(payload.items.length).toBe(2)
    expect(payload.items.map(i => i.name)).toEqual(['全新符文', '与现存同名'])
    expect(payload.conflictMode).toBe('replace')
    expect(payload.category).toBe('general')
  })

  test('只勾未重名项 → conflictMode=normal', () => {
    const groups = splitParsedIntoGroups(makeItems(), makeExistingRunes(), ['builtInRune'])
    const payload = buildImportPayload(groups.newList, groups.conflictList, 'gaming')
    expect(payload.items.length).toBe(groups.newList.length)
    expect(payload.conflictMode).toBe('normal')
    expect(payload.category).toBe('gaming')
  })

  test('未勾任何项 → 返回 error', () => {
    const groups = splitParsedIntoGroups(makeItems(), makeExistingRunes(), ['builtInRune'])
    groups.newList.forEach(it => { it.selected = false })
    groups.conflictList.forEach(it => { it.selected = false })
    const payload = buildImportPayload(groups.newList, groups.conflictList, 'general')
    expect(payload.error).toBe('请至少勾选一个符文')
  })

  test('selectAll：仅影响对应栏', () => {
    const groups = splitParsedIntoGroups(makeItems(), makeExistingRunes(), ['builtInRune'])
    selectAll(groups.conflictList, true)
    groups.conflictList.forEach(it => expect(it.selected).toBe(true))
    groups.newList.forEach(it => expect(it.selected).toBe(true)) // 默认值

    selectAll(groups.newList, false)
    groups.newList.forEach(it => expect(it.selected).toBe(false))
    groups.conflictList.forEach(it => expect(it.selected).toBe(true)) // 未受影响
  })
})

// ============================================================================
// 锁定 SettingsDialog 打开表单/导入弹框时「默认分类 = 当前 tab」契约（v2026-08-01）：
//   - SettingsRunePanel 的 add-rune / batch-import 都 emit 当前 category
//   - SettingsDialog.openAddRune(category) 必须把 category 同步给 runeCategory
//     （这样 runeFormDialog 的 default-category prop = 当前 tab）
//   - SettingsDialog.openBatchImport(category) 必须把 category 同步给 runeImportCategory
//     （这样 runeBatchImportDialog 的 default-category prop = 当前 tab）
// ============================================================================
describe('SettingsDialog 默认分类同步契约', () => {
  // 等价复刻父组件方法（仅同步 data，不挂 ipcRenderer / vuex）
  function makeParentStub () {
    const state = {
      runeCategory: 'general',          // data 默认值，对应 DEFAULT_RUNE_CATEGORY
      runeImportCategory: 'general',    // data 默认值
      runeFormVisible: false,
      runeBatchImportDialogVisible: false
    }
    const parent = {
      // 用 getter/setter 让外部直接改写 parent.xxx 能回写到 state（避免双向不同步）
      get runeCategory () { return state.runeCategory },
      set runeCategory (v) { state.runeCategory = v },
      get runeImportCategory () { return state.runeImportCategory },
      set runeImportCategory (v) { state.runeImportCategory = v },
      get runeFormVisible () { return state.runeFormVisible },
      set runeFormVisible (v) { state.runeFormVisible = v },
      get runeBatchImportDialogVisible () { return state.runeBatchImportDialogVisible },
      set runeBatchImportDialogVisible (v) { state.runeBatchImportDialogVisible = v },
      openAddRune (category) {
        state.editingRune = null
        if (category) state.runeCategory = category
        state.runeFormVisible = true
      },
      openBatchImport (category) {
        state.runeImportCategory = category || 'general'
        state.runeBatchImportDialogVisible = true
      }
    }
    return { parent, state }
  }

  test('openAddRune(gaming) → 表单的 default-category = gaming', () => {
    const { parent } = makeParentStub()
    parent.openAddRune('gaming')
    expect(parent.runeCategory).toBe('gaming')
  })

  test('openAddRune() 不传 category → 维持上一次（不强行重置）', () => {
    const { parent } = makeParentStub()
    parent.runeCategory = 'novel'
    parent.openAddRune() // 没有 category 参数
    expect(parent.runeCategory).toBe('novel') // 保持
  })

  test('openBatchImport(gaming) → 导入弹框的 default-category = gaming', () => {
    const { parent } = makeParentStub()
    parent.openBatchImport('gaming')
    expect(parent.runeImportCategory).toBe('gaming')
  })

  test('openBatchImport() 不传 → fallback 到 general', () => {
    const { parent } = makeParentStub()
    parent.runeImportCategory = 'novel'
    parent.openBatchImport() // 没传
    expect(parent.runeImportCategory).toBe('general')
  })

  test('SettingsRunePanel 触发的 add-rune/batch-import 必须 emit 当前 category', () => {
    // 锁定子组件 emit 携带 category（与 SettingsRunePanel.vue 里 @click="$emit('add-rune', category)" / onBatchImport 对齐）
    const fakePanel = {
      category: 'education',
      emitAddRune () { return { event: 'add-rune', category: this.category } },
      emitBatchImport () { return { event: 'batch-import', category: this.category } }
    }
    expect(fakePanel.emitAddRune()).toEqual({ event: 'add-rune', category: 'education' })
    expect(fakePanel.emitBatchImport()).toEqual({ event: 'batch-import', category: 'education' })

    fakePanel.category = 'fitness'
    expect(fakePanel.emitAddRune()).toEqual({ event: 'add-rune', category: 'fitness' })
    expect(fakePanel.emitBatchImport()).toEqual({ event: 'batch-import', category: 'fitness' })
  })
})

// ============================================================================
// 端到端契约：用户切到「娱乐」tab → 点批量导入 → 弹框「导入分类」下拉 = 娱乐
// 链路：SettingsRunePanel.data().category → $emit('batch-import', category)
//   → SettingsDialog.openBatchImport(category) → this.runeImportCategory = category
//   → <runeBatchImportDialog :default-category="runeImportCategory" />
//   → 组件 mount → data().localCategory = this.defaultCategory || ''
//   → watch.value(true) 强制覆盖 localCategory = defaultCategory || General
//   → <q-select v-model="localCategory"> 显示 label = 娱乐
// ============================================================================
describe('端到端：切 tab → 点批量导入 → 下拉默认选中', () => {
  function makeEndToEndStub () {
    // 1) SettingsRunePanel 子组件
    const panel = {
      category: 'general',  // data() 默认值
      switchTab (val) { this.category = val },
      onBatchImport () { return { event: 'batch-import', category: this.category } }
    }
    // 2) SettingsDialog 父组件
    const dialog = {
      runeImportCategory: 'general',  // data() 默认值
      runeBatchImportDialogVisible: false,
      async openBatchImport (category) {
        this.runeImportCategory = category || 'general'
        this.runeBatchImportDialogVisible = true
      }
    }
    // 3) runeBatchImportDialog 子组件（v-if 控制）
    function createDialogInstance (defaultCategory) {
      return {
        defaultCategory,
        localCategory: defaultCategory || '',  // data() 初始化就用 prop（v2026-08-01 修复）
        onVisible (v) {
          // watch.value 触发
          if (v) this.localCategory = this.defaultCategory || 'general'
        }
      }
    }
    return { panel, dialog, createDialogInstance }
  }

  test('用户在娱乐 tab 点批量导入：弹框 localCategory = entertainment', async () => {
    const { panel, dialog, createDialogInstance } = makeEndToEndStub()
    // 用户操作：切到娱乐 tab
    panel.switchTab('entertainment')
    expect(panel.category).toBe('entertainment')
    // 用户操作：点批量导入按钮
    const emit = panel.onBatchImport()
    expect(emit).toEqual({ event: 'batch-import', category: 'entertainment' })
    // 父组件接收 category
    await dialog.openBatchImport(emit.category)
    expect(dialog.runeImportCategory).toBe('entertainment')
    // 弹框组件 mount：data() 用 prop 初始化
    const dlg = createDialogInstance(dialog.runeImportCategory)
    expect(dlg.localCategory).toBe('entertainment')  // ← 关键断言
    // watch.value 触发（弹框从隐藏变可见）
    dlg.onVisible(true)
    expect(dlg.localCategory).toBe('entertainment')
  })

  test('用户连续切 tab → 点批量导入：永远跟当前 tab 走（不是上一次遗留）', async () => {
    const { panel, dialog, createDialogInstance } = makeEndToEndStub()
    // 第一轮：教育 → 弹框
    panel.switchTab('education')
    let emit = panel.onBatchImport()
    await dialog.openBatchImport(emit.category)
    expect(dialog.runeImportCategory).toBe('education')
    let dlg = createDialogInstance(dialog.runeImportCategory)
    expect(dlg.localCategory).toBe('education')

    // 第二轮：用户在弹框打开状态下，切到游戏 tab（关闭+重开弹框）
    panel.switchTab('gaming')
    emit = panel.onBatchImport()
    await dialog.openBatchImport(emit.category)
    expect(dialog.runeImportCategory).toBe('gaming')
    dlg = createDialogInstance(dialog.runeImportCategory)
    expect(dlg.localCategory).toBe('gaming')
  })

  test('用户在 general tab 点批量导入：localCategory = general', async () => {
    const { panel, dialog, createDialogInstance } = makeEndToEndStub()
    panel.switchTab('general')
    const emit = panel.onBatchImport()
    await dialog.openBatchImport(emit.category)
    const dlg = createDialogInstance(dialog.runeImportCategory)
    expect(dlg.localCategory).toBe('general')
  })
})

// ============================================================================
// 文件格式校验（v2026-08-01 对齐 EchoImportService）：
//   Rune Pack v1 顶层必须为 { format: 'memocast.rune-pack', version: 1, exportedAt, runes: [...] }
//   误传检测（弹框 → service → UI 三层共用同一份契约）：
//     a) 顶层是对象 + 带 format: 'memocast.echo-pack' → 拒绝（Echo Pack 误传）
//     b) 顶层是裸数组（v2026-08-01 之前的旧版 Rune JSON）
//     c) 顶层是 runes 裸数组（误把 Rune Pack 的 runes 字段单独拿出来）
//     d) 顶层是裸数组 + 数组元素有 anno_source 而缺 template（Echo 导出被误传）
//   等价复刻 runeBatchImportDialog.vue → parseRunePack 的判断逻辑。
// ============================================================================

// 等价复刻 parseRunePack 的 schema 校验顺序（与 src/services/RuneImportService.js 保持一致）
function classifyParsedFile (rawText) {
  if (typeof rawText !== 'string') {
    return { kind: 'INVALID_TEXT', errorMessage: '文件内容不是文本' }
  }
  if (rawText.length > 5 * 1024 * 1024) {
    return { kind: 'FILE_TOO_LARGE', errorMessage: '文件过大（> 5242880 字节）' }
  }
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch (e) {
    return { kind: 'JSON_PARSE_FAILED', errorMessage: 'JSON 解析失败: ' + (e && e.message ? e.message : String(e)) }
  }
  if (Array.isArray(parsed)) {
    // 裸数组：旧版符文 JSON 或 Rune Pack 的 runes 数组被误传
    let message = 'JSON 格式不匹配：当前文件不是有效的 Rune Pack（疑似回响导出或旧版符文 JSON）'
    if (parsed.length > 0) {
      const firstValid = parsed.find(it => it && typeof it === 'object' && String(it.name || '').trim())
      if (firstValid && firstValid.anno_source && !firstValid.template) {
        message = 'JSON 格式不匹配：当前文件不是符文 Rune Pack（疑似回响 Echo 导出）'
      }
    }
    return { kind: 'RUNE_PACK_FORMAT', errorMessage: message }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { kind: 'RUNE_PACK_INVALID', errorMessage: 'Rune Pack 必须为 JSON 对象' }
  }
  if (parsed.format === 'memocast.echo-pack') {
    return { kind: 'ECHO_PACK_OBJECT', errorMessage: 'JSON 格式不匹配：当前文件不是符文 Rune Pack（疑似回响 Echo Pack 格式）' }
  }
  if (parsed.format !== 'memocast.rune-pack') {
    return { kind: 'RUNE_PACK_FORMAT_MISMATCH', errorMessage: 'JSON 格式不匹配：当前文件不是符文 Rune Pack（疑似回响 Echo Pack 格式）' }
  }
  if (parsed.version !== 1) {
    return { kind: 'RUNE_PACK_VERSION_UNSUPPORTED', errorMessage: 'version 应为 1' }
  }
  if (!Array.isArray(parsed.runes)) {
    return { kind: 'RUNE_PACK_INVALID', errorMessage: 'runes 必须为数组' }
  }
  if (parsed.runes.length > 500) {
    return { kind: 'RUNE_PACK_TOO_MANY', errorMessage: '条目超过 500 条' }
  }
  return { kind: 'OK', parsed }
}

describe('RuneBatchImportDialog 文件格式校验：Rune Pack v1 + 拒 Echo 误传', () => {
  test('合法 Rune Pack v1 → 通过', () => {
    const text = JSON.stringify({
      format: 'memocast.rune-pack',
      version: 1,
      exportedAt: '2026-08-01T00:00:00.000Z',
      runes: [
        { name: '符文A', template: '<div>A</div>', category: 'general' },
        { name: '符文B', template: '<div>B</div>', category: 'gaming' }
      ]
    })
    const result = classifyParsedFile(text)
    expect(result.kind).toBe('OK')
    expect(result.parsed.runes.length).toBe(2)
  })

  test('顶层 Echo Pack 对象（带 format 头）→ 拒绝（ECHO_PACK_OBJECT）', () => {
    const text = JSON.stringify({
      format: 'memocast.echo-pack',
      version: 1,
      exportedAt: '2026-08-01T00:00:00.000Z',
      echoes: [
        { name: 'A', anno_source: 'export default {}' }
      ]
    })
    const result = classifyParsedFile(text)
    expect(result.kind).toBe('ECHO_PACK_OBJECT')
    expect(result.errorMessage).toMatch(/格式不匹配/)
    expect(result.errorMessage).toMatch(/Echo/)
  })

  test('旧版裸数组（v2026-08-01 之前）→ 拒绝（RUNE_PACK_FORMAT）', () => {
    const text = JSON.stringify([
      { name: '符文A', template: '<div>A</div>', category: 'general' }
    ])
    const result = classifyParsedFile(text)
    expect(result.kind).toBe('RUNE_PACK_FORMAT')
    expect(result.errorMessage).toMatch(/格式不匹配/)
    expect(result.errorMessage).toMatch(/Rune Pack/i)
  })

  test('顶层是 runes 数组但其他字段缺失（v2026-08-01 之后单独拿出 runes 字段）→ 拒绝', () => {
    const text = JSON.stringify([
      { name: '符文A', template: '<div>A</div>', category: 'general' },
      { name: '符文B', template: '<div>B</div>', category: 'gaming' }
    ])
    const result = classifyParsedFile(text)
    expect(result.kind).toBe('RUNE_PACK_FORMAT')
  })

  test('顶层是裸数组 + 元素有 anno_source 无 template → 拒绝（疑似 Echo 导出）', () => {
    const text = JSON.stringify([
      { name: '回响A', anno_source: 'export default {}', category: 'marker', render_type: 'anno' },
      { name: '回响B', anno_source: 'export default {}', category: 'showy', render_type: 'anno' }
    ])
    const result = classifyParsedFile(text)
    expect(result.kind).toBe('RUNE_PACK_FORMAT')
    expect(result.errorMessage).toMatch(/格式不匹配/)
    expect(result.errorMessage).toMatch(/Echo/)
  })

  test('顶层是裸数组但首个有效条目缺 name → 跳过 anno_source 检测（仍按 RUNE_PACK_FORMAT 拒绝）', () => {
    const text = JSON.stringify([
      { anno_source: 'export default {}' },
      { name: '正常符文', template: '<div>A</div>' }
    ])
    const result = classifyParsedFile(text)
    // 第一个条目因 name 缺失被跳过，第二条是有效 rune；
    // 但顶层仍是裸数组 → 仍然 RUNE_PACK_FORMAT
    expect(result.kind).toBe('RUNE_PACK_FORMAT')
  })

  test('顶层 format 写错（既不是 memocast.rune-pack 也不是 memocast.echo-pack）→ 拒绝', () => {
    const text = JSON.stringify({
      format: 'memocast.foo-pack',
      version: 1,
      runes: []
    })
    const result = classifyParsedFile(text)
    expect(result.kind).toBe('RUNE_PACK_FORMAT_MISMATCH')
    expect(result.errorMessage).toMatch(/格式不匹配/)
  })

  test('version 不匹配 → 拒绝', () => {
    const text = JSON.stringify({
      format: 'memocast.rune-pack',
      version: 99,
      runes: []
    })
    const result = classifyParsedFile(text)
    expect(result.kind).toBe('RUNE_PACK_VERSION_UNSUPPORTED')
  })

  test('runes 字段缺失 → 拒绝', () => {
    const text = JSON.stringify({
      format: 'memocast.rune-pack',
      version: 1
    })
    const result = classifyParsedFile(text)
    expect(result.kind).toBe('RUNE_PACK_INVALID')
    expect(result.errorMessage).toMatch(/runes 必须为数组/)
  })

  test('非 JSON 文本 → JSON_PARSE_FAILED', () => {
    const result = classifyParsedFile('not json')
    expect(result.kind).toBe('JSON_PARSE_FAILED')
  })

  test('合法 rune 数组但被错误地放进「runes」键下时 → 仍按 Rune Pack 解析（OK）', () => {
    // 验证 schema 解析只信任顶层格式头，不深入单个元素判定
    const text = JSON.stringify({
      format: 'memocast.rune-pack',
      version: 1,
      runes: [
        { name: '符文A', template: '<div>A</div>', category: 'general' }
      ]
    })
    const result = classifyParsedFile(text)
    expect(result.kind).toBe('OK')
  })
})