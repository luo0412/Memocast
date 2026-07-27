/**
 * 16 个内置回响的 attrs 业务字段 schema（form-create element-ui rule 形态）。
 *
 * 设计动机：
 *   - 用户点击占位符 → 打开 EchoInstanceDialog，期望可视化编辑所有业务字段（不止 value）。
 *   - 每个 echo 在 anno_source 的 render() 里通常会读 `attrs.label` / `attrs.checked` / `attrs.color`
 *     等「业务参数」，这些参数就是实例弹框应该回显 + 编辑的字段。
 *   - 本表就是给每个 echo 列一份「可编辑字段清单」，弹框里按 schema 渲染 form-create 表单。
 *
 * 字段约定：
 *   - `field`     对应 attrs 里的 key（如 attrs.label 对应 field: 'label'）
 *   - `title`     表单项左侧 label
 *   - `type`      form-create 控件类型（input / select / switch / inputNumber / el-color-picker ...）
 *   - `default`   该字段未填时的默认值（用户输入空时回填此值）
 *   - `props`     透传给 Element-UI 控件的额外 props
 *   - `options`   select / radio / checkbox 专属，选项列表
 *   - `info`      表单项下面的灰色提示文本
 *   - `placeholder` 输入占位
 *   - `hidden`    true 时隐藏该字段（保留 schema 位置但不渲染）
 *
 * 注意：
 *   - id / definitionId / value / inheritFromPrevious 这些「基础设施字段」不在这里列，
 *     由 EchoRuntime / EchoInstanceDialog 自动管理。
 *   - 用户自定义 echo 可以在自己的 anno_source.render() 里输出 `definition.attrsSchema = [...]`，
 *     注册到 EchoRegistry 时 EchoRuntime 会优先采用，否则按 id 查本表，再否则按值类型推断。
 */

export const BUILTIN_ECHO_ATTRS_SCHEMA = Object.freeze({
  // === 标记类（builtin 7 个）===
  nice: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: '',
      placeholder: '留空使用 echo 名',
      info: '卡片标题文字，留空回落到 echo 名'
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: '',
      placeholder: '回响卡片的描述',
      info: '鼠标悬停 / 弹框内的说明文字'
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#4CAF50'
    }
  ],

  peek: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: '',
      placeholder: '留空使用 echo 名'
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: '',
      placeholder: '回响卡片的描述'
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#FF7043'
    }
  ],

  ignore: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: '',
      placeholder: '留空使用 echo 名'
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#90A4AE'
    }
  ],

  ad: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#FFB300'
    }
  ],

  diff: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#7E57C2'
    }
  ],

  ref: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#29B6F6'
    },
    {
      field: 'url',
      title: '链接 URL',
      type: 'input',
      default: '',
      placeholder: 'https://...',
      info: '点击时新窗口打开，留空不响应点击'
    }
  ],

  todo: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#26A69A'
    },
    {
      field: 'checked',
      title: '已完成',
      type: 'switch',
      default: false,
      props: {
        activeValue: true,
        inactiveValue: false
      },
      info: '已完成的 todo 会加上删除线样式'
    },
    {
      field: 'icon',
      title: '图标',
      type: 'input',
      default: 'check_box',
      info: 'Material Icons 名称'
    }
  ],

  // === 秀技类（showy 9 个）===
  growth: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#43A047'
    },
    {
      field: 'scope',
      title: '影响范围',
      type: 'select',
      default: 'siblings',
      options: [
        { value: 'siblings', label: '同 block 的兄弟节点（最常用）' },
        { value: 'prev-block', label: '前一个 block 的兄弟节点' },
        { value: 'block', label: '当前 block（含自身）' },
        { value: 'document', label: '整篇文档' }
      ]
    },
    {
      field: 'trigger',
      title: '触发方式',
      type: 'select',
      default: 'auto',
      options: [
        { value: 'auto', label: '自动 stagger' },
        { value: 'manual', label: '需要外部触发器' }
      ]
    },
    {
      field: 'target',
      title: '目标选择器',
      type: 'input',
      default: '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table',
      placeholder: 'CSS selector',
      info: '影响范围内的元素筛选器'
    }
  ],

  shatter: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#E53935'
    },
    {
      field: 'intensity',
      title: '破碎强度',
      type: 'input-number',
      default: 6,
      props: { min: 1, max: 50, step: 1 },
      info: '碎片数量，1~50'
    }
  ],

  skywalk: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#1E88E5'
    },
    {
      field: 'duration',
      title: '动画时长(ms)',
      type: 'input-number',
      default: 800,
      props: { min: 100, max: 5000, step: 100 }
    }
  ],

  twinbloom: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#8E24AA'
    },
    {
      field: 'partner',
      title: '镜像对象',
      type: 'select',
      default: 'previous',
      options: [
        { value: 'previous', label: '前一个节点' },
        { value: 'next', label: '后一个节点' },
        { value: 'block', label: '整个 block' }
      ]
    }
  ],

  mindsteal: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#F4511E'
    },
    {
      field: 'target',
      title: '目标',
      type: 'input',
      default: '',
      placeholder: 'CSS selector',
      info: '留空作用于整个 block'
    }
  ],

  lucky: [
    {
      field: 'label',
      title: '按钮文字',
      type: 'input',
      default: '点击触发 AI 校对',
      placeholder: '在 editor 视图里显示的文案'
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#FB8C00'
    },
    {
      field: 'action',
      title: '触发动作',
      type: 'select',
      default: 'ai-proofread',
      options: [
        { value: 'ai-proofread', label: 'AI 校对（错别字修正）' },
        { value: 'ai-summarize', label: 'AI 总结' },
        { value: 'ai-translate', label: 'AI 翻译' }
      ]
    },
    {
      field: 'model',
      title: 'AI 模型',
      type: 'input',
      default: 'default',
      info: '模型 id，留空走默认'
    }
  ],

  scapegoat: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#6D4C41'
    },
    {
      field: 'mode',
      title: '救场方式',
      type: 'select',
      default: 'replace',
      options: [
        { value: 'replace', label: '替换空缺位置' },
        { value: 'append', label: '追加到末尾' }
      ]
    }
  ],

  calamity: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#5E35B1'
    },
    {
      field: 'severity',
      title: '严重程度',
      type: 'select',
      default: 'medium',
      options: [
        { value: 'low', label: '轻微' },
        { value: 'medium', label: '中等' },
        { value: 'high', label: '严重' }
      ]
    }
  ],

  disperse: [
    {
      field: 'title',
      title: '标题',
      type: 'input',
      default: ''
    },
    {
      field: 'desc',
      title: '说明',
      type: 'input',
      default: ''
    },
    {
      field: 'color',
      title: '颜色',
      type: 'el-color-picker',
      default: '#00897B'
    },
    {
      field: 'density',
      title: '疏密度',
      type: 'select',
      default: 'normal',
      options: [
        { value: 'very-loose', label: '极松' },
        { value: 'loose', label: '松' },
        { value: 'normal', label: '正常' },
        { value: 'tight', label: '紧' }
      ]
    }
  ]
})

