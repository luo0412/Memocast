import Vue from 'vue'
import VueI18n from 'vue-i18n'
import messages from 'src/i18n'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'

// 安装 enum-plus i18next plugin，让 enum.label() 自动走 vue-i18n 翻译
// 必须在 Enum 实例创建之前安装（boot 入口最早执行，无副作用）
import i18nPlugin from '@enum-plus/plugin-i18next'
import { Enum } from 'enum-plus'
// vue-i18n v8 legacy 模式下，i18next 实例挂在 vueI18n.i18n 上
// 先占位安装，instance 延后到 VueI18n 创建后再通过 Enum.install 注入
Enum.install(i18nPlugin, { localize: { instance: null } })

// 加载所有业务 enum（enumSetup.js 已在 index.js 中先执行，确保扩展方法正确注册）
import {
  NoteOrderTypeEnum,
  CalendarDateBasisEnum,
  AiAssistantProviderEnum,
  CloudSyncProviderEnum,
  SettingsTabEnum,
  GeneralSubEnum,
  EditorSubEnum,
  AiSubEnum,
  ServerSubEnum,
  CloudFnSubEnum,
  RuneCategoryEnum,
  EchoCategoryEnum
} from 'src/utils/enum'

// 挂载到 Vue.prototype.$enums（复数语义：一个对象里多个 enum 实例的集合），
// 全局可用，模板中可直接用 $enums.XxxEnum.Key
Vue.prototype.$enums = {
  NoteOrderTypeEnum,
  CalendarDateBasisEnum,
  AiAssistantProviderEnum,
  CloudSyncProviderEnum,
  SettingsTabEnum,
  GeneralSubEnum,
  EditorSubEnum,
  AiSubEnum,
  ServerSubEnum,
  CloudFnSubEnum,
  RuneCategoryEnum,
  EchoCategoryEnum
}

const locale = ClientFileStorage.getItemFromStore('language')
Vue.use(VueI18n)

const i18n = new VueI18n({
  locale: locale,
  fallbackLocale: locale,
  messages,
  availableLocales: ['en-us', 'zh-cn']
})

// 注入 vue-i18n 的 i18next 实例，让 plugin 能调用 t()
Enum.install(i18nPlugin, { localize: { instance: i18n.i18n } })

// 更新 Quasar Dialog 全局默认按钮文字（支持语言切换时动态更新）
// Quasar v1 使用 Quasar.setDefaults，Dialog 本身没有 setDefaults
function updateDialogDefaults () {
  // Quasar.setDefaults({
  //   dialog: {
  //     ok: {
  //       label: i18n.t('ok'),
  //       color: 'primary'
  //     },
  //     cancel: {
  //       label: i18n.t('cancel'),
  //       color: 'grey'
  //     }
  //   }
  // })
}

// 初始化 Dialog 默认值
updateDialogDefaults()

export default ({ app }) => {
  // Set i18n instance on app
  app.i18n = i18n
}

export { i18n, updateDialogDefaults }
