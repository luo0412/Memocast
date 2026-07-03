# TODO - 简历拖拽（Resume Drag-and-Drop）

> 立项日期：2026-07-03
> 目标项目：Memocast / Coolma（Electron + Quasar + Vue 2 + Element-UI）
> 参考项目：[Arman19941113/dnd-resume](https://github.com/Arman19941113/dnd-resume)

---

## 1. 背景与目标

`dnd-resume` 是一个基于 **React 19 + @dnd-kit + Zustand + immer** 的开源简历生成器。它把简历抽象成「可拖拽排序的纵向组件流」，并围绕组件流构建了**三栏编辑器**（左：材料 / 中：画布 / 右：属性）。

我们的 Memocast 是 Vue 2 桌面笔记应用，已经有「符文」机制来扩展编辑器。本次任务是把 dnd-resume 的**简历组件模型**和**拖拽交互**移植到 Memocast 的符文体系里，让用户能在笔记中插入一个"可拖拽简历画布"符文。

### 1.1 最终体验

用户在符文面板选择「简历画布」符文并插入笔记后：

1. 笔记中出现一个 **A4 尺寸**的画布卡片，画布里按纵向堆叠着一组简历组件（基本信息 / 标题段落 / 时间段经历 / 自由文本 / 技能条 / 头像块 ...）。
2. 用户可以**按住组件的拖拽手柄上下拖动**调整顺序。
3. 选中某个组件后，右侧（或弹出）出现**属性表单**，编辑后实时写回组件数据。
4. 整张画布可以**导出为 PDF**（沿用 dnd-resume 的 `window.print` 思路）。
5. 整个简历数据以**单一 JSON** 的形式保存在符文的 `value` 字段里，刷新/重开后保持状态。

---

## 2. 参考项目核心分析（dnd-resume）

### 2.1 技术栈

```
React 19 + TypeScript
@dnd-kit/core | @dnd-kit/sortable | @dnd-kit/modifiers
zustand + immer
i18next + react-i18next
sonner (toast)
lucide-react (icon)
tailwindcss-animate
```

> dnd-resume 跑的是 **React + TypeScript**，与我们 Vue 2 不直接兼容，但**架构思路可借鉴**。

### 2.2 三栏编辑器布局（routes/editor/editor-page.tsx）

| 左栏（panel-materials） | 中栏（panel-dnd） | 右栏（panel-config） |
| --- | --- | --- |
| 组件材料列表（BasicInfo / TitleSection / ExperienceTime / TextContent / ImageSection ...） | 简历画布，纵向 Sortable，**A4 比例**（宽 900px，高 = 宽 × 297/210），底部自动出现分页引导线 | 当前选中组件的属性表单（BasicInfoForm / TitleSectionForm / ExperienceTimeForm / TextContentForm / ImageSectionForm / StyleForm） |

### 2.3 拖拽核心（panel-dnd.tsx）

```ts
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
)

function handleDragEnd(event) {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const oldIndex = widgets.findIndex(w => w.id === active.id)
  const newIndex = widgets.findIndex(w => w.id === over.id)
  setWidgets(arrayMove(widgets, oldIndex, newIndex))
}
```

要点：

- 用 `PointerSensor + distance: 2` 避免点击误触发。
- 用 `KeyboardSensor + sortableKeyboardCoordinates` 提供键盘可达性。
- `restrictToParentElement + restrictToVerticalAxis` 限制只能纵向在父画布里排序。
- 组件统一形态：`{ id, type, data: { propsData, styleData } }`，节点化数据结构。

### 2.4 节点结构（widgets）

```
WidgetNode {
  id: string (uuid)
  type: 'BasicInfo' | 'TitleSection' | 'ExperienceTime' | 'TextContent' | 'ImageSection'
  data: {
    propsData: 组件业务数据
    styleData:  通用样式（间距 / 字体 / 颜色 / 对齐）
  }
}
```

### 2.5 A4 分页引导线

```
RESUME_CANVAS_WIDTH = 900
A4_PAGE_HEIGHT_RATIO = 297 / 210   // 0.5 高度比
PAGE_BREAK_HINT_INTERVAL = 900 * (297 / 210) ≈ 1272.86px
```

通过 `ResizeObserver` + `MutationObserver` 监听画布内容高度，向上取整得到 `guideCount = floor((scrollHeight - 1) / PAGE_BREAK_HINT_INTERVAL)`，每条引导线 = "页 N+1 起于此"。

### 2.6 状态管理

zustand store：

```
widgets: WidgetNode[]
activeId: string | null
addWidget(node)
removeWidget(id)
updateWidget(node)
setWidgets(arr)         // arrayMove 后调用
setActiveId(id)
```

**关键不变量**：

- `widgets` 是唯一真相，所有操作都要走 store，**避免局部 state 漂移**。
- 选中状态 (`activeId`) 与组件流解耦，只用于"高亮 + 弹属性表单"。

---

## 3. 移植到 Memocast 的方案

### 3.1 拖拽库选型

| 候选 | Vue 2 兼容 | 场景 | 结论 |
| --- | --- | --- | --- |
| **vuedraggable** (Sortable.js 的 Vue 包装) | ✅ v2.24.3 已装 | **纵向列表排序** | **采用**，正好对应 dnd-resume 的 SortableContext |
| vue-draggable-resizable | ✅ v1.x | 画布**自由位置**（x/y + 缩放） | 暂不引入，留给未来"自由布局简历" |
| @formkit/drag-and-drop | ⚠️ 主推 Vue 3 | 同 sortable | 不引入，避免双栈 |

> 已确认 `vuedraggable@2.24.3` 在 `package.json` devDependencies，无需新增依赖。
> 但 vuedraggable 默认用 SortableJS，所有列表都基于**位置交换**，与 dnd-resume 的纵向 Sortable 完全对位。

### 3.2 架构映射

| dnd-resume | Memocast |
| --- | --- |
| @dnd-kit/sortable + arrayMove | `vuedraggable` + `v-model` |
| zustand store | 符文组件的 `data()` 内部 state（每次 emit('input', JSON.stringify(...)) 持久化） |
| 节点结构 WidgetNode | 符文的 `value` 字段（一个 JSON 字符串描述 widgets 数组） |
| 三栏路由 `/editor` | 符文在笔记中是单卡片，**自身内嵌一个迷你三栏**：左材料 / 中画布 / 右属性（或折叠抽屉） |
| A4 引导线 | 同算法移植 |
| BasicInfoForm 等 | 用 Element-UI `el-form` 实现，写回 `propsData` |
| lucide-react | Quasar `q-icon` (material-icons) + Element-UI 图标 |
| tailwindcss | 现有 `.scss` 作用域样式 + Element-UI 主题变量 |

### 3.3 文件计划

```
TODO-简历拖拽.md                                    ← 本文档
src/constants/runeEchoCategories.js                 ← 新增 runeCategoryResume
src/i18n/zh-cn/components/ui/SettingsDialog.js     ← 新增 runeCategoryResume
src/i18n/en-us/components/ui/SettingsDialog.js     ← 新增 runeCategoryResume
src/components/ui/dialog/rune-templates.js          ← 新增 createResumeCanvasTemplate 等
src/components/ui/dialog/RuneFormDialog.vue         ← 注册简历相关预设模板
```

### 3.4 简历组件符文（5 个 + 1 容器）

> 容器：`<ResumeCanvas>` 持有 `widgets` 列表 + vuedraggable + 选区 + 增删。
> 5 个内容组件（每个是独立 Vue SFC 字符串模板）：

| 符文名 | 类型 kind | propsData 形状 | 字段说明 |
| --- | --- | --- | --- |
| **简历画布** | 容器 | `{ widgets: WidgetNode[] }` | 拖拽容器 + 选中态 + 增删按钮 |
| **基本信息** | BasicInfo | `{ name, title, phone, email, location, avatar }` | 头像 + 姓名 + 职位 + 联系方式 |
| **标题段落** | TitleSection | `{ text, level: 1\|2\|3 }` | 大号标题 |
| **时间段经历** | ExperienceTime | `{ title, org, startDate, endDate, current, desc }` | 适合工作经历 / 项目经历 |
| **自由文本** | TextContent | `{ text }` | 自我介绍 / 备注 |
| **技能标签** | SkillBar | `{ items: [{name, level: 0-100}] }` | 技能 + 进度条（Element 进度条组件） |

> 把"组件节点数据"封装在 `value`（JSON）里，**ResumeCanvas** 是入口符文，**5 个组件**是子符文（用户也可以单独直接插入组件，画布自身负责注册）。

### 3.5 交互流程

1. 用户在符文菜单选「简历画布」插入笔记 → 画布渲染一个空 A4，**v-model 绑 `widgets=[]`**。
2. 画布顶部显示 5 个"添加组件"按钮 → 点击追加节点到 `widgets` 末尾。
3. 每个组件卡片有"拖拽手柄 / 删除 / 选中高亮"，拖拽时通过 vuedraggable 重排。
4. 选中组件后，画布右侧（或弹出 drawer）出现对应 `propsData` 表单（用 el-form）→ 实时写回。
5. 整张画布渲染完成后 `this.$emit('input', JSON.stringify({ widgets }))`，回到符文 runtime 持久化。
6. 顶部"打印 / 导出 PDF"按钮调用 `window.print()`，配合 `@media print` 隐藏非画布元素。

### 3.6 节点数据结构

```js
{
  widgets: [
    {
      id: 'uuid',
      type: 'BasicInfo',  // 'TitleSection' | 'ExperienceTime' | 'TextContent' | 'SkillBar'
      data: {
        propsData: { /* 组件特有数据 */ },
        styleData: { padding: '12px', align: 'left', color: '#333' }
      }
    },
    ...
  ],
  activeId: null  // 当前选中组件 id（不持久化也行）
}
```

### 3.7 拖拽实现核心（vuedraggable 包装）

```vue
<draggable
  v-model="widgets"
  group="resume-widgets"
  handle=".rune-resume-drag-handle"
  animation="160"
  ghost-class="rune-resume-ghost"
  chosen-class="rune-resume-chosen"
  drag-class="rune-resume-drag"
  :component-data="{ tag: 'div', name: 'fade' }"
  @start="onDragStart"
  @end="onDragEnd"
>
  <div
    v-for="w in widgets"
    :key="w.id"
    class="rune-resume-widget"
    :class="{ 'is-active': activeId === w.id }"
    @click="activeId = w.id"
  >
    <span class="rune-resume-drag-handle">⋮⋮</span>
    <component :is="resolveWidget(w.type)" :value="w.data.propsData" @input="updateWidgetProps(w, $event)" />
    <button class="rune-resume-remove" @click.stop="removeWidget(w.id)">×</button>
  </div>
</draggable>
```

---

## 4. 实施步骤（5 步）

1. **新增 runeCategoryResume 分类** + 中英文 i18n。
2. **新增 6 个简历组件模板**：`createResumeCanvasTemplate` + 5 个组件（createResumeBasicInfoTemplate / createResumeTitleTemplate / createResumeExperienceTemplate / createResumeTextTemplate / createResumeSkillTemplate）。
3. **在 `RuneFormDialog.vue` 注册预设**，让用户能在新建符文时一键选择"简历画布"。
4. **最小可运行验证**：
   - 插入简历画布符文 → 看到空 A4。
   - 添加「基本信息」→ 字段回填。
   - 添加「时间段经历」→ 拖拽换序。
   - 选中 → 属性表单编辑 → 实时写回。
   - 关闭笔记再打开 → 数据保持。
5. **A4 引导线 + 打印** 留作可选第二步（不阻塞本次合入）。

---

## 5. 风险与边界

- vuedraggable 在 Vue 2 内部已经成熟，但**和 Quasar `q-dialog` / `q-drawer` 嵌套时**偶尔会因 portal 导致拖拽事件丢失，需要把画布符文直接渲染到笔记 body（不放抽屉）。
- 简历画布如果直接用 Element-UI 组件库，**需要把 Element-UI 主题色跟 Quasar 主题解耦**，避免冲突（参考现有 rune-templates.js 中的 el-input 模板，已验证可行）。
- 笔记里的"符文卡片"是有宽度的，**A4 比例 (297/210 = 1.414)** 在 760px 宽下高度 ≈ 1075px，可能超过视口。要支持上下滚动 + 顶部 sticky 工具栏。
- 数据持久化：符文 value 是字符串，本次让 ResumeCanvas 把整个 `{ widgets }` JSON 序列化到 `this.$emit('input', json)`。**单文件尽量 < 50KB**（500+ 节点时性能靠 vuedraggable 分页）。

---

## 6. 不引入的依赖

- ❌ `@dnd-kit/*` —— React 专用。
- ❌ `@formkit/drag-and-drop` —— 主推 Vue 3。
- ❌ `vue-draggable-resizable` —— 自由画布模式暂不需要。
- ❌ `react-to-print` / `react-pdf` —— 不适用。

**唯一依赖即 `vuedraggable@2.24.3`（已装）。**

---

## 7. 验收清单（Definition of Done）

- [ ] `runeCategoryResume` 在符文分类 Tab 出现，且计数为 0 / 显示加载。
- [ ] 「简历画布」预设模板出现在 RuneFormDialog 的预设下拉。
- [ ] 在笔记里插入简历画布，能添加 5 种组件并拖拽排序。
- [ ] 选中组件时属性表单可编辑，写回后组件立即更新。
- [ ] 关闭笔记重新打开，widgets 数据保持。
- [ ] 中文 / 英文切换 i18n 正常。
- [ ] 没有引入新的 yarn 依赖。