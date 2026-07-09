const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const { spawn } = require('node:child_process')
const { APP_NAME, VERSION } = require('./app-meta.cjs')
const { applyAppIcon, resolveAppIconPath } = require('./icon.cjs')
const { configureAboutPanel, installApplicationMenu } = require('./menu.cjs')
const { hardenWebContents, mainWindowWebPreferences } = require('./security.cjs')
const { initUpdater, registerUpdaterIpc } = require('./updater.cjs')
const {
  deliverProtocolUrl,
  findProtocolUrl,
  flushPendingProtocolUrl,
  installProtocolHandlers,
  registerProtocolIpc,
  setProtocolDeliverHandler,
} = require('./protocol.cjs')
const {
  configureNotificationIdentity,
  registerNotificationIpc,
  requestNotificationPermission,
} = require('./notifications.cjs')
const { attachCloseToTray, createTray, destroyTray, hasTray } = require('./tray.cjs')
const {
  getTranslationStatus,
  getTranslationModels,
  ensureTranslationDownloadDir,
  startTranslationModelDownload,
  cancelTranslationModelDownload,
  translateArticle,
  preloadTranslationModel,
  maybeBootstrapOfflineModelDownloads,
  disposeTranslation,
} = require('./translation-service.cjs')

const isDev = !app.isPackaged
const API_HOST = '127.0.0.1'
const API_PORT = process.env.STOCK_RESEARCH_PORT ?? '8711'
const MIN_SPLASH_MS = 2200
const SPLASH_HTML = path.join(__dirname, 'splash.html')
const SPLASH_CANVAS = '#F5F5F7'
const APP_ID = require('../package.json').build?.appId

app.setName(APP_NAME)
/** @type {boolean} */
app.isQuitting = false

/** @type {import('node:child_process').ChildProcess | null} */
let serverProcess = null
/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null
let splashShownAt = 0
/** @type {(() => void) | null} */
let resolveShellReady = null
let shellReadyPending = false

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForSplashMinimum() {
  if (!splashShownAt) return
  const elapsed = Date.now() - splashShownAt
  if (elapsed < MIN_SPLASH_MS) {
    await wait(MIN_SPLASH_MS - elapsed)
  }
}

function setOpaqueWindowBackground(win) {
  if (win.isDestroyed()) return
  win.setBackgroundColor(SPLASH_CANVAS)
}

function enableMacWindowTransparency(win) {
  if (process.platform !== 'darwin' || win.isDestroyed()) return
  win.setBackgroundColor('#00000000')
}

async function fadeSplashOut(win) {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  try {
    await win.webContents.executeJavaScript(`
      document.body.classList.add('splash-exit');
    `)
    await wait(200)
  } catch {
    /* splash already gone */
  }
}

function waitForShellReady(win, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (win.isDestroyed()) {
      resolve()
      return
    }
    if (shellReadyPending) {
      shellReadyPending = false
      resolve()
      return
    }
    const timer = setTimeout(() => {
      resolveShellReady = null
      resolve()
    }, timeoutMs)
    resolveShellReady = () => {
      clearTimeout(timer)
      resolveShellReady = null
      resolve()
    }
  })
}

function notifyShellReady(webContents) {
  const win = BrowserWindow.fromWebContents(webContents)
  if (!win || win !== mainWindow) return
  if (resolveShellReady) {
    resolveShellReady()
    return
  }
  shellReadyPending = true
}

function repoRoot() {
  if (isDev) {
    return path.resolve(__dirname, '../../..')
  }
  return path.join(process.resourcesPath, 'runtime-stage')
}

function serverEntry(root) {
  return path.join(root, 'apps/server/dist/index.js')
}

function uiDist(root) {
  return path.join(root, 'client-ui/dist')
}

function nodeCommand() {
  return process.env.NODE_BINARY ?? process.execPath
}

