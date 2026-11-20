/**
 * 苹果价格保险测算 —— 纯计算逻辑。
 * 不依赖 wx API，可同时被小程序页面和 Node.js 测试引用。
 */

const DEFAULTS = {
  settlementWeeks: 12,
  payoutRatio: 1,
  yuanPerTonPoint: 4.49,
}

const ERROR_MESSAGES = {
  settlementIndex: {
    required: '请输入保险期间 12 周平均结算指数',
    number: '结算指数必须为有效数字',
    finite: '结算指数必须为有限数字',
    range: '结算指数必须大于或等于 0',
  },
  tons: {
    required: '请输入投保数量',
    number: '投保数量必须为有效数字',
    finite: '投保数量必须为有限数字',
    range: '投保数量必须严格大于 0',
  },
}

function readText(raw) {
  if (raw === null || raw === undefined) {
    return { empty: true, text: '' }
  }
  const text = String(raw).trim()
  return { empty: text === '', text }
}

function invalid(code, message) {
  return { valid: false, code, message }
}

function validateSettlementIndex(raw) {
  const { empty, text } = readText(raw)
  if (empty) {
    return invalid('required', ERROR_MESSAGES.settlementIndex.required)
  }
  const value = Number(text)
  if (Number.isNaN(value)) {
    return invalid('number', ERROR_MESSAGES.settlementIndex.number)
  }
  if (!Number.isFinite(value)) {
    return invalid('finite', ERROR_MESSAGES.settlementIndex.finite)
  }
  if (value < 0) {
    return invalid('range', ERROR_MESSAGES.settlementIndex.range)
  }
  return { valid: true, value, text }
}

function validateTons(raw) {
  const { empty, text } = readText(raw)
  if (empty) {
    return invalid('required', ERROR_MESSAGES.tons.required)
  }
  const value = Number(text)
  if (Number.isNaN(value)) {
    return invalid('number', ERROR_MESSAGES.tons.number)
  }
  if (!Number.isFinite(value)) {
    return invalid('finite', ERROR_MESSAGES.tons.finite)
  }
  if (value <= 0) {
    return invalid('range', ERROR_MESSAGES.tons.range)
  }
  return { valid: true, value, text }
}

/**
 * 最终金额保留两位小数；中间计算不取整。
 */
function roundToCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatAmount(value) {
  if (!Number.isFinite(value)) return '—'
  return roundToCents(value).toFixed(2)
}

function formatCoverageLevel(level) {
  if (!Number.isFinite(level)) return '—'
  return (level * 100).toFixed(0) + '%'
}

function formatRatioPercent(ratio, decimals) {
  if (!Number.isFinite(ratio)) return '待补充'
  return (ratio * 100).toFixed(decimals === undefined ? 2 : decimals) + '%'
}

function formatMetricAmount(value) {
  if (!Number.isFinite(value)) return '待补充'
  return roundToCents(value).toFixed(2)
}

function readPayoutParams(insurance) {
  const payoutRatio = insurance && Number.isFinite(insurance.payoutRatio)
    ? insurance.payoutRatio
    : DEFAULTS.payoutRatio
  const yuanPerTonPoint = insurance && Number.isFinite(insurance.yuanPerTonPoint)
    ? insurance.yuanPerTonPoint
    : DEFAULTS.yuanPerTonPoint
  return { payoutRatio, yuanPerTonPoint }
}

function decimalParts(value) {
  const [coefficient, exponent = '0'] = String(value).split('e')
  const [whole, fraction = ''] = coefficient.split('.')
  return {
    units: BigInt(whole + fraction),
    places: fraction.length - Number(exponent),
  }
}

function decimalScale(places) {
  return BigInt('1' + '0'.repeat(places))
}

function formatCents(cents) {
  const negative = cents < BigInt(0)
  const digits = String(negative ? -cents : cents).padStart(3, '0')
  return (negative ? '-' : '') + digits.slice(0, -2) + '.' + digits.slice(-2)
}

function addDecimals(left, right) {
  const places = Math.max(left.places, right.places)
  return {
    units: left.units * decimalScale(places - left.places)
      + right.units * decimalScale(places - right.places),
    places,
  }
}

function multiplyDecimals(left, right) {
  return { units: left.units * right.units, places: left.places + right.places }
}

function roundDecimalToCents({ units, places }) {
  if (places <= 2) return units * decimalScale(2 - places)

  const divisor = decimalScale(places - 2)
  const half = divisor / BigInt(2)
  const offset = units < BigInt(0) ? BigInt(1) - half : half
  return (units + offset) / divisor
}

