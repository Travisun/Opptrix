/**
 * Rollback boot pointer to the backup slot when schema-compatible.
 */
import {
  ensureLayout,
  pointBootToVersion,
  readBackupVersion,
  readBootVersion,
} from './layout.js'
import { resolveSystemDir, slotPath } from './paths.js'
import { patchState, readState } from './state.js'
import { fuseVendorAbiIntoSlot } from './vendor-fuse.js'
import { verifySlotVersion } from './verify.js'

export interface SchemaCompatCheckArgs {
  fromVersion: string
  toVersion: string
  currentSlot: string
  backupSlot: string
}

export type SchemaCompatCheck = (
  args: SchemaCompatCheckArgs,
) => boolean | Promise<boolean>

export interface RollbackOptions {
  systemDir?: string
  /** Return false to refuse rollback (e.g. schema incompatible). Default: allow. */
  schemaCompatible?: SchemaCompatCheck
}

export interface RollbackResult {
  rolledBack: boolean
  fromVersion: string
  toVersion: string
  slotPath: string
}

export async function rollbackToBackup(
  opts: RollbackOptions = {},
): Promise<RollbackResult> {
  const root = resolveSystemDir(opts.systemDir)
  ensureLayout(root)
  const state = readState(root)

  const backupVersion = state.backupVersion ?? readBackupVersion(root)
  if (!backupVersion) {
    throw new Error('no backup version available for rollback')
  }

  const currentVersion =
    state.currentVersion ?? readBootVersion(root) ?? 'unknown'

  const backupCheck = verifySlotVersion(backupVersion, root)
  if (!backupCheck.ok) {
    throw new Error(backupCheck.reason ?? `backup slot invalid: ${backupVersion}`)
  }

  const currentSlot = slotPath(root, currentVersion === 'unknown' ? backupVersion : currentVersion)
  const backupSlot = slotPath(root, backupVersion)

  const check = opts.schemaCompatible ?? (() => true)
  const ok = await check({
    fromVersion: currentVersion,
    toVersion: backupVersion,
    currentSlot,
    backupSlot,
  })
  if (!ok) {
    throw new Error(
      `rollback refused: schema incompatible (${currentVersion} → ${backupVersion})`,
    )
  }

  pointBootToVersion(root, backupVersion)
  fuseVendorAbiIntoSlot(backupSlot)

  patchState(
    {
      currentVersion: backupVersion,
      pendingVersion: null,
      backupVersion,
      uiPhase: 'normal',
      firstBootUpgrade: null,
    },
    root,
  )

  return {
    rolledBack: true,
    fromVersion: currentVersion,
    toVersion: backupVersion,
    slotPath: backupSlot,
  }
}
