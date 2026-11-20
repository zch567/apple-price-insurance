const { test } = require('node:test')
const assert = require('node:assert/strict')
const { observationChange, weeklyRisk, withTimes } = require('../miniprogram/utils/price-series')

test('历史波动和下跌频率只使用可比的相邻周度数据', () => {
  const prices = [
    { date: '2026-01-02', contract: 'AP601', close: 100 },
    { date: '2026-01-09', contract: 'AP601', close: 110 },
    { date: '2026-01-16', contract: 'AP603', close: 200 },
    { date: '2026-01-30', contract: 'AP603', close: 100 },
    { date: '2026-02-06', contract: 'AP603', close: 90 },
  ]
  const risk = weeklyRisk(prices, 'close')
  assert.equal(risk.count, 2)
  assert.equal(risk.declineRate, 0.5)
  assert.ok(Math.abs(risk.volatility - Math.sqrt(0.02)) < 1e-12)
})

test('连续月度记录可以展示涨跌幅，但不计入周度风险', () => {
  const points = withTimes([
    { date: '2026-01-01', frequency: '月度', value: 100 },
    { date: '2026-02-01', frequency: '月度', value: 110 },
    { date: '2026-02-06', frequency: '周度', value: 120 },
  ])
  assert.equal(observationChange(points[0], points[1], 'value'), 0.1)
  assert.equal(observationChange(points[1], points[2], 'value'), null)
  assert.deepEqual(weeklyRisk(points, 'value'), { count: 0, volatility: null, declineRate: null })
})
