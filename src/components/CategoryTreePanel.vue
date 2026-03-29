<template>
  <div class="category-tree-panel full-height column">
    <q-scroll-area
    v-if="type === 'category'"
    :thumb-style="thumbStyle"
      :bar-style="barStyle"
      :class="`exclude-header note-list${$q.dark.isActive ? '-dark' : ''}`"
      class="col"
      @contextmenu="drawerContextMenuHandler"
    >
      <el-tree
        ref="tree"
        :data="items"
        :props="treeProps"
        node-key="key"
        :current-node-key="currentCategory"
        :default-expand-all="true"
        :expand-on-click-node="false"
        :highlight-current="true"
        :indent="20"
        class="memocast-el-tree"
        @node-click="handleNodeClick"
        @node-contextmenu="contextMenuHandler"
      >
        <span class="memocast-tree-node" slot-scope="{ node }">
          <i
            :class="nodeIconClass(node)"
            class="memocast-tree-folder-icon"
          />
          <span
            class="node-label"
            :style="isNodeSelected(node) ? 'color: var(--themeColor)' : ''"
          >{{ node.label }}</span>
        </span>
      </el-tree>
    </q-scroll-area>
    <!-- Tag Treemap View -->
    <div
      v-else-if="type === 'tag'"
      ref="chartContainer"
      class="tag-treemap-container"
      @contextmenu="tagTreemapContextMenuHandler"
    />
    <TierRankingDialog ref="tierRankingDialog" />
  </div>
</template>

<script>
import { createNamespacedHelpers } from 'vuex'
import { showContextMenu as showSideDrawerContextMenu } from 'src/contextMenu/sideDrawer'
import TierRankingDialog from 'components/ui/dialog/TierRankingDialog'
import bus from './bus'
import events from 'src/constants/events'
import * as echarts from 'echarts'

const {
  mapGetters: mapServerGetters,
  mapActions: mapServerActions,
  mapState: mapServerState
} = createNamespacedHelpers('server')

const { mapActions: mapClientActions, mapState: mapClientState } = createNamespacedHelpers('client')

/**
 * Treemap value rules (using real note count from Wiz API):
 * - Bottom 80% (by note count): same value → similar "one row" small tiles
 * - Top 20%: larger values → squarify produces taller blocks ("跨两行")
 * @param {Array}  tags           - raw tag list from store
 * @param {Object} tagNotesCount - { [tagGuid]: number }
 */
function calculateTagTreeMapData (tags = [], tagNotesCount = {}) {
  if (!tags || tags.length === 0) return []

  const total = tags.length
  const top20Count = Math.ceil(total * 0.2)

  // Sort by note count desc, so top 20% by count get the largest blocks
  const sorted = tags
    .map(tag => ({
      ...tag,
      noteCount: tagNotesCount[tag.tagGuid] ?? tagNotesCount[tag.key] ?? 0
    }))
    .sort((a, b) => b.noteCount - a.noteCount)

  const base = 100

  return sorted.map((tag, index) => {
    let value
    if (index < top20Count) {
      // Top 20%: proportional to rank (biggest count = biggest block)
      const rankFactor = (top20Count - index) / top20Count
      value = base * (1.8 + 1.5 * rankFactor)
    } else {
      value = base
    }
    return {
      name: tag.label || tag.name,
      tagGuid: tag.tagGuid || tag.key,
      value: Math.max(1, Math.round(value)),
      noteCount: tag.noteCount
    }
  })
}