function sidecarEnv(root) {
  const env = {
    ...process.env,
    SERVE_UI: '1',
    OPPTRIX_DESKTOP: '1',
    OPPTRIX_APP_VERSION: VERSION,
    STOCK_RESEARCH_HOST: API_HOST,
    STOCK_RESEARCH_PORT: API_PORT,
    UI_DIST_PATH: uiDist(root),
  }

  if (app.isReady()) {
    env.OPPTRIX_HTTP_USER_AGENT = session.defaultSession.getUserAgent()
  }

  if (!isDev) {
    env.ELECTRON_RUN_AS_NODE = '1'
    const nodeModules = path.join(root, 'node_modules')
    if (require('node:fs').existsSync(nodeModules)) {
      env.NODE_PATH = nodeModules
    }
  }

  return env
}

function spawnSidecar() {
  const root = repoRoot()
  const entry = serverEntry(root)
  if (!require('node:fs').existsSync(entry)) {
    throw new Error(`Server entry not found: ${entry}\nRun: npm run build:packages`)
  }

  serverProcess = spawn(nodeCommand(), [entry], {
    cwd: root,
    env: sidecarEnv(root),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  serverProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[api] ${chunk}`)
  })
  serverProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[api] ${chunk}`)
  })
  serverProcess.on('exit', () => {
    serverProcess = null
  })

  return serverProcess
}

async function waitForHealth(timeoutMs = 30_000) {
  const url = `http://${API_HOST}:${API_PORT}/api/health`
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(url)
      if (resp.ok) return
    } catch {
      /* retry */
    }
    await wait(250)
  }
  throw new Error(`API sidecar not ready: ${url}`)
}

async function waitForAppUi(timeoutMs = 60_000) {
  const url = appUrl()
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(url)
      if (resp.ok) return
    } catch {
      /* retry */
    }
    await wait(250)
  }
  throw new Error(`App UI not ready: ${url}`)
}

function stopSidecar() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }
}

function appUrl() {
  if (isDev) return 'http://127.0.0.1:5173'
  return `http://${API_HOST}:${API_PORT}`
}

function windowIconOptions() {
  const iconPath = resolveAppIconPath()
  if (!iconPath || process.platform === 'darwin') return {}
  return { icon: iconPath }
}

function getMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  return null
}

function focusMainWindow() {
  const win = getMainWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return
  }
  void openMainWindowFromMenu()
}

function deliverProtocolPayload(payload) {
  const win = getMainWindow()
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send('opptrix-protocol', payload)
    focusMainWindow()
  }
}

function quitApp() {
  app.isQuitting = true
  stopSidecar()
  destroyTray()
  app.quit()
}

setProtocolDeliverHandler(deliverProtocolPayload)
installProtocolHandlers(app, { focusMainWindow })

function buildMainWindowOptions() {
  // Default window size: comfortable on common laptop screens without
  // overwhelming the display. Capped below screen work area on first launch.
  const DEFAULT_WIDTH = 1100
  const DEFAULT_HEIGHT = 740
  const MIN_WIDTH = 510 // Keep in sync with DESKTOP_CHAT_MIN_WIDTH in client-ui/src/desktop/constants.ts
  const MIN_HEIGHT = 640

  let width = DEFAULT_WIDTH
  let height = DEFAULT_HEIGHT
  let center = true
  try {
    const { screen } = require('electron')
    const display = screen.getPrimaryDisplay()
    const { width: sw, height: sh } = display.workAreaSize
    // Use up to 75% width / 80% height of the work area, but no larger than defaults
    const targetW = Math.min(DEFAULT_WIDTH, Math.round(sw * 0.78))
    const targetH = Math.min(DEFAULT_HEIGHT, Math.round(sh * 0.82))
    width = Math.max(MIN_WIDTH, targetW)
    height = Math.max(MIN_HEIGHT, targetH)
  } catch {
    // screen unavailable (headless tests); fall back to defaults
  }

  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const options = {
    width,
    height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'Opptrix 你的A股投研助手',
    backgroundColor: '#F5F5F7',
    show: false,
    center,
    webPreferences: mainWindowWebPreferences({
      isDev,
      preloadPath: path.join(__dirname, 'preload.cjs'),
    }),
    ...windowIconOptions(),
  }

  if (process.platform === 'darwin') {
    options.titleBarStyle = 'hiddenInset'
    options.trafficLightPosition = { x: 16, y: 16 }
    options.vibrancy = 'sidebar'
    options.visualEffectState = 'active'
    options.transparent = true
  } else {
    options.frame = false
  }

  return options
}

