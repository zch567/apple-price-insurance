Page({
  data: { backDelta: 0 },

  onLoad() {
    const routes = getCurrentPages().map((page) => page.route)
    const priceIndex = routes.lastIndexOf('pages/price/index')
    if (priceIndex >= 0) {
      this.setData({ backDelta: routes.length - 1 - priceIndex })
    }
  },
})
