/**
 * Resolve `$OPPTRIX_SYSTEM_DIR` layout paths for Docker and bare Node.
 *
 * Resolution order for the system root:
 * 1. `OPPTRIX_SYSTEM_DIR` (always wins)
 * 2. `OPPTRIX_DATA_DIR` set → sibling `../system` of the data dir
 *    （含 Docker `/opptrix/private` → `/opptrix/system`）
 * 3. Docker（无 data dir）→ `/system`（旧三卷默认）
 * 4. Else → `~/.opptrix/system`
 */
import os from 'node:os'
import path from 'node:path'

export interface SystemPaths {
  systemDir: string
  bootLink: string
  backupLink: string
  updateDir: string
  slotsDir: string
  stateFile: string
}

export function isDockerEnv(): boolean {
  // 仅认 OPPTRIX_DOCKER=1（entrypoint/compose 注入）。裸 /.dockerenv 会误判 CI 容器。
  return process.env.OPPTRIX_DOCKER === '1'
}

export function resolveSystemDir(override?: string): string {
  const fromArg = override?.trim()
  if (fromArg) return path.resolve(fromArg)

  const fromEnv = process.env.OPPTRIX_SYSTEM_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)

  const dataDir = process.env.OPPTRIX_DATA_DIR?.trim()
  if (dataDir) {
    return path.resolve(path.join(dataDir, '..', 'system'))
  }

  if (isDockerEnv()) return path.resolve('/system')

  return path.resolve(path.join(os.homedir(), '.opptrix', 'system'))
}

export function resolveSystemPaths(systemDir?: string): SystemPaths {
  const root = resolveSystemDir(systemDir)
  return {
    systemDir: root,
    bootLink: path.join(root, 'boot'),
    backupLink: path.join(root, 'backup'),
    updateDir: path.join(root, 'update'),
    slotsDir: path.join(root, 'slots'),
    stateFile: path.join(root, 'state.json'),
  }
}

export function slotPath(systemDir: string, version: string): string {
  assertSafeVersion(version)
  return path.join(resolveSystemDir(systemDir), 'slots', version)
}

/** `update/db-snapshots/{fromVersion}-to-{toVersion}/` */
export function dbSnapshotDir(
  systemDir: string,
  fromVersion: string,
  toVersion: string,
): string {
  assertSafeVersion(fromVersion)
  assertSafeVersion(toVersion)
  const { updateDir } = resolveSystemPaths(systemDir)
  return path.join(updateDir, 'db-snapshots', `${fromVersion}-to-${toVersion}`)
}

export function assertSafeVersion(version: string): void {
  const v = version.trim()
  if (!v) throw new Error('version must be non-empty')
  if (v.includes('..') || v.includes('/') || v.includes('\\') || v.includes('\0')) {
    throw new Error(`unsafe version segment: ${version}`)
  }
}

/** Default seed root: `OPPTRIX_SEED_ROOT`, else `/app` in Docker, else cwd. */
export function resolveSeedRoot(override?: string): string {
  const fromArg = override?.trim()
  if (fromArg) return path.resolve(fromArg)

  const fromEnv = process.env.OPPTRIX_SEED_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)

  if (isDockerEnv()) return path.resolve('/app')

  return path.resolve(process.cwd())
}
