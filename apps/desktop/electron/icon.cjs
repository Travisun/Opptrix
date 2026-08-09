const fs = require('node:fs')
const path = require('node:path')
const { nativeImage } = require('electron')

/** Shared PNG / packaged about logo — always current brand from prepare-icons. */
const SHARED_ICON_CANDIDATES = [
  path.join(__dirname, '..', 'build', 'icons', 'logo.png'),
  path.join(__dirname, '..', 'build', 'icons', 'logo-app.png'),
  path.join(__dirname, 'about-logo.png'),
  path.join(__dirname, '..', '..', '..', 'icons', 'logo.png'),
  // Legacy tiny placeholder — last resort only
  path.join(__dirname, '..', 'app-icon.png'),
]

/**
 * Prefer platform-native app icon when present (Win toast / Linux notify / mac Dock).
 * @returns {string[]}
 */
function iconCandidates() {
  if (process.platform === 'win32') {
    return [
      path.join(__dirname, '..', 'build', 'icons', 'icon.ico'),
      ...SHARED_ICON_CANDIDATES,
    ]
  }
  if (process.platform === 'darwin') {
    return [
      path.join(__dirname, '..', 'build', 'icons', 'icon.icns'),
      ...SHARED_ICON_CANDIDATES,
    ]
  }
  // Linux: PNG sizes under build/icons/linux are for .desktop; toast uses PNG path
  return [
    path.join(__dirname, '..', 'build', 'icons', 'linux', '256x256.png'),
    path.join(__dirname, '..', 'build', 'icons', 'linux', '128x128.png'),
    ...SHARED_ICON_CANDIDATES,
  ]
}

function resolveAppIconPath() {
  return iconCandidates().find((candidate) => fs.existsSync(candidate)) ?? null
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
