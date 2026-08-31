/**
 * 服务器已挂载目录（$OPPTRIX_DATA_DIR/mounts 的直接子目录）与授权路径白名单。
 * Web / 自托管强制白名单；桌面端（OPPTRIX_DESKTOP）可放宽为仅 Deny 校验。
 */
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { isDesktopRuntime, resolveUserDataRoot } from '@opptrix/shared'
import { isPathDenied } from './deny.js'
import { DenyPathError, PathEscapeError, WorkspaceError } from './errors.js'
import { resolveSafePath } from './path-gate.js'
import {
  resolveSessionWorkspaceRoot,
  resolveSharedWorkspaceRoot,
} from './paths.js'

export const MOUNTS_SUBDIR = 'mounts'

/** 浏览单层最多返回的子目录数 */
export const MAX_BROWSE_DIR_ENTRIES = 200

/** 相对 path 最大深度（段数） */
export const MAX_BROWSE_REL_DEPTH = 32

export interface WorkspaceMountRoot {
  name: string
  abs_path: string
  /** 面向用户的短标签（通常即目录名） */
  label: string
}

export interface WorkspaceBrowseEntry {
  name: string
  abs_path: string
}

export interface WorkspaceBrowseResult {
  root: string
  path: string
  entries: WorkspaceBrowseEntry[]
  truncated: boolean
}

const EMPTY_MOUNTS_REASON =
  '还没有可选用的已挂载目录。请先在服务器上添加需要共享的文件夹后刷新。本对话工作区与公共资产仍可正常使用。'

export function resolveMountsRoot(): string {
  return path.join(resolveUserDataRoot(), MOUNTS_SUBDIR)
}

export function emptyMountsReason(): string {
  return EMPTY_MOUNTS_REASON
}

function isUnderRoot(target: string, root: string): boolean {
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function realpathSyncSafe(p: string): string {
  const resolved = path.resolve(p)
  try {
    return fs.realpathSync.native(resolved)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      try {
        return path.join(fs.realpathSync.native(path.dirname(resolved)), path.basename(resolved))
      } catch {
        return resolved
      }
    }
    return resolved
  }
}

function isSafeMountChildName(name: string): boolean {
  return Boolean(name) && name !== '.' && name !== '..'
    && !name.includes('/') && !name.includes('\\') && !name.includes('\0')
}