/**
 * 根据 echo id + echo 定义 + 当前 attrs 值，构造最终的 form-create rule。
 * - 优先用 echo 定义里的 attrsSchema（用户自定义 echo 可声明）
 * - 否则查 BUILTIN_ECHO_ATTRS_SCHEMA[id]
 * - 都没有则返回空数组（弹框降级为旧版 textarea 输入 value）
 */
export const resolveAttrsSchema = (echo = {}) => {
  if (Array.isArray(echo?.attrsSchema) && echo.attrsSchema.length) return echo.attrsSchema
  const byId = BUILTIN_ECHO_ATTRS_SCHEMA[echo?.id]
  if (Array.isArray(byId) && byId.length) return byId
  return []
}

/**
 * 给定 echo id + 当前 attrs 值 + schema，把 schema 转成 form-create rule 数组。
 * 隐藏字段（hidden: true）会被过滤；field 缺失的项会被丢弃。
 *
 * @param {Object} echo   matchedEcho 卡片对象
 * @param {Object} attrs  当前实例 attrs（用于设置 value 默认值）
 * @returns {Array} form-create rule 数组
 */
export const buildFormCreateRule = (echo = {}, attrs = {}) => {
  const schema = resolveAttrsSchema(echo)
  if (!schema.length) return []
  return schema
    .filter(item => item && item.field && item.type && !item.hidden)
    .map(item => {
      const field = String(item.field).trim()
      const current = attrs[field]
      const rule = {
        type: item.type,
        field,
        title: item.title || field,
        value: current !== undefined ? current : (item.default !== undefined ? item.default : undefined)
      }
      if (item.placeholder) rule.props = Object.assign({}, rule.props || {}, { placeholder: item.placeholder })
      if (item.props) rule.props = Object.assign({}, rule.props || {}, item.props)
      if (item.options) rule.options = item.options
      if (item.info) rule.info = item.info
      return rule
    })
}