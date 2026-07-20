import Vue from 'vue'
import HeyUI from 'heyui'
import 'heyui/themes/index.css'

Vue.use(HeyUI)

export default ({ app }) => {
  app.heyui = HeyUI
}

export { HeyUI }
