const { getInsurance } = require('../../utils/insurance-data')
const insurance = getInsurance()

function emptyResult() {
  return {
    hasResult: false,
    resultPlans: [],
    resultRows: [],
    resultSummary: '',
    actuarialPending: false,
  }
}

Page({
  data: {
    mode: 'market',
    marketPlans: insurance.plans.map((plan, index) => ({
      id: plan.id,
      name: '方案 ' + String.fromCharCode(65 + index),
      reference: (plan.coverageLevel * 100).toFixed(0) + '% 案例',
      strikePrice: (plan.strikeIndex * insurance.yuanPerTonPoint).toFixed(4),
      coveragePercent: String(insurance.payoutRatio * 100),
    })),
    marketPrice: String(1600 * insurance.yuanPerTonPoint),
    backDelta: 0,
    settlementIndex: '',
    tons: '',
    errors: {
      settlementIndex: '',
      tons: '',
    },
    hasResult: false,
    resultPlans: [],
    resultRows: [],
    resultSummary: '',
    actuarialPending: false,
    payoutRatioText: String(insurance.payoutRatio),
    yuanPerTonPointText: String(insurance.yuanPerTonPoint),
    settlementWeeksText: String(insurance.settlementWeeks),
  },

  onLoad() {
    const routes = getCurrentPages().map((page) => page.route)
    const priceIndex = routes.lastIndexOf('pages/price/index')
    if (priceIndex >= 0) {
      this.setData({ backDelta: routes.length - 1 - priceIndex })
    }
  },

  onSettlementInput(event) {
    this.setData({
      settlementIndex: event.detail.value,
      errors: { ...this.data.errors, settlementIndex: '' },
      ...emptyResult(),
    })
  },

  switchMode(event) {
    this.setData({ mode: event.currentTarget.dataset.mode })
  },

  onTonsInput(event) {
    this.setData({
      tons: event.detail.value,
      errors: { ...this.data.errors, tons: '' },
      ...emptyResult(),
    })
  },

  onCalculate() {
    const { simulate, buildResultView } = require('./calculator')
    const outcome = simulate(insurance, {
      settlementIndex: this.data.settlementIndex,
      tons: this.data.tons,
    })

    if (!outcome.valid) {
      this.setData({
        errors: outcome.errors,
        ...emptyResult(),
      })
      return
    }

    const view = buildResultView(outcome, insurance)
    this.setData({
      errors: { settlementIndex: '', tons: '' },
      hasResult: true,
      resultPlans: view.resultPlans,
      resultRows: view.resultRows,
      resultSummary: view.resultSummary,
      actuarialPending: view.actuarialPending,
      actuarialDataNote: view.actuarialDataNote,
      actuarialDataSummary: view.actuarialDataSummary,
    })
  },
})
