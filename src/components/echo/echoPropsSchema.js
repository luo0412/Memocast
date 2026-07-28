// ============================================================================
// echoPropsSchema —— form-create schema 集合
//
// 一张 echo 卡的「实例可配置参数」可以通过 propsSchema 直接挂在 echo 上：
//   echo.propsSchema = [
//     { field: 'density', type: 'select', title: '密度', options: [...], default: 'loose' },
//     { field: 'color',   type: 'input',  title: '颜色', props: { placeholder: '#RRGGBB' } },
//     ...
//   ]
//
// form-create 的 rule 透传字段：
//   rule.props   非函数控件属性（placeholder / activeValue / inactiveValue / min / max / ...）
//   rule.on      控件事件回调（change / blur / input / ...）
//   rule.options select / radio / checkbox 选项
//   rule.info    表单下方提示
// ============================================================================

// 16 个内置 echo 的默认 propsSchema
export const BUILTIN_ECHO_PROPS_SCHEMA = Object.freeze({
  nice: [],
  growth: [
    { field: 'scope', type: 'select', title: '影响范围', default: 'siblings',
      options: [
        { value: 'siblings', label: '同段落兄弟' },
        { value: 'prev-block', label: '前一块兄弟' },
        { value: 'block', label: '当前 block' },
        { value: 'document', label: '整篇文档' }
      ]
    },
    { field: 'trigger', type: 'select', title: '触发方式', default: 'auto',
      options: [
        { value: 'auto', label: '自动 stagger' },
        { value: 'manual', label: '手动触发' }
      ]
    },
    { field: 'target', type: 'input', title: '命中选择器', default: 'p, li, h1, h2, h3' }
  ],
  shatter: [
    { field: 'target', type: 'select', title: '影响范围', default: 'line',
      options: [{ value: 'line', label: '同行' }, { value: 'block', label: '当前 block' }] }
  ],
  skywalk: [
    { field: 'theme', type: 'select', title: '主题', default: 'auto',
      options: [
        { value: 'auto', label: '跟随系统' },
        { value: 'light', label: '明亮' },
        { value: 'dark', label: '暗黑' },
        { value: 'sepia', label: '护眼' }
      ]
    },
    { field: 'layout', type: 'select', title: '排版', default: 'enhanced',
      options: [
        { value: 'compact', label: '紧凑' },
        { value: 'enhanced', label: '舒适' },
        { value: 'luxe', label: '浓郁' }
      ]
    }
  ],
  twinbloom: [
    { field: 'source', type: 'select', title: '复制源', default: 'prev-sibling',
      options: [
        { value: 'prev-sibling', label: '上一个元素' },
        { value: 'prev-line', label: '上一行 block' },
        { value: 'next-line', label: '下一行 block' }
      ]
    },
    { field: 'placeholder', type: 'input', title: '占位文本', default: '双生节点' }
  ],
  mindsteal: [
    { field: 'mode', type: 'select', title: '作用方式', default: 'override',
      options: [
        { value: 'override', label: '覆盖' },
        { value: 'stack', label: '叠加' },
        { value: 'disable', label: '停用' }
      ]
    },
    { field: 'targets', type: 'input', title: '目标 id（逗号分隔）', default: '' }
  ],
  lucky: [
    { field: 'action', type: 'input', title: '事件 action', default: 'ai-proofread' },
    { field: 'model', type: 'input', title: 'AI 模型', default: 'default' }
  ],
  scapegoat: [
    { field: 'intensity', type: 'input-number', title: '受伤强度', default: 0,
      props: { min: 0, max: 1, step: 0.1 } },
    { field: 'error', type: 'input', title: '错误信息', default: 'pre-injured by intensity' }
  ],
  calamity: [
    { field: 'scope', type: 'select', title: '影响范围', default: 'siblings',
      options: [{ value: 'siblings', label: '同行' }, { value: 'block', label: '当前 block' }] },
    { field: 'intensity', type: 'input-number', title: '染彩强度', default: 0.3,
      props: { min: 0.05, max: 0.8, step: 0.05 } }
  ],
  disperse: [
    { field: 'density', type: 'select', title: '排版密度', default: 'loose',
      options: [
        { value: 'tight', label: '紧' },
        { value: 'normal', label: '正常' },
        { value: 'loose', label: '松' }
      ]
    }
  ],
  peek: [
    { field: 'collapsed', type: 'switch', title: '默认折叠', default: false },
    { field: 'level', type: 'select', title: '高亮强度', default: 1,
      options: [{ value: 1, label: '轻' }, { value: 2, label: '中' }, { value: 3, label: '强' }] }
  ],
  ignore: [
    { field: 'opacity', type: 'input-number', title: '透明度', default: 0.4,
      props: { min: 0.1, max: 1, step: 0.05 } }
  ],
  ad: [
    { field: 'type', type: 'select', title: '广告形态', default: 'banner',
      options: [
        { value: 'banner', label: '横幅' },
        { value: 'inline', label: '内联' },
        { value: 'sidebar', label: '侧栏' }
      ]
    }
  ],
  diff: [
    { field: 'mode', type: 'select', title: '差异类型', default: 'change',
      options: [
        { value: 'add', label: '新增' },
        { value: 'remove', label: '删除' },
        { value: 'change', label: '变更' }
      ]
    }
  ],
  ref: [
    { field: 'url', type: 'input', title: '链接', default: '', props: { placeholder: 'https://...' } },
    { field: 'title', type: 'input', title: '标题', default: '' }
  ],
  todo: [
    { field: 'checked', type: 'switch', title: '已完成', default: false }
  ]
})

export const resolvePropsSchema = (echo = {}) => {
  if (Array.isArray(echo?.propsSchema) && echo.propsSchema.length) return echo.propsSchema
  // 既能按 echo.id 直查，也能按去前缀 `__builtin_xxx__` 后的 baseId 查
  const id = String(echo?.id || '').trim()
  const baseId = id.replace(/^__builtin_/, '').replace(/__$/, '')
  const byId = BUILTIN_ECHO_PROPS_SCHEMA[id] || BUILTIN_ECHO_PROPS_SCHEMA[baseId]
  if (Array.isArray(byId) && byId.length) return byId
  return []
}

// 把 schema 转成 form-create rule 数组；
// rule 透传 props / on / options / info；隐藏字段被过滤；field 缺失被丢弃。
export const buildFormCreateRule = (echo = {}, props = {}) => {
  const schema = resolvePropsSchema(echo)
  if (!schema.length) return []
  return schema
    .filter(item => item && item.field && item.type && !item.hidden)
    .map(item => {
      const field = String(item.field).trim()
      const current = props[field]
      const rule = {
        type: item.type,
        field,
        title: item.title || field,
        value: current !== undefined ? current : (item.default !== undefined ? item.default : undefined)
      }
      if (item.placeholder) rule.props = Object.assign({}, rule.props || {}, { placeholder: item.placeholder })
      if (item.props) rule.props = Object.assign({}, rule.props || {}, item.props)
      if (item.on && typeof item.on === 'object') rule.on = Object.assign({}, rule.on || {}, item.on)
      if (item.options) rule.options = item.options
      if (item.info) rule.info = item.info
      return rule
    })
}