function attachMainWindowHandlers(win) {
  hardenWebContents(win.webContents, { isDev })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  const notifyFullscreen = () => {
    win.webContents.send('window-fullscreen-changed', win.isFullScreen())
  }
  win.on('enter-full-screen', notifyFullscreen)
  win.on('leave-full-screen', notifyFullscreen)
  win.webContents.on('did-finish-load', notifyFullscreen)
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  attachCloseToTray(win, {
    enabled: app.isPackaged,
    shouldQuit: () => app.isQuitting === true,
  })

  setOpaqueWindowBackground(win)
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    return Promise.resolve(mainWindow)
  }

  const win = new BrowserWindow(buildMainWindowOptions())
  mainWindow = win
  attachMainWindowHandlers(win)

  if (isDev && process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'bottom' })
  }

  return Promise.resolve(win)
}

function showSplashInMainWindow(win) {
  return new Promise((resolve, reject) => {
    const onReady = () => {
      splashShownAt = Date.now()
      win.show()
      resolve()
    }
    win.once('ready-to-show', onReady)
    win.loadFile(SPLASH_HTML).catch((err) => {
      win.removeListener('ready-to-show', onReady)
      reject(err)
    })
  })
}

async function loadAppInMainWindow(win, { enforceMinSplash = true } = {}) {
  await ensureSidecarReady()
  await waitForAppUi()
  if (enforceMinSplash) await waitForSplashMinimum()

  await fadeSplashOut(win)
  setOpaqueWindowBackground(win)

  const shellReady = waitForShellReady(win)

  await new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup()
      resolve()
    }
    const onFail = (_event, code, desc) => {
      cleanup()
      reject(new Error(desc || `load failed (${code})`))
    }
    const cleanup = () => {
      win.webContents.removeListener('did-finish-load', onLoad)
      win.webContents.removeListener('did-fail-load', onFail)
    }
    win.webContents.once('did-finish-load', onLoad)
    win.webContents.once('did-fail-load', onFail)
    win.loadURL(appUrl()).catch((err) => {
      cleanup()
      reject(err)
    })
  })

  await shellReady
  enableMacWindowTransparency(win)

  if (!win.isVisible()) {
    await new Promise((resolve) => {
      win.once('ready-to-show', () => {
        win.show()
        resolve()
      })
    })
  }
}

async function ensureSidecarReady() {
  if (isDev) return
  if (!serverProcess) spawnSidecar()
  await waitForHealth()
}

async function bootstrapApp({ withSplash = true } = {}) {
  const win = await createMainWindow()

  if (withSplash) {
    await showSplashInMainWindow(win)
    await loadAppInMainWindow(win, { enforceMinSplash: true })
    return
  }

  await loadAppInMainWindow(win, { enforceMinSplash: false })
}

async function openMainWindowFromMenu() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    return
  }
  await bootstrapApp({ withSplash: false })
}

