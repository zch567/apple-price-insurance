const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const insurance = require('../miniprogram/data/insurance.json')
const {
  simulate,
  simulateMarket,
  buildResultView,
  validateSettlementIndex,
  validateTons,
  roundToCents,
  formatCoverageLevel,
  formatRatioPercent,
} = require('../miniprogram/pages/insurance/calculator')

const PLAN_IDS = ['plan-90', 'plan-95', 'plan-100']

function run(settlementIndex, tons) {
  const outcome = simulate(insurance, { settlementIndex, tons })
  assert.equal(outcome.valid, true, '输入应通过校验：' + JSON.stringify(outcome.errors))
  return outcome
}

function payouts(outcome) {
  return outcome.results.map((result) => result.payout)
}

function payoutTexts(outcome) {
  return outcome.results.map((result) => result.payoutText)
}

test('测试1：标准计算（结算指数 1600，投保 1 吨）', () => {
  const outcome = run('1600', '1')

  assert.deepEqual(outcome.results.map((result) => result.id), PLAN_IDS)
  assert.deepEqual(outcome.results.map((result) => result.triggered), [false, true, true])
  assert.deepEqual(payouts(outcome), [0, 343.62, 739.82])
  assert.deepEqual(payoutTexts(outcome), ['0.00', '343.62', '739.82'])
})

test('测试2：结算指数等于对应档位保障点位时不触发', () => {
  insurance.plans.forEach((plan, index) => {
    const outcome = run(String(plan.strikeIndex), '1')
    const result = outcome.results[index]

    assert.equal(result.id, plan.id)
    assert.equal(result.strikeIndex, plan.strikeIndex)
    assert.equal(result.triggered, false, plan.name + ' 应不触发')
    assert.equal(result.payout, 0, plan.name + ' 赔付应为 0')
    assert.equal(result.payoutText, '0.00')
  })

  // 1588.29 点仍低于 95% 与 100% 档保障点位，这两档应触发。
  const outcome = run('1588.29', '1')
  assert.deepEqual(outcome.results.map((result) => result.triggered), [false, true, true])
})

test('模拟赔付在半分边界按十进制四舍五入', () => {
  const cases = [
    ['1588.21000000001', '2.24'],
    ['1588.21', '2.25'],
    ['1588.20999999999', '2.25'],
  ]

  for (const [settlementIndex, expected] of cases) {
    const outcome = run(settlementIndex, '6.25')
    assert.equal(outcome.results[0].payoutText, expected, settlementIndex)
  }
})

test('市场价格以元/吨计算销售、赔付和未扣保费的模拟收入', () => {
  const plans = [
    { id: 'a', strikePrice: '6500', coveragePercent: '100' },
    { id: 'b', strikePrice: '7000', coveragePercent: '80' },
    { id: 'c', strikePrice: '7500', coveragePercent: '100' },
  ]
  const outcome = simulateMarket({ marketPrice: '6500', outputTons: '10', plans })
  assert.equal(outcome.salesText, '65000.00')
  assert.deepEqual(outcome.results.map(({ triggered, payoutText, incomeText }) => [triggered, payoutText, incomeText]), [
    [false, '0.00', '65000.00'],
    [true, '4000.00', '69000.00'],
    [true, '10000.00', '75000.00'],
  ])
})

test('市场价格测算保留中间精度并拒绝非法保障比例', () => {
  const input = {
    marketPrice: '0.15',
    outputTons: '0.1',
    plans: [
      { id: 'a', strikePrice: '0.25', coveragePercent: '50' },
      { id: 'b', strikePrice: '0.30', coveragePercent: '25' },
    ],
  }
  const outcome = simulateMarket(input)
  assert.equal(outcome.salesText, '0.02')
  assert.equal(outcome.results[0].payoutText, '0.01')
  assert.equal(outcome.results[0].incomeText, '0.02')
  input.plans[1].coveragePercent = '101'
  const invalid = simulateMarket(input)
  assert.match(invalid.errors.plans[1].coveragePercent, /100%/)
  assert.deepEqual(invalid.results, [])
})

test('测试3：结算指数高于全部保障点位时不触发（1800）', () => {
  const outcome = run('1800', '1')

  assert.deepEqual(outcome.results.map((result) => result.triggered), [false, false, false])
  assert.deepEqual(payouts(outcome), [0, 0, 0])
  assert.deepEqual(payoutTexts(outcome), ['0.00', '0.00', '0.00'])
})

test('测试4：结算指数低于全部保障点位时三档均触发（0）', () => {
  const outcome = run('0', '1')

  assert.deepEqual(outcome.results.map((result) => result.triggered), [true, true, true])
  assert.deepEqual(payouts(outcome), [7131.42, 7527.62, 7923.82])
  assert.deepEqual(payoutTexts(outcome), ['7131.42', '7527.62', '7923.82'])
})

