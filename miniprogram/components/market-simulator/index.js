Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    initialPlans: {
      type: Array,
      observer(plans) {
        this.setData({ plans })
      },
    },
    initialMarketPrice: {
      type: String,
      observer(marketPrice) {
        this.setData({ marketPrice })
      },
    },
  },

  data: {
    marketPrice: '',
    outputTons: '1',
    plans: [],
    errors: {},
    results: [],
    salesText: '',
  },

  methods: {
    updateScenario(event) {
      const { field } = event.currentTarget.dataset
      this.setData({
        [field]: event.detail.value,
        ['errors.' + field]: '',
        results: [],
      })
    },

    updatePlan(event) {
      const { index, field } = event.currentTarget.dataset
      const plans = this.data.plans.map((plan, position) => position === Number(index)
        ? { ...plan, [field]: event.detail.value }
        : plan)
      const errors = this.data.errors.plans?.map((plan, position) => position === Number(index)
        ? { ...plan, [field]: '' }
        : plan)
      this.setData({
        plans,
        errors: { ...this.data.errors, plans: errors || [] },
        results: [],
      })
    },

    calculate() {
      const { simulateMarket } = require('../../pages/insurance/calculator')
      const { marketPrice, outputTons, plans } = this.data
      const outcome = simulateMarket({ marketPrice, outputTons, plans })
      this.setData({
        errors: outcome.errors,
        results: outcome.results,
        salesText: outcome.salesText || '',
      })
    },
  },
})
