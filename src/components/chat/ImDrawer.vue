<template>
  <q-drawer
    ref="drawer"
    :width="$q.screen.width * 0.8"
    side="right"
    overlay
    elevated
    content-class="hide-scrollbar"
    class="im-drawer"
  >
    <div class="im-drawer-container">
      <!-- Header bar -->
      <div class="im-drawer-header">
        <span class="im-drawer-title">{{ $t('imChat') }}</span>
        <q-btn
          dense
          flat
          round
          icon="close"
          size="sm"
          @click="hide"
        />
      </div>

      <!-- Wujie micro-frontend container -->
      <div class="im-wujie-wrapper">
        <WujieVue
          key="imUrl"
          v-if="visible"
          name="box-im"
          class="im-wujie-frame"
          :url="imUrl"
          :sync="false"
          :props="wujieProps"
        />
      </div>
    </div>
  </q-drawer>
</template>

<script>
import WujieVue from 'wujie-vue2'
import { getAppPath } from 'src/ApiInvoker'

export default {
  name: 'ImDrawer',
  components: {
    WujieVue
  },
  data () {
    return {
      visible: false,
      appBasePath: ''
    }
  },
  computed: {
    imUrl () {
      // if (process.env.MODE === 'electron') {
      //   return 'http://localhost:8080/box-im/'
      // }
      // return '/box-im/'
      // return 'https://www.boxim.online'
      return 'https://luo0412.github.io/box-im/#/'
    },
    wujieProps () {
      return {
        data: {}
      }
    }
  },
  methods: {
    // async initAppPath () {
    //   try {
    //     const basePath = await getAppPath()
    //     this.appBasePath = basePath
    //   } catch (err) {
    //     console.error('Failed to get app path:', err)
    //   }
    // },
    show () {
      // if (!this.appBasePath) {
      //   this.initAppPath()
      // }
      this.visible = true
      this.$nextTick(() => {
        if (this.$refs.drawer) {
          this.$refs.drawer.show()
        }
      })
    },
    hide () {
      if (this.$refs.drawer) {
        this.$refs.drawer.hide()
      }
    },
    toggle () {
      if (this.$refs.drawer && this.$refs.drawer.showing) {
        this.hide()
      } else {
        this.show()
      }
    }
  }
}
</script>

<style scoped lang="scss">
.im-drawer {
  background-color: transparent !important;
  box-shadow: none !important;
}

.im-drawer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--editorBgColor, #ffffff);
  border-radius: 8px 0 0 8px;
  overflow: hidden;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
}

.im-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--floatBorderColor, #e8e8e8);
  flex-shrink: 0;
}

.im-drawer-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--editorColor, #333);
}

.im-wujie-wrapper {
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.im-wujie-frame {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
