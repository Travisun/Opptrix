const path = require('path')
const Module = require('module')
const { app, BrowserWindow } = require('electron')
const { showLocalNotification } = require('./notifications.cjs')
const {
  readPendingDownloadFromDisk,
  isVersionNewer,
  compareVersions,
  clearPendingDownloadCache,
} = require('./update-pending.cjs')
const {
  reconcileInstallGuard,
  isInstallBlocked,
  recordInstallAttempt,
  getInstallBlockReason,
  clearGuardState,
  readLastRunVersion,
  writeLastRunVersion,
} = require('./update-guard.cjs')
const {
  getAutoDownloadPreference,
  setAutoDownloadPreference,
} = require('./app-update-prefs.cjs')

const UPDATER_VENDOR_DIR = path.join(__dirname, '../build/updater-deps/packages')

function prependNodePath(dir) {
  const sep = path.delimiter
  const parts = (process.env.NODE_PATH || '').split(sep).filter(Boolean)
  if (parts.includes(dir)) return
  process.env.NODE_PATH = parts.length > 0 ? `${dir}${sep}${parts.join(sep)}` : dir
  Module._initPaths()
}

function loadAutoUpdater() {
  try {
    return require('electron-updater').autoUpdater
  } catch {
    prependNodePath(UPDATER_VENDOR_DIR)
    return require(path.join(UPDATER_VENDOR_DIR, 'electron-updater')).autoUpdater
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

/** @type {(() => void) | null} */
let prepareForUpdateInstall = null

/** @type {(() => void | Promise<void>) | null} 安装未退出时恢复 UI（防空壳进程） */
let onInstallStallRecover = null

/** electron-updater 已加载待安装包（含 Squirrel 代理就绪） */
let updatePackageHydrated = false

/** 启动时 resume 钩子是否已执行过 checkForUpdates */
let startupResumeHandled = false

/** 避免重复注册 autoUpdater 事件 */
let autoUpdaterEventsBound = false

/** 同一次安装只挂一次退出/恢复看门狗 */
let installExitWatchdogScheduled = false

const INSTALL_FORCE_EXIT_MS = 3_000
const INSTALL_STALL_RECOVER_MS = 12_000

/** Startup: do not block UI/bootstrap longer than this for hydrate + install. */
const STARTUP_UPDATE_QUICK_MS = 6_000
const STARTUP_UPDATE_DEFERRED_MS = 25_000

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

function setStatus(patch) {
  // 默认清除手动安装引导；仅 blocked 分支显式置 true，避免标志残留刷屏
  status = { ...status, manual_install_help: false, ...patch }
  broadcast('app-update-status', status)
}

function shouldSkipStartupResume() {
  if (process.argv.includes('--opptrix-skip-update-resume')) return true
  // OS tick 唤醒只负责跑任务，不在此刻替换安装包（避免与后台调度 / 单实例转发竞态）
  if (process.argv.includes('--schedule-tick')) return true
  return false
}

/** 清理已成功应用、或降级后残留的 pending 包与 guard，避免误触发 resume */
function reconcileLocalUpdateState(currentVersion) {
  reconcileInstallGuard(currentVersion)

  const lastRunVersion = readLastRunVersion()
  const pending = readPendingDownloadFromDisk()
  let cleared = false

  if (pending?.version) {
    if (!isVersionNewer(pending.version, currentVersion)) {
      console.info('[updater] clearing applied pending cache for', pending.version)
      cleared = clearPendingDownloadCache()
    } else if (
      lastRunVersion
      && compareVersions(currentVersion, lastRunVersion) < 0
    ) {
      console.info(
        '[updater] clearing stale pending after downgrade',
        `${currentVersion} <- was ${lastRunVersion}, pending ${pending.version}`,
      )
      cleared = clearPendingDownloadCache()
    }
  }

  if (cleared) {
    clearGuardState()
    updatePackageHydrated = false
  }

  writeLastRunVersion(currentVersion)
}

function hydrateReadyStatusFromDisk(currentVersion) {
  const pending = readPendingDownloadFromDisk()
  if (!pending?.version || !isVersionNewer(pending.version, currentVersion)) {
    return null
  }

  const blocked = isInstallBlocked(pending.cacheKey)
  const blockReason = blocked ? getInstallBlockReason(pending.cacheKey) : null

  setStatus({
    state: 'ready',
    currentVersion,
    version: pending.version,
    percent: 100,
    message: blockReason
      ?? `新版本 ${pending.version} 已就绪，重启后即可完成更新`,
    manual_install_help: blocked,
  })
  return pending
}

function configureAutoUpdaterDefaults() {
  if (!autoUpdater) return
  autoUpdater.autoDownload = getAutoDownloadPreference()
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = null
  try {
    const { installCustomUpdateSignatureVerification } = require('./update-signature.cjs')
    installCustomUpdateSignatureVerification(autoUpdater)
  } catch (err) {
    console.error('[updater] failed to install custom signature verification:', err)
  }
}

function attachNativeBeforeQuitHook() {
  try {
    const { autoUpdater: nativeAutoUpdater } = require('electron')
    nativeAutoUpdater.on('before-quit-for-update', () => {
      prepareForUpdateInstall?.()
    })
  } catch {
    // non-mac or older runtime
  }
}

function focusMainWindowForUpdate() {
  const win = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed())
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function notifyUpdateAvailable(version) {
  if (!version) return
  const autoDownload = getAutoDownloadPreference()
  showLocalNotification({
    title: '发现 Opptrix 新版本',
    body: autoDownload
      ? `版本 ${version} 正在后台下载，完成后会通知你重启。`
      : `发现新版本 ${version}，打开应用后可确认下载。`,
    tag: 'app-update-available',
    onClick: focusMainWindowForUpdate,
  })
}

function notifyUpdateReady(version) {
  if (!version) return
  showLocalNotification({
    title: 'Opptrix 更新已就绪',
    body: `新版本 ${version} 已下载，点击打开应用并重启更新。`,
    tag: 'app-update-ready',
    onClick: focusMainWindowForUpdate,
  })
}

function bindAutoUpdaterEvents(currentVersion) {
  if (!autoUpdater || autoUpdaterEventsBound) return
  autoUpdaterEventsBound = true

  autoUpdater.on('checking-for-update', () => {
    if (status.state === 'installing') return
    setStatus({
      state: 'checking',
      currentVersion,
      message: '正在检查更新…',
    })
  })

  autoUpdater.on('update-available', (info) => {
    if (status.state === 'installing') return
    const autoDownload = getAutoDownloadPreference()
    setStatus({
      state: 'available',
      currentVersion,
      version: info.version,
      percent: 0,
      message: autoDownload
        ? `发现新版本 ${info.version}`
        : `发现新版本 ${info.version}，确认后即可下载`,
    })
    notifyUpdateAvailable(info.version)
  })

  autoUpdater.on('update-not-available', () => {
    if (status.state === 'installing') return
    const pending = readPendingDownloadFromDisk()
    if (pending?.version && isVersionNewer(pending.version, currentVersion)) {
      hydrateReadyStatusFromDisk(currentVersion)
      return
    }
    setStatus({
      state: 'not-available',
      currentVersion,
      version: null,
      percent: 0,
      message: '当前已是最新版本',
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    if (status.state === 'installing') return
    setStatus({
      state: 'downloading',
      percent: Math.round(progress.percent ?? 0),
      message: `正在下载更新 ${Math.round(progress.percent ?? 0)}%`,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    void (async () => {
      if (process.platform === 'linux') {
        try {
          const {
            tryDownloadCmsBeside,
            verifyLinuxUpdateArtifact,
          } = require('./update-signature.cjs')
          const artifactPath = info?.downloadedFile || info?.path || null
          if (artifactPath) {
            const fileUrl = info?.files?.[0]?.url || info?.path || null
            await tryDownloadCmsBeside(artifactPath, typeof fileUrl === 'string' && fileUrl.startsWith('http') ? fileUrl : null)
            const cmsErr = await verifyLinuxUpdateArtifact(artifactPath)
            if (cmsErr) {
              updatePackageHydrated = false
              setStatus({
                state: 'error',
                currentVersion,
                version: info.version,
                message: `更新包签名校验失败：${cmsErr}`,
              })
              return
            }
          }
        } catch (err) {
          console.error('[updater] linux signature check failed:', err)
        }
      }

      updatePackageHydrated = true
      setStatus({
        state: 'ready',
        currentVersion,
        version: info.version,
        percent: 100,
        message: `新版本 ${info.version} 已就绪，重启后即可完成更新`,
      })
      notifyUpdateReady(info.version)
    })()
  })

  autoUpdater.on('error', (err) => {
    if (status.state === 'installing') return
    const pending = readPendingDownloadFromDisk()
    if (pending?.version && isVersionNewer(pending.version, currentVersion)) {
      hydrateReadyStatusFromDisk(currentVersion)
      return
    }
    setStatus({
      state: 'error',
      message: err instanceof Error ? err.message : '更新检查失败',
    })
  })
}

function triggerInstall({ targetVersion, cacheKey, source }) {
  if (cacheKey && isInstallBlocked(cacheKey)) {
    const reason = getInstallBlockReason(cacheKey)
    setStatus({
      state: 'ready',
      currentVersion: status.currentVersion,
      version: targetVersion ?? status.version,
      percent: 100,
      message: reason ?? '自动更新多次未成功。可到官网下载最新安装包覆盖安装，或稍后再试。',
      manual_install_help: true,
    })
    return Promise.resolve(false)
  }

  if (cacheKey && targetVersion) {
    recordInstallAttempt({ cacheKey, targetVersion })
  }

  setStatus({
    state: 'installing',
    currentVersion: status.currentVersion,
    version: targetVersion ?? status.version,
    message: source === 'startup'
      ? '检测到待安装更新，正在退出并安装…'
      : '正在安装更新并重启应用…',
  })

  return Promise.resolve(prepareForUpdateInstall?.())
    .catch((err) => {
      console.error('[updater] prepareForUpdateInstall failed:', err)
    })
    .then(() => {
      // 等关闭窗口 / sidecar 落盘后再安装：
      // - macOS：Squirrel 替换 .app 并重新拉起本应用
      // - Windows / Linux：唤起已下载的安装包（exe / AppImage），isForceRunAfter 安装后启动 App
      setImmediate(() => {
        if (!autoUpdater) {
          scheduleInstallExitGuards()
          app.exit(0)
          return
        }
        try {
          // macOS：Squirrel.Mac 的 quitAndInstall 自行替换 .app 并 relaunch；
          // 不再翻 autoInstallOnAppQuit=true，避免与 ShipIt 流程叠加产生二次安装/relaunch 竞态。
          // Windows / Linux：保留 quit 时安装兜底，防 quitAndInstall 只退不装。
          if (process.platform !== 'darwin') {
            autoUpdater.autoInstallOnAppQuit = true
          }
          autoUpdater.quitAndInstall(false, true)
        } catch (err) {
          console.error('[updater] quitAndInstall failed:', err)
          try {
            app.exit(0)
          } catch {
            process.exit(0)
          }
        }
        scheduleInstallExitGuards()
      })
      return true
    })
}

/**
 * macOS ShipIt / Linux AppImage 替换要求本进程真正退出，否则报应用仍在运行或占锁失败。
 * 若 quitAndInstall 未退出，先强制 exit；仍卡住则恢复 UI，避免无窗口空壳。
 */
function scheduleInstallExitGuards() {
  if (installExitWatchdogScheduled) return
  installExitWatchdogScheduled = true

  setTimeout(() => {
    if (!app.isUpdating) return
    console.warn('[updater] forcing app.exit so the installer can replace the app bundle')
    try {
      app.exit(0)
    } catch {
      process.exit(0)
    }
  }, INSTALL_FORCE_EXIT_MS)

  setTimeout(() => {
    if (!app.isUpdating) return
    console.error('[updater] install did not exit within grace period; recovering UI')
    installExitWatchdogScheduled = false
    app.isUpdating = false
    app.isQuitting = false
    setStatus({
      state: 'ready',
      currentVersion: status.currentVersion,
      version: status.version,
      percent: 100,
      message:
        '更新安装未完成。请强制退出本应用后重新打开，即可继续安装。',
    })
    void Promise.resolve(onInstallStallRecover?.()).catch((err) => {
      console.error('[updater] install stall recovery failed:', err)
    })
  }, INSTALL_STALL_RECOVER_MS)
}

function waitForHydratedUpdate(currentVersion, timeoutMs = 20_000) {
  if (updatePackageHydrated && status.state === 'ready') {
    return Promise.resolve(status.version ?? null)
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (version) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(version)
    }

    const timer = setTimeout(() => finish(null), timeoutMs)

    autoUpdater.once('update-downloaded', (info) => finish(info.version ?? null))
    autoUpdater.once('update-not-available', () => {
      const pending = readPendingDownloadFromDisk()
      if (pending?.version && isVersionNewer(pending.version, currentVersion)) {
        finish(pending.version)
        return
      }
      finish(null)
    })
    autoUpdater.once('error', () => finish(null))

    // 自动下载关闭时，hydrate 待安装包须显式 downloadUpdate（resume / 安装前）
    void (async () => {
      try {
        await autoUpdater.checkForUpdates()
        if (!autoUpdater.autoDownload && !updatePackageHydrated && !settled) {
          await autoUpdater.downloadUpdate()
        }
      } catch {
        finish(null)
      }
    })()
  })
}

/**
 * 启动第一时间：若本地已有比当前版本新的待安装包，则尝试退出并安装。
 * @param {{ version: string, hydrateTimeoutMs?: number }} opts
 * @returns {Promise<boolean>} true = 已进入安装退出路径
 */
async function resumePendingUpdateOnStartup({ version, hydrateTimeoutMs = 20_000 }) {
  if (!app.isPackaged || !autoUpdater || shouldSkipStartupResume()) {
    return false
  }

  reconcileLocalUpdateState(version)

  const pending = readPendingDownloadFromDisk()
  if (!pending?.version || !isVersionNewer(pending.version, version)) {
    return false
  }

  startupResumeHandled = true

  if (isInstallBlocked(pending.cacheKey)) {
    console.warn('[updater] startup resume blocked by guard for', pending.version)
    hydrateReadyStatusFromDisk(version)
    return false
  }

  configureAutoUpdaterDefaults()
  attachNativeBeforeQuitHook()
  bindAutoUpdaterEvents(version)

  const hydratedVersion = await waitForHydratedUpdate(version, hydrateTimeoutMs)
  if (!hydratedVersion || !isVersionNewer(hydratedVersion, version)) {
    console.warn('[updater] startup resume: update not hydrated yet; deferring')
    return false
  }

  return triggerInstall({
    targetVersion: hydratedVersion,
    cacheKey: pending.cacheKey,
    source: 'startup',
  })
}

/** 短超时快速尝试（不阻塞 UI）；失败则 deferred 钩子再试。 */
async function tryQuickPendingUpdateOnStartup({ version }) {
  return resumePendingUpdateOnStartup({
    version,
    hydrateTimeoutMs: STARTUP_UPDATE_QUICK_MS,
  })
}

/** UI 就绪后后台再试一次 pending 安装。 */
async function tryDeferredPendingUpdateOnStartup({ version }) {
  if (!app.isPackaged || !autoUpdater) return
  const pending = readPendingDownloadFromDisk()
  if (!pending?.version || !isVersionNewer(pending.version, version)) return
  if (status.state === 'installing') return
  await resumePendingUpdateOnStartup({
    version,
    hydrateTimeoutMs: STARTUP_UPDATE_DEFERRED_MS,
  })
}

function initUpdater({ version }) {
  status.currentVersion = version
  reconcileLocalUpdateState(version)

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

  configureAutoUpdaterDefaults()
  attachNativeBeforeQuitHook()
  bindAutoUpdaterEvents(version)

  const pending = hydrateReadyStatusFromDisk(version)

  const runCheck = () => {
    if (status.state === 'installing') return
    void autoUpdater.checkForUpdates().catch(() => {
      if (pending?.version && isVersionNewer(pending.version, version)) {
        hydrateReadyStatusFromDisk(version)
        return
      }
      setStatus({
        state: 'error',
        message: '无法连接更新服务器',
      })
    })
  }

  if (startupResumeHandled) {
    // resume 钩子已做过一次 checkForUpdates；此处仅补常规轮询。
    setInterval(runCheck, 6 * 60 * 60 * 1000)
    return
  }

  const startupDelayMs = pending ? 0 : 10_000
  setTimeout(runCheck, startupDelayMs)
  setInterval(runCheck, 6 * 60 * 60 * 1000)
}

function isUpdateReady() {
  return status.state === 'ready'
}

async function installPendingUpdate() {
  if (!app.isPackaged || !autoUpdater || !isUpdateReady()) return false

  const pending = readPendingDownloadFromDisk()
  const targetVersion = status.version ?? pending?.version ?? null
  const cacheKey = pending?.cacheKey ?? null

  if (!updatePackageHydrated) {
    const hydratedVersion = await waitForHydratedUpdate(status.currentVersion ?? app.getVersion())
    if (!hydratedVersion) return false
  }

  return triggerInstall({ targetVersion, cacheKey, source: 'manual' })
}

/** 用户确认后下载（autoDownload 关闭时的显式路径） */
async function downloadAvailableUpdate() {
  if (!app.isPackaged || !autoUpdater) {
    setStatus({
      state: 'error',
      message: '暂时无法下载更新，请稍后重试或到官网获取安装包。',
    })
    return false
  }
  if (status.state === 'downloading' || status.state === 'installing' || status.state === 'ready') {
    return status.state === 'ready'
  }
  if (status.state !== 'available' && status.state !== 'error') {
    return false
  }

  setStatus({
    state: 'downloading',
    currentVersion: status.currentVersion,
    version: status.version,
    percent: 0,
    message: '正在准备下载…',
  })

  try {
    await autoUpdater.downloadUpdate()
    return true
  } catch (err) {
    setStatus({
      state: 'error',
      currentVersion: status.currentVersion,
      version: status.version,
      message: err instanceof Error ? err.message : '下载更新失败，请稍后重试。',
    })
    return false
  }
}

function registerUpdaterIpc(ipcMain, deps = {}) {
  prepareForUpdateInstall = deps.prepareForUpdateInstall ?? null
  onInstallStallRecover = deps.onInstallStallRecover ?? null

  ipcMain.handle('app-update-get-status', async () => status)

  ipcMain.handle('app-update-get-auto-download', async () => getAutoDownloadPreference())

  ipcMain.handle('app-update-set-auto-download', async (_event, enabled) => {
    const next = setAutoDownloadPreference(Boolean(enabled))
    if (autoUpdater) {
      autoUpdater.autoDownload = next
    }
    return next
  })

  ipcMain.handle('app-update-check', async () => {
    if (!autoUpdater) {
      setStatus({
        state: 'error',
        message: '更新组件不可用，请重新安装应用或从 GitHub Releases 下载最新版。',
      })
      return status
    }
    if (!app.isPackaged) {
      setStatus({
        state: 'not-available',
        currentVersion: status.currentVersion,
        version: null,
        percent: 0,
        message: '开发模式不支持自动更新，请从 GitHub Releases 下载正式安装包。',
      })
      return status
    }
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

  ipcMain.handle('app-update-download', async () => downloadAvailableUpdate())

  ipcMain.handle('app-update-install', async () => {
    if (!isUpdateReady()) return false
    return installPendingUpdate()
  })
}

module.exports = {
  initUpdater,
  registerUpdaterIpc,
  resumePendingUpdateOnStartup,
  tryQuickPendingUpdateOnStartup,
  tryDeferredPendingUpdateOnStartup,
  isUpdateReady,
  installPendingUpdate,
}
