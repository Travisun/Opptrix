/**
 * Docker base vendor ↔ runtime slot dependency contract.
 *
 * Opptrix packages are ESM (`"type": "module"`). Node's NODE_PATH is **not**
 * consulted for bare ESM imports, so we cannot rely on NODE_PATH alone.
 *
 * Instead, lifecycle APIs materialize ABI packages into `$SLOT/node_modules` as
 * **real recursive copies** from `$OPPTRIX_VENDOR_NODE_MODULES` (default
 * `/opt/opptrix/vendor/node_modules`), via `fs.cpSync(..., { recursive, dereference })`.
 * Symlinks into an isolated vendor tree break Node resolution for hoisted deps
 * (e.g. `better-sqlite3` → `require('bindings')` looking under vendor, not slot).
 * Application code keeps normal `import 'better-sqlite3'` — no source changes.
 *
 * Soft no-op when vendor dir is missing (bare Node / non-Docker): returns
 * `missingInVendor` and does not throw.
 *
 * ## Fusion rules (no app code changes)
 *
 * | Package kind | In hot-update slot | Boot / activate behavior |
 * |--------------|--------------------|---------------------------|
 * | **ABI-pinned** (native) | Must not ship (CI); if present, **replaced** | Always **copy** from vendor (force; migrates old symlinks) |
 * | **Nested ABI** under nested node_modules trees | Stray copies from old packs | **Scrubbed** so root vendor **copy** wins |
 * | **Hot-pack forbidden** (e.g. onnxruntime-web) | Must not ship; never vendor | **Deleted** from every node_modules |
 * | **Non-ABI / new deps** | May ship in slot node_modules | Left untouched (slot wins) |
 */

import fs from 'node:fs'
import path from 'node:path'

/** Default vendor node_modules inside the self-host image. */
export const DEFAULT_VENDOR_NODE_MODULES = '/opt/opptrix/vendor/node_modules'

/**
 * Native / ABI-sensitive packages provided by the Docker base vendor layer.
 * Hot-update runtime packs must not ship these (see assertNoAbiPinnedInTree).
 */
export const ABI_PINNED_PACKAGE_NAMES: readonly string[] = Object.freeze([
  'better-sqlite3',
  'duckdb',
  '@duckdb/node-api',
  '@duckdb/node-bindings',
  'sharp',
  'node-llama-cpp',
  'onnxruntime-node',
  '@lancedb/lancedb',
  '@napi-rs/canvas',
  'koffi',
  'nodejs-whisper',
])

/**
 * Scoped / platform package name prefixes treated as ABI-pinned.
 * Includes LanceDB / sharp platform binary packages.
 */
export const ABI_PINNED_NAME_PREFIXES: readonly string[] = Object.freeze([
  '@img/sharp-',
  '@napi-rs/canvas-',
  '@node-llama-cpp/',
  '@lancedb/lancedb-',
])

/**
 * Packages that must never ship in hot-update packs and must not be kept in
 * Docker vendor (OS-replaced or browser-only). Scrubbed from every node_modules.
 *
 * - `onnxruntime-web`: transformers.js browser backend; Node uses `onnxruntime-node`
 * - `ffmpeg-static`: Docker uses apt `ffmpeg` (`FFMPEG_PATH`)
 */
export const HOT_PACK_FORBIDDEN_PACKAGE_NAMES: readonly string[] = Object.freeze([
  'onnxruntime-web',
  'ffmpeg-static',
])

export interface VendorFuseOptions {
  dryRun?: boolean
  scrubNested?: boolean
}

export interface VendorFuseResult {
  /** Newly installed (slot path did not exist). */
  linked: string[]
  /** Existed (real dir / file / old symlink) then replaced with copy. */
  replaced: string[]
  /** Unused under always-copy (kept for API compat; stays empty). */
  alreadyLinked: string[]
  scrubbed: string[]
  missingInVendor: string[]
  vendorRoot: string
}

export function isAbiPinnedPackageName(name: string): boolean {
  const n = String(name ?? '').trim()
  if (!n) return false
  if (ABI_PINNED_PACKAGE_NAMES.includes(n)) return true
  return ABI_PINNED_NAME_PREFIXES.some((p) => n.startsWith(p))
}

