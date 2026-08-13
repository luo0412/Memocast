# vue-layerx 集成规范（Vue 2.7 + Options API 命令式弹层）

> vue-layerx 是「弹层命令式调用 + 内容 / 容器分离」的小库（MIT，~37KB）。本仓库用 `vue-layerx@^1.2.1`（`peerDependencies: vue ^2.7 || ^3.3`）。
>
> **唯一目的**：把常驻模板里的 `<XxxDrawer ref="..." />` 删掉，改成「模块顶层单例 + 命令式 `open / close / toggle`」，父组件模板不再持有 drawer 实例。
>
> **典型用例**：AI 助手 drawer。Header 点击 → `aiHelperDrawerContent.toggle()`；`runeFormDialog` 点 AI 帮写 → `aiHelperDrawerContent.open({...})`。

---

## 1. 二件套文件

```
src/components/<feature>/
├── <feature>Content.vue        # 纯内容组件（业务 UI / 逻辑，不写 <el-drawer>）
└── <feature>Content.js         # 命令式单例：容器 factory + open/close/toggle/bindHost 一步到位
```

**对照（AI 助手）**：

| 文件 | 角色 |
|---|---|
| `src/components/ai/AiHelperDrawerContent.vue` | 聊天 UI / 消息流 / composer / code-gen 业务 |
| `src/components/ai/aiHelperDrawerContent.js` | `createLayer(Drawer, { model, props })(Content)` + `open / close / toggle / isVisible / bindHost` |

**为什么是「Content.js」而不是「Layer.js」或「Layers.js」**：

- **不叫 `Layer.js`**：vue-layerx 内部概念已经够多了（Layer / LayerApp / LayerView / defineLayer），多一个同名文件只会让人晕。
- **不叫 `Layers.js`（带 s）**：单例就是单例，没有「多个 layer」语义；带 s 反而暗示「容器工厂集合」这种假抽象。
- **叫 `Content.js`**：跟 `Content.vue` 配对，**文件名前缀一致**，调用方一眼能看出「这对文件是一套」。

---

## 2. 二件套最小代码

### 2.1 `xxxContent.js`（命令式单例 + 容器 factory）

```javascript
import { createLayer } from 'vue-layerx'
import { Drawer } from 'element-ui' // 或 Dialog / Popover，按需换
import { i18n } from 'boot/i18n'
import XxxContent from './XxxContent.vue'

// 容器默认 props + 内容组件 + 命令式 API 一次性绑死。
// 整个项目里 _layer 是真正的单例（模块顶层只 import 一次）。
const _layer = createLayer(Drawer, {
  model: 'visible', // Element-UI 必须显式声明（详见 §5）
  props: {
    direction: 'rtl',
    size: '420px',
    modal: false,
    appendToBody: true,
    withHeader: true,
    wrapperClosable: false,
    closeOnPressEscape: false,
    zIndex: 9999,
    title: i18n.t('xxxTitle') // 模块 import 时一次性解析，locale 切换不重渲
  }
})(XxxContent)

export function bindHost () { _layer.bindHost() }
export function open (props) { _layer.open({ props }) }
export function close () { _layer.close() }
export function toggle () { _layer.visible ? close() : open() }
export function isVisible () { return !!_layer?.visible }
```

**就这样**——不要加 `_setOnRequestConfig` / `_ensureReady` / appBus `$on` 间接层。业务校验放内容组件的 `mounted()` 里。

### 2.2 `xxxContent.vue`（纯 Options API）

```vue
<script>
import PortkeyService from 'src/services/PortkeyService'
import MarkdownRenderer from 'src/services/MarkdownRenderer'
import appBus from 'src/components/common/bus'

export default {
  name: 'XxxContent',
  // props 由 vue-layerx open({ props }) 透传进来
  props: {
    codeGenPrompt: { type: String, default: '' },
    codeGenType: { type: String, default: null }
  },
  async mounted () {
    await MarkdownRenderer.initMarkdownRenderer()
    // 业务校验：AI 配置不可用 → appBus 通知父组件跳 Settings
    await this.refreshDefaultConfig()
    if (!PortkeyService.isConfigUsable(this.defaultConfig)) {
      appBus.$emit('REQUEST_AI_PROVIDER_CONFIG')
    }
  },
  beforeDestroy () {
    MarkdownRenderer.disposeAll()
  },
  methods: {
    async refreshDefaultConfig () {
      this.defaultConfig = await PortkeyService.getDefaultConfig()
    }
    // ...
  }
}
</script>
```

**注意**：
- 不要写 `<el-drawer>` / `<el-dialog>`（容器在 factory 里）
- 不要写 `defineLayer({...})`（需要 setup()，Options API 写不了）
- 不要维护 `internalVisible` / `lastShowOptions`（vue-layerx 管生命周期）
- 副作用（AbortController / MarkdownRenderer / 计时器）放 `beforeDestroy`