test('测试5：赔付金额与投保吨数成正比（1 吨 → 10 吨）', () => {
  const oneTon = run('1600', '1')
  const tenTons = run('1600', '10')

  oneTon.results.forEach((result, index) => {
    const scaled = tenTons.results[index]
    if (result.rawPayout === 0) {
      assert.equal(scaled.rawPayout, 0)
    } else {
      assert.ok(
        Math.abs(scaled.rawPayout - result.rawPayout * 10) < 1e-9,
        '原始赔付金额应严格按 10 倍放大'
      )
    }
  })

  assert.deepEqual(payouts(tenTons), [0, 3436.2, 7398.17])
  assert.deepEqual(payoutTexts(tenTons), ['0.00', '3436.20', '7398.17'])
})

describe('测试6：非法输入不执行测算', () => {
  const invalidCases = [
    { name: '结算指数为空', inputs: { settlementIndex: '', tons: '1' }, field: 'settlementIndex', code: 'required' },
    { name: '结算指数仅含空格', inputs: { settlementIndex: '   ', tons: '1' }, field: 'settlementIndex', code: 'required' },
    { name: '结算指数为 null', inputs: { settlementIndex: null, tons: '1' }, field: 'settlementIndex', code: 'required' },
    { name: '结算指数为负数', inputs: { settlementIndex: '-1', tons: '1' }, field: 'settlementIndex', code: 'range' },
    { name: '结算指数为非数字', inputs: { settlementIndex: 'abc', tons: '1' }, field: 'settlementIndex', code: 'number' },
    { name: '结算指数为 NaN', inputs: { settlementIndex: 'NaN', tons: '1' }, field: 'settlementIndex', code: 'number' },
    { name: '结算指数为 Infinity', inputs: { settlementIndex: 'Infinity', tons: '1' }, field: 'settlementIndex', code: 'finite' },
    { name: '结算指数溢出为 Infinity', inputs: { settlementIndex: '1e999', tons: '1' }, field: 'settlementIndex', code: 'finite' },
    { name: '投保数量为空', inputs: { settlementIndex: '1600', tons: '' }, field: 'tons', code: 'required' },
    { name: '投保数量仅含空格', inputs: { settlementIndex: '1600', tons: ' ' }, field: 'tons', code: 'required' },
    { name: '投保数量为 null', inputs: { settlementIndex: '1600', tons: null }, field: 'tons', code: 'required' },
    { name: '投保数量为 0', inputs: { settlementIndex: '1600', tons: '0' }, field: 'tons', code: 'range' },
    { name: '投保数量为负数', inputs: { settlementIndex: '1600', tons: '-1' }, field: 'tons', code: 'range' },
    { name: '投保数量为非数字', inputs: { settlementIndex: '1600', tons: 'abc' }, field: 'tons', code: 'number' },
    { name: '投保数量为 NaN', inputs: { settlementIndex: '1600', tons: 'NaN' }, field: 'tons', code: 'number' },
    { name: '投保数量为 Infinity', inputs: { settlementIndex: '1600', tons: 'Infinity' }, field: 'tons', code: 'finite' },
    { name: '结算指数与投保数量均为空', inputs: { settlementIndex: '', tons: '' }, field: 'both', code: 'required' },
  ]

  invalidCases.forEach((testCase) => {
    test(testCase.name, () => {
      const outcome = simulate(insurance, testCase.inputs)

      assert.equal(outcome.valid, false)
      assert.equal(outcome.results.length, 0, '校验失败时不得产生测算结果')
      assert.equal(outcome.settlementIndex, null)
      assert.equal(outcome.tons, null)

      if (testCase.field === 'both' || testCase.field === 'settlementIndex') {
        assert.ok(outcome.errors.settlementIndex, '应显示结算指数错误')
      }
      if (testCase.field === 'both' || testCase.field === 'tons') {
        assert.ok(outcome.errors.tons, '应显示投保数量错误')
      }

      const validation = testCase.field === 'tons'
        ? validateTons(testCase.inputs.tons)
        : validateSettlementIndex(testCase.inputs.settlementIndex)
      assert.equal(validation.valid, false)
      assert.equal(validation.code, testCase.code)
      assert.ok(validation.message)
    })
  })

  test('空字符串不会被 Number() 转换成 0 而绕过校验', () => {
    const outcome = simulate(insurance, { settlementIndex: '', tons: '1' })
    assert.equal(outcome.valid, false)
    assert.equal(outcome.errors.settlementIndex, '请输入保险期间 12 周平均结算指数')

    const zeroTons = simulate(insurance, { settlementIndex: '1600', tons: '0' })
    assert.equal(zeroTons.valid, false)
    assert.equal(zeroTons.errors.tons, '投保数量必须严格大于 0')
  })

  test('合法边界：结算指数 0 和小数均可测算', () => {
    const zeroIndex = simulate(insurance, { settlementIndex: '0', tons: '1' })
    assert.equal(zeroIndex.valid, true)
    assert.equal(zeroIndex.results.length, 3)

    const decimal = simulate(insurance, { settlementIndex: '1600.50', tons: '0.5' })
    assert.equal(decimal.valid, true)
    assert.equal(decimal.results.length, 3)
  })
})

