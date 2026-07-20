import { DEFAULT_NOTE_ORDER_TYPE } from 'src/utils/noteOrderTypesConst'
import { DEFAULT_CALENDAR_DATE_BASIS } from 'src/utils/calendarDateBasisConst'
import { BUILTIN_ECHO_CARDS } from 'components/echo/builtinEchoes'

export default function () {
  return {
    language: null,
    autoLogin: false,
    rememberPassword: true,
    darkMode: false,
    noteListDenseMode: false,
    markdownOnly: false,
    enableSelfHostServer: false,
    imageUploadService: 'wizOfficialImageUploadService',
    imageUploadServiceParam: {},
    noteOrderType: DEFAULT_NOTE_ORDER_TYPE,
    apiServerUrl: '',
    postParam: '',
    jsonPath: '',
    customHeader: '',
    customBody: '',
    shrinkInTray: false,
    paneLayoutMode: 0,
    categoryTreeVisible: true,
    noteListVisible: true,
    enablePreviewEditor: true,
    rightClickNoteItem: {},
    rightClickCategoryItem: '',
    theme: 'Default-Light',
    themes: [],
    // 头部皮肤: 'baiyang'(白羊/默认白) / 'nezha'(哪吒/莫兰迪红) / 'infp'(INFP/莫兰迪绿)
    skin: 'baiyang',
    autoSaveGap: 0,
    quickInsertColumns: 6,
    splitterWidth: 580,
    sidebarTreeType: 'category',
    noteMethod: 'notesSixDaoLun',
    noteMethodPrefix: 'Course',
    calendarSelectedDate: '',
    calendarDateBasis: DEFAULT_CALENDAR_DATE_BASIS,
    leftInnerSplitterRatio: 280,
    runeCards: [],
    echoCards: BUILTIN_ECHO_CARDS.map(echo => ({ ...echo })),
    // 右上角 AI 助手入口使用的实现：
    //   'builtin' -> 内置 AI 抽屉（读取 ai_model_configs 默认项）
    //   'doubao'  -> 豆包 WebApp（wujie 微前端）
    aiAssistantProvider: 'builtin',
    // 云同步方式：
    //   'wiznote'    -> 为知笔记同步
    //   'customFn'   -> 自定义云函数同步
    cloudSyncProvider: 'wiznote',
    syncStatus: {
      isSyncing: false,
      lastSyncTime: null,
      total: 0,
      synced: 0,
      pending: 0
    },
    // CDN 依赖配置：用于笔记软件静态资源 + 可选注入到博客 index.html
    // 每项结构: { id, name, url, enabled, applyToBlog }
    cdnDeps: []
  }
}
