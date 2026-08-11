import path from 'node:path'

/**
 * Windows `srt-win acl grant` 路径策略。
 *
 * 对 WINDIR / Program Files* / 盘符根等系统目录 stamp ACL 会触发 ACCESS_DENIED (0x5)，
 * 且上游 grant 为 all-or-nothing，导致整批回滚。这些路径依赖系统默认 Users RX，
 * 不得进入 allowRead/allowWrite 的 ACL stamp 列表。
 */

export type WindowsAclEnv = NodeJS.ProcessEnv

function winNormalize(absPath: string): string {
  const resolved = path.win32.resolve(absPath.trim())
  // 统一分隔符并去掉多余尾部反斜杠（保留盘符根 `C:\`）
  let n = resolved.replace(/\//g, '\\')
  if (n.length > 3 && n.endsWith('\\')) {
    n = n.slice(0, -1)
  }
  return n.toLowerCase()
}

/** `C:` / `C:\` / `C:/` — resolve 前识别，避免 `D:` 被展开为盘符 cwd */
function isBareWindowsDriveRoot(raw: string): boolean {
  return /^[a-zA-Z]:[\\/]?$/.test(raw.trim())
}

function isWindowsDriveRoot(normalized: string): boolean {
  // `c:` 或 `c:\`
  return /^[a-z]:\\?$/.test(normalized)
}

function isSameOrUnder(candidateNorm: string, rootNorm: string): boolean {
  if (candidateNorm === rootNorm) return true
  const prefix = rootNorm.endsWith('\\') ? rootNorm : `${rootNorm}\\`
  return candidateNorm.startsWith(prefix)
}

/** 系统目录根：WINDIR / SystemRoot / ProgramFiles*（含默认回退） */
export function windowsAclForbiddenRoots(env: WindowsAclEnv = process.env): string[] {
  const windir = (env.WINDIR ?? env.SystemRoot ?? 'C:\\Windows').trim()
  const roots = [windir]
  const systemRoot = env.SystemRoot?.trim()
  if (systemRoot && winNormalize(systemRoot) !== winNormalize(windir)) {
    roots.push(systemRoot)
  }
  const pf = (env.ProgramFiles ?? 'C:\\Program Files').trim()
  roots.push(pf)
  const pf86 = env['ProgramFiles(x86)']?.trim()
  if (pf86) roots.push(pf86)
  const pf64 = env.ProgramW6432?.trim()
  if (pf64) roots.push(pf64)
  return roots
}

/** 是否禁止对路径执行 Windows ACL stamp（srt-win acl grant） */
export function isWindowsAclStampForbidden(
  absPath: string,
  env: WindowsAclEnv = process.env,
): boolean {
  const raw = absPath.trim()
  if (!raw) return true
  if (isBareWindowsDriveRoot(raw)) return true
  const norm = winNormalize(raw)
  if (isWindowsDriveRoot(norm)) return true
  for (const root of windowsAclForbiddenRoots(env)) {
    if (isSameOrUnder(norm, winNormalize(root))) return true
  }
  return false
}

/** 路径是否可作为 Windows ACL grant 目标（非空且非黑名单） */
export function needsWindowsAclGrant(
  absPath: string,
  env: WindowsAclEnv = process.env,
): boolean {
  return Boolean(absPath.trim()) && !isWindowsAclStampForbidden(absPath, env)
}

/** 过滤掉不可 stamp 的路径；保持相对顺序与去重由调用方负责 */
export function filterWindowsAclGrantPaths(
  paths: readonly string[],
  env: WindowsAclEnv = process.env,
): string[] {
  return paths.filter(p => needsWindowsAclGrant(p, env))
}

/**
 * 平台出口硬过滤：仅 win32 剔除黑名单；其它平台原样返回（浅拷贝）。
 * 供 buildSandboxConfig* 的 allowRead / allowWrite 出口使用。
 */
export function finalizeFilesystemPathsForPlatform(
  paths: readonly string[],
  platform: NodeJS.Platform = process.platform,
  env: WindowsAclEnv = process.env,
): string[] {
  if (platform !== 'win32') return [...paths]
  return filterWindowsAclGrantPaths(paths, env)
}
