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

/** Installed provider plugins (~/.opptrix/providers) */
export function resolveProvidersDir(): string {
  return path.join(resolveUserDataRoot(), 'providers')
}

export function isDesktopRuntime(): boolean {
  return process.env.OPPTRIX_DESKTOP === '1' || process.env.OPPTRIX_DESKTOP === '1'
}

/** 向上查找 monorepo 根目录（含 workspaces 的 package.json） */
export function resolveProjectRoot(start = process.cwd()): string {
  let dir = path.resolve(start)
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string; workspaces?: unknown }
        if (pkg.name === 'opptrix' || pkg.workspaces) return dir
      } catch { /* continue */ }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}
