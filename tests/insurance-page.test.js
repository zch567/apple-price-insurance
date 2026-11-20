const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const miniprogramRoot = path.join(__dirname, '..', 'miniprogram')

global.wx = {
  getFileSystemManager() {
    return {
      readFileSync(filePath, encoding) {
        return fs.readFileSync(path.join(miniprogramRoot, filePath), encoding)
      },
    }
  },
}

let pageConfig = null
global.Page = (config) => {
  pageConfig = config
}
global.getCurrentPages = () => [
  { route: 'pages/price/index' },
  { route: 'pages/insurance/index' },
]

require('../miniprogram/pages/insurance/index.js')

function createPage() {
  const page = {}
  Object.keys(pageConfig).forEach((key) => {
    if (key !== 'data') page[key] = pageConfig[key]
  })
  page.data = JSON.parse(JSON.stringify(pageConfig.data))
  page.setData = function setData(patch) {
    Object.keys(patch).forEach((key) => {
      if (key.indexOf('.') >= 0) {
        const parts = key.split('.')
        let target = this.data
        for (let index = 0; index < parts.length - 1; index += 1) {
          target = target[parts[index]]
        }
        target[parts[parts.length - 1]] = patch[key]
      } else {
        this.data[key] = patch[key]
      }
    })
  }
  return page
}

function enter(page, settlementIndex, tons) {
  page.onSettlementInput({ detail: { value: settlementIndex } })
  page.onTonsInput({ detail: { value: tons } })
}

test('页面初始状态与返回导航', () => {
  const page = createPage()
  page.onLoad()

  assert.equal(page.data.backDelta, 1)
  assert.equal(page.data.hasResult, false)
  assert.deepEqual(page.data.resultRows, [])
  assert.equal(page.data.payoutRatioText, '1')
  assert.equal(page.data.yuanPerTonPointText, '4.49')
  assert.equal(page.data.settlementWeeksText, '12')
})

test('空输入点击测算：两个输入框均提示错误且不产生结果', () => {
  const page = createPage()
  page.onCalculate()

  assert.equal(page.data.hasResult, false)
  assert.deepEqual(page.data.resultRows, [])
  assert.equal(page.data.errors.settlementIndex, '请输入保险期间 12 周平均结算指数')
  assert.equal(page.data.errors.tons, '请输入投保数量')
})

test('合法输入测算：三档方案使用同一组输入并正确展示', () => {
  const page = createPage()
  enter(page, '1600', '1')
  page.onCalculate()

  assert.equal(page.data.hasResult, true)
  assert.deepEqual(page.data.errors, { settlementIndex: '', tons: '' })
  assert.equal(page.data.resultSummary, '结算指数 1600 点 · 投保 1 吨')
  assert.deepEqual(page.data.resultPlans.map((plan) => plan.coverageLabel), ['90%', '95%', '100%'])
  assert.deepEqual(page.data.resultPlans.map((plan) => plan.statusText), ['未触发', '触发赔付', '触发赔付'])

  const payoutRow = page.data.resultRows.find((row) => row.key === 'payout')
  assert.deepEqual(payoutRow.cells.map((cell) => cell.text), ['0.00', '343.62', '739.82'])
})

test('输入变化后旧结果立即清除，必须重新测算', () => {
  const page = createPage()
  enter(page, '1600', '1')
  page.onCalculate()
  assert.equal(page.data.hasResult, true)

  page.onTonsInput({ detail: { value: '2' } })

  assert.equal(page.data.hasResult, false)
  assert.deepEqual(page.data.resultRows, [])
  assert.equal(page.data.resultSummary, '')

  page.onCalculate()
  assert.equal(page.data.hasResult, true)
  const payoutRow = page.data.resultRows.find((row) => row.key === 'payout')
  assert.deepEqual(payoutRow.cells.map((cell) => cell.text), ['0.00', '687.24', '1479.63'])
})

test('先成功再输入非法值：清除旧结果并显示对应错误', () => {
  const page = createPage()
  enter(page, '1600', '1')
  page.onCalculate()
  assert.equal(page.data.hasResult, true)

  page.onTonsInput({ detail: { value: '0' } })
  page.onCalculate()

  assert.equal(page.data.hasResult, false)
  assert.deepEqual(page.data.resultRows, [])
  assert.equal(page.data.errors.tons, '投保数量必须严格大于 0')
  assert.equal(page.data.errors.settlementIndex, '')
})

test('修改输入会清除该输入的错误提示', () => {
  const page = createPage()
  page.onCalculate()
  assert.ok(page.data.errors.settlementIndex)
  assert.ok(page.data.errors.tons)

  page.onSettlementInput({ detail: { value: '1600' } })

  assert.equal(page.data.errors.settlementIndex, '')
  assert.equal(page.data.errors.tons, '请输入投保数量')
})

test('精算指标已接入并在页面中逐项展示', () => {
  const page = createPage()
  enter(page, '1600', '1')
  page.onCalculate()

  assert.equal(page.data.actuarialPending, false)
  assert.ok(page.data.actuarialDataNote.indexOf('B最终结果汇总.xlsx') >= 0)
  assert.ok(page.data.actuarialDataSummary.indexOf('B4农户视角') >= 0)

  const rowTexts = (key) => page.data.resultRows.find((row) => row.key === key).cells.map((cell) => cell.text)
  assert.deepEqual(rowTexts('triggerProbability'), ['27.12%', '41.37%', '56.90%'])
  assert.deepEqual(rowTexts('expectedPayout'), ['145.30', '280.20', '475.80'])
  assert.deepEqual(rowTexts('farmerPremium'), ['55.80', '58.90', '62.00'])

  const expectedRow = page.data.resultRows.find((row) => row.key === 'expectedPayout')
  const premiumRow = page.data.resultRows.find((row) => row.key === 'farmerPremium')
  assert.deepEqual(expectedRow.cells.map((cell) => cell.note), ['元/吨', '元/吨', '元/吨'])
  assert.deepEqual(premiumRow.cells.map((cell) => cell.note), ['元/吨', '元/吨', '元/吨'])
})