test('测试7：数据完整性与展示口径', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'miniprogram', 'data', 'insurance.json'), 'utf8')
  const parsed = JSON.parse(raw)

  assert.equal(parsed.settlementWeeks, 12)
  assert.equal(parsed.payoutRatio, 1)
  assert.equal(parsed.yuanPerTonPoint, 4.49)
  assert.equal(parsed.actuarialDataSource.file, '中期精算小交付物/B最终结果汇总.xlsx')
  assert.deepEqual(parsed.actuarialDataSource.sheets, ['参数汇总', 'B4三档对比', 'B4农户视角'])

  assert.equal(parsed.plans.length, 3)
  assert.deepEqual(parsed.plans.map((plan) => plan.id), PLAN_IDS)
  assert.deepEqual(parsed.plans.map((plan) => plan.coverageLevel), [0.9, 0.95, 1])
  assert.deepEqual(parsed.plans.map((plan) => plan.strikeIndex), [1588.29, 1676.53, 1764.77])

  for (let index = 1; index < parsed.plans.length; index += 1) {
    assert.ok(parsed.plans[index].coverageLevel > parsed.plans[index - 1].coverageLevel, '保障水平应升序排列')
    assert.ok(parsed.plans[index].strikeIndex > parsed.plans[index - 1].strikeIndex, '保障点位应升序排列')
  }

  const metricFields = ['triggerProbability', 'expectedPayoutYuanPerTon', 'farmerPremiumYuanPerTon']
  parsed.plans.forEach((plan) => {
    assert.equal(typeof plan.coverageLevel, 'number')
    assert.equal(typeof plan.strikeIndex, 'number')
    metricFields.forEach((field) => {
      assert.ok(Object.prototype.hasOwnProperty.call(plan, field), plan.id + ' 缺少字段 ' + field)
      assert.equal(typeof plan[field], 'number', plan.id + ' 的 ' + field + ' 应为 number')
      assert.ok(Number.isFinite(plan[field]), plan.id + ' 的 ' + field + ' 应为有限数值')
      assert.notEqual(plan[field], null, plan.id + ' 的 ' + field + ' 不应为 null')
      assert.ok(plan.sourceCells && plan.sourceCells[field], plan.id + ' 缺少 ' + field + ' 的单元格来源')
    })
  })
  assert.equal(parsed.actuarialDataStatus, 'available')
  assert.ok(parsed.actuarialDataNote)
  assert.ok(parsed.actuarialDataSummary)

  assert.equal(formatCoverageLevel(0.9), '90%')
  assert.equal(formatCoverageLevel(0.95), '95%')
  assert.equal(formatCoverageLevel(1), '100%')
  assert.equal(formatRatioPercent(0.2712), '27.12%')
  assert.equal(formatRatioPercent(null), '待补充')
  assert.equal(roundToCents(343.6196999999999), 343.62)
  assert.equal(roundToCents(1.005), 1.01)

  const outcome = run('1600', '1')
  const view = buildResultView(outcome, insurance)
  assert.deepEqual(view.resultPlans.map((plan) => plan.coverageLabel), ['90%', '95%', '100%'])
  assert.equal(view.resultRows.length, 6)

  const payoutRow = view.resultRows.find((row) => row.key === 'payout')
  assert.deepEqual(payoutRow.cells.map((cell) => cell.text), ['0.00', '343.62', '739.82'])
  assert.equal(payoutRow.emphasis, true)

  const metricRows = view.resultRows.filter((row) =>
    ['triggerProbability', 'expectedPayout', 'farmerPremium'].includes(row.key)
  )
  assert.equal(metricRows.length, 3)

  assert.equal(view.actuarialPending, false)
  assert.ok(view.actuarialDataSummary.indexOf('B最终结果汇总.xlsx') >= 0)

  const rowTexts = (key) => view.resultRows.find((row) => row.key === key).cells.map((cell) => cell.text)
  assert.deepEqual(rowTexts('triggerProbability'), ['27.12%', '41.37%', '56.90%'])
  assert.deepEqual(rowTexts('expectedPayout'), ['145.30', '280.20', '475.80'])
  assert.deepEqual(rowTexts('farmerPremium'), ['55.80', '58.90', '62.00'])
})

