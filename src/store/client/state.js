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
    noteOrderType: 'orderByModifiedTime',
    apiServerUrl: '',
    postParam: '',
    jsonPath: '',
    customHeader: '',
    customBody: '',
    shrinkInTray: false,
    noteListVisible: true,
    enablePreviewEditor: true,
    rightClickNoteItem: {},
    rightClickCategoryItem: '',
    theme: 'Default-Light',
    themes: [],
    autoSaveGap: 0,
    splitterWidth: 580,
    /** 左侧第一栏：分类树 / 标签树（与 Header 文件夹、标签按钮同步） */
    sidebarTreeType: 'category',
    /** 左侧内部分割：分类树宽度 px */
    leftInnerSplitterRatio: 280
  }
}
