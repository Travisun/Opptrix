/**
 * After `fs.cpSync(..., { dereference: true })`, Node may still leave workspace
 * package symlinks whose targets resolve **outside** the destination tree
 * (e.g. `node_modules/@opptrix/user-store` → absolute `/app/packages/user-store`).
 * Slot processes then load code from outside the slot and miss fused ABI under
 * `$SLOT/node_modules`. This helper replaces those external symlinks with real
 * recursive copies so resolution stays under `root`.
 */
import fs from 'node:fs'
import path from 'node:path'

const MAX_WALK_DEPTH = 24

export interface MaterializeExternalSymlinksResult {
  /** Absolute paths of symlink locations that were replaced with real copies. */
  replaced: string[]
}

/** Prefer realpath so `/var` vs `/private/var` (macOS) does not false-flag in-tree links. */
function canonicalPath(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

function isPathInsideRoot(absPath: string, absRootCanonical: string): boolean {
  const resolved = canonicalPath(absPath)
  return (
    resolved === absRootCanonical
    || resolved.startsWith(absRootCanonical + path.sep)
  )
}

/**
 * Resolve symlink target for "outside root?" checks.
 * Prefers `realpath`; falls back to dirname+readlink when the link is broken.
 */
function resolveSymlinkDestination(linkPath: string): string | null {
  try {
    return fs.realpathSync(linkPath)
  } catch {
    try {
      const raw = fs.readlinkSync(linkPath)
      return path.resolve(path.dirname(linkPath), raw)
    } catch {
      return null
    }
  }
}

/**
 * Walk `root` and replace any symlink whose resolved target lies outside `root`
 * with a recursive real copy of that target (`dereference: true`).
 * Soft-safe: missing/broken targets are skipped; walk depth is capped.
 */
export function materializeExternalSymlinks(
  root: string,
): MaterializeExternalSymlinksResult {
  const absRoot = path.resolve(root)
  const replaced: string[] = []
  /** Realpaths already copied from — avoid loops if trees cross-link. */
  const copiedFrom = new Set<string>()

  if (!fs.existsSync(absRoot)) {
    return { replaced }
  }
  try {
    if (!fs.statSync(absRoot).isDirectory()) {
      return { replaced }
    }
  } catch {
    return { replaced }
  }

  const absRootCanonical = canonicalPath(absRoot)

  function walk(dir: string, depth: number): void {
    if (depth > MAX_WALK_DEPTH) return
    let ents: fs.Dirent[]
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const ent of ents) {
      if (ent.name === '.git' || ent.name === 'dist-runtime') continue
      const full = path.join(dir, ent.name)

      if (ent.isSymbolicLink()) {
        const dest = resolveSymlinkDestination(full)
        if (!dest) continue
        if (isPathInsideRoot(dest, absRootCanonical)) continue
        if (!fs.existsSync(dest)) continue

        let destReal: string
        try {
          destReal = fs.realpathSync(dest)
        } catch {
          destReal = path.resolve(dest)
        }
        if (copiedFrom.has(destReal)) continue
        // Do not pull the destination tree into itself via a back-link.
        if (isPathInsideRoot(destReal, absRootCanonical)) continue

        try {
          fs.unlinkSync(full)
          fs.cpSync(destReal, full, { recursive: true, dereference: true })
          copiedFrom.add(destReal)
          replaced.push(full)
        } catch {
          // Soft-safe: leave whatever is there and continue.
          continue
        }

        try {
          if (fs.statSync(full).isDirectory()) {
            walk(full, depth + 1)
          }
        } catch {
          /* ignore */
        }
        continue
      }

      if (ent.isDirectory()) {
        walk(full, depth + 1)
      }
    }
  }

  walk(absRoot, 0)
  return { replaced }
}
