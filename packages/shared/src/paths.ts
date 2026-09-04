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

/** Opptrix 托管 Python 运行时根目录 (~/.opptrix/runtimes/python) */
export function resolvePythonRuntimeRoot(): string {
  return path.join(resolveUserDataRoot(), 'runtimes', 'python')
}

/** 扩展平台：插件私有数据根 (~/.opptrix/plugin-data) */
export function resolvePluginDataRoot(): string {
  return path.join(resolveUserDataRoot(), 'plugin-data')
}

/** 单个扩展的数据目录 (~/.opptrix/plugin-data/{pluginId}) */
export function resolvePluginDataDir(pluginId: string): string {
  const safe = pluginId.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  if (!safe) {
    throw new Error('invalid plugin id')
  }
  // `.` / `..` survive the character allowlist — they would resolve to the
  // plugin-data root itself or its parent (user data root), letting an
  // uninstall recurse-delete far beyond one extension's directory.
  if (safe === '.' || safe === '..' || safe.startsWith('..') || safe.includes('/')) {
    throw new Error('invalid plugin id')
  }
  return path.join(resolvePluginDataRoot(), safe)
}

/** 已安装扩展目录 (~/.opptrix/extensions) */
export function resolveExtensionsDir(): string {
  return path.join(resolveUserDataRoot(), 'extensions')
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

/**
 * Opptrix 产品版本（Agent / health / get_project_info）。
 * 优先 `OPPTRIX_APP_VERSION`；否则读 monorepo `apps/desktop/package.json`；再否则 `unknown`。
 * 权威来源是桌面端 package.json，不是 server package.json。
 */
export function resolveOpptrixAppVersion(): string {
  const fromEnv = process.env.OPPTRIX_APP_VERSION?.trim()
  if (fromEnv) return fromEnv

  try {
    for (const rel of ['apps/server/package.json', 'package.json']) {
      const pkgPath = path.join(resolveProjectRoot(), ...rel.split('/'))
      if (!fs.existsSync(pkgPath)) continue
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: unknown }
      if (typeof pkg.version === 'string') {
        const v = pkg.version.trim()
        if (v) return v
      }
    }
  } catch {
    /* fall through */
  }
  return 'unknown'
}
