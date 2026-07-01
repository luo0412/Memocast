// 内置回响（系统提供，固定不可删改）
// 用于设置弹框展示、layout 初始化以及运行时合并 echoCards。
const createDefaultEchoAnnoSource = (echoName = '回响') => `export default {
  kind: 'echo',
  version: 1,
  name: '${String(echoName || '回响').replace(/'/g, "\\'")}',
  render (context = {}) {
    const attrs = context.attrs || {}
    const prompt = context.prompt || ''
    const icon = attrs.icon || context.echo?.icon || 'thumb_up'
    const color = attrs.color || context.echo?.color || '#4CAF50'
    const title = attrs.title || context.echo?.name || '${String(echoName || '回响').replace(/'/g, "\\'")}'
    const description = attrs.desc || context.echo?.desc || ''

    return {
      type: 'card',
      icon,
      color,
      title,
      description,
      prompt
    }
  }
}`

export const BUILTIN_ECHO_CARDS = Object.freeze([
  Object.freeze({
    id: '__builtin_nice__',
    name: 'nice',
    desc: '标记为赞的内容',
    icon: 'thumb_up',
    color: '#4CAF50',
    anno_source: createDefaultEchoAnnoSource('nice'),
    isBuiltin: true
  })
])

export const getDefaultEchoAnnoSource = createDefaultEchoAnnoSource

export const isBuiltinEcho = (echo = {}) => Boolean(echo && echo.isBuiltin)
