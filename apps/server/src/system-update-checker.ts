/**
 * Background update check, silent download, first-boot migration hooks.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  OPPTRIX_EXIT_RESTART_POST_HOOK,
  OPPTRIX_EXIT_RESTART_ROLLBACK,
  blockVersion,
  clearBlockedUpTo,
  collectSqliteDataFiles,
  dbSnapshotDir,
  deleteDbSnapshotDir,
  ensureLayout,
  evaluateRuntimeRequires,
  extractUpdateArchive,
  markFirstBootUpgradeProgress,
  patchState,
  readBootVersion,
  readDbSnapshotManifest,
  readRuntimeMarker,
  readState,
  restoreMainDatabase,
  resolveSystemDir,
  resolveSystemPaths,
  rollbackToBackup,
  runPostActivateHooks,
  shouldOfferLatestVersion,
  slotPath,
  snapshotMainDatabase,
} from '@opptrix/system-update'
import { resolveOpptrixAppVersion } from '@opptrix/shared'
import { getUserDataStore, UserDataStore } from '@opptrix/user-store'
import { getMarketDataService } from '@opptrix/market-data-store'
import {
  fetchHotLatest,
  readChannelEnv,
  type ChannelEnv,
  type HotLatestRelease,
} from './system-update-channel.js'
import { buildSystemUpdateUserAgent } from './system-update-user-agent.js'
import { downloadToFile } from './system-update-download.js'
import {
  buildSystemUpdateStatus,
  clearBlockedPending,
  isSystemUpdateEnabled,
  packageReadyFrom,
  scheduleSystemUpdateExit,
  userFacingUpdateError,
  type SystemUpdateStatusDto,
} from './system-update-service.js'
import { resolveUpdateCheckIntervalMs } from './system-update-check-schedule.js'

const CHECK_TIMEOUT_MS = 30_000
const DOWNLOAD_TIMEOUT_MS = 180_000

let checkInFlight: Promise<SystemUpdateStatusDto> | null = null
let downloadInFlight = false
let intervalHandle: ReturnType<typeof setInterval> | null = null

export async function runUpdateCheck(opts?: {
  force?: boolean
  signal?: AbortSignal
}): Promise<SystemUpdateStatusDto> {
  if (!isSystemUpdateEnabled()) return buildSystemUpdateStatus()
  if (checkInFlight && !opts?.force) return checkInFlight

  const run = (async () => {
    let state = readState()
    if (state.uiPhase === 'wizard_apply' || state.uiPhase === 'first_boot_hooks') {
      return buildSystemUpdateStatus(state)
    }
    state = clearBlockedPending(state)
    if (packageReadyFrom(state)) return buildSystemUpdateStatus(state)
    if (downloadInFlight || state.downloadJob?.status === 'running') {
      return buildSystemUpdateStatus(state)
    }

    const env = readChannelEnv()
    const current = state.currentVersion ?? resolveOpptrixAppVersion()
    const userAgent = buildSystemUpdateUserAgent(current)
    let latest: HotLatestRelease | null
    try {
      latest = await fetchHotLatest(env, {
        timeoutMs: CHECK_TIMEOUT_MS,
        signal: opts?.signal,
        userAgent,
      })
    } catch (err) {
      patchState({
        downloadJob: {
          ...(state.downloadJob ?? {}),
          status: 'failed',
          error: userFacingUpdateError(err),
        },
      })
      return buildSystemUpdateStatus()
    }

    if (!latest || !shouldOfferLatestVersion(state, latest.version, current)) {
      return buildSystemUpdateStatus(readState())
    }

    void startSilentDownload(latest, env).catch(() => {})
    return buildSystemUpdateStatus(readState())
  })()

  checkInFlight = run.finally(() => {
    checkInFlight = null
  })
  return checkInFlight
}

async function startSilentDownload(
  latest: HotLatestRelease,
  _env: ChannelEnv,
): Promise<void> {
  if (downloadInFlight) return
  downloadInFlight = true
  const version = latest.version
  const { updateDir } = resolveSystemPaths()
  ensureLayout()
  const archivePath = path.join(updateDir, latest.binName)
  const shaPath = path.join(updateDir, latest.sha256Name)

  patchState({
    downloadJob: {
      id: `dl-${version}`,
      version,
      status: 'running',
      bytesReceived: 0,
      bytesTotal: latest.size,
      error: null,
    },
  })

  try {
    const userAgent = buildSystemUpdateUserAgent(version)
    const headers: Record<string, string> = { 'User-Agent': userAgent }

    await downloadToFile(latest.binUrl, archivePath, {
      headers,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      onProgress: (received, total) => {
        patchState({
          downloadJob: {
            id: `dl-${version}`,
            version,
            status: 'running',
            bytesReceived: received,
            bytesTotal: total ?? latest.size,
            error: null,
          },
        })
      },
    })
    await downloadToFile(latest.sha256Url, shaPath, {
      headers,
      timeoutMs: CHECK_TIMEOUT_MS,
    })

    const extracted = extractUpdateArchive({
      archivePath,
      version,
      sha256Path: shaPath,
      markPending: false,
    })

    // Gate is status-only: keep slot + pendingVersion even when base refresh is needed.
    evaluateRuntimeRequires(readRuntimeMarker(extracted.slotPath))

    patchState({
      pendingVersion: version,
      uiPhase: 'normal',
      downloadJob: {
        id: `dl-${version}`,
        version,
        status: 'done',
        bytesReceived: fs.existsSync(archivePath) ? fs.statSync(archivePath).size : 0,
        bytesTotal: latest.size,
        error: null,
      },
    })
  } catch (err) {
    patchState({
      downloadJob: {
        id: `dl-${version}`,
        version,
        status: 'failed',
        error: userFacingUpdateError(err),
      },
    })
  } finally {
    downloadInFlight = false
  }
}

export async function runFirstBootHooksIfNeeded(): Promise<boolean> {
  const state = readState()
  if (!state.firstBootUpgrade && state.uiPhase !== 'first_boot_hooks') return false
  if (state.firstBootUpgrade?.phase === 'done') return false

  const targetVersion =
    state.firstBootUpgrade?.version
    ?? state.currentVersion
    ?? readBootVersion()
  const fromVersion = state.backupVersion
  let snapshotDir: string | null = null
  let storeOpened = false

  if (targetVersion && fromVersion) {
    snapshotDir = dbSnapshotDir(resolveSystemDir(), fromVersion, targetVersion)
    if (!readDbSnapshotManifest(snapshotDir)) {
      const dataFiles = collectSqliteDataFiles(UserDataStore.dbPath())
      snapshotMainDatabase({ dataFiles, snapshotDir })
    }
  }

  try {
    markFirstBootUpgradeProgress({ phase: 'running', progress: 10, error: null })
    getUserDataStore()
    storeOpened = true
    markFirstBootUpgradeProgress({ phase: 'running', progress: 40 })
    getMarketDataService()
    markFirstBootUpgradeProgress({ phase: 'running', progress: 55 })

    const bootVer =
      readBootVersion()
      ?? state.currentVersion
      ?? state.firstBootUpgrade?.version
      ?? null
    if (bootVer) {
      const bootSlot = slotPath(resolveSystemDir(), bootVer)
      await runPostActivateHooks(bootSlot, {
        onProgress: (ev) => {
          const total = Math.max(1, ev.total)
          const doneUnits = ev.index + (ev.phase === 'done' ? 1 : 0)
          const frac = Math.min(1, doneUnits / total)
          markFirstBootUpgradeProgress({
            phase: 'running',
            progress: Math.min(95, Math.round(55 + frac * 40)),
            error: null,
          })
        },
      })
    }

    markFirstBootUpgradeProgress({ phase: 'done', progress: 100, error: null })
    if (targetVersion) clearBlockedUpTo(targetVersion)
    if (snapshotDir) deleteDbSnapshotDir(snapshotDir)
    scheduleSystemUpdateExit(OPPTRIX_EXIT_RESTART_POST_HOOK)
    return true
  } catch (err) {
    const reason = userFacingUpdateError(err)
    if (storeOpened) {
      try {
        UserDataStore.getInstance().close()
      } catch {
        /* ignore */
      }
    }
    if (snapshotDir) {
      try {
        restoreMainDatabase({
          snapshotDir,
          dataFiles: collectSqliteDataFiles(UserDataStore.dbPath()),
        })
      } catch {
        /* best effort */
      }
    }
    try {
      await rollbackToBackup()
    } catch {
      /* rollback may fail if backup missing — still block failed version */
    }
    if (targetVersion) blockVersion(targetVersion, reason)
    patchState({
      pendingVersion: null,
      uiPhase: 'normal',
      firstBootUpgrade: null,
    })
    scheduleSystemUpdateExit(OPPTRIX_EXIT_RESTART_ROLLBACK)
    return true
  }
}

export function startSystemUpdateBackground(opts?: {
  checkOnStart?: boolean
  intervalMs?: number
}): () => void {
  if (!isSystemUpdateEnabled()) return () => {}

  void runFirstBootHooksIfNeeded().catch(() => {})

  if (opts?.checkOnStart !== false) {
    setTimeout(() => {
      void runUpdateCheck().catch(() => {})
    }, 2_000).unref?.()
  }

  const ms = opts?.intervalMs ?? resolveUpdateCheckIntervalMs()
  intervalHandle = setInterval(() => {
    void runUpdateCheck().catch(() => {})
  }, ms)
  intervalHandle.unref?.()

  return () => {
    if (intervalHandle) {
      clearInterval(intervalHandle)
      intervalHandle = null
    }
  }
}
