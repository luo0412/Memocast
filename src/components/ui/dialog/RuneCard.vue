<template>
  <div class='rune-card' :style='cardStyle'>
    <div class='rune-card-header' :style='headerStyle'>
      <div class='rune-card-icon' :style='iconBadgeStyle'>
        <q-icon v-if='hasIcon' :name='rune.icon' class='rune-card-icon-glyph' />
        <span v-else class='rune-card-icon-text'>{{ runeInitial }}</span>
      </div>
      <div class='rune-card-power'>
        <span class='power-label'>{{ $t('runeCardPower') }}</span>
        <span class='power-value'>{{ rune.power }}</span>
      </div>
    </div>
    <div class='rune-card-body'>
      <div class='rune-card-name'>{{ rune.name }}</div>
      <div class='rune-card-desc'>{{ rune.desc }}</div>
    </div>
    <div class='rune-card-footer'>
      <q-btn flat dense size='sm' :label="$t('runeCardEdit')" color='white' @click='$emit("edit", rune)' />
      <q-btn flat dense size='sm' :label="$t('runeCardDelete')" color='red-3' @click='$emit("delete", rune)' />
    </div>
  </div>
</template>

<script>
const isChineseCharacter = char => /[\u3400-\u9FFF]/.test(char)
const isAlphabetCharacter = char => /[A-Za-z]/.test(char)

const getRuneInitial = rune => {
  const sourceText = String(rune?.name || rune?.text || rune?.label || '').trim()
  const firstChar = Array.from(sourceText)[0]

  if (!firstChar) return '符'
  if (isChineseCharacter(firstChar)) return firstChar
  if (isAlphabetCharacter(firstChar)) return firstChar.toUpperCase()
  return firstChar
}

export default {
  name: 'RuneCard',
  props: {
    rune: {
      type: Object,
      required: true
    }
  },
  computed: {
    hasIcon () {
      return Boolean(this.rune.icon)
    },
    runeInitial () {
      return getRuneInitial(this.rune)
    },
    iconBadgeStyle () {
      return {
        background: 'rgba(255, 255, 255, 0.16)',
        borderColor: `${this.rune.color || '#7E57C2'}66`
      }
    },
    cardStyle () {
      return {
        borderColor: this.rune.color + '66'
      }
    },
    headerStyle () {
      return {
        background: `linear-gradient(135deg, ${this.rune.color}dd 0%, ${this.rune.color}88 100%)`
      }
    }
  }
}
</script>

<style scoped>
.rune-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 160px;
  height: 100%;
  border-radius: 12px;
  border: 2px solid;
  overflow: hidden;
  background: #1a1a2e;
  color: #e0e0e0;
  cursor: grab;
  transition: transform 0.2s, box-shadow 0.2s;
  user-select: none;
  position: relative;
}

.rune-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 1;
}

.rune-card:active {
  cursor: grabbing;
}

.rune-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 6px;
  height: 60px;
  box-sizing: border-box;
}

.rune-card-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  border: 1px solid transparent;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(6px);
  flex-shrink: 0;
}

.rune-card-icon-glyph {
  font-size: 1.15rem;
  color: #fff;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
}

.rune-card-icon-text {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.rune-card-power {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 3px 7px;
}

.power-label {
  font-size: 0.55rem;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1;
}

.power-value {
  font-size: 1rem;
  font-weight: bold;
  color: #fff;
  line-height: 1.2;
}

.rune-card-body {
  flex: 1;
  padding: 6px 10px 2px;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.rune-card-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rune-card-desc {
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.rune-card-footer {
  display: flex;
  justify-content: space-between;
  padding: 2px 6px 6px;
  background: rgba(0, 0, 0, 0.2);
  height: 32px;
  box-sizing: border-box;
}

.rune-card-footer .q-btn {
  font-size: 0.62rem;
  min-height: 20px;
  padding: 0 2px;
  color: rgba(255, 255, 255, 0.85);
}
</style>
