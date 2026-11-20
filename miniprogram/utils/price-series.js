const day = 86400000
const week = (time) => Math.floor((time / day + 3) / 7)
let prices

function getPrices() {
  if (!prices) prices = JSON.parse(wx.getFileSystemManager().readFileSync('data/prices.json', 'utf8'))
  return prices
}

function hasGap(previous, point) {
  if (previous.frequency === '月度' && point.frequency === '月度') {
    const month = (date) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
    return month(point.date) - month(previous.date) > 1
  }
  if (previous.frequency === '月度') return point.time - previous.time > 35 * day

  return week(point.time) - week(previous.time) > 1
}

function observationChange(previous, point, valueKey) {
  if (!previous || hasGap(previous, point)
    || previous.frequency !== point.frequency || previous.contract !== point.contract) return null
  if (point.frequency !== '月度' && week(point.time) - week(previous.time) !== 1) return null

  const before = previous[valueKey]
  const after = point[valueKey]
  return Number.isFinite(before) && before > 0 && Number.isFinite(after) ? (after - before) / before : null
}

function withTimes(series) {
  return series.map((point) => ({ ...point, time: Date.parse(point.date + 'T00:00:00Z') }))
}

function weeklyRisk(series, valueKey) {
  const points = withTimes(series)
  const changes = points.flatMap((point, index) => {
    if (point.frequency === '月度') return []
    const change = observationChange(points[index - 1], point, valueKey)
    return change === null ? [] : [change]
  })
  const count = changes.length
  const average = count ? changes.reduce((sum, change) => sum + change, 0) / count : 0
  const squaredDeviations = changes.reduce((sum, change) => sum + (change - average) ** 2, 0)

  return {
    count,
    volatility: count > 1 ? Math.sqrt(squaredDeviations / (count - 1)) : null,
    declineRate: count ? changes.filter((change) => change < 0).length / count : null,
  }
}

module.exports = { getPrices, hasGap, observationChange, withTimes, weeklyRisk }
