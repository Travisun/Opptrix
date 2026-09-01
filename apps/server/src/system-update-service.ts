/**
 * System-update status, apply, rollback, injectable process.exit.
 */
import {
  OPPTRIX_EXIT_RESTART_APPLY,
  OPPTRIX_EXIT_RESTART_ROLLBACK,
  evaluateRuntimeRequires,
  isDockerEnv,
  isVersionBlocked,
  resolveHostBaseVersion,
  patchState,
  readRuntimeMarker,
  readState,
  resolveSystemDir,
  rollbackToBackup,
  setPendingVersion,
  slotPath,
  type RuntimeRequiresResult,
  type SystemUpdateState,
} from '@opptrix/system-update'
import { resolveOpptrixAppVersion } from '@opptrix/shared'
import { readChannelEnv } from './system-update-channel.js'

const APPLY_EXIT_DELAY_MS = 400

/** Shown when pending slot cannot run on the current host base. */
export const BASE_REFRESH_CLI_COMMAND = 'opptrix update'

export const BASE_REFRESH_HINT =
  '当前运行环境无法安装此版本。请在服务器上执行：opptrix update。数据与已保存内容会保留。'

export const NEEDS_BASE_REFRESH_CODE = 'needs_base_refresh'

export type ExitFn = (code: number) => void

let exitImpl: ExitFn = (code) => {
  process.exit(code)
}

/** Injectable for tests — do not hang CI. */
export function setSystemUpdateProcessExit(fn: ExitFn): void {
  exitImpl = fn
}

export function resetSystemUpdateProcessExit(): void {
  exitImpl = (code) => {
    process.exit(code)
  }
}

export function scheduleSystemUpdateExit(code: number, delayMs = APPLY_EXIT_DELAY_MS): void {
  setTimeout(() => {
    try {
      exitImpl(code)
    } catch {
      /* ignore */
    }
  }, delayMs).unref?.()
}

export function isSystemUpdateEnabled(): boolean {
  if (process.env.OPPTRIX_UPDATE_ENABLED?.trim() === '0') return false
  if (process.env.OPPTRIX_UPDATE_ENABLED?.trim() === '1') return true
  if (process.env.OPPTRIX_DESKTOP === '1') return false
  return true
}

export function userFacingUpdateError(err: unknown): string {
  if (err instanceof Error && err.message) {
    const m = err.message
    if (/schema incompatible/i.test(m)) return '当前数据与上一版本不兼容，暂时无法回退'
    if (/no backup/i.test(m)) return '没有可回退的版本'
    if (/no pending/i.test(m)) return '没有待应用的更新'
    if (/sha256|archive|download|release fetch/i.test(m)) {
      return '更新包获取失败，请稍后重试'
    }
  }
  return '更新操作未能完成，请稍后重试'
}

export interface SystemUpdateStatusDto {
  enabled: boolean
  currentVersion: string
  availableVersion: string | null
  pendingVersion: string | null
  backupVersion: string | null
  uiPhase: SystemUpdateState['uiPhase']
  readyToApply: boolean
  /** Pending slot requires a newer host base (`opptrix update`). */
  needsBaseRefresh: boolean
  baseRefreshHint: string | null
  cliCommand: string | null
  download: {
    status: string
    bytesReceived: number
    bytesTotal: number | null
    version: string | null
    error: string | null
  } | null
  firstBoot: SystemUpdateState['firstBootUpgrade']
  error: string | null
  channel: string
  blockedVersions: string[]
  /** Pending version is blocked after a failed first-boot — wait for a newer release. */
  updateBlocked: boolean
  lastBlockedReason: string | null
}

function runtimeCheckEnv(): Parameters<typeof evaluateRuntimeRequires>[1] {
  return {
    isDocker: isDockerEnv(),
    baseVersion: resolveHostBaseVersion(),
  }
}

export function evaluateSlotRuntimeRequires(
  version: string | null | undefined,
): RuntimeRequiresResult {
  if (!version || !String(version).trim()) {
    return { ok: true, needsBaseRefresh: false, reasons: [] }
  }
  const dir = slotPath(resolveSystemDir(), version.trim())
  return evaluateRuntimeRequires(readRuntimeMarker(dir), runtimeCheckEnv())
}

export function needsBaseRefreshFromState(state: SystemUpdateState): boolean {
  return evaluateSlotRuntimeRequires(state.pendingVersion).needsBaseRefresh
}