function registerWindowIpc() {
  ipcMain.on('shell-ready', (event) => {
    notifyShellReady(event.sender)
  })

  ipcMain.on('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('window-is-fullscreen', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
  })

  ipcMain.handle('pick-export-directory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择导出文件夹',
      buttonLabel: '选择此文件夹',
    })
    if (result.canceled || !result.filePaths?.[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('write-binary-file', async (_event, payload) => {
    const dirPath = String(payload?.dirPath ?? '').trim()
    const filename = String(payload?.filename ?? '').trim()
    const data = payload?.data
    if (!dirPath || !filename || !data) {
      throw new Error('写入参数无效')
    }
    const safeName = path.basename(filename)
    const filePath = path.join(dirPath, safeName)
    const buf = Buffer.from(data)
    await fs.writeFile(filePath, buf)
    return filePath
  })

  ipcMain.handle('pick-save-file', async (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const defaultPath = String(payload?.defaultPath ?? '对话.md').trim() || '对话.md'
    const result = await dialog.showSaveDialog(win ?? undefined, {
      title: String(payload?.title ?? '保存文件'),
      defaultPath,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle('write-text-file', async (_event, payload) => {
    const filePath = String(payload?.filePath ?? '').trim()
    const text = String(payload?.text ?? '')
    if (!filePath) throw new Error('保存路径无效')
    await fs.writeFile(filePath, text, 'utf8')
    return filePath
  })

  ipcMain.handle('client-version', async () => VERSION)

  ipcMain.handle('open-external-url', async (_event, url) => {
    const target = String(url ?? '').trim()
    if (!/^https?:\/\//i.test(target)) return false
    await shell.openExternal(target)
    return true
  })

  ipcMain.handle('translation-get-status', async () => {
    return getTranslationStatus(repoRoot())
  })

  ipcMain.handle('translation-get-models', async () => {
    return getTranslationModels(repoRoot())
  })

  ipcMain.handle('translation-get-download-dir', async () => {
    return ensureTranslationDownloadDir()
  })

  ipcMain.handle('translation-open-download-dir', async () => {
    const dir = await ensureTranslationDownloadDir()
    const err = await shell.openPath(dir)
    if (err) throw new Error(`无法打开目录：${err}`)
    return dir
  })

  ipcMain.handle('translation-start-download', async (event, modelId) => {
    const sender = event.sender
    return startTranslationModelDownload(repoRoot(), String(modelId ?? ''), progress => {
      if (!sender.isDestroyed()) {
        sender.send('translation-download-progress', progress)
      }
    })
  })

  ipcMain.handle('translation-cancel-download', async () => {
    return cancelTranslationModelDownload()
  })

  ipcMain.handle('translation-translate-article', async (event, payload) => {
    const sender = event.sender
    return translateArticle(repoRoot(), payload, progress => {
      if (!sender.isDestroyed()) {
        sender.send('translation-progress', progress)
      }
    })
  })

  registerUpdaterIpc(ipcMain)
  registerProtocolIpc(ipcMain)
  registerNotificationIpc(ipcMain, {
    onNotificationClick: () => focusMainWindow(),
  })
}

function setupDesktopChrome() {
  configureAboutPanel(app, resolveAppIconPath() ?? undefined)
  installApplicationMenu({
    isDev,
    getMainWindow,
    onOpenMainWindow: () => {
      void openMainWindowFromMenu()
    },
  })
}

app.whenReady().then(async () => {
  configureNotificationIdentity(APP_ID)
  applyAppIcon(app)
  setupDesktopChrome()
  registerWindowIpc()
  createTray({
    onShowMainWindow: () => {
      void openMainWindowFromMenu()
    },
    onQuit: quitApp,
  })
  await bootstrapApp()

  const launchUrl = findProtocolUrl()
  if (launchUrl) deliverProtocolUrl(launchUrl)
  else flushPendingProtocolUrl()

  if (app.isPackaged) {
    void requestNotificationPermission()
  }

  void preloadTranslationModel(repoRoot())
  void maybeBootstrapOfflineModelDownloads(repoRoot(), progress => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('translation-download-progress', progress)
      }
    }
  })
  initUpdater({ version: VERSION })

  app.on('activate', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      await bootstrapApp()
    } else {
      focusMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (app.isPackaged && hasTray()) return
  stopSidecar()
  app.quit()
})

app.on('before-quit', () => {
  app.isQuitting = true
  destroyTray()
  stopSidecar()
  void disposeTranslation()
})
