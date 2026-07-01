import { DEFAULT_NOTE_ORDER_TYPE } from 'src/constants/noteOrderTypes'
import { DEFAULT_CALENDAR_DATE_BASIS } from 'src/constants/calendarDateBasis'
import { BUILTIN_ECHO_CARDS } from 'components/ui/editor/echo/builtinEchoes'

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
    syncStatus: {
      isSyncing: false,
      lastSyncTime: null,
      total: 0,
      synced: 0,
      pending: 0
    }
  }
}