/** 列出 mounts/ 下可作为授权根的直接子目录（含指向目录的符号链接）。 */
export async function listMountRoots(): Promise<WorkspaceMountRoot[]> {
  const mountsRoot = resolveMountsRoot()
  let entries: fs.Dirent[]
  try {
    entries = await fsPromises.readdir(mountsRoot, { withFileTypes: true })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return []
    throw err
  }

  const out: WorkspaceMountRoot[] = []
  for (const entry of entries) {
    if (!isSafeMountChildName(entry.name)) continue
    const abs = path.join(mountsRoot, entry.name)
    let st: fs.Stats
    try {
      st = await fsPromises.stat(abs)
    } catch {
      continue
    }
    if (!st.isDirectory()) continue
    out.push({
      name: entry.name,
      abs_path: path.resolve(abs),
      label: entry.name,
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/**
 * 同步收集可授权根的 realpath：shared、可选 session、以及 mounts 直接子项。
 */
export function collectGrantAllowlistRootsSync(sessionId?: string): string[] {
  const roots: string[] = [realpathSyncSafe(resolveSharedWorkspaceRoot())]
  if (sessionId?.trim()) {
    try {
      roots.push(realpathSyncSafe(resolveSessionWorkspaceRoot(sessionId.trim())))
    } catch {
      /* 无效 sessionId 忽略；后续仍可走 mounts */
    }
  }

  const mountsRoot = resolveMountsRoot()
  let names: string[]
  try {
    names = fs.readdirSync(mountsRoot)
  } catch {
    return roots
  }
  for (const name of names) {
    if (!isSafeMountChildName(name)) continue
    const abs = path.join(mountsRoot, name)
    try {
      const st = fs.statSync(abs)
      if (!st.isDirectory()) continue
      roots.push(realpathSyncSafe(abs))
    } catch {
      continue
    }
  }
  return roots
}

/**
 * 路径是否落在白名单根内（不含桌面放宽）。
 * 拒绝 `..` 逃逸：先 resolve，再与各根 realpath 做 isUnderRoot。
 */
export function isGrantPathAllowlisted(absPath: string, sessionId?: string): boolean {
  const target = realpathSyncSafe(absPath)
  for (const root of collectGrantAllowlistRootsSync(sessionId)) {
    if (isUnderRoot(target, root)) return true
  }
  return false
}

export interface AssertGrantPathOptions {
  sessionId?: string
  /**
   * true：强制白名单（测试 / 明确自托管）。
   * false：仅 Deny。
   * 缺省：桌面运行时放宽，否则强制白名单。
   */
  enforceAllowlist?: boolean
}

/**
 * 规范化并校验可授权路径。返回 resolve 后的绝对路径。
 */
export function assertGrantPathAllowed(
  absPath: string,
  opts?: AssertGrantPathOptions,
): string {
  const raw = String(absPath ?? '').trim()
  if (!raw) throw new WorkspaceError('请指定要授权的文件夹')
  if (raw.includes('\0')) throw new PathEscapeError('路径无效')

  const resolved = path.resolve(raw)
  if (isPathDenied(resolved)) {
    throw new DenyPathError('无法授权该目录（受保护路径）')
  }

  const enforce =
    opts?.enforceAllowlist !== undefined
      ? opts.enforceAllowlist
      : !isDesktopRuntime()

  if (!enforce) return resolved

  if (!isGrantPathAllowlisted(resolved, opts?.sessionId)) {
    throw new PathEscapeError(
      '只能授权已挂载目录、本对话工作区或公共资产下的文件夹',
    )
  }
  return resolved
}

/** `root` 是否为允许浏览的根（mounts 子项或公共资产）。 */
export async function resolveBrowseRootAbs(rootParam: string): Promise<string> {
  const raw = String(rootParam ?? '').trim()
  if (!raw) throw new WorkspaceError('请指定浏览根目录')
  if (raw.includes('\0')) throw new PathEscapeError('浏览根目录无效')

  const resolved = path.resolve(raw)
  const shared = path.resolve(resolveSharedWorkspaceRoot())
  if (resolved === shared || realpathSyncSafe(resolved) === realpathSyncSafe(shared)) {
    return shared
  }

  const mounts = await listMountRoots()
  for (const m of mounts) {
    const mountAbs = path.resolve(m.abs_path)
    if (mountAbs === resolved || realpathSyncSafe(mountAbs) === realpathSyncSafe(resolved)) {
      return mountAbs
    }
  }
  throw new PathEscapeError('只能浏览已挂载目录或公共资产')
}

/**
 * 在允许的 root 下列出子目录（不含文件）。path 为相对 root 的路径。
 */
export async function browseWorkspaceDirs(
  rootParam: string,
  relativePath = '',
): Promise<WorkspaceBrowseResult> {
  const rootAbs = await resolveBrowseRootAbs(rootParam)
  const relRaw = String(relativePath ?? '').trim().replace(/\\/g, '/')
  if (relRaw.includes('\0')) throw new PathEscapeError('路径无效')

  const segments = relRaw && relRaw !== '.'
    ? relRaw.split('/').filter(Boolean)
    : []
  if (segments.length > MAX_BROWSE_REL_DEPTH) {
    throw new PathEscapeError('目录层级过深')
  }
  for (const seg of segments) {
    if (seg === '..' || seg === '.' || seg.includes('\0')) {
      throw new PathEscapeError('不允许使用 .. 穿越目录')
    }
  }

  const relJoined = segments.join('/')
  const dirAbs = await resolveSafePath(rootAbs, relJoined)

  let dirents: fs.Dirent[]
  try {
    dirents = await fsPromises.readdir(dirAbs, { withFileTypes: true })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new WorkspaceError('目录不存在或无法打开')
    }
    throw err
  }

  const dirs: WorkspaceBrowseEntry[] = []
  let truncated = false
  const sorted = [...dirents].sort((a, b) => a.name.localeCompare(b.name))
  for (const ent of sorted) {
    if (!ent.name || ent.name === '.' || ent.name === '..') continue
    if (ent.name.includes('\0')) continue
    const childAbs = path.join(dirAbs, ent.name)
    let isDir = ent.isDirectory()
    if (ent.isSymbolicLink()) {
      try {
        const st = await fsPromises.stat(childAbs)
        isDir = st.isDirectory()
      } catch {
        continue
      }
    }
    if (!isDir) continue
    const childRelFromRoot = relJoined ? `${relJoined}/${ent.name}` : ent.name
    let safeAbs: string
    try {
      safeAbs = await resolveSafePath(rootAbs, childRelFromRoot)
    } catch {
      continue
    }
    dirs.push({ name: ent.name, abs_path: safeAbs })
    if (dirs.length >= MAX_BROWSE_DIR_ENTRIES) {
      truncated = true
      break
    }
  }

  return {
    root: rootAbs,
    path: relJoined,
    entries: dirs,
    truncated,
  }
}
