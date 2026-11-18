const DAY = 86400000
const ROLLOVER_COLOR = '#a55d27'
const MONTHLY_COLOR = '#766785'
const ranges = [
  { weeks: 0, label: '全部' },
  { weeks: 52, label: '近52周' },
  { weeks: 26, label: '近26周' },
]

function axisBounds(points, valueKey) {
  const values = points.map((point) => point[valueKey])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const interval = (max - min) / 4 || Math.max(Math.abs(max) / 20, 1)
  const magnitude = 10 ** Math.floor(Math.log10(interval))
  const step = [1, 2, 2.5, 5, 10].find((size) => size * magnitude >= interval) * magnitude
  const bottom = Math.floor(min / step) * step

  return { step, bottom, top: Math.max(bottom + step, Math.ceil(max / step) * step) }
}

function hasGap(previous, point) {
  if (previous.frequency === '月度' && point.frequency === '月度') {
    const month = (date) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
    return month(point.date) - month(previous.date) > 1
  }
  if (previous.frequency === '月度') return point.time - previous.time > 35 * DAY

  // Group dates by Monday-start weeks so an early holiday close stays in its own week.
  const week = (time) => Math.floor((time / DAY + 3) / 7)
  return week(point.time) - week(previous.time) > 1
}

function drawDateTicks(ctx, start, end, x) {
  const first = new Date(start)
  const monthStep = end - start > 400 * DAY ? 12 : 3
  const month = (Math.floor(first.getUTCMonth() / monthStep) + 1) * monthStep
  for (const tick = new Date(Date.UTC(first.getUTCFullYear(), month, 1)); tick < end;
    tick.setUTCMonth(tick.getUTCMonth() + monthStep)) {
    const position = x(tick.getTime())
    if (position - x(start) < 23 || x(end) - position < 23) continue
    const label = monthStep === 12 ? tick.getUTCFullYear() : tick.getUTCMonth() + 1 + '月'
    ctx.fillText(String(label), position, 0)
  }
}

Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    title: String,
    series: Array,
    unit: String,
    valueKey: String,
    metaKey: String,
    color: String,
    source: String,
    note: String,
    decimals: Number,
  },

  data: {
    ranges,
    activeWeeks: 0,
    startDate: '',
    endDate: '',
    visibleCount: 0,
    selectedDate: '',
    selectedMeta: '',
    selectedValue: '',
    selectedEvent: '',
    selectedNumber: 0,
    isLatest: true,
  },

  lifetimes: {
    ready() {
      this.points = this.data.series.map((point) => ({
        ...point,
        time: Date.parse(point.date + 'T00:00:00Z'),
      }))
      if (!this.points.length) return
      this.points.forEach((point, index) => {
        const previous = this.points[index - 1]
        if (!previous) return
        point.gap = hasGap(previous, point)
        if (previous.contract && previous.contract !== point.contract) {
          point.previousContract = previous.contract
        }
      })
      this.applyRange(0)
      this.measurePlot()
    },
  },

  pageLifetimes: {
    resize() {
      this.measurePlot()
    },
  },

  methods: {
    measurePlot() {
      if (!this.visiblePoints?.length) return
      this.createSelectorQuery().select('#plot')
        .fields({ node: true, size: true, rect: true }).exec(([plot]) => {
          if (!plot?.node || !plot.width || !plot.height) return

          const { node, width, height, left } = plot
          const ratio = wx.getWindowInfo().pixelRatio
          node.width = Math.round(width * ratio)
          node.height = Math.round(height * ratio)
          const ctx = node.getContext('2d')
          ctx.scale(node.width / width, node.height / height)
          this.plot = { ctx, width, height, left }
          this.draw()
        })
    },

    changeRange(event) {
      const weeks = Number(event.currentTarget.dataset.weeks)
      if (weeks !== this.data.activeWeeks) this.applyRange(weeks)
    },

    applyRange(weeks) {
      const latest = this.points[this.points.length - 1]
      const selected = this.visiblePoints?.[this.pointIndex]
      const cutoff = weeks ? latest.time - weeks * 7 * DAY : this.points[0].time
      const firstIndex = this.points.findIndex((point) => point.time >= cutoff)
      this.visiblePoints = this.points.slice(firstIndex)
      const selectedIndex = this.visiblePoints.indexOf(selected)

      this.setData({
        activeWeeks: weeks,
        startDate: this.visiblePoints[0].date,
        endDate: latest.date,
        visibleCount: this.visiblePoints.length,
      })
      this.showPoint(selectedIndex >= 0 ? selectedIndex : this.visiblePoints.length - 1)
    },

    stepPoint(event) {
      this.showPoint(this.pointIndex + Number(event.currentTarget.dataset.step))
    },

    showPoint(index) {
      const point = this.visiblePoints[index]
      if (!point) return
      const { valueKey, metaKey, decimals } = this.data
      this.pointIndex = index
      this.setData({
        selectedDate: point.date,
        selectedMeta: point[metaKey],
        selectedValue: point[valueKey].toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
        selectedEvent: point.previousContract ? '主力换月 · ' + point.previousContract + ' → ' + point.contract : '',
        selectedNumber: index + 1,
        isLatest: index === this.visiblePoints.length - 1,
      })
      if (this.plot) this.draw()
    },

    draw() {
      const { ctx, width, height } = this.plot
      const { valueKey, color } = this.data
      const points = this.visiblePoints
      const left = 47
      const right = width - 10
      const top = 12
      const bottom = height - 23
      const range = axisBounds(points, valueKey)
      const start = points[0].time
      const end = points[points.length - 1].time
      const x = (time) => end === start ? (left + right) / 2 : left + (time - start) / (end - start) * (right - left)
      const y = (value) => bottom - (value - range.bottom) / (range.top - range.bottom) * (bottom - top)
      this.xPositions = points.map((point) => x(point.time))

      ctx.clearRect(0, 0, width, height)
      if (this.data.metaKey === 'frequency') {
        ctx.fillStyle = '#efe7ec'
        points.forEach((point, index) => {
          if (index > 0 && point.gap && point.time - points[index - 1].time > 35 * DAY) {
            const gapStart = this.xPositions[index - 1]
            ctx.fillRect(gapStart, top, this.xPositions[index] - gapStart, bottom - top)
          }
        })
      }

      ctx.font = '12px sans-serif'
      ctx.fillStyle = '#625360'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.strokeStyle = '#e9dce3'
      ctx.lineWidth = 1
      for (let tick = range.bottom; tick <= range.top; tick += range.step) {
        const lineY = y(tick)
        ctx.beginPath()
        ctx.moveTo(left, lineY)
        ctx.lineTo(right, lineY)
        ctx.stroke()
        ctx.fillText(String(Number(tick.toFixed(2))), left - 6, lineY)
      }

      ctx.textAlign = 'center'
      ctx.save()
      ctx.translate(0, bottom + 15)
      drawDateTicks(ctx, start, end, x)
      ctx.restore()

      const monthly = (point) => point.frequency === '月度'
      ctx.lineWidth = 1.6
      points.forEach((point, index) => {
        if (index === 0 || point.gap) return
        const previous = points[index - 1]
        ctx.strokeStyle = point.previousContract ? ROLLOVER_COLOR : monthly(point) ? MONTHLY_COLOR : color
        ctx.setLineDash(point.previousContract || monthly(point) ? [3, 2] : [])
        ctx.beginPath()
        ctx.moveTo(this.xPositions[index - 1], y(previous[valueKey]))
        ctx.lineTo(this.xPositions[index], y(point[valueKey]))
        ctx.stroke()
      })
      ctx.setLineDash([])

      points.forEach((point, index) => {
        ctx.fillStyle = point.previousContract ? ROLLOVER_COLOR : monthly(point) ? MONTHLY_COLOR : color
        ctx.beginPath()
        ctx.arc(this.xPositions[index], y(point[valueKey]), point.previousContract ? 2.8 : 1.4, 0, Math.PI * 2)
        ctx.fill()
      })

      const selectedX = this.xPositions[this.pointIndex]
      const selectedY = y(points[this.pointIndex][valueKey])
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.moveTo(selectedX, top)
      ctx.lineTo(selectedX, bottom)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(selectedX, selectedY, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fffdfc'
      ctx.lineWidth = 1.5
      ctx.stroke()
    },

    selectPoint(event) {
      const touch = event.changedTouches[0]
      if (!this.plot || !touch) return

      const x = typeof touch.x === 'number' ? touch.x : touch.clientX - this.plot.left
      const index = this.xPositions.reduce((closest, position, i, points) =>
        Math.abs(position - x) < Math.abs(points[closest] - x) ? i : closest, 0)
      this.showPoint(index)
    },
  },
})