test('测试8：九项精算指标与 Excel 来源逐项一致', () => {
  // 期望值直接抄录自 中期精算小交付物/B最终结果汇总.xlsx：
  // 触发概率：B4三档对比!B3:D3（与 B3风险指标!C2:C4 一致）
  // 期望赔付（元/吨）：B4农户视角!B6:D6
  // 农户自缴（元/吨）：B4农户视角!B4:D4
  const expected = [
    {
      id: 'plan-90',
      triggerProbability: 0.2712,
      expectedPayoutYuanPerTon: 145.3,
      farmerPremiumYuanPerTon: 55.8,
      sourceCells: {
        triggerProbability: 'B4三档对比!B3',
        expectedPayoutYuanPerTon: 'B4农户视角!B6',
        farmerPremiumYuanPerTon: 'B4农户视角!B4',
      },
    },
    {
      id: 'plan-95',
      triggerProbability: 0.4137,
      expectedPayoutYuanPerTon: 280.2,
      farmerPremiumYuanPerTon: 58.9,
      sourceCells: {
        triggerProbability: 'B4三档对比!C3',
        expectedPayoutYuanPerTon: 'B4农户视角!C6',
        farmerPremiumYuanPerTon: 'B4农户视角!C4',
      },
    },
    {
      id: 'plan-100',
      triggerProbability: 0.569,
      expectedPayoutYuanPerTon: 475.8,
      farmerPremiumYuanPerTon: 62,
      sourceCells: {
        triggerProbability: 'B4三档对比!D3',
        expectedPayoutYuanPerTon: 'B4农户视角!D6',
        farmerPremiumYuanPerTon: 'B4农户视角!D4',
      },
    },
  ]

  expected.forEach((item, index) => {
    const plan = insurance.plans[index]
    assert.equal(plan.id, item.id)
    assert.equal(plan.triggerProbability, item.triggerProbability)
    assert.equal(plan.expectedPayoutYuanPerTon, item.expectedPayoutYuanPerTon)
    assert.equal(plan.farmerPremiumYuanPerTon, item.farmerPremiumYuanPerTon)
    assert.deepEqual(plan.sourceCells, item.sourceCells)
  })

  // 交叉核对：元/吨指标 = 点/吨指标 × 4.49，按 Excel 口径保留 1 位小数。
  const pointPayout = [32.35, 62.41, 105.96]
  const pointPremium = [12.42, 13.11, 13.8]
  const totalPremium = [278.8, 294.3, 309.8]
  const round1 = (value) => Math.round((value + Number.EPSILON) * 10) / 10

  insurance.plans.forEach((plan, index) => {
    assert.equal(plan.expectedPayoutYuanPerTon, round1(pointPayout[index] * 4.49))
    assert.equal(plan.farmerPremiumYuanPerTon, round1(pointPremium[index] * 4.49))
    assert.equal(plan.farmerPremiumYuanPerTon, round1(totalPremium[index] * 0.2))
    // 触发概率以比例存储，展示为两位小数百分比。
    assert.equal(formatRatioPercent(plan.triggerProbability), (itemPercent(index)).toFixed(2) + '%')
  })

  function itemPercent(index) {
    return [27.12, 41.37, 56.9][index]
  }
})

test('补充：精算指标可用时的展示格式（仅使用合成占位值验证格式，不写入数据文件）', () => {
  const sample = JSON.parse(JSON.stringify(insurance))
  sample.actuarialDataStatus = 'available'
  sample.plans[0].triggerProbability = 0.5
  sample.plans[1].triggerProbability = 0.25
  sample.plans[2].triggerProbability = 0.125
  sample.plans[0].expectedPayoutYuanPerTon = 1
  sample.plans[1].expectedPayoutYuanPerTon = 2
  sample.plans[2].expectedPayoutYuanPerTon = 3
  sample.plans[0].farmerPremiumYuanPerTon = 4
  sample.plans[1].farmerPremiumYuanPerTon = 5
  sample.plans[2].farmerPremiumYuanPerTon = 6

  const view = buildResultView(simulate(sample, { settlementIndex: '1600', tons: '1' }), sample)
  assert.equal(view.actuarialPending, false)

  const rowTexts = (key) => view.resultRows.find((row) => row.key === key).cells.map((cell) => cell.text)
  assert.deepEqual(rowTexts('triggerProbability'), ['50.00%', '25.00%', '12.50%'])
  assert.deepEqual(rowTexts('expectedPayout'), ['1.00', '2.00', '3.00'])
  assert.deepEqual(rowTexts('farmerPremium'), ['4.00', '5.00', '6.00'])
})
