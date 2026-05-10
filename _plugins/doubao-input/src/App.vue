<script setup lang="ts">
import { ref } from 'vue';
import ChatInput from './components/ChatInput/index.vue'
import type { Node } from 'slate-vue3/core';
import type { CustomNode } from './components/type';

const skills = ref<{
  label: string;
  value: string;
  url: string;
  description: string;
  skill: CustomNode[];
}[]>([
  {
    label: '写作',
    value: '1',
    url: "",
    description: "分步骤生成大纲和文档",
    skill: [
      {
        type: 'paragraph',
        children: [
          { text: '我是一名' },
          { type: 'input-tag', children: [{ text: '公众号博主' }], label: '[输入职业]' },
          { text: '，帮我写一篇关于' },
          { type: 'input-tag', children: [{ text: '' }], label: '[输入主题]' },
          { type: 'select-tag', children: [{ text: '' }], value: '文章', options: [{ label: '文章', value: '文章' }, { label: '论文', value: '论文' }, { label: '研究报告', value: '研究报告' }] },
        ]
      }
    ]
  },
  {
    label: '翻译',
    value: '2',
    url: "https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/samantha/writing-templates/icon/Article.png",
    description: "撰写各主流平台文章",
    skill: [
      {
        type: 'paragraph', children: [
          { text: '我是', },
          { type: 'input-tag', children: [{ text: '计算机' }], label: '[计算机]' },
          { text: '专业的', },
          { type: 'select-tag', children: [{ text: '' }], value: '本科生', options: [{ label: '本科生', value: '本科生' }, { label: '研究生', value: '研究生' }, { label: '博士生', value: '博士生' }] },
          { text: '帮我写一篇关于', },
          { type: 'input-tag', children: [{ text: '' }], label: '[输入主题]' },
          { text: '的论文。', },
        ],
      },
    ]
  },
  {
    label: '翻译',
    value: '3',
    url: "https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/samantha/writing-templates/icon/Article.png",
    description: "凝练你的工作成效",
    skill: [
      {
        type: 'paragraph',
        children: [{ text: '这是一个段落' }]
      }
    ]
  },
  {
    label: '翻译',
    value: '4',
    url: "https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/samantha/writing-templates/icon/Article.png",
    description: "撰写专业详实的论文",
    skill: [
      {
        type: 'paragraph',
        children: [{ text: '这是一个段落' }]
      }
    ]
  },
  {
    label: '翻译',
    value: '5',
    url: "https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/samantha/writing-templates/icon/Article.png",
    description: "专为学生打造满分作文",
    skill: [
      {
        type: 'paragraph',
        children: [{ text: '这是一个段落' }]
      }
    ]
  },
])

const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null);

function handleSelect(item: { skill: Node[] }) {
  chatInputRef.value?.setEditValue(item.skill)
}
</script>

<template>
  <div class="container">
    <div class="content-wrapper">
      <h1>帮我写作</h1>
      <h2>多种体裁，润色校对，一键成文</h2>
      <ChatInput ref="chatInputRef" />
      <!-- 技能列表 -->
      <div class="skill-box">
        <div class="skill-item" v-for="item in skills" :key="item.value" @click="handleSelect(item)">
          <div class="item-header">
            <img v-if="item.url" :src="item.url" class="skill-icon" />
            <div class="skill-label">{{ item.label }}</div>
          </div>
          <div class="item-description">
            {{ item.description }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;

  .content-wrapper {
    display: flex;
    flex-direction: column;
    justify-content: center;
    max-width: 809px;
    width: 100%;

    h1 {
      color: var(--s-color-text-secondary);
      font: var(--s-font-h1);
      margin: 28px 0 10px 0;
      text-align: center;
    }

    h2 {
      height: 52px;
      font: var(--s-font-base);
      text-align: center;
      color: rgba(0, 0, 0, 0.3);
      margin-bottom: 20px;
    }

    .skill-box {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
      margin-top: 20px;

      .skill-item {
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 10px;
        height: 86px;
        display: flex;
        flex-direction: column;
        padding: 10px 16px 0 16px;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }

        .item-header {
          display: flex;
          align-items: center;

          .skill-icon {
            width: 18px;
            height: 18px;
          }

          .skill-label {
            color: var(--s-color-text-primary);
            font: var(--s-font-small-strong);
            padding-left: 8px;
          }
        }

        .item-description {
          height: 32px;
          margin-top: 4px;
          width: 100%;
          color: var(--s-color-text-quaternary);
          font-size: 12px;
          line-height: 16px;
        }
      }
    }
  }
}
</style>