export function isHotPackForbiddenPackageName(name: string): boolean {
  const n = String(name ?? '').trim()
  if (!n) return false
  return HOT_PACK_FORBIDDEN_PACKAGE_NAMES.includes(n)
}

/** ABI vendor packages + forbidden bloat — must not appear in hot-update archives. */
export function isHotPackExcludedPackageName(name: string): boolean {
  return isAbiPinnedPackageName(name) || isHotPackForbiddenPackageName(name)
}

export function resolveVendorNodeModules(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.OPPTRIX_VENDOR_NODE_MODULES?.trim()
  if (raw) return path.resolve(raw)
  return DEFAULT_VENDOR_NODE_MODULES
}

/**
 * List package names present directly under a node_modules tree (incl. @scope/pkg).
 */
export function listInstalledPackageNames(nodeModulesDir: string): string[] {
  if (!fs.existsSync(nodeModulesDir) || !fs.statSync(nodeModulesDir).isDirectory()) {
    return []
  }
  const out: string[] = []
  for (const ent of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (ent.name === '.bin' || ent.name.startsWith('.')) continue
    const full = path.join(nodeModulesDir, ent.name)
    if (ent.name.startsWith('@')) {
      if (!ent.isDirectory()) continue
      for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
        if (!sub.isDirectory() && !sub.isSymbolicLink()) continue
        out.push(`${ent.name}/${sub.name}`)
      }
      continue
    }
    if (ent.isDirectory() || ent.isSymbolicLink()) out.push(ent.name)
  }
  return out.sort()
}

/** e.g. better-sqlite3 or @duckdb/node-api */
export function packageInstallPath(nodeModulesDir: string, packageName: string): string {
  return path.join(nodeModulesDir, ...packageName.split('/'))
}

function pathExists(targetPath: string): boolean {
  try {
    fs.lstatSync(targetPath)
    return true
  } catch {
    return false
  }
}

function removePath(targetPath: string): void {
  const st = fs.lstatSync(targetPath)
  if (st.isSymbolicLink() || st.isFile()) {
    fs.unlinkSync(targetPath)
    return
  }
  fs.rmSync(targetPath, { recursive: true, force: true })
}

/**
 * True when `slotPath` is a symlink to `vendorPath` (or same real path).
 * Used to detect legacy symlink fusion that must be migrated to a real copy.
 */
export function isLinkToVendor(slotPkgPath: string, vendorPath: string): boolean {
  try {
    const st = fs.lstatSync(slotPkgPath)
    if (!st.isSymbolicLink()) return false
    const resolved = path.resolve(path.dirname(slotPkgPath), fs.readlinkSync(slotPkgPath))
    return path.resolve(resolved) === path.resolve(vendorPath)
  } catch {
    return false
  }
}

/**
 * Remove ABI-pinned packages from nested node_modules (not the slot root),
 * so resolution walks up to the root vendor **copy**.
 */
export function scrubNestedAbiPinnedCopies(
  slotRoot: string,
  slotRootNodeModules: string,
  opts: VendorFuseOptions = {},
): string[] {
  const absRoot = path.resolve(slotRoot)
  const rootNm = path.resolve(slotRootNodeModules)
  const scrubbed: string[] = []

  function walk(dir: string, depth: number): void {
    if (depth > 24) return
    let ents: fs.Dirent[]
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (ent.name === '.git' || ent.name === 'dist-runtime') continue
      const full = path.join(dir, ent.name)
      if (ent.name === 'node_modules' && (ent.isDirectory() || ent.isSymbolicLink())) {
        const nmAbs = path.resolve(full)
        if (nmAbs === rootNm) {
          // Do not scrub the root node_modules here — handled by force-copy.
          continue
        }
        for (const name of listInstalledPackageNames(full)) {
          if (!isAbiPinnedPackageName(name)) continue
          const pkgPath = packageInstallPath(full, name)
          if (!pathExists(pkgPath)) continue
          if (!opts.dryRun) removePath(pkgPath)
          scrubbed.push(name)
        }
        for (const name of listInstalledPackageNames(full)) {
          if (isAbiPinnedPackageName(name)) continue
          const pkgPath = packageInstallPath(full, name)
          try {
            if (fs.statSync(pkgPath).isDirectory()) walk(pkgPath, depth + 1)
          } catch {
            /* ignore */
          }
        }
        continue
      }
      if (ent.isDirectory() && !ent.isSymbolicLink()) walk(full, depth + 1)
    }
  }

  walk(absRoot, 0)
  return scrubbed
}

