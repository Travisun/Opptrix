const { app, BrowserWindow, ipcMain, dialog, shell, session, nativeTheme } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const fsSync = require('node:fs')
const { pathToFileURL } = require('node:url')
const { APP_NAME, APP_TITLE, VERSION } = require('./app-meta.cjs')
const {
  buildSidecarEnv,
  spawnSidecarProcess,
  waitForHealth: waitForSidecarHealth,
  stopChild,
  serverEntryPath,
} = require('./os-schedule/sidecar-launch.cjs')
const { applyAppIcon, resolveAppIconPath } = require('./icon.cjs')
const { configureAboutPanel, installApplicationMenu, listApplicationMenuTopItems, popupApplicationMenuAt } = require('./menu.cjs')
const { hardenWebContents, mainWindowWebPreferences } = require('./security.cjs')
const { clearMacAppQuarantine } = require('./clear-mac-quarantine.cjs')
const { initUpdater, registerUpdaterIpc, resumePendingUpdateOnStartup, isUpdateReady, installPendingUpdate } = require('./updater.cjs')
const {
  deliverProtocolUrl,
  findProtocolUrl,
  flushPendingProtocolUrl,
  installProtocolHandlers,
  handleSecondInstanceArgv,
  registerProtocolIpc,
  setProtocolDeliverHandler,
} = require('./protocol.cjs')
const {
  configureNotificationIdentity,
  registerNotificationIpc,
  requestNotificationPermission,
} = require('./notifications.cjs')
const {
  installMediaPermissionHandlers,
  registerMediaPermissionIpc,
} = require('./media-permissions.cjs')
const { registerSpeechIpc } = require('./speech-whisper.cjs')
const { attachCloseToTray, createTray, destroyTray, hasTray } = require('./tray.cjs')
const { parseLaunchArgs, hasScheduleTickArg, hasBackgroundArg } = require('./launch-args.cjs')
const {
  configureScheduleBridge,
  postScheduleTick,
  fetchScheduleStatus,
  ensureAutostart,
  reconcileOsSchedule,
  pauseOsScheduleForUpdateInstall,
} = require('./schedule-bridge.cjs')
const { killResidualAppProcessesForUpdate } = require('./kill-app-for-update.cjs')
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
const {
  resolveApiPort,
  resolveWebPort,
  logPortPlan,
} = require('./resolve-ports.cjs')

const isDev = !app.isPackaged
const launchArgs = parseLaunchArgs()
/** @type {ReturnType<typeof setInterval> | null} */
let scheduleReconcileTimer = null
const API_HOST = '127.0.0.1'
let API_PORT = process.env.STOCK_RESEARCH_PORT ?? '8711'
let WEB_DEV_PORT = process.env.WEB_PORT ?? '5173'
/** @type {'use' | 'reuse' | 'bump'} */
let apiPortMode = process.env.OPPTRIX_API_PORT_MODE ?? 'use'
const MIN_SPLASH_MS = 2200
  const SPLASH_HTML = path.join(__dirname, 'splash.html')
  const SPLASH_CANVAS = '#FCFCFC'
  const APP_ID = require('../package.json').build?.appId

app.setName(APP_NAME)
/** @type {boolean} */
app.isQuitting = false
/** @type {boolean} 正在走 quitAndInstall，禁止 window-all-closed 抢先 app.quit */
app.isUpdating = false
/** @type {Promise<void> | null} */
let prepareForUpdateInstallPromise = null
/** @type {(() => Promise<void>) | null} */
let recoverDesktopAfterUpdateStall = null

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

/** Hide system traffic lights — UI draws compact stand-ins in the secondary chrome. */
function hideNativeMacTrafficLights(win) {
  if (process.platform !== 'darwin' || win.isDestroyed()) return
  try {
    if (typeof win.setWindowButtonVisibility === 'function') {
      win.setWindowButtonVisibility(false)
    }
  } catch {
    /* older Electron */
  }
}

  /**
   * macOS vibrancy / Windows mica — 对齐 Cursor 窗材质。
   * 勿开 BrowserWindow.transparent，否则缩放动画会漏出桌面空透明。
   * 窗底色按主题：mac 浅 #00FFFFFF / 深 #40000000；win 浅 #00FFFFFF / 深 #00000000。
   */
  function enableWindowBlurBackground(win) {
    if (win.isDestroyed()) return
    const dark = nativeTheme.shouldUseDarkColors
    if (process.platform === 'darwin') {
      try {
        win.setVibrancy('sidebar')
      } catch {
        /* older Electron */
      }
      win.setBackgroundColor(dark ? '#40000000' : '#00FFFFFF')
      return
    }
    if (process.platform === 'win32') {
      try {
        if (typeof win.setBackgroundMaterial === 'function') {
          win.setBackgroundMaterial('mica')
        }
      } catch {
        /* unsupported on older Windows */
      }
      win.setBackgroundColor(dark ? '#00000000' : '#00FFFFFF')
    }
  }

