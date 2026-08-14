# vue-layerx BusDialog（Vue 2.7 / Options API）

所有新增全局 Dialog / Drawer 使用 `*BusDialog.vue`。业务组件只声明普通业务 props 和 `busDialogProps.default()`；不维护 `ref`、`visible` 或局部 bus 监听。

## 组件约定

文件名就是全局事件名称。例如 `src/components/user/UserEditorBusDialog.vue`：

```js
export default {
  name: 'UserEditorBusDialog',
  props: {
    busDialogProps: {
      type: Object,
      default: () => ({
        title: '编辑用户',
        width: '520px',
        appendToBody: true,
        closeOnClickModal: false
      })
    },
    user: { type: Object, required: true }
  }
}
```

Drawer 在默认值中加入 `container: 'drawer'`，并配置 `direction`、`size` 等 Element UI props。`busDialogProps` 是唯一的容器配置入口；打开 payload 的其他字段只传给业务组件。因此，只有 `busDialogProps.title` 能覆盖容器标题，业务字段 `title` 不会影响外层标题。

## 打开和关闭

最简调用（无需关心 session）：

```js
this.$busDialog.$emit('UserEditorBusDialog.open', { user })
```

需要临时覆盖容器配置时：

```js
this.$busDialog.$emit('UserEditorBusDialog.open', {
  user,
  busDialogProps: { title: '新建用户', width: '640px' }
})
```

同一种弹框允许多开。每一次打开都是一个数据、组件实例和关闭生命周期彼此隔离的 session。需要精确关闭某一次时使用 Promise API：

```js
const opened = await this.$busDialog.open('UserEditorBusDialog', { user })
if (opened.status === 'opened') opened.close()
```

业务组件关闭自己时只需：

```js
this.$emit('close')
```

这只关闭当前组件所在的 session。`this.$busDialog.$emit('UserEditorBusDialog.close')` 或 `this.$busDialog.close('UserEditorBusDialog')` 是关闭该类型全部 session 的全局/兼容入口；不要使用 `.toggle`。

## 基础设施边界

- `busDialogContext.js` 必须保留顶层静态 `require.context('src', true, /BusDialog\.vue$/, 'lazy')`，保证 webpack 可静态分析并让业务 SFC 首次打开时才加载。
- `busDialogBus.js` 是独立总线，挂到 `Vue.prototype.$busDialog`，不得与应用 bus 混用。
- `busDialogRegistry.js` 统一承担扫描、重复名称校验、懒加载、session 生命周期和 `$on/$off`。
- `BusLayerContainer.vue` 是唯一的 Element UI Dialog / Drawer 适配层，业务组件不再写自己的外层容器。
- `bindBusDialogHost()` 必须在 `App.vue` 的同步 `setup()` 中执行。vue-layerx 会自动捕获 host；不要手动调用 `layer.bindHost()`。

vue-layerx 的 `clone()` 不会继承已捕获的 setup host，不能在 bus 回调中按需 clone。registry 因而在 setup 为每个弹框类型绑定一个轻量 portal host；每个 host 内部再渲染多个 session。这样同时保留 `$store` / `$i18n` / `$q` host bridge、业务 chunk 懒加载和同类型多开。

## 验证

运行：

```bash
yarn verify:bus-dialog
```

测试至少覆盖默认/覆盖容器 props、同名并发打开、session 精确关闭、加载中取消、加载失败与事件解绑。
