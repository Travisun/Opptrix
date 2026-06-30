const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('node:child_process')
const { APP_NAME } = require('./app-meta.cjs')
const { applyAppIcon, resolveAppIconPath } = require('./icon.cjs')
const { configureAboutPanel, installApplicationMenu } = require('./menu.cjs')
const { hardenWebContents, mainWindowWebPreferences } = require('./security.cjs')

const isDev = !app.isPackaged
const API_HOST = '127.0.0.1'
const API_PORT = process.env.STOCK_RESEARCH_PORT ?? '8711'
const MIN_SPLASH_MS = 900

app.setName(APP_NAME)

/** @type {import('node:child_process').ChildProcess | null} */
let serverProcess = null
/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null
/** @type {import('electron').BrowserWindow | null} */
let splashWindow = null
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
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`API sidecar not ready: ${url}`)
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

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}

function createSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return Promise.resolve(splashWindow)
  }

  return new Promise((resolve) => {
    splashWindow = new BrowserWindow({
      width: 380,
      height: 260,
      frame: false,
      resizable: false,
      movable: false,
      center: true,
      show: true,
      alwaysOnTop: true,
      backgroundColor: '#F5F5F7',
      ...windowIconOptions(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: false,
      },
    })

    splashWindow.loadFile(path.join(__dirname, 'splash.html'))
    splashWindow.once('ready-to-show', () => {
      if (!splashWindow?.isDestroyed()) {
        splashWindow.show()
        splashShownAt = Date.now()
      }
      resolve(splashWindow)
    })
  })
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    return Promise.resolve(mainWindow)
  }

  return new Promise((resolve) => {
    /** @type {import('electron').BrowserWindowConstructorOptions} */
    const options = {
      width: 1280,
      height: 840,
      // Keep in sync with DESKTOP_CHAT_MIN_WIDTH in client-ui/src/desktop/constants.ts
      minWidth: 510,
      minHeight: 640,
      title: 'Opptrix 你的A股投研助手',
      backgroundColor: '#00000000',
      transparent: true,
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
    } else {
      options.frame = false
    }

    const win = new BrowserWindow(options)
    mainWindow = win

    hardenWebContents(win.webContents, { isDev })

    const notifyFullscreen = () => {
      win.webContents.send('window-fullscreen-changed', win.isFullScreen())
    }
    win.on('enter-full-screen', notifyFullscreen)
    win.on('leave-full-screen', notifyFullscreen)
    win.webContents.on('did-finish-load', notifyFullscreen)
    win.on('closed', () => {
      if (mainWindow === win) mainWindow = null
    })

    win.setBackgroundColor('#00000000')

    win.once('ready-to-show', async () => {
      await waitForSplashMinimum()
      closeSplash()
      win.show()
      resolve(win)
    })

    void win.loadURL(appUrl())

    if (isDev && process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'bottom' })
    }
  })
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
}

async function ensureSidecarReady() {
  if (isDev) return
  if (!serverProcess) spawnSidecar()
  await waitForHealth()
}

async function bootstrapApp({ withSplash = true } = {}) {
  if (withSplash) {
    await createSplashWindow()
  }
  const mainReady = createMainWindow()
  await ensureSidecarReady()
  await mainReady
}

async function openMainWindowFromMenu() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    return
  }
  await bootstrapApp({ withSplash: false })
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
  closeSplash()
  stopSidecar()
  app.quit()
})

app.on('before-quit', () => {
  closeSplash()
  stopSidecar()
})
