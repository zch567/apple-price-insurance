const prices = JSON.parse(wx.getFileSystemManager().readFileSync('data/prices.json', 'utf8'))

Page({
  data: {
    futures: prices.futures,
    spotIndex: prices.spotIndex,
  },
})
