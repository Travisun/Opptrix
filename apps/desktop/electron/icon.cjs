const fs = require('node:fs')
const path = require('node:path')
const { nativeImage } = require('electron')

const ICON_CANDIDATES = [
  path.join(__dirname, '..', 'build', 'icons', 'logo.png'),
  path.join(__dirname, '..', 'build', 'icons', 'logo-app.png'),
  path.join(__dirname, 'about-logo.png'),
  path.join(__dirname, '..', '..', '..', 'icons', 'logo.png'),
  path.join(__dirname, '..', 'app-icon.png'),
]

function resolveAppIconPath() {
  return ICON_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null
}

function loadAppIconImage() {
  const iconPath = resolveAppIconPath()
  if (!iconPath) return null

  const image = nativeImage.createFromPath(iconPath)
  return image.isEmpty() ? null : image
}

function applyAppIcon(app) {
  const image = loadAppIconImage()
  if (!image) return null

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(image)
  }

  return image
}

module.exports = {
  resolveAppIconPath,
  loadAppIconImage,
  applyAppIcon,
}
