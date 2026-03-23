<template>
  <div class="category-tree-panel full-height column">
    <q-scroll-area
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
          <i :class="nodeIconName(node)" class="node-icon"></i>
          <span
            class="node-label"
            :style="isNodeSelected(node) ? 'color: var(--themeColor)' : ''"
          >{{ node.label }}</span>
        </span>
      </el-tree>
    </q-scroll-area>
  </div>
</template>

<script>
import { createNamespacedHelpers } from 'vuex'
import { showContextMenu as showSideDrawerContextMenu } from 'src/contextMenu/sideDrawer'
import bus from './bus'
import events from 'src/constants/events'

const {
  mapGetters: mapServerGetters,
  mapActions: mapServerActions,
  mapState: mapServerState
} = createNamespacedHelpers('server')

const { mapActions: mapClientActions, mapState: mapClientState } = createNamespacedHelpers('client')

export default {
  name: 'CategoryTreePanel',
  computed: {
    thumbStyle () {
      return {
        display: 'none'
      }
    },

    barStyle () {
      return {
        display: 'none'
      }
    },
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
    ...mapServerState(['currentCategory']),
    ...mapClientState(['rightClickCategoryItem', 'sidebarTreeType'])
  },
  methods: {
    nodeIconName: function (node) {
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
    handleNodeClick: function (data, node) {
      this.updateCurrentCategory({ data: data.key, type: this.type })
      this.toggleChanged({
        key: 'noteListVisible',
        value: true
      })
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
    openCategoryHandler: function () {
      this.updateCurrentCategory({ data: this.rightClickCategoryItem, type: this.type })
      this.toggleChanged({
        key: 'noteListVisible',
        value: true
      })
    },
    ...mapServerActions(['updateCurrentCategory']),
    ...mapClientActions(['toggleChanged', 'setRightClickCategoryItem'])
  },
  mounted () {
    bus.$on(events.SIDE_DRAWER_CONTEXT_MENU.openCategory, this.openCategoryHandler)
  },
  beforeDestroy () {
    bus.$off(events.SIDE_DRAWER_CONTEXT_MENU.openCategory, this.openCategoryHandler)
  },
  watch: {
    currentCategory: {
      immediate: true,
      handler (val) {
        if (this.$refs.tree) {
          this.$refs.tree.setCurrentKey(val)
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
    padding-right: 8px;

    .node-icon {
      margin-right: 8px;
      font-size: 16px;
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
