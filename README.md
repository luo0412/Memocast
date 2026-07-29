# README

基于memocast，加入自己的笔记习惯进行二创，全程鞭策AI实现(基本已失控！！！)。

# 文件夹模式

<img width="1123" height="748" alt="image" src="https://github.com/user-attachments/assets/ee1ac04d-3eb0-41fe-a58e-b414bf60e5c0" />

# 标签模式

<img width="1123" height="748" alt="image" src="https://github.com/user-attachments/assets/93467559-16bd-48df-b730-9d21541ddb0f" />

# 日历模式

<img width="1123" height="748" alt="image" src="https://github.com/user-attachments/assets/18fd3798-90c6-4205-a20e-5a00b43852d4" />

---

# Muya 编辑器 Echo & Rune

> **本文只放截图 + 一句话指引。Echo / Rune 的深度架构、命名约定、内置卡片清单、anno_source 模板、rune SFC 流水线、与 Muya 集成方式、决策树，全部迁到 skills 目录。**

Echo（回响）= `@xxx{props}(prompt)`，main 功能是改附近元素的排版/动画；Rune（符文）= Vue SFC 模板，由 `Vue.extend` 渲染成自包含卡片。两条管线完全独立。

**深度文档：**

- 设计速查 / 决策树 / 内置卡片清单 / 命名坑 → [`.cursor/skills/rune-echo-design/SKILL.md`](.cursor/skills/rune-echo-design/SKILL.md)
- 源码级逐行解析 / anno_source 完整形态 / rune SFC 编译流程 / handler body 范式 → [`.cursor/skills/rune-echo-design/reference.md`](.cursor/skills/rune-echo-design/reference.md)
- 试验阶段规则（不兼容、不背历史包袱、graceful skip 原则）→ [`.cursor/rules/rune-echo-cloudfn-experimental.mdc`](.cursor/rules/rune-echo-cloudfn-experimental.mdc)
- 测试护城河（哪些契约被 Jest 锁住、何时必须更新用例）→ [`.cursor/rules/rune-echo-test-moat.mdc`](.cursor/rules/rune-echo-test-moat.mdc)
