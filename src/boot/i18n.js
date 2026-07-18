import Vue from 'vue'
import VueI18n from 'vue-i18n'
import { Dialog } from 'quasar'
import messages from 'src/i18n'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'
const locale = ClientFileStorage.getItemFromStore('language')
Vue.use(VueI18n)

const i18n = new VueI18n({
  locale: locale,
  fallbackLocale: locale,
  messages,
  availableLocales: ['en-us', 'zh-cn']
})

// 更新 Quasar Dialog 全局默认按钮文字（支持语言切换时动态更新）
function updateDialogDefaults () {
  Dialog.setDefaults({
    ok: {
      label: i18n.t('ok'),
      color: 'primary'
    },
    cancel: {
      label: i18n.t('cancel'),
      color: 'grey'
    }
  })
}

// 初始化 Dialog 默认值
updateDialogDefaults()

export default ({ app }) => {
  // Set i18n instance on app
  app.i18n = i18n
}

export { i18n, updateDialogDefaults }