---

## 3. 调用方写法

### 3.1 父组件（toggle）

```javascript
import * as aiHelperDrawerContent from 'components/ai/aiHelperDrawerContent'

methods: {
  handleAiAssistantClick () {
    if (this.aiAssistantProvider === 'doubao') {
      this.$refs.doubaoChatDrawer.toggle() // 旧 ref 模式不动
    } else {
      aiHelperDrawerContent.toggle() // ← 命令式，无 ref
    }
  },
  handleAiProviderConfigRequest () {
    this.$nextTick(() => {
      this.$refs.settingsDialog?.show({ openAiAdd: true })
      aiHelperDrawerContent.close() // 跳 Settings 后关 drawer
    })
  }
}

mounted () {
  // ...
  bus.$on('REQUEST_AI_PROVIDER_CONFIG', this.handleAiProviderConfigRequest)
}

beforeDestroy () {
  bus.$off('REQUEST_AI_PROVIDER_CONFIG', this.handleAiProviderConfigRequest)
}
```

父组件模板**不**写 `<XxxContent ref="..." />`。

### 3.2 业务表单（open 带 props）

```javascript
import * as aiHelperDrawerContent from 'components/ai/aiHelperDrawerContent'

methods: {
  handleAiHelpClick () {
    const prompt = buildPrompt(...)
    aiHelperDrawerContent.open({
      codeGenPrompt: prompt,
      codeGenType: 'rune', // 或 'echo'
      codeGenCallback: (code) => { // 闭包捕获 this
        this.form.template = extractCode(code)
        this.$refs.runeFormEditor?.setTemplate(extractCode(code))
      }
    })
  }
}
```

不要走 `bus.$emit(REQUEST_AI_RUNE_HELP, {...})` + aiHelperDrawerContent 顶层监听——那样需要再加一层 props 转发。直接 import 模块调 `open()` 最简。

---

## 4. Vue 2.7 + Options API：必须 host bridge

**误区**：以为 vue-layerx 顶层单例 + Vue.prototype 继承就能让 Content 拿到 `$store` / `$t` / `$q`。**错的**——vuex / vue-i18n v8 / Quasar 都是通过 `Vue.mixin({ beforeCreate })` 在组件创建时**沿 `$root` / `options.parent` 链注入**：

```js
// vuex install（节选）
Vue.mixin({ beforeCreate: vuexInit })
function vuexInit () {
  if (options.store) this.$store = options.store
  else if (options.parent && options.parent.$store) this.$store = options.parent.$store  // ← parent chain
}

// vue-i18n v8 install（节选）
Vue.mixin({ beforeCreate })
function beforeCreate () {
  // ...
  } else if (this.$root && this.$root.$i18n) {
    this._i18n = this.$root.$i18n   // ← $root chain
  } else if (options.parent && options.parent.$i18n) {
    this._i18n = options.parent.$i18n
  }
}
```

**LayerApp 子树没有 host bridge 时**：
- `new Ctor()`（无 parent）→ LayerApp 自己就是 root，没 `$store` / `$i18n`
- Content 子组件 `vuexInit` 走 `options.parent.$store` → LayerApp 没 → Content.$store 是 undefined
- Content `vue-i18n beforeCreate` 走 `this.$root.$i18n` → LayerApp 没 → Content.$i18n 是 undefined
- **Content render 时 this.$t('xxx') → this.$i18n 是 undefined → `Cannot read properties of undefined (reading '_t')`**

### 修复：App.vue setup() 同步调 bindHost

vue-layerx 1.2.1 的 `bindHost()` **必须**在 setup() 同步阶段调用（内部走 `getCurrentInstance()` 拿 host proxy，过了 setup 就拿不到）。这是 vue-layerx + Options API 项目里**唯一**必需的 setup() 钩子。

```javascript
// App.vue（顶层 Vue 实例）
import * as aiHelperDrawerContent from 'components/ai/aiHelperDrawerContent'

export default {
  name: 'App',
  setup () {
    aiHelperDrawerContent.bindHost() // ← 桥接 LayerApp parent 到 App
    return {}
  }
  // ...其余代码全部 Options API，不变
}
```

`bindHost()` 后 vue-layerx 用 `new Ctor({ parent: host })` 创建 LayerApp → LayerApp 是 App 的 child → Content 沿 parent chain 找 `$root` = App.$root = 主 Vue root → 拿到 `$store` / `$i18n`。✓

### 不要尝试的兼容写法