/**
 * Delete hot-pack-forbidden packages from **every** node_modules under `root`
 * (including the tree root). Never moved into vendor.
 */
export function scrubHotPackForbiddenFromTree(
  root: string,
  opts: VendorFuseOptions = {},
): string[] {
  const absRoot = path.resolve(root)
  const scrubbed: string[] = []

  function walk(dir: string, depth: number): void {
    if (depth > 24) return
    let ents: fs.Dirent[]
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (ent.name === '.git' || ent.name === 'dist-runtime') continue
      const full = path.join(dir, ent.name)
      if (ent.name === 'node_modules' && (ent.isDirectory() || ent.isSymbolicLink())) {
        for (const name of listInstalledPackageNames(full)) {
          if (!isHotPackForbiddenPackageName(name)) continue
          const pkgPath = packageInstallPath(full, name)
          if (!pathExists(pkgPath)) continue
          if (!opts.dryRun) removePath(pkgPath)
          scrubbed.push(name)
        }
        for (const name of listInstalledPackageNames(full)) {
          if (isHotPackForbiddenPackageName(name)) continue
          const pkgPath = packageInstallPath(full, name)
          try {
            if (fs.statSync(pkgPath).isDirectory()) walk(pkgPath, depth + 1)
          } catch {
            /* ignore */
          }
        }
        continue
      }
      if (ent.isDirectory() && !ent.isSymbolicLink()) walk(full, depth + 1)
    }
  }

  walk(absRoot, 0)
  return scrubbed
}

/**
 * Fuse vendor ABI packages into the slot without touching non-ABI hot-update deps.
 *
 * Always replaces with a fresh recursive copy (force semantics). Legacy
 * vendor symlinks are removed and copied — never treated as "already done".
 * Always scrubs hot-pack-forbidden packages (even when vendor is absent).
 */
export function ensureVendorModuleLinks(
  slotRoot: string,
  vendorNodeModules: string,
  opts: VendorFuseOptions = {},
): VendorFuseResult {
  const scrubNested = opts.scrubNested !== false
  const slotNm = path.join(path.resolve(slotRoot), 'node_modules')
  const vendorNm = path.resolve(vendorNodeModules)
  const linked: string[] = []
  const replaced: string[] = []
  const alreadyLinked: string[] = []
  const missingInVendor: string[] = []

  const forbiddenScrubbed = scrubHotPackForbiddenFromTree(path.resolve(slotRoot), opts)

  if (!fs.existsSync(vendorNm) || !fs.statSync(vendorNm).isDirectory()) {
    return {
      linked,
      replaced,
      alreadyLinked,
      scrubbed: forbiddenScrubbed,
      missingInVendor: [...ABI_PINNED_PACKAGE_NAMES],
      vendorRoot: vendorNm,
    }
  }

  const vendorPackages = listInstalledPackageNames(vendorNm).filter((n) =>
    isAbiPinnedPackageName(n),
  )

  if (!opts.dryRun) {
    fs.mkdirSync(slotNm, { recursive: true })
  }

  for (const name of vendorPackages) {
    const vendorPath = packageInstallPath(vendorNm, name)
    const slotPkgPath = packageInstallPath(slotNm, name)
    if (!fs.existsSync(vendorPath)) {
      missingInVendor.push(name)
      continue
    }

    // Always fresh-copy (incl. migrate legacy symlink-to-vendor — do not skip).
    const existed = pathExists(slotPkgPath)
    if (!opts.dryRun) {
      if (existed) removePath(slotPkgPath)
      fs.mkdirSync(path.dirname(slotPkgPath), { recursive: true })
      fs.cpSync(vendorPath, slotPkgPath, { recursive: true, dereference: true })
    }
    if (existed) replaced.push(name)
    else linked.push(name)
  }

  for (const name of ABI_PINNED_PACKAGE_NAMES) {
    if (!fs.existsSync(packageInstallPath(vendorNm, name))) {
      if (!missingInVendor.includes(name)) missingInVendor.push(name)
    }
  }

  const nestedScrubbed = scrubNested
    ? scrubNestedAbiPinnedCopies(path.resolve(slotRoot), slotNm, opts)
    : []

  return {
    linked,
    replaced,
    alreadyLinked,
    scrubbed: [...forbiddenScrubbed, ...nestedScrubbed],
    missingInVendor,
    vendorRoot: vendorNm,
  }
}

