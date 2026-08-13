import { createLayer } from 'vue-layerx'
import { Drawer } from 'element-ui'
import { i18n } from 'boot/i18n'
import AiHelperDrawerContent from './AiHelperDrawerContent.vue'

// 命令式 AI 助手 drawer。模块顶层 import 即创建单例：
//   import * as aiHelperDrawerContent from 'components/ai/aiHelperDrawerContent'
//   aiHelperDrawerContent.open({ codeGenPrompt, codeGenType, ... })
//   aiHelperDrawerContent.close() / .toggle() / .isVisible() / .bindHost()
//
// ⚠ 必须 host bridge：在 App.vue setup() 同步调用 aiHelperDrawerContent.bindHost()，
// 让 LayerApp 的 parent = App 实例 → 子组件的 $root / parent chain 能找到
// 主 Vue app 树上的 $store / $i18n（vuex / vue-i18n 都是通过 mixin 在
// beforeCreate 取 this.$root.$xxx，子组件断 host 就拿不到）。
// 纯 Options API 项目里，这是 vue-layerx 唯一需要的 setup() 钩子。
//
// 容器 title 一次性解析（模块 import 时）：vue-i18n 切换 locale 后不重渲。
// 项目当前未做 locale 热切换，保留现状；如果未来要做，需把 title 移到 Content
// 组件内计算并通过自定义 prop 注入。
const _layer = createLayer(Drawer, {
  model: 'visible', // Element-UI Drawer 用 visible+update:visible，必须显式声明
  props: {
    direction: 'rtl',
    size: '420px',
    customClass: 'ai-demo-drawer',
    modal: false,
    appendToBody: true,
    withHeader: true,
    wrapperClosable: false,
    closeOnPressEscape: false,
    zIndex: 9999,
    title: i18n.t('aiAssistant')
  }
})(AiHelperDrawerContent)

export function bindHost () { _layer.bindHost() }
export function open (props) { _layer.open({ props }) }
export function close () { _layer.close() }
export function toggle () { _layer.visible ? close() : open() }
export function isVisible () { return !!_layer?.visible }