/**
 * 单档赔付：max(保障点位 - 平均结算指数, 0) × 投保吨数 × 赔付比例 × 金额换算系数。
 */
function computePayout(plan, settlementIndex, tons, params) {
  const payoutRatio = params && Number.isFinite(params.payoutRatio)
    ? params.payoutRatio
    : DEFAULTS.payoutRatio
  const yuanPerTonPoint = params && Number.isFinite(params.yuanPerTonPoint)
    ? params.yuanPerTonPoint
    : DEFAULTS.yuanPerTonPoint
  if (settlementIndex >= plan.strikeIndex) {
    return { triggered: false, gap: 0, rawPayout: 0, payout: 0, payoutText: '0.00' }
  }

  // 先对齐十进制位数再做差和相乘，在最终换算成分时才舍入。
  const gap = addDecimals(decimalParts(plan.strikeIndex), decimalParts(-settlementIndex))
  const raw = [tons, payoutRatio, yuanPerTonPoint].map(decimalParts).reduce(multiplyDecimals, gap)
  const payoutText = formatCents(roundDecimalToCents(raw))
  return {
    triggered: true,
    gap: Number(gap.units + 'e' + -gap.places),
    rawPayout: Number(raw.units + 'e' + -raw.places),
    payout: Number(payoutText),
    payoutText,
  }
}

function simulateMarket({ marketPrice, outputTons, plans }) {
  const market = readText(marketPrice)
  const output = readText(outputTons)
  const price = Number(market.text)
  const tons = Number(output.text)
  const errors = {
    marketPrice: market.empty || !Number.isFinite(price) || price < 0 ? '请输入大于或等于 0 的市场价格' : '',
    outputTons: output.empty || !Number.isFinite(tons) || tons <= 0 ? '请输入大于 0 的苹果产量' : '',
    plans: plans.map((plan) => {
      const strike = readText(plan.strikePrice)
      const ratio = readText(plan.coveragePercent)
      const strikePrice = Number(strike.text)
      const coverage = Number(ratio.text)
      return {
        strikePrice: strike.empty || !Number.isFinite(strikePrice) || strikePrice <= 0 ? '保障价格须大于 0' : '',
        coveragePercent: ratio.empty || !Number.isFinite(coverage) || coverage <= 0 || coverage > 100
          ? '保障比例须大于 0 且不超过 100%' : '',
      }
    }),
  }
  if (errors.marketPrice || errors.outputTons
    || errors.plans.some((plan) => plan.strikePrice || plan.coveragePercent)) return { errors, results: [] }

  const quantity = decimalParts(tons)
  const sales = multiplyDecimals(decimalParts(price), quantity)
  const results = plans.map(({ id, name, strikePrice, coveragePercent }) => {
    const strike = Number(strikePrice)
    const triggered = price < strike
    const percent = decimalParts(Number(coveragePercent))
    const ratio = { units: percent.units, places: percent.places + 2 }
    const gap = triggered ? addDecimals(decimalParts(strike), decimalParts(-price)) : decimalParts(0)
    const rawPayout = [gap, quantity, ratio].reduce(multiplyDecimals)
    const income = addDecimals(sales, rawPayout)
    return {
      id,
      name,
      triggered,
      payoutText: formatCents(roundDecimalToCents(rawPayout)),
      incomeText: formatCents(roundDecimalToCents(income)),
    }
  })
  return { errors, results, salesText: formatCents(roundDecimalToCents(sales)) }
}

/**
 * 校验输入并用同一组输入计算全部方案。
 * 校验失败时不返回任何测算结果，避免旧结果或半成品结果被当作本次结果。
 */