- ❌ 在 Content 里手动 `this.$store = this.$root.$store`：污染 Content 子树，重复 mixin 的工作
- ❌ 把 `i18n` / `store` 手动 import 进来当单例：Content 里的 this 不指向这个单例
- ❌ 在 Content 里 `inject('i18n')`：没 host bridge 时 inject 拿不到
- ❌ 让 Content 不依赖 `this.$t` 而只用 module-level `i18n.t('xxx')`：可以但每个地方都 i18n.t(...) 太丑，破坏组件化风格

**最简方案就是加一个 setup() 钩子调 bindHost**，其他代码保持 Options API。

---

## 5. Element-UI 容器必须显式 `model: 'visible'`

vue-layerx 默认 model 是 Vue 3 的 `modelValue`+`update:modelValue`，对应 Vue 2.7 默认是 `value`+`input`。Element-UI 的 `Dialog` / `Drawer` / `Popover` 用 `visible`+`update:visible`，**必须**显式声明：

```javascript
createLayer(Drawer, { model: 'visible', props: { ... } })
//              ^^^^^^^^^^^^^^^^^^ 必须
```

否则 close() 调了但 visible 不同步回来，drawer 不消失。

---

## 6. 拆分迁移 checklist

把旧 `<XxxDrawer ref="xxx" />` 改成 vue-layerx 二件套：

- [ ] **拆分** 旧 `XxxDrawer.vue` 为 `XxxContent.vue`：
  - [ ] 删除 `<el-drawer>` / `<el-dialog>` 容器
  - [ ] 删除 `internalVisible` / `_emitOpen` / `_emitClose` / `defineLayer({...})`
  - [ ] 容器侧 props（size / direction / title / modal 等）下沉到 `xxxContent.js` 的 factory
  - [ ] 副作用放 `beforeDestroy`
- [ ] **新建** `xxxContent.js`：`createLayer(Container, { model, props })(Content)` + 暴露 `bindHost / open / close / toggle / isVisible`
- [ ] **改** App.vue 加一个 setup()：`xxxContent.bindHost()`（仅这一处用 setup，其余 Options API）
- [ ] **改** 父组件：
  - [ ] 模板删除 `<XxxDrawer ref="..." />` 和 components 注册
  - [ ] 改为 `xxxContent.toggle()` / `xxxContent.open({ props })`
- [ ] **删除** 旧 `XxxDrawer.vue`

---

## 7. 推广模板：新增一个命令式弹层

需要把任意一个常驻 ref 弹层迁过来 / 新做一个，按这个顺序：

1. **先写 `XxxContent.vue`**，纯 Options API，**不**写 `<el-drawer>` / `<el-dialog>` / `<el-popover>` 容器
2. **再写 `xxxContent.js`**：照抄 §2.1，**只**改 4 处——容器组件名（Drawer / Dialog / Popover）、容器默认 props、import 的 Content 组件路径、`title` 的 i18n key
3. **App.vue setup()** 加 `xxxContent.bindHost()`（已有就不重复加，所有 layer 共用一次 App.setup() 调用即可）
4. **改父组件** 模板删 ref + 改成 `xxxContent.toggle() / open({props})`
5. **跑一次** `yarn dev` 验证

---

## 8. 常见坑

| 现象 | 原因 | 修复 |
|---|---|---|
| `Cannot read properties of undefined (reading '_t')` / `'$store'` undefined | 没调 bindHost，LayerApp 自己就是 root，没 `$store` / `$i18n` | App.vue setup() 调 `xxxContent.bindHost()` |
| `[vue-layerx] bindHost() must be called synchronously during setup` | bindHost 在 mounted 之后调（getCurrentInstance 已清） | 在 App.vue setup() 同步阶段调 |
| drawer 关不掉（close() 调了但 visible 不同步） | 忘了 `model: 'visible'` | `createLayer(Container, { model: 'visible', ... })` |
| `[vue-layerx] defineLayer() must be called synchronously inside setup()` | Options API 组件顶部写了 `defineLayer({...})` | 删掉，容器默认 props 全放 factory |
| 每次 open 都重置消息流 | 内容组件被重新 mount = 全新 data | 需要持久的状态提升到 store / appBus 缓存 |
| drawer 开着但内容无意义 | Content mounted 校验失败却没关 drawer | mounted 里 emit `REQUEST_XXX_CONFIG` 等业务事件，父组件收到后 `xxxContent.close()` |
| 切换语言后容器 title 不变 | `title: i18n.t('xxx')` 在模块 import 时一次性解析 | 项目当前未做 locale 热切换，**保留现状**；未来要做时把 title 移到 Content 组件内计算并通过自定义 prop 注入 |

---

## 9. 一句话总结

> **二件套：`XxxContent.vue`（业务 UI，Options API）+ `xxxContent.js`（容器 factory + 命令式 open/close/toggle + bindHost）。App.vue setup() 调一次 bindHost 让 LayerApp 拿到 store/i18n，其余组件保持 Options API 不变。**
