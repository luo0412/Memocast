# 🎯 echo-monster-deleter

> 把 [531149627/MonsterDeleter](https://github.com/531149627/MonsterDeleter) 的 PyQt 交互剧场移植到 Vue 3 + Vite 的 Web 单页应用。

## 它做什么

怪物会从屏幕左边走来，半路停下指着文件，问"喂，是这个吗？"，你点了"是的"，它就一脚把文件踹爆（连带爆炸特效 + 音效），然后雷欧登场，转身飞出屏幕外。

## 5 阶段状态机（来自 main.py）

| # | 阶段 | 资源 | 行为 |
|---|------|------|------|
| 1 | `walk`  | `走路动效_spritesheet_transparent.png` (5×3) | 8 FPS loop · 4500 ms OutQuad 缓动横向移动 |
| 2 | `point` | `指着文件_spritesheet_transparent.png` (5×3 · 仅 11-14 帧) | 8 FPS 一次性播放 |
| 3 | `kick`  | `踹文件动效_spritesheet_transparent.png` (5×3) | 8 FPS 一次性；第 6 帧触发爆炸 |
| 4 | `leo`   | `雷欧登场_spritesheet_transparent.png` (5×3) | 8 FPS 一次性 |
| 5 | `fly`   | `出场飞行动效_spritesheet_transparent.png` (5×3) | 8 FPS loop + 2000 ms InQuad 飞出屏幕 |

## 音频三轨（PyQt QMediaPlayer → HTMLAudioElement）

| 轨 | 来源 | 触发时机 |
|----|------|---------|
| bgm | `音频/bgm(1).mp3` | `walk` 阶段开始（loop） |
| sfx | `音频/怪兽说话.mp3` | `point` 阶段开始 |
| explosion | `音频/爆炸.MP4` | `kick` 阶段第 6 帧 |

## 目录结构

```
echo-monster-deleter/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── components/
│   │   ├── monsterSprite.vue   # 单帧怪兽精灵渲染器（canvas 输出）
│   │   └── monsterStage.vue    # 完整舞台 = 背景 + 怪兽 + 爆炸 + 对话泡
│   ├── utils/
│   │   ├── spriteAnimator.js   # SpriteAnimator（PyQt 移植 + Vue rAF 驱动）
│   │   ├── monsterSequence.js  # 5 阶段状态机 + 元数据
│   │   ├── sniperCursor.js     # SVG 红色十字狙击光标
│   │   └── assetPath.js        # 资源 URL 集中导出
│   └── assets/
│       ├── *.png               # 6 张 spritesheet（抠过图）
│       ├── 选择界面/选择界面.png
│       └── 音频/{bgm, sfx, explosion}
```

## 启动

```bash
cd _plugins/echo-monster-deleter
yarn install
yarn dev    # vite 启动 http://localhost:5175
```

## 关键设计决策

### 1. 帧序列播放器
- 用 `createImageBitmap` 一次性切好所有帧（默认 5×3=15 帧、单帧 targetHeight=250）
- 切帧在内存 ImageBitmap 上做，避免每帧重切导致主线程卡顿
- 用 `requestAnimationFrame` + 累计 dt 驱动，保证不掉帧（PyQt 用 QTimer 1000/fps）

### 2. 走路 / 飞行的缓动
- PyQt 用 `QPropertyAnimation` + `OutQuad / InQuad` 缓动
- 这里用 rAF + `1 - (1-t)^2`（OutQuad）/ `t*t`（InQuad）复刻
- 走路 4500 ms，飞行 2000 ms

### 3. 跨工程隔离
- 独立 `package.json`（vue 3.5、vite 5、@vitejs/plugin-vue）
- 资源全部本地化（无 cdn 依赖），独立 `vite serve` 端口 5175
- 与主项目 coolma-muya / Vue 2.7 完全解耦，不会污染 SDK 边界

### 4. 资源命名
- 6 张 spritesheet 沿用源项目文件名（中文），不重命名
- 音频也沿用源项目文件名
- 直接走 `import xxx from '../assets/...'` 拿 URL（Vite 处理）

### 5. 指认 → 踹腿之间的中间状态（v2026-08-07）

怪兽在「指认完成 → 踹腿」之间加了 `AWAIT_CONFIRM` 中间态，避免还没确认就先踢：

```
IDLE → WALK → POINT → AWAIT_CONFIRM ─[confirm()]→ KICK → EXPLOSION → LEO → FLY → DONE
                          │
                          └─[cancel()/visible=false]→ IDLE（清理现场）
```

- `_stagePoint` 播完 frames 11~14 后把 `monster.currentFrame` 钉死在最后一帧
- 进入 `AWAIT_CONFIRM` 后创建 `confirmPromise` 等待外部 resolve
- `monsterStage` 的 `onChoice()` 调 `controller.confirm()` 推进到 KICK
- `controller.stop()` 会 reject `confirmPromise`，让 `start()` 走 cancel 分支

### 6. 文件摧毁状态

- `fakeFiles` 增 `destroyed` 字段
- `onFinished` 回调把 `targetFile.destroyed = true`
- tile 切到「💥 + 删除线 + 已摧毁」样式，不可再点
- 全部摧毁后召唤按钮自动 disable；提供「重置所有文件」按钮

### 7. 重置链路

`monsterStage._teardown()` 统一收口所有清理：

- `controller.stop()` 拒绝 confirmPromise，确保 `start()` 不悬挂
- 清空所有 sprite / position / bubble / choices
- 仅在自然结束（`onFlyFinished`）调 `onFinished()`；
  `visible=false` / `beforeDestroy` 时 silent 不回调父级
- `App.vue.onFinished()` 再标记 tile 摧毁、关闭舞台

## 与原项目的差异

| 维度 | 原 PyQt | Web 复刻 |
|------|---------|---------|
| 图形 | QPixmap / QPainter | ImageBitmap + canvas 2d |
| 定时器 | QTimer | rAF + 累计 dt |
| 缓动 | QPropertyAnimation | rAF + ease 函数 |
| 音频 | QMediaPlayer × 3 | HTMLAudioElement × 3 |
| 鼠标 | 自定义 QCursor | SVG dataURL cursor |
| 触发 | 右键菜单注册 | 按钮 + 文件 tile 点击 |

文件并未真实删除 —— 仅演示怪兽剧场。原项目的 send2trash 路径在 Web 端没有等价物；真要把它变成 Browser 端的"垃圾箱"插件，可考虑：
- Tauri/Neutralino 类跨端框架
- File System Access API（仅 chrome/edge 部分支持）
- 单独的"假装删除"模式（保留这份 demo 的展示本质）
