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
    /** 0 三栏 | 1 仅隐藏分类/标签树 | 2 仅编辑器 */
    paneLayoutMode: 0,
    categoryTreeVisible: true,
    noteListVisible: true,
    enablePreviewEditor: true,
    rightClickNoteItem: {},
    rightClickCategoryItem: '',
    theme: 'Default-Light',
    themes: [],
    autoSaveGap: 0,
    splitterWidth: 580,
    /** 左侧第一栏：分类树 / 标签树 / 日历（与 Header 按钮同步） */
    sidebarTreeType: 'category',
    /** 日历模式下列表筛选日 YYYY-MM-DD（本地日界） */
    calendarSelectedDate: '',
    /** 左侧内部分割：分类树宽度 px */
    leftInnerSplitterRatio: 280,
    runeCards: [
      {
        id: 'rune-1',
        name: '火焰之魂',
        desc: '释放灼烧伤害，持续灼烧敌人',
        power: 85,
        color: '#FF6B35',
        icon: 'whatshot'
      },
      {
        id: 'rune-2',
        name: '寒冰护盾',
        desc: '生成冰霜护盾，减免30%伤害',
        power: 72,
        color: '#4FC3F7',
        icon: 'ac_unit'
      },
      {
        id: 'rune-3',
        name: '雷霆一击',
        desc: '召唤雷电攻击，造成群体眩晕',
        power: 95,
        color: '#AB47BC',
        icon: 'flash_on'
      },
      {
        id: 'rune-4',
        name: '生命汲取',
        desc: '攻击时恢复自身生命值',
        power: 60,
        color: '#66BB6A',
        icon: 'favorite'
      },
      {
        id: 'rune-5',
        name: '暗影之刃',
        desc: '提升暴击率与移动速度',
        power: 78,
        color: '#7E57C2',
        icon: 'nights_stay'
      },
      {
        id: 'rune-6',
        name: '圣光庇护',
        desc: '免疫一次负面效果并治疗',
        power: 88,
        color: '#FFD54F',
        icon: 'wb_sunny'
      }
    ]
  }
}
