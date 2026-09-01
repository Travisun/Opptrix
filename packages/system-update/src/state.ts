/**
 * Durable `state.json` for the system-update state machine.
 *
 * Fields:
 * - `currentVersion` — version pointed to by `boot`
 * - `pendingVersion` — downloaded/extracted slot waiting for activate
 * - `backupVersion` — previous slot pointed to by `backup`
 * - `uiPhase` — `normal` | `wizard_apply` | `first_boot_hooks` | `failed`
 * - `firstBootUpgrade` — post-activate hook progress (`version`, `phase`, `progress`, `error`)
 * - `downloadJob` — optional stub for silent download UI
 */
import fs from 'node:fs'
import path from 'node:path'
import type { FirstBootUpgradePhase, SystemUiPhase } from './constants.js'
import { resolveSystemPaths } from './paths.js'

export interface FirstBootUpgradeState {
  version: string
  phase: FirstBootUpgradePhase
  /** 0–100 */
  progress: number
  error: string | null
}

/** Optional download job fields (stub — download lives elsewhere). */
export interface DownloadJobStub {
  id?: string
  version?: string
  status?: 'idle' | 'queued' | 'running' | 'done' | 'failed'
  bytesReceived?: number
  bytesTotal?: number | null
  error?: string | null
}

export interface SystemUpdateState {
  currentVersion: string | null
  pendingVersion: string | null
  backupVersion: string | null
  uiPhase: SystemUiPhase
  firstBootUpgrade: FirstBootUpgradeState | null
  downloadJob?: DownloadJobStub | null
  /** Versions that failed apply/first-boot; skip re-offer until a newer latest appears */
  blockedVersions?: string[]
  /** Optional: last failed apply error for UI */
  lastBlockedReason?: string | null
  updatedAt: string
}

export function emptyState(): SystemUpdateState {
  return {
    currentVersion: null,
    pendingVersion: null,
    backupVersion: null,
    uiPhase: 'normal',
    firstBootUpgrade: null,
    downloadJob: null,
    updatedAt: new Date().toISOString(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asStringOrNull(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  return null
}

function parseUiPhase(value: unknown): SystemUiPhase {
  if (
    value === 'normal'
    || value === 'wizard_apply'
    || value === 'first_boot_hooks'
    || value === 'failed'
  ) {
    return value
  }
  return 'normal'
}

function parseFirstBoot(value: unknown): FirstBootUpgradeState | null {
  if (!isRecord(value)) return null
  const version = asStringOrNull(value.version)
  if (!version) return null
  const phaseRaw = value.phase
  const phase: FirstBootUpgradePhase =
    phaseRaw === 'pending'
    || phaseRaw === 'running'
    || phaseRaw === 'done'
    || phaseRaw === 'failed'
      ? phaseRaw
      : 'pending'
  const progress = typeof value.progress === 'number' && Number.isFinite(value.progress)
    ? Math.max(0, Math.min(100, value.progress))
    : 0
  const error = asStringOrNull(value.error)
  return { version, phase, progress, error }
}

function parseBlockedVersions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim())
  }
  return out.length > 0 ? out : undefined
}

function parseDownloadJob(value: unknown): DownloadJobStub | null {
  if (value == null) return null
  if (!isRecord(value)) return null
  const status = value.status
  const statusOk =
    status === 'idle'
    || status === 'queued'
    || status === 'running'
    || status === 'done'
    || status === 'failed'
      ? status
      : undefined
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    version: typeof value.version === 'string' ? value.version : undefined,
    status: statusOk,
    bytesReceived: typeof value.bytesReceived === 'number' ? value.bytesReceived : undefined,
    bytesTotal:
      value.bytesTotal === null
        ? null
        : typeof value.bytesTotal === 'number'
          ? value.bytesTotal
          : undefined,
    error: asStringOrNull(value.error),
  }
}

export function normalizeState(raw: unknown): SystemUpdateState {
  if (!isRecord(raw)) return emptyState()
  return {
    currentVersion: asStringOrNull(raw.currentVersion),
    pendingVersion: asStringOrNull(raw.pendingVersion),
    backupVersion: asStringOrNull(raw.backupVersion),
    uiPhase: parseUiPhase(raw.uiPhase),
    firstBootUpgrade: parseFirstBoot(raw.firstBootUpgrade),
    downloadJob: parseDownloadJob(raw.downloadJob),
    blockedVersions: parseBlockedVersions(raw.blockedVersions),
    lastBlockedReason: asStringOrNull(raw.lastBlockedReason),
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
  }
}

export function readState(systemDir?: string): SystemUpdateState {
  const { stateFile } = resolveSystemPaths(systemDir)
  if (!fs.existsSync(stateFile)) return emptyState()
  try {
    const text = fs.readFileSync(stateFile, 'utf8')
    return normalizeState(JSON.parse(text) as unknown)
  } catch {
    return emptyState()
  }
}

/** Atomic write: temp file in same dir + rename. */
export function writeState(
  next: SystemUpdateState,
  systemDir?: string,
): SystemUpdateState {
  const { systemDir: root, stateFile } = resolveSystemPaths(systemDir)
  fs.mkdirSync(root, { recursive: true })
  const payload: SystemUpdateState = {
    ...next,
    updatedAt: new Date().toISOString(),
  }
  const tmp = path.join(
    root,
    `.state.json.${process.pid}.${Date.now()}.tmp`,
  )
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, stateFile)
  return payload
}

export function patchState(
  patch: Partial<SystemUpdateState>,
  systemDir?: string,
): SystemUpdateState {
  const prev = readState(systemDir)
  return writeState({ ...prev, ...patch }, systemDir)
}
