/**
 * Ensure system layout dirs and manage boot/backup pointers.
 * Unix: symlinks. Windows: directory junctions (or a pointer file fallback).
 */
import fs from 'node:fs'
import path from 'node:path'
import { assertSafeVersion, resolveSystemPaths, slotPath } from './paths.js'

const POINTER_SUFFIX = '.opptrix-slot-pointer'

export function ensureLayout(systemDir?: string): void {
  const p = resolveSystemPaths(systemDir)
  fs.mkdirSync(p.systemDir, { recursive: true })
  fs.mkdirSync(p.updateDir, { recursive: true })
  fs.mkdirSync(p.slotsDir, { recursive: true })
}

function pointerFileFor(linkPath: string): string {
  return `${linkPath}${POINTER_SUFFIX}`
}

function unlinkQuiet(target: string): void {
  try {
    fs.rmSync(target, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

/**
 * Point `linkPath` at `targetDir` (absolute).
 * Prefer symlink; on win32 use junction; if that fails, write a pointer file.
 */
export function setDirectoryPointer(linkPath: string, targetDir: string): void {
  const absTarget = path.resolve(targetDir)
  if (!fs.existsSync(absTarget)) {
    throw new Error(`pointer target missing: ${absTarget}`)
  }

  unlinkQuiet(linkPath)
  unlinkQuiet(pointerFileFor(linkPath))

  const parent = path.dirname(linkPath)
  fs.mkdirSync(parent, { recursive: true })

  const type = process.platform === 'win32' ? 'junction' : 'dir'
  try {
    fs.symlinkSync(absTarget, linkPath, type)
    return
  } catch {
    /* fall through to pointer file */
  }

  fs.writeFileSync(
    pointerFileFor(linkPath),
    `${absTarget}\n`,
    'utf8',
  )
}

/** Resolve the absolute directory a boot/backup pointer currently references. */
export function readDirectoryPointer(linkPath: string): string | null {
  const pointerFile = pointerFileFor(linkPath)
  if (fs.existsSync(pointerFile)) {
    try {
      const text = fs.readFileSync(pointerFile, 'utf8').trim()
      if (text && fs.existsSync(text)) return path.resolve(text)
    } catch {
      return null
    }
  }

  if (!fs.existsSync(linkPath)) return null

  try {
    const st = fs.lstatSync(linkPath)
    if (st.isSymbolicLink()) {
      const resolved = fs.realpathSync(linkPath)
      return path.resolve(resolved)
    }
    if (st.isDirectory()) {
      return path.resolve(linkPath)
    }
  } catch {
    return null
  }
  return null
}

export function clearDirectoryPointer(linkPath: string): void {
  unlinkQuiet(linkPath)
  unlinkQuiet(pointerFileFor(linkPath))
}

export function versionFromSlotDir(slotDir: string): string {
  return path.basename(path.resolve(slotDir))
}

export function pointBootToVersion(systemDir: string, version: string): string {
  assertSafeVersion(version)
  const p = resolveSystemPaths(systemDir)
  const target = slotPath(p.systemDir, version)
  setDirectoryPointer(p.bootLink, target)
  return target
}

export function pointBackupToVersion(systemDir: string, version: string): string {
  assertSafeVersion(version)
  const p = resolveSystemPaths(systemDir)
  const target = slotPath(p.systemDir, version)
  setDirectoryPointer(p.backupLink, target)
  return target
}

export function readBootVersion(systemDir?: string): string | null {
  const p = resolveSystemPaths(systemDir)
  const dir = readDirectoryPointer(p.bootLink)
  return dir ? versionFromSlotDir(dir) : null
}

export function readBackupVersion(systemDir?: string): string | null {
  const p = resolveSystemPaths(systemDir)
  const dir = readDirectoryPointer(p.backupLink)
  return dir ? versionFromSlotDir(dir) : null
}
