const fs = require('node:fs')
const path = require('node:path')
const { Menu, Tray } = require('electron')
const { loadAppIconImage } = require('./icon.cjs')
const { APP_NAME } = require('./app-meta.cjs')

/** @type {import('electron').Tray | null} */
let tray = null

/** @type {(() => Promise<{ label: string; enabled?: boolean; click?: () => void }>) | null} */
let scheduleStatusProvider = null

/**
 * Packaged: apps/desktop/build/icons/tray (via prepare-icons + electron-builder files).
 * Dev / monorepo: repo icons/tray.
 */
function trayIconDirCandidates() {
  return [
    path.join(__dirname, '..', 'build', 'icons', 'tray'),
    path.join(__dirname, '..', '..', '..', 'icons', 'tray'),
  ]
}

/**
 * macOS: trayTemplate.png (+ @2x/@3x) — filename Template enables system tinting + DPI.
 * Windows / Linux: tray-color.png (+ @2x/@3x) — brand-color glyph.
 * @returns {string | null} absolute path to 1x asset (Electron loads @2x siblings)
 */
function resolveDedicatedTrayIconPath() {
  const fileName = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray-color.png'
  for (const dir of trayIconDirCandidates()) {
    const candidate = path.join(dir, fileName)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Prefer dedicated tray assets (path string keeps Retina Template/@2x). Fallback: resize app logo.
 * @returns {string | import('electron').NativeImage | null}
 */
function resolveTrayIcon() {
  const dedicated = resolveDedicatedTrayIconPath()
  if (dedicated) return dedicated

  const image = loadAppIconImage()
  if (!image) return null

  const size = process.platform === 'darwin' ? 22 : 16
  const resized = image.resize({ width: size, height: size })
  if (process.platform === 'darwin') {
    resized.setTemplateImage(true)
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

/**
 * @param {{ onShowMainWindow: () => void; onQuit: () => void; onOpenScheduleStatus?: () => void }} handlers
 */
function buildTrayMenuTemplate(handlers, scheduleItem) {
  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const items = [
    {
      label: `显示 ${APP_NAME}`,
      click: () => handlers.onShowMainWindow(),
    },
  ]

  if (scheduleItem) {
    items.push({
      label: scheduleItem.label,
      enabled: scheduleItem.enabled !== false,
      click: scheduleItem.click ?? handlers.onOpenScheduleStatus,
    })
  }

  items.push(
    { type: 'separator' },
    {
      label: `退出 ${APP_NAME}`,
      click: () => handlers.onQuit(),
    },
  )

  return items
}

async function resolveScheduleMenuItem(handlers) {
  if (!scheduleStatusProvider) {
    return {
      label: '计划任务状态',
      click: handlers.onOpenScheduleStatus,
    }
  }
  try {
    return await scheduleStatusProvider()
  } catch {
    return {
      label: '计划任务：暂时无法获取状态',
      enabled: false,
    }
  }
}

async function refreshTrayMenu(handlers) {
  if (!tray) return
  const scheduleItem = await resolveScheduleMenuItem(handlers)
  const menu = Menu.buildFromTemplate(buildTrayMenuTemplate(handlers, scheduleItem))
  tray.setContextMenu(menu)
}

/**
 * @param {{
 *   onShowMainWindow: () => void;
 *   onQuit: () => void;
 *   onOpenScheduleStatus?: () => void;
 *   scheduleStatusProvider?: () => Promise<{ label: string; enabled?: boolean; click?: () => void }>;
 * }} opts
 */
function createTray(opts) {
  if (tray) return tray

  const handlers = {
    onShowMainWindow: opts.onShowMainWindow,
    onQuit: opts.onQuit,
    onOpenScheduleStatus: opts.onOpenScheduleStatus,
  }
  scheduleStatusProvider = opts.scheduleStatusProvider ?? null

  const image = resolveTrayIcon()
  if (!image) {
    console.warn('[tray] icon missing; system tray disabled')
    return null
  }

  tray = new Tray(image)
  tray.setToolTip(APP_NAME)

  void refreshTrayMenu(handlers)

  tray.on('right-click', () => {
    void refreshTrayMenu(handlers)
  })

  // win32 单击 + 双击都会触发；短 debounce 避免连开两次
  let lastShowAt = 0
  const SHOW_DEBOUNCE_MS = 300
  const showMainWindow = () => {
    const now = Date.now()
    if (now - lastShowAt < SHOW_DEBOUNCE_MS) return
    lastShowAt = now
    handlers.onShowMainWindow()
  }

  tray.on('double-click', showMainWindow)
  tray.on('click', () => {
    // macOS 以菜单为主；Linux / Windows 单击唤起主窗
    if (process.platform === 'darwin') return
    showMainWindow()
  })

  return tray
}

function destroyTray() {
  if (!tray) return
  tray.destroy()
  tray = null
  scheduleStatusProvider = null
}

function hasTray() {
  return tray != null
}

module.exports = {
  attachCloseToTray,
  createTray,
  destroyTray,
  hasTray,
  refreshTrayMenu,
  resolveDedicatedTrayIconPath,
}
