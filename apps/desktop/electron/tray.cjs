const { Menu, Tray } = require('electron')
const { loadAppIconImage } = require('./icon.cjs')
const { APP_NAME } = require('./app-meta.cjs')

/** @type {import('electron').Tray | null} */
let tray = null

function resolveTrayIconImage() {
  const image = loadAppIconImage()
  if (!image) return null

  const size = process.platform === 'darwin' ? 22 : 32
  const resized = image.resize({ width: size, height: size })
  if (process.platform === 'darwin') {
    resized.setTemplateImage(false)
  }
  return resized
}

function attachCloseToTray(win, { enabled, shouldQuit }) {
  if (!enabled) return

  win.on('close', (event) => {
    if (shouldQuit()) return
    event.preventDefault()
    win.hide()
    if (process.platform === 'darwin' && win.isFullScreen()) {
      win.setFullScreen(false)
    }
  })
}

function createTray({ onShowMainWindow, onQuit }) {
  if (tray) return tray

  const image = resolveTrayIconImage()
  if (!image) {
    console.warn('[tray] icon missing; system tray disabled')
    return null
  }

  tray = new Tray(image)
  tray.setToolTip(APP_NAME)

  const menu = Menu.buildFromTemplate([
    {
      label: `显示 ${APP_NAME}`,
      click: () => onShowMainWindow(),
    },
    { type: 'separator' },
    {
      label: `退出 ${APP_NAME}`,
      click: () => onQuit(),
    },
  ])
  tray.setContextMenu(menu)
  tray.on('double-click', () => onShowMainWindow())
  tray.on('click', () => {
    if (process.platform === 'linux') onShowMainWindow()
  })

  return tray
}

function destroyTray() {
  if (!tray) return
  tray.destroy()
  tray = null
}

function hasTray() {
  return tray != null
}

module.exports = {
  attachCloseToTray,
  createTray,
  destroyTray,
  hasTray,
}
