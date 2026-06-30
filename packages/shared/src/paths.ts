import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const NEW_ROOT = path.join(os.homedir(), '.opptrix')
const LEGACY_ROOT = path.join(os.homedir(), '.opptrix')

/** User data root (~/.opptrix). Falls back to legacy ~/.opptrix if present. */
export function resolveUserDataRoot(): string {
  const fromEnv = process.env.OPPTRIX_DATA_DIR ?? process.env.OPPTRIX_DATA_DIR
  if (fromEnv) return fromEnv
  if (fs.existsSync(NEW_ROOT)) return NEW_ROOT
  if (fs.existsSync(LEGACY_ROOT)) return LEGACY_ROOT
  return NEW_ROOT
}

export function isDesktopRuntime(): boolean {
  return process.env.OPPTRIX_DESKTOP === '1' || process.env.OPPTRIX_DESKTOP === '1'
}
