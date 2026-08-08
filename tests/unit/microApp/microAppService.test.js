// ============================================================================
// tests/unit/microApp/microAppService.test.js
// 锁定的契约（v2026-08-08 起微应用 schema 演进）：
//   1) buildDefaultMicroApps 包含内置条目 echo-monster-deleter（displayMode=fullscreen, isBuiltIn=true）
//   2) BUILTIN_APPS 只能由代码注入（不在 export 给用户的 UI 里暴露）
//   3) normalizeMicroApp 对内置条目强制刷 url / devUrl / displayMode
//   4) normalizeMicroApp 对非内置条目保留原值，displayMode 合法化
//   5) mergeBuiltInApps：现有列表追加缺失的内置条目，已存在的内置条目保留用户修改
//   6) diffMicroAppsForReload：displayMode 变化也算 dirty
// ============================================================================

const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'microApp')

const {
  buildDefaultMicroApps,
  normalizeMicroApp,
  normalizeMicroApps,
  mergeBuiltInApps,
  diffMicroAppsForReload,
  BUILTIN_APPS,
  BUILTIN_ECHO_MONSTER_DELETER_ID,
  MICRO_APP_DISPLAY_MODES
} = require(path.join(ROOT, 'microAppService.js'))

describe('microAppService — schema 演进契约', () => {
  test('1) BUILTIN_ECHO_MONSTER_DELETER_ID = "echo-monster-deleter"', () => {
    expect(BUILTIN_ECHO_MONSTER_DELETER_ID).toBe('echo-monster-deleter')
  })

  test('2) MICRO_APP_DISPLAY_MODES 包含 drawer / fullscreen', () => {
    expect(MICRO_APP_DISPLAY_MODES.DRAWER).toBe('drawer')
    expect(MICRO_APP_DISPLAY_MODES.FULLSCREEN).toBe('fullscreen')
  })

  test('3) BUILTIN_APPS 只包含内置条目，且标记 isBuiltIn=true / displayMode=fullscreen', () => {
    expect(BUILTIN_APPS.length).toBeGreaterThanOrEqual(1)
    BUILTIN_APPS.forEach(a => {
      expect(a.isBuiltIn).toBe(true)
      expect(a.displayMode).toBe('fullscreen')
    })
    expect(BUILTIN_APPS.find(a => a.id === BUILTIN_ECHO_MONSTER_DELETER_ID)).toBeTruthy()
  })

  test('4) buildDefaultMicroApps 含内置条目（独立实例，不与 BUILTIN_APPS 共享引用）', () => {
    const list = buildDefaultMicroApps()
    const builtinEntry = list.find(a => a.id === BUILTIN_ECHO_MONSTER_DELETER_ID)
    expect(builtinEntry).toBeTruthy()
    expect(builtinEntry.isBuiltIn).toBe(true)
    expect(builtinEntry.displayMode).toBe('fullscreen')
    // 防御：buildDefaultMicroApps 返回新数组，内部条目也是新对象，不能共享引用
    expect(builtinEntry).not.toBe(BUILTIN_APPS[0])
    expect(list).not.toBe(BUILTIN_APPS)
  })

  test('5) normalizeMicroApp 强制内置条目 url / devUrl 与 BUILTIN_APPS 一致', () => {
    // 即便用户硬塞一个错误 url 进内置条目，normalize 时也会被强制刷为 BUILTIN_APPS 的值
    const raw = {
      id: BUILTIN_ECHO_MONSTER_DELETER_ID,
      name: '被污染',
      url: 'http://hacker.example/',
      devUrl: 'http://localhost:9999/',
      isBuiltIn: false, // 用户尝试清掉 isBuiltIn 标记
      displayMode: 'drawer' // 用户尝试改成 drawer
    }
    const out = normalizeMicroApp(raw)
    expect(out.isBuiltIn).toBe(true)
    expect(out.displayMode).toBe('fullscreen')
    // url / devUrl 强制刷成 BUILTIN_APPS 的值（两个值都为空字符串，因为内置 url 由 resolveEntryUrl 回退）
    expect(out.url).toBe('')
    expect(out.devUrl).toBe('')
    // name 字段不属于强制锁定（用户可改内置条目的 name）
    expect(out.name).toBe('被污染')
  })

  test('6) normalizeMicroApp 非内置条目：displayMode 合法化（未知值 → drawer）', () => {
    const out = normalizeMicroApp({
      id: 'coolma',
      displayMode: 'unknown-mode'
    })
    expect(out.displayMode).toBe('drawer')
    expect(out.isBuiltIn).toBe(false)
  })

  test('7) normalizeMicroApp 非内置条目：displayMode=fullscreen 保留', () => {
    const out = normalizeMicroApp({
      id: 'coolma',
      displayMode: 'fullscreen'
    })
    expect(out.displayMode).toBe('fullscreen')
    expect(out.isBuiltIn).toBe(false)
  })

  test('8) normalizeMicroApp 缺字段时补齐默认值', () => {
    const out = normalizeMicroApp({ id: 'foo' })
    expect(out.displayMode).toBe('drawer')
    expect(out.isBuiltIn).toBe(false)
    expect(out.isMobile).toBe(false)
    expect(out.isDefault).toBe(false)
    expect(out.enabled).toBe(true)
    expect(out.url).toBe('')
    expect(out.devUrl).toBe('')
  })

  test('9) normalizeMicroApps 保留 isDefault 唯一性', () => {
    const list = normalizeMicroApps([
      { id: 'a', isDefault: true },
      { id: 'b', isDefault: true },
      { id: 'c', isDefault: false }
    ])
    const defaults = list.filter(a => a.isDefault)
    expect(defaults.length).toBe(1)
    expect(defaults[0].id).toBe('a')
  })

  test('10) mergeBuiltInApps：缺内置条目时追加，已存在时保留', () => {
    // 旧用户列表里只有 box-im，没 echo-monster-deleter
    const userList = [
      { id: 'box-im', name: '聊天', enabled: true }
    ]
    const merged = mergeBuiltInApps(userList)
    expect(merged.length).toBe(2)
    const builtinEntry = merged.find(a => a.id === BUILTIN_ECHO_MONSTER_DELETER_ID)
    expect(builtinEntry).toBeTruthy()
    expect(builtinEntry.isBuiltIn).toBe(true)
    expect(builtinEntry.enabled).toBe(false) // 内置默认关闭
    // 已存在的用户条目原样保留
    expect(merged.find(a => a.id === 'box-im').name).toBe('聊天')
  })

  test('11) mergeBuiltInApps：已存在内置条目时保留用户修改', () => {
    // 用户已经在 settings 里把 echo-monster-deleter 改成 enabled=true + url=custom
    const userList = [
      { id: BUILTIN_ECHO_MONSTER_DELETER_ID, enabled: true, url: 'http://custom.example/' }
    ]
    const merged = mergeBuiltInApps(userList)
    expect(merged.length).toBe(1)
    // mergeBuiltInApps 不动用户修改（normalizeMicroApp 加载时会强制刷 url 为 BUILTIN_APPS 值，
    // 但 merge 阶段不动；保留职责分离）
    expect(merged[0].enabled).toBe(true)
    expect(merged[0].url).toBe('http://custom.example/')
  })

  test('12) diffMicroAppsForReload：displayMode 变化算 dirty', () => {
    const oldList = [
      { id: 'a', url: '', devUrl: '', displayMode: 'drawer' }
    ]
    const newList = [
      { id: 'a', url: '', devUrl: '', displayMode: 'fullscreen' }
    ]
    const dirty = diffMicroAppsForReload(oldList, newList)
    expect(dirty).toContain('a')
  })

  test('13) diffMicroAppsForReload：url 变化算 dirty', () => {
    const oldList = [{ id: 'a', url: 'http://old', devUrl: '', displayMode: 'drawer' }]
    const newList = [{ id: 'a', url: 'http://new', devUrl: '', displayMode: 'drawer' }]
    const dirty = diffMicroAppsForReload(oldList, newList)
    expect(dirty).toContain('a')
  })

  test('14) diffMicroAppsForReload：displayMode 默认值差异（old 未指定 → drawer，new=fullscreen）算 dirty', () => {
    const oldList = [{ id: 'a', url: '', devUrl: '' }] // 缺 displayMode
    const newList = [{ id: 'a', url: '', devUrl: '', displayMode: 'fullscreen' }]
    const dirty = diffMicroAppsForReload(oldList, newList)
    expect(dirty).toContain('a')
  })

  test('15) diffMicroAppsForReload：被删的 id 算 dirty', () => {
    const oldList = [{ id: 'a', url: '', devUrl: '', displayMode: 'drawer' }]
    const newList = []
    const dirty = diffMicroAppsForReload(oldList, newList)
    expect(dirty).toContain('a')
  })

  test('16) 完整 normalizeMicroApps + 内置条目场景', () => {
    const list = normalizeMicroApps([
      { id: 'box-im', name: '聊天', displayMode: 'drawer' },
      { id: BUILTIN_ECHO_MONSTER_DELETER_ID, enabled: true, url: 'http://malicious/' }
    ])
    // 内置条目的 url 被强制刷为 BUILTIN_APPS 值（这里为空字符串）
    const builtinEntry = list.find(a => a.id === BUILTIN_ECHO_MONSTER_DELETER_ID)
    expect(builtinEntry.url).toBe('')
    expect(builtinEntry.isBuiltIn).toBe(true)
    expect(builtinEntry.enabled).toBe(true) // enabled 是用户可控字段
  })
})