<script>
import { Dialog, Drawer } from 'element-ui'

// Shared shell used by vue-layerx.  The layer library owns the portal, mount and
// visible lifecycle; this component only selects the Element UI shell.
export default {
  name: 'BusLayerContainer',
  props: {
    visible: { type: Boolean, default: false },
    kind: { type: String, default: 'dialog' }
  },
  methods: {
    updateVisible (visible) {
      this.$emit('update:visible', visible)
    }
  },
  render (h) {
    const Container = this.kind === 'drawer' ? Drawer : Dialog
    const props = { ...this.$attrs, visible: this.visible }
    return h(Container, {
      props,
      on: {
        'update:visible': this.updateVisible
      }
    }, this.$slots.default)
  }
}
</script>
