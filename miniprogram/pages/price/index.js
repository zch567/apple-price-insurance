const { getPrices } = require('../../utils/price-series')
const { futures, spotIndex } = getPrices()
const { arima } = JSON.parse(wx.getFileSystemManager().readFileSync('data/risk.json', 'utf8'))

Page({
  data: {
    futures,
    spotIndex,
    forecast: arima.forecastYuanPerTon.map((value, index) => ({
      week: index + 1,
      value,
    })),
    forecastHorizon: arima.forecastHorizonWeeks,
    arimaName: arima.modelName,
  },
})
