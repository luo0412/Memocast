import Vue from 'vue'
import ElementUI from 'element-ui'
import ElementUIX from 'vue-element-ui-x'
import 'element-ui/lib/theme-chalk/index.css'

Vue.use(ElementUI)
Vue.use(ElementUIX)

export default ({ app }) => {
  app.elementUI = ElementUI
}

export { ElementUI }
