<template>
  <div class="calendar-panel full-height column">
    <q-scroll-area
      :thumb-style="thumbStyle"
      :bar-style="barStyle"
      :class="`exclude-header note-list${$q.dark.isActive ? '-dark' : ''}`"
      class="col"
    >
      <!-- fullscreen=false 为卡片模式（非全屏日历） -->
      <a-calendar
        :value="pickDate"
        :fullscreen="false"
        @select="onSelect"
      />
    </q-scroll-area>
  </div>
</template>

<script>
import moment from 'moment'
import { createNamespacedHelpers } from 'vuex'

const { mapState: mapClientState, mapActions: mapClientActions } = createNamespacedHelpers('client')
const { mapActions: mapServerActions } = createNamespacedHelpers('server')

export default {
  name: 'CalendarPanel',
  data () {
    return {
      pickDate: moment()
    }
  },
  computed: {
    thumbStyle () {
      return { display: 'none' }
    },
    barStyle () {
      return { display: 'none' }
    },
    ...mapClientState(['calendarSelectedDate'])
  },
  watch: {
    calendarSelectedDate (s) {
      if (!s) return
      const ymd = this.toYmd(this.pickDate)
      if (ymd === s) return
      const d = this.parseYmd(s)
      if (d) this.pickDate = moment(d)
    }
  },
  mounted () {
    if (this.calendarSelectedDate) {
      const d = this.parseYmd(this.calendarSelectedDate)
      if (d) this.pickDate = moment(d)
    }
  },
  methods: {
    parseYmd (s) {
      const parts = s.split('-').map(p => parseInt(p, 10))
      if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null
      return new Date(parts[0], parts[1] - 1, parts[2])
    },
    toYmd (m) {
      return m.format('YYYY-MM-DD')
    },
    onSelect (val) {
      const ymd = val.format('YYYY-MM-DD')
      if (ymd === this.calendarSelectedDate) return
      this.toggleChanged({ key: 'calendarSelectedDate', value: ymd })
      this.getCategoryNotes()
    },
    ...mapClientActions(['toggleChanged']),
    ...mapServerActions(['getCategoryNotes'])
  }
}
</script>

<style lang="scss">
.calendar-panel {
  min-width: 0;
  min-height: 0;
}
</style>