export default {
  name: 'CategoryTreePanel',
  components: { TierRankingDialog },
  data () {
    return {
      thumbStyle: {
        display: 'none'
      },
      barStyle: {
        display: 'none'
      },
      tagChart: null,
      tagChartData: []
    }
  },
  computed: {
    type () {
      return this.sidebarTreeType
    },
    items () {
      if (this.type === 'category') {
        return this.categories
      } else if (this.type === 'tag') {
        return this.tags
      }
      return []
    },
    treeProps () {
      return {
        children: 'children',
        label: 'label'
      }
    },
    ...mapServerGetters(['categories', 'tags']),
    ...mapServerState(['currentCategory', 'tagNotesCount']),
    ...mapClientState(['rightClickCategoryItem', 'sidebarTreeType'])
  },
  methods: {
    nodeIconClass: function (node) {
      if (this.type !== 'category') return 'el-icon-price-tag'

      const isExpanded = node.expanded
      const isSelected = this.currentCategory === node.key

      if (isSelected || isExpanded) {
        return 'el-icon-folder-opened'
      }
      return 'el-icon-folder'
    },
    isNodeSelected: function (node) {
      return this.currentCategory === node.key
    },
    initTagTreemap () {
      if (this.type !== 'tag' || !this.$refs.chartContainer) return

      this.tagChartData = calculateTagTreeMapData(this.items, this.tagNotesCount)

      if (!this.tagChart) {
        this.tagChart = echarts.init(this.$refs.chartContainer)
      }

      const isDark = this.$q.dark.isActive
      const selectedColor = 'var(--themeColor)'

      const option = {
        backgroundColor: 'transparent',
        series: [{
          type: 'treemap',
          width: '100%',
          height: '100%',
          // 覆盖 ECharts 默认 left/top/right/bottom（tokens.size），否则会留白
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          sort: 'desc',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          upperLabel: { show: false },
          label: {
            show: true,
            formatter: (params) => {
              const { name, noteCount } = params.data
              return `{name|${name}}\n{count|(${noteCount})}`
            },
            rich: {
              name: {
                color: '#fff',
                fontSize: 12,
                lineHeight: 16,
                overflow: 'truncate'
              },
              count: {
                color: 'rgba(255,255,255,0.75)',
                fontSize: 11,
                lineHeight: 14
              }
            },
            align: 'center',
            verticalAlign: 'middle',
            minSize: 8
          },
          itemStyle: {
            borderColor: isDark ? '#2d2d2d' : '#fff',
            borderWidth: 2,
            gapWidth: 2
          },
          emphasis: {
            upperLabel: { show: false },
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.3)'
            }
          },
          visualMin: 100,
          visualMax: 400,
          color: isDark
            ? ['#4a9eff', '#50c9a8', '#f5a623', '#e74c3c', '#9b59b6', '#1abc9c', '#3498db']
            : ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#1890ff'],
          data: this.tagChartData
        }]
      }

      this.tagChart.setOption(option)

      this.tagChart.off('click')
      this.tagChart.on('click', (params) => {
        if (params.data && params.data.tagGuid) {
          this.handleTagClick(params.data.tagGuid)
        }
      })
    },
    handleTagClick (tagGuid) {
      const tagData = this.items.find(t => (t.key || t.tagGuid) === tagGuid)
      if (tagData) {
        this.updateCurrentCategory({ data: tagGuid, type: this.type })
        this.expandFullPaneLayout()
        this.updateTagTreemapHighlight(tagGuid)
      }
    },
    updateTagTreemapHighlight (selectedTagGuid) {
      if (!this.tagChart) return

      const isDark = this.$q.dark.isActive
      const selectedColor = 'var(--themeColor)'

      this.tagChart.setOption({
        series: [{
          data: this.tagChartData.map(item => ({
            ...item,
            itemStyle: {
              borderColor: (item.tagGuid === selectedTagGuid) ? selectedColor : (isDark ? '#2d2d2d' : '#fff'),
              borderWidth: (item.tagGuid === selectedTagGuid) ? 3 : 2,
              gapWidth: 2
            }
          }))
        }]
      })
    },
    handleNodeClick: function (data, node) {
      this.updateCurrentCategory({ data: data.key, type: this.type })
      this.expandFullPaneLayout()
    },
    contextMenuHandler: function (e, data, node) {
      if (this.type !== 'category') return
      this.setRightClickCategoryItem(data.key)
      e.stopPropagation()
      showSideDrawerContextMenu(e, this.currentCategory === data.key, data.key)
    },
    drawerContextMenuHandler: function (e) {
      if (this.type !== 'category') return
      this.setRightClickCategoryItem('')
      e.stopPropagation()
      showSideDrawerContextMenu(e, this.currentCategory === '', '')
    },
    tagTreemapContextMenuHandler: function (e) {
      e.preventDefault()
    },
    openTierRankingHandler: function () {
      this.$refs.tierRankingDialog.toggle()
    },
    resizeTagTreemap () {
      if (this.tagChart && this.type === 'tag') {
        this.tagChart.resize()
      }
    },
    ...mapServerActions(['updateCurrentCategory']),
    ...mapClientActions(['setRightClickCategoryItem', 'expandFullPaneLayout'])
  },
  mounted () {
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.openTierRanking, this.openTierRankingHandler)
    bus.$on(events.TAG_TREEMAP_RESIZE, this.resizeTagTreemap)
  },
  beforeDestroy () {
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.openTierRanking, this.openTierRankingHandler)
    bus.$off(events.TAG_TREEMAP_RESIZE, this.resizeTagTreemap)
    if (this.tagChart) {
      this.tagChart.dispose()
      this.tagChart = null
    }
  },
  watch: {
    currentCategory: {
      immediate: true,
      handler (val) {
        if (this.type === 'category' && this.$refs.tree) {
          this.$refs.tree.setCurrentKey(val)
        } else if (this.type === 'tag' && this.tagChart) {
          this.updateTagTreemapHighlight(val)
        }
      }
    },
    type: {
      immediate: true,
      handler (newType) {
        if (newType === 'tag') {
          this.$nextTick(() => {
            this.initTagTreemap()
          })
        } else if (this.tagChart) {
          this.tagChart.dispose()
          this.tagChart = null
        }
      }
    },
    items: {
      deep: true,
      handler () {
        if (this.type === 'tag') {
          this.$nextTick(() => {
            this.initTagTreemap()
          })
        }
      }
    },
    tagNotesCount: {
      deep: true,
      handler () {
        if (this.type === 'tag') {
          this.$nextTick(() => {
            this.initTagTreemap()
          })
        }
      }
    }
  }
}
</script>

<style lang="scss">
.category-tree-panel {
  min-width: 0;
  min-height: 0;
}

.tag-treemap-container {
  width: 100%;
  height: 100%;
  padding: 10px;
  box-sizing: border-box;
}

.memocast-el-tree {
  background: transparent;
  padding: 8px 0;

  .el-tree-node {
    padding-left: 0;
  }

  .el-tree-node__content {
    height: 32px;
    line-height: 32px;
    padding-left: 0;
  }

  .el-tree__indent {
    display: inline-block;
  }

  .el-tree-node__expand-icon {
    font-size: 14px;
    color: var(--iconColor);
    padding: 4px;
    margin-right: 4px;
    flex-shrink: 0;
  }

  .el-tree-node__expand-icon.is-leaf {
    color: transparent;
  }

  .el-tree-node.is-current > .el-tree-node__content {
    background-color: var(--themeColor10);
  }

  .el-tree-node__content:hover {
    background-color: var(--floatHoverColor);
  }

  .el-tree-node:focus > .el-tree-node__content {
    background-color: var(--themeColor10);
  }

  .memocast-tree-node {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    padding-right: 8px;
    column-gap: 4px;

    .memocast-tree-folder-icon {
      flex-shrink: 0;
      color: var(--iconColor);
    }

    .node-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: inherit;
    }
  }
}
</style>
