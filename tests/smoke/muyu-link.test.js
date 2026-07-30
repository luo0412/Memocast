// 烟雾测试：确认 @coolma/muya 的所有 import 路径能被 yarn link 解析到源码
// 这是最关键的契约——路径解析失败 = 主项目跑不起来

const path = require.resolve('@coolma/muya/lib')
const utilsPath = require.resolve('@coolma/muya/lib/utils')
const tablePickerPath = require.resolve('@coolma/muya/lib/ui/tablePicker')
const quickInsertPath = require.resolve('@coolma/muya/lib/ui/quickInsert')
const themeCssPath = require.resolve('@coolma/muya/themes/default.css')
const configPath = require.resolve('@coolma/muya/lib/config')
const parserPath = require.resolve('@coolma/muya/lib/parser')

describe('@coolma/muya via yarn link — path resolution', () => {
  it('main entry resolves to _plugins/@coolma/muya/lib/index.js', () => {
    expect(path).toMatch(/_plugins[\\/]@coolma[\\/]muya[\\/]lib[\\/]index\.js$/)
  })

  it('sub-paths resolve under _plugins/@coolma/muya/lib/', () => {
    for (const p of [utilsPath, tablePickerPath, quickInsertPath, configPath, parserPath]) {
      expect(p).toMatch(/_plugins[\\/]@coolma[\\/]muya[\\/]lib[\\/]/)
    }
  })

  it('themes/default.css resolves', () => {
    expect(themeCssPath).toMatch(/_plugins[\\/]@coolma[\\/]muya[\\/]themes[\\/]default\.css$/)
  })
})