/** @deprecated use enableWindowBlurBackground */
function enableMacWindowTransparency(win) {
  enableWindowBlurBackground(win)
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

function nodeCommand() {
  return process.env.NODE_BINARY ?? process.execPath
}

/**
 * Sidecar env — shared with headless OS tick (`sidecar-launch.cjs`) so UI reuse
 * and cold-start use the same STOCK_RESEARCH_* / NODE_PATH layout.
 */
function sidecarEnv(root) {
  let httpUserAgent
  try {
    if (app.isReady()) {
      httpUserAgent = session.defaultSession.getUserAgent()
    }
  } catch {
    /* ignore */
  }
  return buildSidecarEnv({
    root,
    host: API_HOST,
    port: API_PORT,
    resourcesPath: isDev ? null : process.resourcesPath,
    version: VERSION,
    isDev,
    httpUserAgent,
  })
}

function spawnSidecar() {
  const root = repoRoot()
  const entry = serverEntryPath(root)
  if (!require('node:fs').existsSync(entry)) {
    throw new Error(`Server entry not found: ${entry}\nRun: npm run build:packages`)
  }

  serverProcess = spawnSidecarProcess({
    execPath: nodeCommand(),
    entry,
    cwd: root,
    env: sidecarEnv(root),
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
  await waitForSidecarHealth(API_HOST, API_PORT, timeoutMs)
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
  const proc = serverProcess
  serverProcess = null
  stopChild(proc)
}

/**
 * 更新安装前等待 sidecar 退出，避免 Windows/Linux 安装程序或 macOS 替换 .app 时文件仍被占用。
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
function stopSidecarAndWait(timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!serverProcess || serverProcess.killed || serverProcess.exitCode != null) {
      resolve()
      return
    }
    const proc = serverProcess
    serverProcess = null
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(softTimer)
      clearTimeout(hardTimer)
      resolve()
    }
    // exit 才是端口真正释放的信号；SIGTERM / SIGKILL 后都等到 exit 再 resolve。
    proc.once('exit', finish)
    // 软超时：SIGTERM 未退则升级 SIGKILL，但不立即 resolve，继续等 exit。
    const softTimer = setTimeout(() => {
      try {
        if (proc.exitCode == null && !proc.killed) proc.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }, timeoutMs)
    // 硬超时：SIGKILL 后仍拿不到 exit（极端情况），兜底放行，避免卡死退出流程。
    const hardTimer = setTimeout(finish, timeoutMs + 2000)
    try {
      proc.kill('SIGTERM')
    } catch {
      finish()
    }
  })
}

function appUrl() {
  if (isDev) return `http://127.0.0.1:${WEB_DEV_PORT}`
  return `http://${API_HOST}:${API_PORT}`
}

async function initResolvedPorts() {
  if (process.env.OPPTRIX_PORTS_RESOLVED === '1') {
    API_PORT = String(process.env.STOCK_RESEARCH_PORT ?? '8711')
    WEB_DEV_PORT = String(process.env.WEB_PORT ?? '5173')
    apiPortMode = process.env.OPPTRIX_API_PORT_MODE ?? 'use'
    return true
  }

  try {
    const apiPlan = await resolveApiPort({
      isDev,
      allowBump: isDev,
      allowReuse: true,
      allowCleanup: true,
    })
    API_PORT = String(apiPlan.port)
    apiPortMode = apiPlan.mode
    process.env.STOCK_RESEARCH_PORT = API_PORT
    process.env.OPPTRIX_API_PORT_MODE = apiPlan.mode

    if (isDev) {
      const webPlan = await resolveWebPort({ allowBump: true, allowReuse: true })
      WEB_DEV_PORT = String(webPlan.port)
      process.env.WEB_PORT = WEB_DEV_PORT
      process.env.OPPTRIX_WEB_PORT_MODE = webPlan.mode
      logPortPlan(apiPlan, webPlan)
    } else if (apiPlan.mode === 'reuse') {
      console.log(`[ports] 复用已在运行的 Opptrix API（:${API_PORT}）`)
    } else {
      console.log(`[ports] API → ${API_PORT}`)
    }

    return true
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    if (app.isReady()) {
      await dialog.showMessageBox({
        type: 'error',
        title: APP_NAME,
        message: '无法启动本地服务',
        detail,
        buttons: ['知道了'],
      })
    } else {
      console.error(`[ports] ${detail}`)
    }
    return false
  }
}

async function reportBootstrapFailure(err) {
  const detail = err instanceof Error ? err.message : String(err)
  const hint = isDev
    ? '请确认 API 与 Vite 开发服务已启动，或重新运行 npm run dev:desktop。'
    : '可尝试重启应用；若仍失败，请检查本机 8711 端口是否被其他程序占用。'
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    await dialog.showMessageBox(win, {
      type: 'error',
      title: APP_NAME,
      message: '应用加载失败',
      detail: `${detail}\n\n${hint}`,
      buttons: ['知道了'],
    })
  } else {
    console.error(`[bootstrap] ${detail}`)
  }
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

/**
 * 主窗 renderer 是否可安全 show（未崩溃、URL 落在 app 源上）。
 * @param {import('electron').BrowserWindow | null | undefined} win
 */
function isMainWindowUiHealthy(win) {
  if (!win || win.isDestroyed()) return false
  const wc = win.webContents
  if (!wc || wc.isDestroyed()) return false
  if (typeof wc.isCrashed === 'function' && wc.isCrashed()) return false
  let url = ''
  try {
    url = wc.getURL() || ''
  } catch {
    return false
  }
  if (!url || url === 'about:blank' || url === 'data:,') return false
  if (url.startsWith('chrome-error://') || url.startsWith('chrome://') || url.startsWith('file:')) {
    return false
  }
  try {
    const expected = new URL(appUrl())
    const actual = new URL(url)
    return actual.origin === expected.origin
  } catch {
    return false
  }
}

/** Restore Dock (mac) / taskbar entry before show (paired with close-to-tray hide). */
function restoreWindowTaskbarVisibility(win) {
  if (process.platform === 'darwin') {
    try {
      if (app.dock && typeof app.dock.show === 'function') app.dock.show()
    } catch {
      /* ignore */
    }
  }
  if (!win || win.isDestroyed()) return
  if (typeof win.setSkipTaskbar !== 'function') return
  try {
    win.setSkipTaskbar(false)
  } catch {
    /* ignore */
  }
}

/**
 * 托盘 / 菜单 / focus：健康窗则 restore+show；坏窗则重载；无窗则 bootstrap。
 */
async function ensureMainWindowVisible() {
  const win = getMainWindow()
  if (win) {
    if (isMainWindowUiHealthy(win)) {
      restoreWindowTaskbarVisibility(win)
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      return
    }
    try {
      await loadAppInMainWindow(win, { enforceMinSplash: false })
      if (!win.isDestroyed()) {
        restoreWindowTaskbarVisibility(win)
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      }
    } catch {
      try {
        if (!win.isDestroyed()) {
          win.removeAllListeners('close')
          win.destroy()
        }
      } catch {
        /* ignore */
      }
      if (mainWindow === win) mainWindow = null
      try {
        await bootstrapApp({ withSplash: false })
      } catch (bootErr) {
        await reportBootstrapFailure(bootErr)
      }
    }
    return
  }
  try {
    await bootstrapApp({ withSplash: false })
  } catch (err) {
    await reportBootstrapFailure(err)
  }
}

function focusMainWindow() {
  void ensureMainWindowVisible()
}

function deliverProtocolPayload(payload) {
  const win = getMainWindow()
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send('opptrix-protocol', payload)
    focusMainWindow()
  }
}

function prepareForUpdateInstall() {
  if (app.isUpdating && prepareForUpdateInstallPromise) return prepareForUpdateInstallPromise
  // 先立旗：关窗托盘化 / second-instance OS tick 都会读这两个标志
  app.isUpdating = true
  app.isQuitting = true
  prepareForUpdateInstallPromise = (async () => {
    // 1) 停主进程内调度轮询，避免安装窗口期再 reconcile / 拉起 tick
    stopScheduleReconcilePoll()
    // 2) 卸掉 OS 级 tick（launchd / schtasks / systemd），防止第二实例顶上
    try {
      const paused = await pauseOsScheduleForUpdateInstall()
      if (!paused.ok) {
        console.warn('[updater] pause OS schedule tick:', paused.error ?? paused.tick)
      }
    } catch (err) {
      console.warn('[updater] pause OS schedule tick failed:', err)
    }
    // 3) 托盘会让进程在关窗后仍存活；安装前必须拆掉
    destroyTray()
    // 4) sidecar 可能正跑计划任务；多等一会再强杀，再交给 ShipIt
    await stopSidecarAndWait(5_000)
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      try {
        // 卸掉 close→托盘隐藏等监听，强制销毁，确保进程可真正退出走安装
        win.removeAllListeners('close')
        win.destroy()
      } catch {
        /* ignore */
      }
    }
    // 5) 强杀同 bundle / 安装目录残留（Helper、孤儿实例、sidecar 孙进程等），排除 self
    try {
      await killResidualAppProcessesForUpdate()
    } catch (err) {
      console.warn('[updater] residual process cleanup failed:', err)
    }
  })()
  return prepareForUpdateInstallPromise
}

/**
 * 用户主动退出（托盘/菜单）。对齐更新路径：等 sidecar、拆托盘/窗；不设 isUpdating。
 * Windows 加短超时 app.exit 兜底，防幽灵进程。
 */
async function quitApp() {
  if (isUpdateReady()) {
    void installPendingUpdate()
    return
  }
  if (app.isUpdating) return
  app.isQuitting = true
  stopScheduleReconcilePoll()
  destroyTray()
  await stopSidecarAndWait(2_500)
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.removeAllListeners('close')
      win.destroy()
    } catch {
      /* ignore */
    }
  }
  app.quit()
  // Windows / Linux：托盘或 AppImage 更新后偶发不退；短超时强制 exit（更新路径另有 scheduleInstallExitGuards）
  if (process.platform === 'win32' || process.platform === 'linux') {
    setTimeout(() => {
      if (app.isUpdating) return
      try {
        app.exit(0)
      } catch {
        process.exit(0)
      }
    }, 4_000)
  }
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
    title: APP_TITLE,
    // Splash / Linux 默认实色；mac/win 有原生毛玻璃时启动阶段仍先用不透明底防闪
    // 路线 1：系统窗形（圆角/阴影由 OS 提供）；禁止 transparent:true
    backgroundColor: SPLASH_CANVAS,
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
    // 系统侧栏毛玻璃。不要设 transparent:true —— 缩放时新区域会短暂变成「空透明」漏桌面。
    options.vibrancy = 'sidebar'
    options.visualEffectState = 'active'
  } else if (process.platform === 'win32') {
    options.frame = false
    // 同 mac：用系统材料，避免整窗 transparent 导致缩放漏底；Win11 默认系统圆角（对齐 Cursor mica）
    options.backgroundMaterial = 'mica'
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

  win.webContents.on('will-frame-navigate', (event, url) => {
    if (!/^https?:\/\//i.test(url)) return
    try {
      const current = win.webContents.getURL()
      if (current) {
        const currentOrigin = new URL(current).origin
        const targetOrigin = new URL(url).origin
        if (currentOrigin === targetOrigin) return
      }
    } catch {
      /* open externally */
    }
    event.preventDefault()
    void shell.openExternal(url)
  })

  const notifyFullscreen = () => {
    win.webContents.send('window-fullscreen-changed', win.isFullScreen())
    hideNativeMacTrafficLights(win)
  }
  win.on('enter-full-screen', notifyFullscreen)
  win.on('leave-full-screen', notifyFullscreen)
  win.webContents.on('did-finish-load', () => {
    notifyFullscreen()
    hideNativeMacTrafficLights(win)
  })
  win.on('show', () => {
    hideNativeMacTrafficLights(win)
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  attachCloseToTray(win, {
    enabled: app.isPackaged,
    shouldQuit: () => app.isQuitting === true,
  })

  setOpaqueWindowBackground(win)
  hideNativeMacTrafficLights(win)
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
  enableWindowBlurBackground(win)

  if (!win.isVisible()) {
    await new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(fallbackTimer)
        win.removeListener('ready-to-show', onReady)
        resolve()
      }
      const showNow = () => {
        if (!win.isDestroyed() && !win.isVisible()) {
          win.show()
        }
        finish()
      }
      const onReady = () => showNow()
      // 先挂 ready-to-show，再尝试立刻 show（did-finish-load 后事件可能已错过）
      win.once('ready-to-show', onReady)
      const fallbackTimer = setTimeout(showNow, 1_000)
      // did-finish-load 后 ready-to-show 可能已错过：内容不在加载中则立刻 show
      if (!win.webContents.isLoading()) {
        setImmediate(showNow)
      }
    })
  }
}

