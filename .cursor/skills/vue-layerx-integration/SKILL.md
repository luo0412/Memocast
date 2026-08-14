---
name: vue-layerx-integration
description: 在 coolma 的 Vue 2.7 + Element UI 项目中新增或修改全局 BusDialog、Drawer、vue-layerx host bridge、懒加载弹框和多实例 session 时使用。遵循 *BusDialog.vue 自动扫描、busDialogProps 容器配置与 Promise session API。
---

# vue-layerx BusDialog

使用本规范创建全局 Dialog / Drawer。业务组件必须命名为 `XxxBusDialog.vue`，由 `src/components/common/busDialogContext.js` 内部的 `require.context('src', true, /BusDialog\.vue$/, 'lazy')` 自动扫描发现；业务 SFC 仅在首次打开时懒加载。

## 业务组件

在同一 SFC 中声明业务 props 和唯一的容器配置入口 `busDialogProps`：

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
    userId: { type: String, required: true }
  }
}
```

Drawer 在默认值中加入 `container: 'drawer'`，并使用 Element UI 的 `direction`、`size` 等 props。除 `busDialogProps` 外的打开 payload 字段只传给业务组件；普通业务 `title` 不影响容器标题。

## 打开与关闭

不关心实例句柄时：

```js
this.$busDialog.$emit('UserEditorBusDialog.open', { userId })
```

临时覆盖容器配置时：

```js
this.$busDialog.$emit('UserEditorBusDialog.open', {
  userId,
  busDialogProps: { title: '新建用户', width: '640px' }
})
```

同类型允许多开。需要控制某一次时使用 Promise API：

```js
const opened = await this.$busDialog.open('UserEditorBusDialog', { userId })
if (opened.status === 'opened') {
  // opened.id 可用于 close(name, id)
  // opened.close() 可直接关闭该 session
}
```

组件内部关闭自己时仅使用：

```js
this.$emit('close')
```

不要使用 `.toggle`。`this.$busDialog.close(name, id)` 只关闭指定 session；`this.$busDialog.closeAll(name)` 明确关闭同类全部 session。事件 `XxxBusDialog.close` 无 id 时是 close-all，带 `{ id }` 时关闭该实例。

## 基础设施约束

- 只使用独立的 `this.$busDialog`，不要使用应用通用 bus。
- `bindBusDialogHost()` 必须在 `App.vue` 同步 `setup()` 中调用。vue-layerx 会自动绑定 host，不要手动调用 `layer.bindHost()`。
- vue-layerx 的 setup 外 `clone()` 不会继承 host。registry 因而为每种弹框建立一个轻量 portal host；host 内渲染多个独立 session。
- `BusLayerContainer.vue` 只负责将 `busDialogProps` 透传给 Element UI。不要维护第二份 Dialog/Drawer props 白名单，也不要用 `.sync` 修改 `visible` prop；通过 `update:visible` 回传给 host。
- 业务组件的销毁必须只释放自身资源。不要在可多开的 `XxxBusDialog` 中调用会影响其他实例的全局 `disposeAll()`；需要时使用引用计数或实例级 dispose。

## 验证

运行：

```bash
yarn verify:bus-dialog
```

测试至少覆盖：默认与覆盖容器 props、同名并发多开、内容 `$emit('close')`、原生容器关闭、指定 session 关闭、显式 close-all、加载中取消、加载失败和 `$on/$off` 清理。
