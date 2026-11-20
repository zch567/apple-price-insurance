const filePath = 'data/insurance.json'
const encoding = 'utf8'
let preloadedText
let insurance

function preloadInsurance() {
  if (insurance) return

  wx.getFileSystemManager().readFile({
    filePath,
    encoding,
    success({ data }) {
      if (!insurance) preloadedText = data
    },
  })
}

function getInsurance() {
  if (!insurance) {
    // 首次导航早于预读完成时，仍可直接打开测算页。
    const text = preloadedText ?? wx.getFileSystemManager().readFileSync(filePath, encoding)
    insurance = JSON.parse(text)
    preloadedText = undefined
  }
  return insurance
}

module.exports = { preloadInsurance, getInsurance }
