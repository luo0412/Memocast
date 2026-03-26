<template>
  <q-dialog ref='dialog' persistent>
    <q-card class='rune-form-card'>
      <q-card-section class='row items-center q-pb-none'>
        <div class='text-subtitle1'>
          {{ isEditing ? $t('runeCardEdit') : $t('runeCardAdd') }}
        </div>
        <q-space />
        <q-btn icon='close' flat round dense v-close-popup />
      </q-card-section>
      <q-separator />
      <q-card-section class='q-gutter-sm'>
        <div>
          <div class='text-caption text-grey-7 q-mb-xs'>{{ $t('runeCardName') }}</div>
          <q-input
            v-model='form.name'
            dense outlined
            :placeholder="$t('runeCardName')"
          />
        </div>
        <div>
          <div class='text-caption text-grey-7 q-mb-xs'>{{ $t('runeCardDesc') }}</div>
          <q-input
            v-model='form.desc'
            dense outlined
            type='textarea'
            rows='2'
            :placeholder="$t('runeCardDesc')"
          />
        </div>
        <div class='row q-col-gutter-xs'>
          <div class='col-6'>
            <div class='text-caption text-grey-7 q-mb-xs'>{{ $t('runeCardPower') }}</div>
            <q-input
              v-model.number='form.power'
              dense outlined
              type='number'
              min='1'
              max='100'
            />
          </div>
          <div class='col-6'>
            <div class='text-caption text-grey-7 q-mb-xs'>图标</div>
            <q-select
              v-model='form.icon'
              dense outlined
              :options='iconOptions'
              emit-value
              map-options
            >
              <template v-slot:selected>
                <q-icon :name='form.icon' size='sm' />
              </template>
            </q-select>
          </div>
        </div>
        <div>
          <div class='text-caption text-grey-7 q-mb-xs'>颜色</div>
          <div class='row q-gutter-xs'>
            <div
              v-for='c in colorOptions'
              :key='c.value'
              class='color-dot'
              :style='{ background: c.value }'
              :class="{ selected: form.color === c.value }"
              @click='form.color = c.value'
            />
          </div>
        </div>
      </q-card-section>
      <q-card-actions align='right' class='q-px-md q-pb-md'>
        <q-btn flat :label="$q.lang.label.cancel" v-close-popup />
        <q-btn
          unelevated
          :label="$q.lang.label.ok"
          color='primary'
          @click='submit'
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
export default {
  name: 'RuneFormDialog',
  props: {
    rune: {
      type: Object,
      default: null
    }
  },
  data () {
    return {
      form: {
        id: '',
        name: '',
        desc: '',
        power: 50,
        color: '#7E57C2',
        icon: 'auto_awesome'
      },
      iconOptions: [
        { label: '火焰 whatsho', value: 'whatshot' },
        { label: '冰霜 ac_unit', value: 'ac_unit' },
        { label: '闪电 flash_on', value: 'flash_on' },
        { label: '爱心 favorite', value: 'favorite' },
        { label: '月亮 nights_stay', value: 'nights_stay' },
        { label: '太阳 wb_sunny', value: 'wb_sunny' },
        { label: '星星 star', value: 'star' },
        { label: '魔法 whatshot', value: 'whatshot' },
        { label: '漩涡 ring', value: 'ring' },
        { label: '护盾 security', value: 'security' },
        { label: '翅膀 flight', value: 'flight' },
        { label: '骷髅 skull', value: 'skull' },
        { label: '水晶 gradient', value: 'gradient' },
        { label: '叶子 eco', value: 'eco' },
        { label: '水 water_drop', value: 'water_drop' }
      ],
      colorOptions: [
        { value: '#FF6B35' },
        { value: '#4FC3F7' },
        { value: '#AB47BC' },
        { value: '#66BB6A' },
        { value: '#7E57C2' },
        { value: '#FFD54F' },
        { value: '#EF5350' },
        { value: '#26A69A' },
        { value: '#FF7043' },
        { value: '#5C6BC0' },
        { value: '#EC407A' },
        { value: '#8D6E63' }
      ]
    }
  },
  computed: {
    isEditing () {
      return !!this.rune
    }
  },
  watch: {
    rune: {
      immediate: true,
      handler (val) {
        if (val) {
          this.form = { ...val }
        } else {
          this.form = {
            id: 'rune-' + Date.now(),
            name: '',
            desc: '',
            power: 50,
            color: '#7E57C2',
            icon: 'whatshot'
          }
        }
      }
    }
  },
  methods: {
    submit () {
      if (!this.form.name.trim()) return
      this.$emit('submit', { ...this.form })
      this.$refs.dialog.hide()
    }
  }
}
</script>

<style scoped>
.rune-form-card {
  min-width: 340px;
  max-width: 400px;
}
.color-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.15s, border-color 0.15s;
}
.color-dot:hover {
  transform: scale(1.15);
}
.color-dot.selected {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
}
</style>
