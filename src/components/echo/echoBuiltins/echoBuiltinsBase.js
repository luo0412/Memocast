// ============================================================================
// echoBuiltinsBase —— 16 个内置回响的 anno_source 工厂（被各张回响卡片复用）
//
// 形态：
//   - baseRender(meta)             // 产出 `render (props = {}) { ... }` 字符串
//   - baseAfterRender(handlerBody, meta)  // 产出 `afterRender (node, props) { ... }` 字符串
//   - createAnnoSource({meta, renderBody, handlerBody})  // 拼成完整 anno_source
//   - buildEchoCard(meta)          // meta + anno_source 拼成一张内置 echo 卡
//
// 各张卡片的 meta 单独存到 echoBuiltinsNice.js / echoBuiltinsGrowth.js 等文件里。
// 入口在 ./echoBuiltins.js，外部 API 保持 echoBuiltins.js 原样。
// ============================================================================

import { banner, handlerDoc } from '../echoBuiltinsShared.js'

// ---------------------------------------------------------------------------
// render(props) 工厂：直接产出 echo host HTML 字符串
//   - 元数据（type / field / title / version）由 createAnnoSource 顶层写死
//   - render() 只返回 HTML，不再打包 type/icon/color/... 那些运行时再补
// ---------------------------------------------------------------------------
const baseRender = (meta = {}) => `render (props = {}) {
    const metaName = '${meta.name}'
    console.log('[echoBaseRender]', metaName, 'start', { hasProps: !!props, hasRenderFn: !!(props && typeof props.render === 'function'), propsKeys: props ? Object.keys(props) : [] })
    // 优先级 1: props.render 是函数且返回非空 → 无条件采纳
    if (props && typeof props.render === 'function') {
      let out
      try {
        out = props.render(props)
      } catch (e) {
        console.error('[echoBaseRender]', metaName, 'props.render threw:', e)
        out = undefined
      }
      console.log('[echoBaseRender]', metaName, 'render returned:', JSON.stringify(out), 'type:', typeof out)
      if (out != null && String(out) !== '') {
        console.log('[echoBaseRender]', metaName, '-> ADOPTED (priority 1)')
        return out
      }
      console.log('[echoBaseRender]', metaName, '-> render returned empty/null, falling back')
    }
    // 优先级 2/3 兜底: props.title > metaName
    const displayTitle = (props && props.title) || metaName
    const idTag = (props && (props.id || props.definitionId)) || metaName
    console.log('[echoBaseRender]', metaName, '-> FALLBACK', { displayTitle, idTag, propTitle: props && props.title, propId: props && props.id, propDefId: props && props.definitionId })
    return '<span class="ag-echo-placeholder-marker ag-rune ag-rune--' + idTag + '" data-echo-chant-id="' + idTag + '">' + displayTitle + '</span>'
  }`

// ---------------------------------------------------------------------------
// 通用 afterRender 工厂（签名 (node, props) → cleanup|undefined，与旧版一致）
// ---------------------------------------------------------------------------
const baseAfterRender = (handlerBody = '', meta = {}) => `${handlerDoc([`【handler】${meta.handlerDesc || ''}`])}
    ${handlerBody}
  }`

// ---------------------------------------------------------------------------
// 把 meta + render + afterRender 拼装成 anno_source 字符串
//
// === 新结构（v2026-07-28 起固定）===
//   export default {
//     type: 'echo' | 'echo-chant' | 'echo-tbd',  // 顶层 type 直接承担分类语义
//     field: '<id>',                            // 顶层 field，原 id 的别名
//     title: '<name>',                          // 顶层 title，原 name 的别名
//     version: 1,
//     props: {                                   // ★ 实例可配置参数提到顶层
//       ...meta.propsDefaults,
//     },
//     render (props = {}) { ... },              // 只返回 HTML 字符串
//     afterRender (node, props = {}) { ... }    // 签名不变
//   }
// ---------------------------------------------------------------------------
const createAnnoSource = ({ meta, renderBody, handlerBody }) => `export default {
  ${banner(meta.banner || [])},
  type: '${meta.type}',
  field: '${meta.id}',
  title: '${meta.name}',
  version: 1,

  props: ${JSON.stringify(meta.propsDefaults || {})},

  ${renderBody},

  ${baseAfterRender(handlerBody, meta)}
}`

// ---------------------------------------------------------------------------
// 把单张 meta + 工厂 → 一张完整 echo 卡片
// ---------------------------------------------------------------------------
const buildEchoCard = (meta) => {
  const renderBody = baseRender(meta)
  const anno_source = createAnnoSource({ meta, renderBody, handlerBody: meta.handlerBody || '' })
  return Object.freeze({
    id: `__builtin_${meta.id}__`,
    metaId: meta.id,
    name: meta.name,
    desc: meta.desc,
    icon: meta.icon,
    color: meta.color,
    category: meta.category,
    anno_source,
    isBuiltin: true
  })
}

export { baseRender, baseAfterRender, createAnnoSource, buildEchoCard }
