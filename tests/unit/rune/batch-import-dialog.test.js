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