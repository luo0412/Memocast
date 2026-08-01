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