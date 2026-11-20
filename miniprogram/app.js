const { preloadInsurance } = require('./utils/insurance-data')

App({
  onLaunch() {
    preloadInsurance()
  },
})