/** Pending package extracted and idle — used to skip re-download (ignores base refresh). */
export function packageReadyFrom(state: SystemUpdateState): boolean {
  if (!state.pendingVersion) return false
  if (isVersionBlocked(state, state.pendingVersion)) return false
  if (state.uiPhase === 'wizard_apply' || state.uiPhase === 'first_boot_hooks') return false
  const job = state.downloadJob
  if (job?.status === 'failed') return false
  if (job?.status === 'running' || job?.status === 'queued') return false
  return true
}

/** Clear blocked pendingVersion so update checks can fetch a newer latest. */
export function clearBlockedPending(state: SystemUpdateState): SystemUpdateState {
  if (!state.pendingVersion || !isVersionBlocked(state, state.pendingVersion)) {
    return state
  }
  return patchState({
    pendingVersion: null,
    uiPhase: 'normal',
  })
}

/** User may confirm apply — false when host base cannot run the pending slot. */
export function readyToApplyFrom(state: SystemUpdateState): boolean {
  return packageReadyFrom(state) && !needsBaseRefreshFromState(state)
}

export function buildSystemUpdateStatus(
  state?: SystemUpdateState,
  enabled = isSystemUpdateEnabled(),
): SystemUpdateStatusDto {
  const s = state ?? readState()
  const current = s.currentVersion ?? resolveOpptrixAppVersion()
  const job = s.downloadJob ?? null
  const blockedVersions = s.blockedVersions ?? []
  const pendingBlocked = Boolean(
    s.pendingVersion && isVersionBlocked(s, s.pendingVersion),
  )
  const available =
    pendingBlocked
      ? null
      : s.pendingVersion
        ?? (job?.version && job.status !== 'failed' ? job.version : null)
  const needsBaseRefresh = Boolean(
    enabled && s.pendingVersion && !pendingBlocked && needsBaseRefreshFromState(s),
  )
  return {
    enabled,
    currentVersion: current,
    availableVersion: available,
    pendingVersion: pendingBlocked ? null : s.pendingVersion,
    backupVersion: s.backupVersion,
    uiPhase: s.uiPhase,
    readyToApply: enabled && readyToApplyFrom(s),
    needsBaseRefresh,
    baseRefreshHint: needsBaseRefresh ? BASE_REFRESH_HINT : null,
    cliCommand: needsBaseRefresh ? BASE_REFRESH_CLI_COMMAND : null,
    download: job
      ? {
          status: job.status ?? 'idle',
          bytesReceived: job.bytesReceived ?? 0,
          bytesTotal: job.bytesTotal ?? null,
          version: job.version ?? null,
          error: job.error ?? null,
        }
      : null,
    firstBoot: s.firstBootUpgrade,
    error: job?.error ?? s.firstBootUpgrade?.error ?? s.lastBlockedReason ?? null,
    channel: readChannelEnv().channel,
    blockedVersions,
    updateBlocked: pendingBlocked,
    lastBlockedReason: s.lastBlockedReason ?? null,
  }
}

export class NeedsBaseRefreshError extends Error {
  readonly code = NEEDS_BASE_REFRESH_CODE
  readonly cliCommand = BASE_REFRESH_CLI_COMMAND

  constructor(message = BASE_REFRESH_HINT) {
    super(message)
    this.name = 'NeedsBaseRefreshError'
  }
}

export async function applyPendingUpdate(): Promise<{ ok: true; exitCode: number }> {
  const state = readState()
  const version = state.pendingVersion
  if (!version) throw new Error('no pendingVersion')
  if (isVersionBlocked(state, version)) {
    throw new Error('version blocked after failed upgrade')
  }
  if (needsBaseRefreshFromState(state)) {
    throw new NeedsBaseRefreshError()
  }
  setPendingVersion(version)
  scheduleSystemUpdateExit(OPPTRIX_EXIT_RESTART_APPLY)
  return { ok: true, exitCode: OPPTRIX_EXIT_RESTART_APPLY }
}

export async function rollbackUpdate(): Promise<{
  ok: true
  exitCode: number
  toVersion: string
}> {
  const result = await rollbackToBackup()
  scheduleSystemUpdateExit(OPPTRIX_EXIT_RESTART_ROLLBACK)
  return {
    ok: true,
    exitCode: OPPTRIX_EXIT_RESTART_ROLLBACK,
    toVersion: result.toVersion,
  }
}
