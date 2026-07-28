// ============================================================================
// echoAnnoSource —— anno_source 字符串编译 + 默认模板
//
// 形态：anno_source 是 `export default { ... }` 形式的字符串，
// 被 safeEvalFactory 编译成一个工厂函数，调用即得 definition 对象。
//
// 模板 `createDefaultEchoAnnoSource` 是「最朴素的 echo」实现，
// user-defined / builtin echo 都基于这套模板机制。
//
// handler 函数体统一用 jQuery：`const $ = window.jQuery` 由 HANDLER_PRELUDE 注入。
// ============================================================================

import { DEFAULT_ECHO_COLOR, DEFAULT_ECHO_ICON } from './builtin-echo-shared.js'

export const HANDLER_PRELUDE = 'const $ = window.jQuery\n'

export const safeEvalAnnoSource = (source = '', prelude = '') => {
  const normalized = String(source || '').replace(/export\s+default/, 'return ')
  return new Function(String(prelude || '') + normalized)
}

export const createDefaultEchoAnnoSource = (echoName = '回响') => `export default {
  kind: 'echo',
  version: 1,
  name: '${String(echoName || '回响').replace(/'/g, "\\'")}',
  namespace: '回响',

  // === 模板签名（v2026-07 调整后）：node + props ===
  //   - node  : token = { type:'echo_anno', echoName, echoId, propsParsed, prompt, raw, range, ... }
  //   - props : 合并后的实例参数对象（payload.props ∪ token.propsParsed ∪ value 兜底），
  //              字段名与 form-create 的 rule.props / rule.on / rule.options / rule.info 对齐。
  render (node, props) {
    const inst = props || (node && node.propsParsed) || {}
    const prompt = (node && node.prompt) || ''
    const echoMeta = (node && node._echoMeta) || {}
    return {
      type: 'card',
      icon: inst.icon || echoMeta.icon || '${DEFAULT_ECHO_ICON}',
      color: inst.color || echoMeta.color || '${DEFAULT_ECHO_COLOR}',
      title: inst.title || echoMeta.name || '${String(echoName || '回响').replace(/'/g, "\\'")}',
      description: inst.desc || echoMeta.desc || '',
      prompt,
      props: { ...inst },
      html: inst.html || ''
    }
  },

  // === 后渲染钩子：domElement 已插入到 DOM ===
  // 第 1 参是 echo host DOM element（jQuery 能直接 $(node) 选中），
  // 第 2 参 props = 编译期算好的实例参数（含 resolved value），由 EchoRuntime 注入。
  afterRender (node, props = {}) {
    $(node).addClass('ag-echo-default-mounted')
  }
}`
