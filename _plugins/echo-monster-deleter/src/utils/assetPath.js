// ============================================================================
// assetPath.js —— 把 spritesheet 的资源路径稳定映射到 import.meta.url 派生 URL
//
// 由于 Vite/Vue 2.7 消费资源时一般用 `import xxx from '@/assets/...'`
// 这里以 ESM 形式手动构造一组 URL，供 MonsterStageController / 播放音频模块使用。
// ============================================================================

import chooseBgUrl from '../assets/选择界面/选择界面.png'
import walkSheetUrl from '../assets/走路动效_spritesheet_transparent.png'
import pointSheetUrl from '../assets/指着文件_spritesheet_transparent.png'
import kickSheetUrl from '../assets/踹文件动效_spritesheet_transparent.png'
import leoSheetUrl from '../assets/雷欧登场_spritesheet_transparent.png'
import flySheetUrl from '../assets/出场飞行动效_spritesheet_transparent.png'
import explosionSheetUrl from '../assets/爆炸_spritesheet_transparent.png'

// 音频改为 new URL() 加载，避免 Vite 把 .MP4 / .mp3 走成 ESM import-analysis
// （vite 5 默认不识别 .MP4 后缀）；new URL 走静态资源 URL 路径，build 时
// 会自动落到 assets 目录并替换为 hash 化的 URL。
const bgmUrl = new URL('../assets/音频/bgm(1).mp3', import.meta.url).href
const sfxUrl = new URL('../assets/音频/怪兽说话.mp3', import.meta.url).href
const explosionUrl = new URL('../assets/音频/爆炸.MP4', import.meta.url).href

export const ASSETS = {
  audio: {
    bgm: bgmUrl,
    sfx: sfxUrl,
    explosion: explosionUrl
  },
  background: chooseBgUrl,
  sprite: {
    walk: walkSheetUrl,
    point: pointSheetUrl,
    kick: kickSheetUrl,
    leo: leoSheetUrl,
    fly: flySheetUrl,
    explosion: explosionSheetUrl
  }
}

// MonsterStageController 期望的 assetBase 形如 '../assets/' 结尾，
// 用于拼接子文件路径。这里把 5 张精灵图打成 patch 表，让 controller
// 走 Object.keys(...) 拿 URL。
export const SPRITE_URLS = {
  walk: ASSETS.sprite.walk,
  point: ASSETS.sprite.point,
  kick: ASSETS.sprite.kick,
  leo: ASSETS.sprite.leo,
  fly: ASSETS.sprite.fly,
  explosion: ASSETS.sprite.explosion
}