/**
 * Fuse ABI packages from `$OPPTRIX_VENDOR_NODE_MODULES` (or override) into `slotRoot`.
 * Soft no-op when vendor is absent.
 */
export function fuseVendorAbiIntoSlot(
  slotRoot: string,
  opts: VendorFuseOptions & { vendorNodeModules?: string } = {},
): VendorFuseResult {
  const vendorNm = opts.vendorNodeModules ?? resolveVendorNodeModules()
  return ensureVendorModuleLinks(slotRoot, vendorNm, opts)
}

/**
 * Walk a pack/slot tree and collect ABI-pinned package dirs under any node_modules.
 */
export function findAbiPinnedInTree(root: string): string[] {
  return findNamedPackagesInTree(root, isAbiPinnedPackageName)
}

/** Collect hot-pack-forbidden package names present under any node_modules. */
export function findHotPackForbiddenInTree(root: string): string[] {
  return findNamedPackagesInTree(root, isHotPackForbiddenPackageName)
}

function findNamedPackagesInTree(
  root: string,
  match: (name: string) => boolean,
): string[] {
  const abs = path.resolve(root)
  const found = new Set<string>()

  function walk(dir: string, depth: number): void {
    if (depth > 24) return
    let ents: fs.Dirent[]
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (ent.name === '.git' || ent.name === 'dist-runtime') continue
      const full = path.join(dir, ent.name)
      if (ent.name === 'node_modules' && ent.isDirectory()) {
        for (const name of listInstalledPackageNames(full)) {
          if (match(name)) found.add(name)
        }
        for (const name of listInstalledPackageNames(full)) {
          const pkgPath = packageInstallPath(full, name)
          try {
            if (fs.statSync(pkgPath).isDirectory()) walk(pkgPath, depth + 1)
          } catch {
            /* ignore */
          }
        }
        continue
      }
      if (ent.isDirectory() && !ent.isSymbolicLink()) walk(full, depth + 1)
    }
  }

  walk(abs, 0)
  return [...found].sort()
}

/** @throws when ABI-pinned or hot-pack-forbidden packages are present */
export function assertNoAbiPinnedInTree(root: string): true {
  const abi = findAbiPinnedInTree(root)
  const forbidden = findHotPackForbiddenInTree(root)
  if (abi.length || forbidden.length) {
    const parts: string[] = []
    if (abi.length) {
      parts.push(
        `ABI-pinned (found: ${abi.join(', ')}) — provide via Docker vendor `
          + '($OPPTRIX_VENDOR_NODE_MODULES) and raise minBaseImage',
      )
    }
    if (forbidden.length) {
      parts.push(
        `hot-pack-forbidden (found: ${forbidden.join(', ')}) — scrub before pack `
          + '(Node uses onnxruntime-node; Docker uses system ffmpeg)',
      )
    }
    throw new Error(`Hot-update packs must not ship: ${parts.join('; ')}.`)
  }
  return true
}

/**
 * Tar --exclude args for ABI-pinned + forbidden package dirs (best-effort; CI also asserts).
 */
export function abiPinnedTarExcludeArgs(): string[] {
  const args: string[] = []
  for (const name of [...ABI_PINNED_PACKAGE_NAMES, ...HOT_PACK_FORBIDDEN_PACKAGE_NAMES]) {
    args.push(`--exclude=**/node_modules/${name}`)
    args.push(`--exclude=node_modules/${name}`)
  }
  args.push('--exclude=**/node_modules/@img/sharp-*')
  args.push('--exclude=**/node_modules/@napi-rs/canvas-*')
  args.push('--exclude=**/node_modules/@node-llama-cpp')
  args.push('--exclude=**/node_modules/@lancedb/lancedb-*')
  return args
}
