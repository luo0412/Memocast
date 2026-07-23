/**
 * enum-plus 全局扩展
 *
 * 给所有 enum 实例挂三个常用元数据快捷访问器。**必须在业务 enum 实例
 * 创建之前调用**，否则那些早期创建的实例拿不到这些方法（enum-plus v3 的
 * prototype 查找行为）。
 *
 *   - i18nKey(value)   -> 等价于 enum.label(value)，语义更明显
 *   - tagType(value)   -> 拿 enum 项里写的 tagType，没写返回 null
 *   - iconOf(value)    -> 拿 enum 项里写的 icon
 *
 * 注：真实使用时由 index.js 在所有业务 enum 实例之前 import 触发。
 */

import { Enum } from 'enum-plus'

Enum.extends({
  i18nKey (value) {
    return this.label(value)
  },
  tagType (value) {
    const item = this.findBy('value', value)
    return item && item.raw && item.raw.tagType ? item.raw.tagType : null
  },
  iconOf (value) {
    const item = this.findBy('value', value)
    return item && item.raw && item.raw.icon ? item.raw.icon : null
  }
})