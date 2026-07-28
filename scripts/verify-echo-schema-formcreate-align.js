// ============================================================================
// verify-echo-schema-formcreate-align.js —— echo propsSchema 必须贴合 form-create rule
//
// 锁定的契约（v2026-07-28 起）：
//   1) BUILTIN_ECHO_PROPS_SCHEMA 16 张卡的 schema 项里，**禁止**出现 form-create 不认的
//      自造字段（典型反例：`placeholder` 作为顶层 schema 元数据——要用 props.placeholder）
//   2) 每一项 schema 都至少声明 type + field；options 与 select/checkbox 配套
//   3) buildFormCreateRule 输出的 rule 字段全部是 form-create 标准字段
//   4) buildFormCreateRule 把 schemaItem.defaultValue 作为默认值，但实例 props 优先覆盖
//
// 这些断言的目的不是验证"功能正确"，而是**防止 schema 形态再次飘出
// form-create 共识**——下次有人看到 echo 上线了 form-create 新字段，
// 知道应该在 schema 里直接用标准名（value / props.placeholder），不要自造。
// ============================================================================
const path = require('path')

async function main () {
  const schemaUrl = `file:///${path.resolve('src/components/echo/echoPropsSchema.js').replace(/\\/g, '/')}`
  const schemaMod = await import(schemaUrl)
  const { BUILTIN_ECHO_PROPS_SCHEMA, resolvePropsSchema, buildFormCreateRule } = schemaMod

  let pass = 0
  let fail = 0
  const fails = []

  function check (name, cond, info) {
    if (cond) { console.log('[OK]   ' + name); pass += 1 }
    else {
      console.log('[FAIL] ' + name + (info ? ' info=' + JSON.stringify(info) : ''))
      fails.push({ name, info })
      fail += 1
    }
  }

  // form-create rule 公认的标准字段（白名单）。其他字段不是不能加，而是新加时必须
  // 先确认是 form-create 自己支持的，再加到这张白名单里。
  const FORM_CREATE_STANDARD_FIELDS = new Set([
    'type', 'field', 'title', 'value',
    'props', 'on', 'options', 'info',
    'hidden', 'col', 'control', 'component',
    'validate', 'inject', 'sync', 'emit', 'emitPrefix',
    'effect', 'update', 'computed', 'cache',
    'children', 'renderSlots', 'hook'
  ])

  // 反面教材字段名（echo 历史上自造、非 form-create 标准的）。schema 项里出现就 FAIL。
  // placeholder 作为顶层字段（非 props.placeholder）禁止；default 已被 defaultValue 替代。
  const FORBIDDEN_AT_TOP_LEVEL = new Set(['placeholder'])

  const cardIds = Object.keys(BUILTIN_ECHO_PROPS_SCHEMA)
  check('BUILTIN_ECHO_PROPS_SCHEMA 至少有一张卡',
    cardIds.length > 0, { count: cardIds.length })

  // === 1) 16 张卡的 schema 项里**禁止** `default` / `placeholder` 作为顶层字段 ===
  let itemsChecked = 0
  for (const cardId of cardIds) {
    const items = BUILTIN_ECHO_PROPS_SCHEMA[cardId] || []
    for (const item of items) {
      itemsChecked += 1
      for (const banned of FORBIDDEN_AT_TOP_LEVEL) {
        if (banned in item) {
          check(`[${cardId}] schema 项不应含顶层字段 '${banned}'（form-create 不认）`,
            false,
            { item })
        }
      }
      // === 2) 每项 schema 必须有 type + field ===
      check(`[${cardId}] schema 项含 type 字段`,
        typeof item.type === 'string' && item.type.length > 0, { item })
      check(`[${cardId}] schema 项含 field 字段`,
        typeof item.field === 'string' && item.field.length > 0, { item })
    }
  }
  console.log(`[INFO] 检查了 ${itemsChecked} 个 schema 项 / ${cardIds.length} 张卡`)

  // === 3) buildFormCreateRule 输出的 rule 字段必须是 form-create 标准字段 ===
  // 用 resolvePropsSchema 能解析的 echo，先过一道 schema 层校验：
  const sampleEcho = { id: 'growth' }
  const schemaItems = resolvePropsSchema(sampleEcho)
  check('resolvePropsSchema 拿得到 growth schema',
    Array.isArray(schemaItems) && schemaItems.length > 0,
    { schemaItems })

  // 构造一个测试 echo，让 buildFormCreateRule 拿到 schema
  const echo = { id: 'growth', name: '生生不息' }

  // 没传 props：rule.value 应该用 schema.defaultValue（默认值）
  const ruleEmpty = buildFormCreateRule(echo, {})
  check('buildFormCreateRule：无 props 时 value 用 schema.defaultValue',
    ruleEmpty.length > 0 && ruleEmpty.every(r => r.value !== undefined),
    { ruleEmpty })

  // 传了 props：rule.value 应该用 props[field]
  const propsWithOverrides = { scope: 'document', trigger: 'manual' }
  const ruleOverride = buildFormCreateRule(echo, propsWithOverrides)
  const scopeRule = ruleOverride.find(r => r.field === 'scope')
  const triggerRule = ruleOverride.find(r => r.field === 'trigger')
  check('buildFormCreateRule：实例 props.scope 覆盖 schema.defaultValue',
    scopeRule && scopeRule.value === 'document',
    { scopeRule })
  check('buildFormCreateRule：实例 props.trigger 覆盖 schema.defaultValue',
    triggerRule && triggerRule.value === 'manual',
    { triggerRule })

  // 未覆盖字段保留 schema.defaultValue
  const targetRule = ruleOverride.find(r => r.field === 'target')
  check('buildFormCreateRule：未覆盖字段保留 schema.defaultValue',
    targetRule && targetRule.value === 'p, li, h1, h2, h3',
    { targetRule })

  // === 4) rule 输出字段必须是 form-create 标准字段（不允许出现 default / placeholder 等自造字段）===
  let fieldCheckCount = 0
  for (const rule of ruleOverride) {
    for (const key of Object.keys(rule)) {
      fieldCheckCount += 1
      if (!FORM_CREATE_STANDARD_FIELDS.has(key)) {
        check(`rule 字段 '${key}' 必须是 form-create 标准字段之一`,
          false,
          { allowedFields: Array.from(FORM_CREATE_STANDARD_FIELDS), ruleKey: key, rule })
      }
    }
    // props 应当透传：仅当 schema 里声明了 props 时检查
    if (rule.field === 'target') {
      // growth.target 是 input 没声明 props，rule 就不该有 props 键（透传语义）
      check(`rule[field=target].props 应当未声明（input 类型没配 props）`,
        rule.props === undefined,
        { rule })
    }
    // ref 卡的 url 应当透传 props.placeholder
    const refRule = buildFormCreateRule({ id: 'ref' }, {})[0]
    check(`rule[field=url].props.placeholder 透传`,
      refRule && refRule.props && refRule.props.placeholder === 'https://...',
      { refRule })
  }
  console.log(`[INFO] 检查了 ${fieldCheckCount} 个 rule 字段名`)

  // === 5) options 与 select/checkbox 类型配套（不应给 input 配 options）===
  for (const cardId of cardIds) {
    const items = BUILTIN_ECHO_PROPS_SCHEMA[cardId] || []
    for (const item of items) {
      const needsOptions = ['select', 'radio', 'checkbox', 'radio-group', 'checkbox-group', 'cascader', 'tree-select']
        .includes(item.type)
      const hasOptions = Array.isArray(item.options)
      if (needsOptions && !hasOptions) {
        check(`[${cardId}/${item.field}] ${item.type} 类控件应当含 options`, false, { item })
      }
      if (!needsOptions && hasOptions) {
        // 允许但不强制——input-number 之类也可能用 options？保守起见警告
        check(`[${cardId}/${item.field}] 非 options 类控件含 options，警告（不阻塞）`,
          true, { item, warn: true })
      }
    }
  }

  console.log(`\n=== summary: pass=${pass}, fail=${fail}, total=${pass + fail}`)
  if (fail > 0) {
    console.log('\n--- 失败明细 ---')
    fails.forEach(f => console.log('  -', f.name, f.info ? JSON.stringify(f.info) : ''))
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})