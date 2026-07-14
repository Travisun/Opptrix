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

/** electron-updater 已加载待安装包（含 Squirrel 代理就绪） */
let updatePackageHydrated = false

/** 启动时 resume 钩子是否已执行过 checkForUpdates */
let startupResumeHandled = false

/** 避免重复注册 autoUpdater 事件 */
let autoUpdaterEventsBound = false

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

function shouldSkipStartupResume() {
  return process.argv.includes('--opptrix-skip-update-resume')
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

  const blockReason = isInstallBlocked(pending.cacheKey)
    ? getInstallBlockReason(pending.cacheKey)
    : null

  setStatus({
    state: 'ready',
    currentVersion,
    version: pending.version,
    percent: 100,
    message: blockReason
      ?? `新版本 ${pending.version} 已就绪，重启后即可完成更新`,
  })
  return pending
}

function configureAutoUpdaterDefaults() {
  if (!autoUpdater) return
  autoUpdater.autoDownload = true
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
  showLocalNotification({
    title: '发现 Opptrix 新版本',
    body: `版本 ${version} 正在后台下载，完成后会通知你重启。`,
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
    setStatus({
      state: 'available',
      currentVersion,
      version: info.version,
      percent: 0,
      message: `发现新版本 ${info.version}`,
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
      message: reason ?? '自动安装已暂停，请手动点击「重启更新」。',
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
          app.quit()
          return
        }
        try {
          // 兜底：若 quitAndInstall 仅触发退出，仍尝试在 quit 时安装
          autoUpdater.autoInstallOnAppQuit = true
          autoUpdater.quitAndInstall(false, true)
        } catch (err) {
          console.error('[updater] quitAndInstall failed:', err)
          app.quit()
        }
      })
      return true
    })
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

    void autoUpdater.checkForUpdates().catch(() => finish(null))
  })
}

/**
 * 启动第一时间：若本地已有比当前版本新的待安装包，则跳过 UI/bootstrap，直接退出并安装。
 * 防循环：同一 pending 包在窗口期内失败次数有上限，超出后仅提示手动安装。
 */
async function resumePendingUpdateOnStartup({ version }) {
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

  const hydratedVersion = await waitForHydratedUpdate(version)
  if (!hydratedVersion || !isVersionNewer(hydratedVersion, version)) {
    return false
  }

  return triggerInstall({
    targetVersion: hydratedVersion,
    cacheKey: pending.cacheKey,
    source: 'startup',
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

function registerUpdaterIpc(ipcMain, deps = {}) {
  prepareForUpdateInstall = deps.prepareForUpdateInstall ?? null

  ipcMain.handle('app-update-get-status', async () => status)

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

  ipcMain.handle('app-update-install', async () => {
    if (!isUpdateReady()) return false
    return installPendingUpdate()
  })
}

module.exports = {
  initUpdater,
  registerUpdaterIpc,
  resumePendingUpdateOnStartup,
  isUpdateReady,
  installPendingUpdate,
}
