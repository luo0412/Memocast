<template>
  <div class='rune-card' :style='cardStyle'>
    <div class='rune-card-header' :style='headerStyle'>
      <q-icon :name='rune.icon' class='rune-card-icon' />
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
export default {
  name: 'RuneCard',
  props: {
    rune: {
      type: Object,
      required: true
    }
  },
  computed: {
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
  display: block;
  width: 148px;
  height: 160px;
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
  font-size: 1.8rem;
  color: #fff;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
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
  padding: 6px 10px 2px;
  height: 68px;
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