function simulate(insurance, rawInputs) {
  const inputs = rawInputs || {}
  const settlement = validateSettlementIndex(inputs.settlementIndex)
  const tons = validateTons(inputs.tons)
  const errors = {
    settlementIndex: settlement.valid ? '' : settlement.message,
    tons: tons.valid ? '' : tons.message,
  }

  if (!settlement.valid || !tons.valid) {
    return {
      valid: false,
      errors,
      settlementIndex: null,
      tons: null,
      results: [],
    }
  }

  const params = readPayoutParams(insurance)
  const plans = insurance && Array.isArray(insurance.plans) ? insurance.plans : []
  const results = plans.map((plan) => {
    if (!Number.isFinite(plan.strikeIndex)) {
      throw new Error('保险方案缺少有效的保障点位：' + (plan.id || plan.name || '未知方案'))
    }
    const calc = computePayout(plan, settlement.value, tons.value, params)
    const hasActuarialMetrics = [
      plan.triggerProbability,
      plan.expectedPayoutYuanPerTon,
      plan.farmerPremiumYuanPerTon,
    ].every(Number.isFinite)

    return {
      id: plan.id,
      name: plan.name,
      coverageLevel: plan.coverageLevel,
      coverageLabel: formatCoverageLevel(plan.coverageLevel),
      strikeIndex: plan.strikeIndex,
      strikeIndexText: plan.strikeIndex.toFixed(2),
      triggered: calc.triggered,
      gap: calc.gap,
      rawPayout: calc.rawPayout,
      payout: calc.payout,
      payoutText: calc.payoutText,
      triggerProbability: plan.triggerProbability,
      triggerProbabilityText: formatRatioPercent(plan.triggerProbability),
      expectedPayoutYuanPerTon: plan.expectedPayoutYuanPerTon,
      expectedPayoutText: formatMetricAmount(plan.expectedPayoutYuanPerTon),
      farmerPremiumYuanPerTon: plan.farmerPremiumYuanPerTon,
      farmerPremiumText: formatMetricAmount(plan.farmerPremiumYuanPerTon),
      hasActuarialMetrics,
    }
  })

  return {
    valid: true,
    errors,
    settlementIndex: settlement.value,
    settlementIndexText: settlement.text,
    tons: tons.value,
    tonsText: tons.text,
    payoutRatio: params.payoutRatio,
    yuanPerTonPoint: params.yuanPerTonPoint,
    results,
  }
}

function metricCell(result, text, note) {
  return {
    planId: result.id,
    text,
    note: result.hasActuarialMetrics ? note : '',
    tone: result.hasActuarialMetrics ? '' : 'is-pending',
  }
}

/**
 * 把测算结果整理成三档横向对比所需的展示数据。
 */
function buildResultView(outcome, insurance) {
  const results = outcome.results
  const rows = [
    {
      key: 'strikeIndex',
      label: '保障点位',
      cells: results.map((result) => ({
        planId: result.id,
        text: result.strikeIndexText,
        note: '点',
        tone: '',
      })),
    },
    {
      key: 'triggered',
      label: '是否触发赔付',
      cells: results.map((result) => ({
        planId: result.id,
        text: result.triggered ? '触发赔付' : '未触发',
        note: '',
        tone: result.triggered ? 'is-triggered' : 'is-calm',
      })),
    },
    {
      key: 'payout',
      label: '本次模拟赔付',
      emphasis: true,
      cells: results.map((result) => ({
        planId: result.id,
        text: result.payoutText,
        note: '元',
        tone: 'is-payout',
      })),
    },
    {
      key: 'triggerProbability',
      label: '精算触发概率',
      cells: results.map((result) => metricCell(result, result.triggerProbabilityText, '')),
    },
    {
      key: 'expectedPayout',
      label: '精算期望赔付',
      cells: results.map((result) => metricCell(result, result.expectedPayoutText, '元/吨')),
    },
    {
      key: 'farmerPremium',
      label: '农户自缴',
      cells: results.map((result) => metricCell(result, result.farmerPremiumText, '元/吨')),
    },
  ]

  const actuarialPending = insurance && insurance.actuarialDataStatus === 'pending'
    ? true
    : results.some((result) => !result.hasActuarialMetrics)

  return {
    resultPlans: results.map((result) => ({
      id: result.id,
      coverageLabel: result.coverageLabel,
      statusText: result.triggered ? '触发赔付' : '未触发',
      triggered: result.triggered,
    })),
    resultRows: rows,
    resultSummary: '结算指数 ' + String(outcome.settlementIndex) +
      ' 点 · 投保 ' + String(outcome.tons) + ' 吨',
    actuarialPending,
    actuarialDataNote: insurance && insurance.actuarialDataNote
      ? insurance.actuarialDataNote
      : '精算组提供的触发概率、期望赔付、农户自缴待补充。',
    actuarialDataSummary: insurance && insurance.actuarialDataSummary
      ? insurance.actuarialDataSummary
      : '精算指标来源：中期精算小交付物/B最终结果汇总.xlsx。',
  }
}

module.exports = {
  DEFAULTS,
  ERROR_MESSAGES,
  validateSettlementIndex,
  validateTons,
  computePayout,
  simulate,
  simulateMarket,
  buildResultView,
  roundToCents,
  formatAmount,
  formatCoverageLevel,
  formatRatioPercent,
}
