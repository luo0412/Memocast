<template>
  <el-drawer
    v-if="kind === 'drawer'"
    :visible.sync="visible"
    :direction="busDialogProps.direction"
    :size="busDialogProps.size"
    :title="busDialogProps.title"
    :custom-class="busDialogProps.customClass"
    :modal="busDialogProps.modal"
    :with-header="busDialogProps.withHeader"
    :wrapper-closable="busDialogProps.wrapperClosable"
    :close-on-press-escape="busDialogProps.closeOnPressEscape"
    :z-index="busDialogProps.zIndex"
    :append-to-body="busDialogProps.appendToBody"
  >
    <slot></slot>
  </el-drawer>

  <el-dialog
    v-else
    :visible.sync="visible"
    :title="busDialogProps.title"
    :width="busDialogProps.width"
    :custom-class="busDialogProps.customClass"
    :modal="busDialogProps.modal"
    :close-on-click-modal="busDialogProps.closeOnClickModal"
    :close-on-press-escape="busDialogProps.closeOnPressEscape"
    :z-index="busDialogProps.zIndex"
    :append-to-body="busDialogProps.appendToBody"
  >
    <slot></slot>
  </el-dialog>
</template>

<script>
export default {
  name: 'BusLayerContainer',
  props: {
    visible: { type: Boolean, default: false },
    kind: { type: String, default: 'dialog' },
    busDialogProps: { type: Object, default: () => ({}) }
  }
}
</script>