async function ensureSidecarReady() {
  if (isDev) {
    await waitForHealth()
    return
  }
  if (apiPortMode === 'reuse') {
    await waitForHealth()
    return
  }
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

async function handleScheduleTickFromOs() {
  try {
    await ensureSidecarReady()
    await postScheduleTick()
  } catch (err) {
    console.warn('[schedule] os tick failed:', err instanceof Error ? err.message : err)
  }
}

async function buildTrayScheduleStatusItem() {
  try {
    const status = await fetchScheduleStatus()
    if (!status.master_enabled) {
      return { label: '计划任务：已关闭' }
    }
    if (status.recent_failure_count > 0) {
      return {
        label: `计划任务：最近有 ${status.recent_failure_count} 项失败`,
      }
    }
    return {
      label: `计划任务：${status.enabled_jobs} 个任务运行中`,
    }
  } catch {
    return { label: '计划任务：暂时无法获取状态', enabled: false }
  }
}

function startScheduleReconcilePoll() {
  if (scheduleReconcileTimer) return
  scheduleReconcileTimer = setInterval(() => {
    void reconcileOsSchedule().catch(() => {})
  }, 30_000)
  if (typeof scheduleReconcileTimer.unref === 'function') {
    scheduleReconcileTimer.unref()
  }
}

function stopScheduleReconcilePoll() {
  if (!scheduleReconcileTimer) return
  clearInterval(scheduleReconcileTimer)
  scheduleReconcileTimer = null
}

async function bootstrapBackgroundApp() {
  if (process.platform === 'darwin' && launchArgs.background) {
    try {
      app.dock.hide()
    } catch {
      /* ignore */
    }
  }

  await ensureSidecarReady()
  configureScheduleBridge({ host: API_HOST, port: API_PORT })

  // 登录项 / 前台 / --background 常驻：sidecar + 进程内 timer；reconcile 仅注销遗留 OS tick
  await reconcileOsSchedule().catch((err) => {
    console.warn('[schedule] reconcile failed:', err instanceof Error ? err.message : err)
  })
  startScheduleReconcilePoll()
}

/**
 * 兼容旧 LaunchAgent / 手动 `--schedule-tick`：短命 worker，不建托盘、不常驻 reconcile poll。
 * 新注册的 OS tick 不再指向此路径（见 headless-tick.cjs）。
 */
async function exitAfterEphemeralScheduleTick() {
  app.isQuitting = true
  stopScheduleReconcilePoll()
  destroyTray()
  await stopSidecarAndWait(2_500)
  app.quit()
  if (process.platform === 'win32' || process.platform === 'linux') {
    setTimeout(() => {
      if (app.isUpdating) return
      try {
        app.exit(0)
      } catch {
        process.exit(0)
      }
    }, 3_000)
  }
}

/**
 * 兼容旧 plist / 手动调试的 GUI 短命 tick worker：ensureSidecar → tick → 可选 reconcile → 退出。
 * OS runner fallback 使用 headless-tick（ELECTRON_RUN_AS_NODE），不经过本函数。
 */
async function runEphemeralScheduleTickWorker() {
  if (process.platform === 'darwin') {
    try {
      app.dock.hide()
    } catch {
      /* ignore */
    }
  }

  try {
    await ensureSidecarReady()
    configureScheduleBridge({ host: API_HOST, port: API_PORT })
    await handleScheduleTickFromOs()
    await reconcileOsSchedule().catch((err) => {
      console.warn('[schedule] reconcile failed:', err instanceof Error ? err.message : err)
    })
  } catch (err) {
    console.error('[bootstrap:schedule-tick]', err instanceof Error ? err.message : err)
  } finally {
    await exitAfterEphemeralScheduleTick()
  }
}

async function bootstrapForegroundApp({ withSplash = true } = {}) {
  try {
    await bootstrapApp({ withSplash })
  } catch (err) {
    await reportBootstrapFailure(err)
    app.quit()
    return false
  }
  configureScheduleBridge({ host: API_HOST, port: API_PORT })
  await reconcileOsSchedule().catch((err) => {
    console.warn('[schedule] reconcile failed:', err instanceof Error ? err.message : err)
  })
  startScheduleReconcilePoll()
  return true
}

function revealAppFromTray() {
  if (process.platform === 'darwin') {
    try {
      app.dock.show()
    } catch {
      /* ignore */
    }
  }
  void ensureMainWindowVisible()
}

function createDesktopTray() {
  createTray({
    onShowMainWindow: revealAppFromTray,
    onQuit: () => {
      void quitApp()
    },
    onOpenScheduleStatus: revealAppFromTray,
    scheduleStatusProvider: buildTrayScheduleStatusItem,
  })
}

async function openMainWindowFromMenu() {
  await ensureMainWindowVisible()
}

function applyNativeThemeSource(source) {
  if (source !== 'system' && source !== 'light' && source !== 'dark') return
  nativeTheme.themeSource = source
  // Re-apply vibrancy/mica + theme-matched window background (dark mac uses #40000000).
  const win = mainWindow
  if (win && !win.isDestroyed()) {
    enableWindowBlurBackground(win)
  }
}

async function installWindowsSandboxFromMain() {
  if (process.platform !== 'win32') {
    return { ok: false, message: '当前系统无需此步骤' }
  }
  const root = repoRoot()
  const { RUNTIME_DEPS_DIR } = require('./runtime-deps.cjs')
  const nmDir = path.join(root, 'node_modules')
  const depsDir = path.join(root, RUNTIME_DEPS_DIR)
  const moduleRoot = fsSync.existsSync(nmDir) ? nmDir : depsDir
  const entry = path.join(moduleRoot, '@anthropic-ai/sandbox-runtime/dist/index.js')
  if (!fsSync.existsSync(entry)) {
    return { ok: false, message: '命令隔离组件未随应用分发，请重新安装 Opptrix' }
  }
  const mod = await import(pathToFileURL(entry).href)
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : process.arch
  const srtWinExe = path.join(
    moduleRoot,
    '@anthropic-ai/sandbox-runtime/vendor/srt-win',
    arch,
    'srt-win.exe',
  )
  if (!fsSync.existsSync(srtWinExe)) {
    return { ok: false, message: '命令隔离组件不完整，请重新安装 Opptrix' }
  }
  const srtWin = mod.resolveSrtWin({ path: srtWinExe })
  const result = await mod.installWindowsSandboxAsync({ srtWin })
  if (result.cancelled) {
    return {
      ok: false,
      cancelled: true,
      message: '未完成系统授权，命令隔离环境尚未就绪；可稍后在设置中重试',
    }
  }
  const shellMod = await resolveAgentWorkspaceShellModule('shell/ensure-windows-sandbox.js')
  // Align with isWindowsSandboxProvisioned — cannot-read is OK for unelevated probes
  const ready = shellMod?.isWindowsSandboxProvisioned
    ? shellMod.isWindowsSandboxProvisioned(result)
    : Boolean(
        result.user?.provisioned &&
          result.user?.credPresent &&
          (result.wfp?.state === 'installed' || result.wfp?.state === 'cannot-read'),
      )
  return {
    ok: ready,
    message: ready ? '命令隔离环境已就绪' : '命令隔离环境尚未就绪，请稍后重试',
  }
}

async function resolveAgentWorkspaceShellModule(subpath) {
  const root = repoRoot()
  const { RUNTIME_DEPS_DIR } = require('./runtime-deps.cjs')
  const candidates = [
    path.join(root, RUNTIME_DEPS_DIR, '@opptrix/agent-workspace/dist', subpath),
    path.join(root, 'node_modules/@opptrix/agent-workspace/dist', subpath),
    path.join(root, 'packages/agent-workspace/dist', subpath),
  ]
  for (const entry of candidates) {
    if (fsSync.existsSync(entry)) {
      return import(pathToFileURL(entry).href)
    }
  }
  return null
}

async function installLinuxSandboxFromMain() {
  if (process.platform !== 'linux') {
    return { ok: false, message: '当前系统无需此步骤' }
  }
  const mod = await resolveAgentWorkspaceShellModule('shell/ensure-linux-sandbox.js')
  if (!mod?.ensureLinuxSandboxReady) {
    return { ok: false, message: '命令隔离组件未随应用分发，请重新安装 Opptrix' }
  }
  const result = await mod.ensureLinuxSandboxReady({ allowAutoInstall: true, forceRetry: true })
  if (result.cancelled) {
    return {
      ok: false,
      cancelled: true,
      message: result.message ?? '未完成系统授权，命令隔离环境尚未就绪；可稍后在设置中重试',
    }
  }
  return {
    ok: Boolean(result.ready),
    message: result.message ?? (result.ready ? '命令隔离环境已就绪' : '命令隔离环境尚未就绪，请稍后重试'),
  }
}

function registerWindowIpc() {
  ipcMain.on('shell-ready', (event) => {
    notifyShellReady(event.sender)
  })

  ipcMain.on('set-theme-source', (_event, source) => {
    applyNativeThemeSource(source)
  })

  ipcMain.on('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    // macOS green button ≈ zoom (maximize fill); Windows/Linux = maximize toggle
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('app-menu-list', () => listApplicationMenuTopItems())
  ipcMain.handle('app-menu-popup', async (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const index = Number(payload?.index)
    const x = Number(payload?.x)
    const y = Number(payload?.y)
    if (!Number.isInteger(index) || index < 0) return false
    return popupApplicationMenuAt(index, { window: win, x, y })
  })
  ipcMain.handle('window-is-fullscreen', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
  })
  ipcMain.handle('window-is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
  ipcMain.handle('window-is-focused', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return false
    return win.isFocused()
  })

  /**
   * Ensure the window's content width is at least `minWidth`.
   * Used when opening the right panel on a narrow window.
   * Unmaximizes if needed; clamps to the current display work area.
   */
  ipcMain.handle('window-ensure-content-width', async (event, minWidth) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return { ok: false, width: 0 }
    const target = Math.round(Number(minWidth))
    if (!Number.isFinite(target) || target <= 0) return { ok: false, width: 0 }

    if (win.isFullScreen()) {
      const [cw] = win.getContentSize()
      return { ok: false, width: cw, reason: 'fullscreen' }
    }

    if (win.isMaximized()) {
      win.unmaximize()
    }

    const [contentW, contentH] = win.getContentSize()
    if (contentW >= target) return { ok: true, width: contentW }

    const { screen } = require('electron')
    const bounds = win.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const work = display.workArea
    const frameW = Math.max(0, bounds.width - contentW)
    const maxOuterW = work.width
    const maxContentW = Math.max(contentW, maxOuterW - frameW)
    const nextContentW = Math.min(target, maxContentW)
    const nextOuterW = nextContentW + frameW

    let nextX = bounds.x
    if (nextX + nextOuterW > work.x + work.width) {
      nextX = work.x + work.width - nextOuterW
    }
    if (nextX < work.x) nextX = work.x

    win.setBounds({
      x: Math.round(nextX),
      y: bounds.y,
      width: Math.round(nextOuterW),
      height: bounds.height,
    })

    const [finalW] = win.getContentSize()
    return { ok: finalW >= Math.min(target, maxContentW), width: finalW }
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

  ipcMain.handle('shell-install-windows-sandbox', async () => {
    return installWindowsSandboxFromMain()
  })

  ipcMain.handle('shell-install-linux-sandbox', async () => {
    return installLinuxSandboxFromMain()
  })

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

  ipcMain.handle('chat-debug-open-log-dir', async () => {
    const dataRoot = String(process.env.OPPTRIX_DATA_DIR ?? '').trim()
      || path.join(require('node:os').homedir(), '.opptrix')
    const dir = path.join(dataRoot, 'logs', 'chat-debug')
    await fs.mkdir(dir, { recursive: true })
    const err = await shell.openPath(dir)
    if (err) throw new Error(`无法打开目录：${err}`)
    return dir
  })

  /** 仅允许打开 resolveUserDataRoot()/agent-workspace 之下的目录 */
  ipcMain.handle('open-local-directory', async (_event, dirPath) => {
    const raw = String(dirPath ?? '').trim()
    if (!raw || raw.includes('..')) {
      throw new Error('目录路径无效')
    }
    const resolved = path.resolve(raw)
    if (resolved.includes('..')) {
      throw new Error('目录路径无效')
    }
    const dataRoot = path.resolve(
      String(process.env.OPPTRIX_DATA_DIR ?? '').trim() || path.join(require('node:os').homedir(), '.opptrix'),
    )
    const workspaceRoot = path.resolve(dataRoot, 'agent-workspace')
    const prefix = workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`
    if (resolved !== workspaceRoot && !resolved.startsWith(prefix)) {
      throw new Error('目录路径无效')
    }
    if (!fsSync.existsSync(resolved)) {
      fsSync.mkdirSync(resolved, { recursive: true })
    }
    const err = await shell.openPath(resolved)
    if (err) throw new Error(`无法打开目录：${err}`)
    return resolved
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

  registerUpdaterIpc(ipcMain, {
    prepareForUpdateInstall,
    onInstallStallRecover: () => recoverDesktopAfterUpdateStall?.(),
  })
  registerProtocolIpc(ipcMain)
  registerNotificationIpc(ipcMain, {
    onNotificationClick: (payload) => {
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
      if (sessionId) {
        deliverProtocolUrl(`opptrix://chat?session=${encodeURIComponent(sessionId)}`)
        return
      }
      focusMainWindow()
    },
  })
  registerMediaPermissionIpc(ipcMain)
  registerSpeechIpc(ipcMain)

  ipcMain.handle('schedule-os-reconcile', async () => reconcileOsSchedule())
  ipcMain.handle('schedule-ensure-autostart', async (_event, enabled) => ensureAutostart(Boolean(enabled)))
  ipcMain.handle('schedule-post-tick', async () => postScheduleTick())
  ipcMain.handle('schedule-get-status', async () => fetchScheduleStatus())
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

// Defensive: hide Dock before single-instance lock so a losing
// --background / --schedule-tick instance does not flash the Dock icon before quit.
if (process.platform === 'darwin' && (launchArgs.background || launchArgs.scheduleTick)) {
  try {
    if (app.dock && typeof app.dock.hide === 'function') {
      app.dock.hide()
    }
  } catch {
    /* ignore */
  }
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // 更新安装窗口期：忽略 OS tick / 二次唤起，避免拖住本进程或再开工作
    if (app.isUpdating || app.isQuitting) return

    if (hasScheduleTickArg(argv)) {
      void handleScheduleTickFromOs()
      if (!hasBackgroundArg(argv)) {
        focusMainWindow()
      }
      return
    }
    handleSecondInstanceArgv(argv)
    focusMainWindow()
  })

  app.whenReady().then(async () => {
    // 尽早清 quarantine，减轻自动更新/下载后 Gatekeeper「已损坏」误报
    clearMacAppQuarantine()
    configureNotificationIdentity(APP_ID)
    installMediaPermissionHandlers(session.defaultSession)
    applyAppIcon(app)
    setupDesktopChrome()
    registerWindowIpc()

    const portsOk = await initResolvedPorts()
    if (!portsOk) {
      app.quit()
      return
    }

    if (app.isPackaged) {
      const quittingForUpdate = await resumePendingUpdateOnStartup({ version: VERSION })
      // true：已 destroy 窗口并进入 quitAndInstall；退出/恢复看门狗在 updater.triggerInstall
      if (quittingForUpdate) return
    }

    await continueDesktopBootstrap({
      withSplash: !launchArgs.background,
      background: launchArgs.background,
    })

    // 短命 tick worker 已退出路径，勿再挂 activate / 常驻逻辑
    if (launchArgs.scheduleTick) return

    app.on('activate', async () => {
      if (launchArgs.background && !mainWindow) {
        return
      }
      if (!mainWindow || mainWindow.isDestroyed()) {
        try {
          await bootstrapApp()
        } catch (err) {
          await reportBootstrapFailure(err)
        }
      } else {
        focusMainWindow()
      }
    })
  })

  /**
   * 正常启动（及更新安装失败后的恢复）共用：托盘 → sidecar/窗口 → updater。
   * `--schedule-tick` 冷启动走短命 worker：不建托盘、tick 后退出。
   * @param {{ withSplash?: boolean; background?: boolean }} [opts]
   * @returns {Promise<boolean>} true = 常驻桌面已就绪；false = 短命 tick 已退出
   */
  async function continueDesktopBootstrap(opts = {}) {
    // OS schtasks / launchd 冷启动：不建托盘，跑完 tick 干净退出
    if (launchArgs.scheduleTick) {
      await runEphemeralScheduleTickWorker()
      return false
    }

    const background = opts.background === true
    const withSplash = opts.withSplash !== false && !background

    createDesktopTray()

    if (background) {
      try {
        await bootstrapBackgroundApp()
      } catch (err) {
        console.error('[bootstrap:background]', err instanceof Error ? err.message : err)
        app.quit()
        return false
      }
    } else {
      const ok = await bootstrapForegroundApp({ withSplash })
      if (!ok) return false
    }

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
    return true
  }

  recoverDesktopAfterUpdateStall = async () => {
    console.error('[updater] recovering desktop UI after stalled update install')
    app.isUpdating = false
    app.isQuitting = false
    prepareForUpdateInstallPromise = null
    await continueDesktopBootstrap({ withSplash: true, background: false })
  }

  app.on('window-all-closed', () => {
    // 更新安装中由 quitAndInstall 接管退出；勿抢先 app.quit()
    if (app.isUpdating) return
    if (app.isPackaged && hasTray()) return
    stopSidecar()
    app.quit()
  })

  app.on('before-quit', () => {
    app.isQuitting = true
    stopScheduleReconcilePoll()
    destroyTray()
    stopSidecar()
    void disposeTranslation()
  })
}
