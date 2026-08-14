<script>
import BusLayerContainer from './BusLayerContainer.vue'

// One vue-layerx portal can host many independent Element UI dialog shells.
// Every session owns its component, payload and close lifecycle.
export default {
  name: 'BusDialogLayerHost',
  props: {
    sessions: { type: Array, required: true }
  },
  methods: {
    closeSession (session) {
      session.close()
    }
  },
  render (h) {
    return h('div', { class: 'bus-dialog-layer-host' }, this.sessions.map(session => {
      const { kind = 'dialog', ...containerProps } = session.containerProps
      return h(BusLayerContainer, {
        key: session.id,
        props: { ...containerProps, kind, visible: true },
        on: {
          'update:visible': visible => {
            if (!visible) this.closeSession(session)
          }
        }
      }, [h(session.component, {
        key: session.id,
        props: session.contentProps,
        on: { close: () => this.closeSession(session) }
      })])
    }))
  }
}
</script>
