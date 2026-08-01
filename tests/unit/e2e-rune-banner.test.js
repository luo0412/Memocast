// 端到端：场景 A + 场景 C 都跑一遍，验证 v2026-08-01 的 UI 强提示文案出现
const fs = require('fs')
const path = require('path')

require('../../tests/fixtures/jquery-setup.js')

const mockText = fs.readFileSync(path.resolve(__dirname, '../../_plugins/rune-template/memocast-runes-2026-08-01.json'), 'utf8')

jest.mock('../../src/utils/DatabaseClient.js', () => {
  return {
    runes: { getAll: jest.fn() },
    runeTemplates: { getAll: jest.fn() },
    runePacks: { fetchRemote: jest.fn().mockResolvedValue({ success: true, text: mockText, finalUrl: 'x' }) }
  }
})

const { mount, createLocalVue } = require('@vue/test-utils')
const Quasar = require('quasar')
const ElementUI = require('element-ui')
const DatabaseClient = require('../../src/utils/DatabaseClient.js')

const localVue = createLocalVue()
localVue.use(Quasar, { config: {} })
localVue.use(ElementUI)

const Comp = require('../../src/components/rune/runeBatchImportDialog.vue').default

test('场景 A：runes 表里已经存在所有 7 个符文 → 弹框渲染强提示 + hasSelectedItem=false', async () => {
  // 模拟 runes 表里已经有所有 7 个
  const parsed = JSON.parse(mockText)
  DatabaseClient.runes.getAll.mockResolvedValue(parsed.runes.map(r => ({
    id: 'rune-existing-' + r.name,
    name: r.name,
    category: 'general'
  })))

  const wrapper = mount(Comp, {
    localVue,
    propsData: {
      value: true,
      defaultCategory: 'general',
      existingRunes: parsed.runes.map(r => ({ name: r.name, category: 'general' })),
      builtinNames: []
    }
  })
  await new Promise(r => setTimeout(r, 50))
  const vm = wrapper.vm
  await vm.applyParsedText(mockText)
  await new Promise(r => setTimeout(r, 50))

  console.log('[A] newItems.length:', vm.newItems.length)
  console.log('[A] conflictItems.length:', vm.conflictItems.length)
  console.log('[A] hasSelectedItem:', vm.hasSelectedItem)
  console.log('[A] .rune-batch-import-all-conflict exists in DOM:', wrapper.find('.rune-batch-import-all-conflict').exists())

  expect(vm.newItems.length).toBe(0)
  expect(vm.conflictItems.length).toBeGreaterThan(0)
  expect(vm.hasSelectedItem).toBe(false)
  // 强提示横幅必须在 DOM 里
  expect(wrapper.find('.rune-batch-import-all-conflict').exists()).toBe(true)
  const banner = wrapper.find('.rune-batch-import-all-conflict').text()
  expect(banner).toMatch(/全部 7 项与现有符文重名/)
  expect(banner).toMatch(/如需覆盖/)
})

test('场景 C：runes 表里只有 2 个重名 → 弹框不渲染强提示 + hasSelectedItem=true', async () => {
  // 模拟 runes 表里只有"演示符文"和"日期"
  DatabaseClient.runes.getAll.mockResolvedValue([
    { id: 'r1', name: '演示符文', category: 'general' },
    { id: 'r2', name: '日期', category: 'general' }
  ])

  const wrapper = mount(Comp, {
    localVue,
    propsData: {
      value: true,
      defaultCategory: 'general',
      existingRunes: [],
      builtinNames: []
    }
  })
  await new Promise(r => setTimeout(r, 50))
  const vm = wrapper.vm
  await vm.applyParsedText(mockText)
  await new Promise(r => setTimeout(r, 50))

  console.log('[C] newItems.length:', vm.newItems.length)
  console.log('[C] conflictItems.length:', vm.conflictItems.length)
  console.log('[C] hasSelectedItem:', vm.hasSelectedItem)
  console.log('[C] .rune-batch-import-all-conflict exists:', wrapper.find('.rune-batch-import-all-conflict').exists())

  expect(vm.newItems.length).toBe(5)
  expect(vm.conflictItems.length).toBe(2)
  expect(vm.hasSelectedItem).toBe(true)
  // 强提示横幅不出现（newItems 不为空）
  expect(wrapper.find('.rune-batch-import-all-conflict').exists()).toBe(false)
})