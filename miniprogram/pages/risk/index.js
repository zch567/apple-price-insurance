const { pca, arima } = JSON.parse(wx.getFileSystemManager().readFileSync('data/risk.json', 'utf8'))
const { percent } = require('../../utils/format')
const descriptions = {
  PC1: '气温和降水的共同变化。',
  PC2: '期货与现货变化率方向相反的部分。',
  PC3: '期货与现货变化率同向波动的部分。',
}

Page({
  data: {
    cumulative: percent(pca.cumulativeContributionRate),
    components: pca.components.map((component) => ({
      ...component,
      percent: percent(component.contributionRate),
      description: descriptions[component.id],
    })),
    arimaName: arima.modelName,
    arimaMape: percent(arima.outOfSampleMape),
    baselineMape: percent(arima.baselineMape),
    mapeGap: (Math.abs(arima.baselineMape - arima.outOfSampleMape) * 100).toFixed(2),
  },
})
