const insurance = JSON.parse(wx.getFileSystemManager().readFileSync('data/insurance.json', 'utf8'))
const { simulate, buildResultView } = require('./calculator')

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
    actuarialDataNote: insurance.actuarialDataNote || '',
    actuarialDataSummary: insurance.actuarialDataSummary || '',
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

  onTonsInput(event) {
    this.setData({
      tons: event.detail.value,
      errors: { ...this.data.errors, tons: '' },
      ...emptyResult(),
    })
  },

  onCalculate() {
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
