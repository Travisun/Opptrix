const path = require('path')
const { app, BrowserWindow } = require('electron')

function loadAutoUpdater() {
  try {
    return require('electron-updater').autoUpdater
  } catch {
    const staged = path.join(__dirname, '../build/updater-deps/node_modules/electron-updater')
    return require(staged).autoUpdater
  }
}

/** @type {import('electron-updater').AppUpdater | null} */
let autoUpdater = null
try {
  autoUpdater = loadAutoUpdater()
} catch (err) {
  console.error('[updater] failed to load electron-updater:', err)
}

/** @type {import('./updater.types').AppUpdateStatus} */
let status = {
  state: 'idle',
  currentVersion: null,
  version: null,
  percent: 0,
  message: null,
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

function setStatus(patch) {
  status = { ...status, ...patch }
  broadcast('app-update-status', status)
}

function initUpdater({ version }) {
  status.currentVersion = version

  if (!autoUpdater) {
    setStatus({
      state: 'not-available',
      currentVersion: version,
      message: null,
    })
    return
  }

  if (!app.isPackaged) {
    setStatus({
      state: 'not-available',
      currentVersion: version,
      message: null,
    })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => {
    setStatus({
      state: 'checking',
      currentVersion: version,
      message: '正在检查更新…',
    })
  })

  autoUpdater.on('update-available', (info) => {
    setStatus({
      state: 'available',
      currentVersion: version,
      version: info.version,
      percent: 0,
      message: `发现新版本 ${info.version}`,
    })
  })

  autoUpdater.on('update-not-available', () => {
    setStatus({
      state: 'not-available',
      currentVersion: version,
      version: null,
      percent: 0,
      message: null,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      state: 'downloading',
      percent: Math.round(progress.percent ?? 0),
      message: `正在下载更新 ${Math.round(progress.percent ?? 0)}%`,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setStatus({
      state: 'ready',
      currentVersion: version,
      version: info.version,
      percent: 100,
      message: `新版本 ${info.version} 已就绪，重启后即可完成更新`,
    })
  })

  autoUpdater.on('error', (err) => {
    setStatus({
      state: 'error',
      message: err instanceof Error ? err.message : '更新检查失败',
    })
  })

  const runCheck = () => {
    void autoUpdater.checkForUpdates().catch(() => {
      setStatus({
        state: 'error',
        message: '无法连接更新服务器',
      })
    })
  }

  // Wait for shell to settle before the first background check.
  setTimeout(runCheck, 10_000)
  setInterval(runCheck, 6 * 60 * 60 * 1000)
}

function registerUpdaterIpc(ipcMain) {
  ipcMain.handle('app-update-get-status', async () => status)

  ipcMain.handle('app-update-check', async () => {
    if (!app.isPackaged || !autoUpdater) return status
    setStatus({ state: 'checking', message: '正在检查更新…' })
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      setStatus({
        state: 'error',
        message: err instanceof Error ? err.message : '更新检查失败',
      })
    }
    return status
  })

  ipcMain.handle('app-update-install', async () => {
    if (!app.isPackaged || !autoUpdater || status.state !== 'ready') return false
    autoUpdater.quitAndInstall(false, true)
    return true
  })
}

module.exports = {
  initUpdater,
  registerUpdaterIpc,
}
