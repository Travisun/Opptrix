/**
 * Activate a pending version: backup←old current, boot←new, firstBootUpgrade pending.
 */
import { ensureLayout, pointBackupToVersion, pointBootToVersion } from './layout.js'
import { assertSafeVersion, resolveSystemDir, slotPath } from './paths.js'
import { patchState, readState } from './state.js'
import { fuseVendorAbiIntoSlot } from './vendor-fuse.js'
import { verifySlotVersion } from './verify.js'

export interface ActivateOptions {
  systemDir?: string
  /** Defaults to `state.pendingVersion`. */
  version?: string
}

export interface ActivateResult {
  previousVersion: string | null
  currentVersion: string
  slotPath: string
}

export function setPendingVersion(
  version: string,
  systemDir?: string,
): void {
  assertSafeVersion(version)
  const root = resolveSystemDir(systemDir)
  ensureLayout(root)
  const check = verifySlotVersion(version, root)
  if (!check.ok) {
    throw new Error(check.reason ?? `pending slot invalid: ${version}`)
  }
  patchState(
    {
      pendingVersion: version,
      uiPhase: 'wizard_apply',
    },
    root,
  )
}

export function activatePending(opts: ActivateOptions = {}): ActivateResult {
  const root = resolveSystemDir(opts.systemDir)
  ensureLayout(root)
  const state = readState(root)
  const version = (opts.version ?? state.pendingVersion)?.trim()
  if (!version) {
    throw new Error('no pendingVersion to activate')
  }
  assertSafeVersion(version)

  const check = verifySlotVersion(version, root)
  if (!check.ok) {
    throw new Error(check.reason ?? `cannot activate invalid slot: ${version}`)
  }

  const previous = state.currentVersion
  if (previous && previous !== version) {
    assertSafeVersion(previous)
    const prevCheck = verifySlotVersion(previous, root)
    if (prevCheck.ok) {
      pointBackupToVersion(root, previous)
    }
  }

  pointBootToVersion(root, version)

  const destSlot = slotPath(root, version)
  fuseVendorAbiIntoSlot(destSlot)

  patchState(
    {
      currentVersion: version,
      pendingVersion: null,
      backupVersion: previous && previous !== version ? previous : state.backupVersion,
      uiPhase: 'first_boot_hooks',
      firstBootUpgrade: {
        version,
        phase: 'pending',
        progress: 0,
        error: null,
      },
    },
    root,
  )

  return {
    previousVersion: previous && previous !== version ? previous : null,
    currentVersion: version,
    slotPath: destSlot,
  }
}

export function markFirstBootUpgradeProgress(
  update: {
    phase?: 'pending' | 'running' | 'done' | 'failed'
    progress?: number
    error?: string | null
  },
  systemDir?: string,
): void {
  const root = resolveSystemDir(systemDir)
  const state = readState(root)
  if (!state.firstBootUpgrade) {
    throw new Error('no firstBootUpgrade in progress')
  }
  const next = {
    ...state.firstBootUpgrade,
    phase: update.phase ?? state.firstBootUpgrade.phase,
    progress:
      typeof update.progress === 'number'
        ? Math.max(0, Math.min(100, update.progress))
        : state.firstBootUpgrade.progress,
    error: update.error === undefined ? state.firstBootUpgrade.error : update.error,
  }
  const uiPhase =
    next.phase === 'done'
      ? 'normal'
      : next.phase === 'failed'
        ? 'failed'
        : 'first_boot_hooks'
  patchState(
    {
      firstBootUpgrade: next.phase === 'done' ? null : next,
      uiPhase,
    },
    root,
  )
}
