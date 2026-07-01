const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const { spawn } = require('node:child_process')
const { APP_NAME, VERSION } = require('./app-meta.cjs')
const { applyAppIcon, resolveAppIconPath } = require('./icon.cjs')
const { configureAboutPanel, installApplicationMenu } = require('./menu.cjs')
const { hardenWebContents, mainWindowWebPreferences } = require('./security.cjs')

const isDev = !app.isPackaged
const API_HOST = '127.0.0.1'
const API_PORT = process.env.STOCK_RESEARCH_PORT ?? '8711'
const MIN_SPLASH_MS = 2200
const SPLASH_HTML = path.join(__dirname, 'splash.html')

app.setName(APP_NAME)

/** @type {import('node:child_process').ChildProcess | null} */
let serverProcess = null
/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null
let splashShownAt = 0

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

function buildMainWindowOptions() {
  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const options = {
    width: 1280,
    height: 840,
    // Keep in sync with DESKTOP_CHAT_MIN_WIDTH in client-ui/src/desktop/constants.ts
    minWidth: 510,
    minHeight: 640,
    title: 'Opptrix 你的A股投研助手',
    backgroundColor: '#F5F5F7',
    show: false,
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

  if (process.platform === 'darwin') {
    win.setBackgroundColor('#00000000')
  }
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

  await win.loadURL(appUrl())

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

  ipcMain.handle('client-version', async () => VERSION)

  ipcMain.handle('open-external-url', async (_event, url) => {
    const target = String(url ?? '').trim()
    if (!/^https?:\/\//i.test(target)) return false
    await shell.openExternal(target)
    return true
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
  applyAppIcon(app)
  setupDesktopChrome()
  registerWindowIpc()
  await bootstrapApp()

  app.on('activate', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      await bootstrapApp()
    }
  })
})

app.on('window-all-closed', () => {
  stopSidecar()
  app.quit()
})

app.on('before-quit', () => {
  stopSidecar()
})
