/**
 * Docker base vendor ↔ runtime slot dependency contract.
 *
 * Opptrix packages are ESM (`"type": "module"`). Node's NODE_PATH is **not**
 * consulted for bare ESM imports, so we cannot rely on NODE_PATH alone.
 *
 * Instead, at boot we materialize ABI packages into `$BOOT/node_modules` as
 * symlinks to `$OPPTRIX_VENDOR_NODE_MODULES` (default
 * `/opt/opptrix/vendor/node_modules`). Application code keeps normal
 * `import 'better-sqlite3'` — no source changes.
 *
 * ## Fusion rules (no app code changes)
 *
 * | Package kind | In hot-update slot | Boot / activate behavior |
 * |--------------|--------------------|---------------------------|
 * | **ABI-pinned** (native) | Must not ship (CI); if present, **replaced** | Always symlink → vendor (force) |
 * | **Nested ABI** under nested node_modules trees | Stray copies from old packs | **Scrubbed** so root vendor link wins |
 * | **Non-ABI / new deps** | May ship in slot node_modules | Left untouched (slot wins) |
 *
 * Wiring: `system-boot` `ensure` + `activate-pending` → `ensureVendorModuleLinks`
 * after the active boot slot is known (seed, promote, or hot-activate).
 */
import fs from 'node:fs'
import path from 'node:path'

/** Default vendor node_modules inside the self-host image. */
export const DEFAULT_VENDOR_NODE_MODULES = '/opt/opptrix/vendor/node_modules'

/**
 * Native / ABI-sensitive packages provided by the Docker base vendor layer.
 * Hot-update runtime packs must not ship these (see assertNoAbiPinnedInTree).
 * @type {readonly string[]}
 */
export const ABI_PINNED_PACKAGE_NAMES = Object.freeze([
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
 * @type {readonly string[]}
 */
export const ABI_PINNED_NAME_PREFIXES = Object.freeze([
  '@img/sharp-',
  '@napi-rs/canvas-',
  '@node-llama-cpp/',
])

/**
 * @param {string} name
 */
export function isAbiPinnedPackageName(name) {
  const n = String(name ?? '').trim()
  if (!n) return false
  if (ABI_PINNED_PACKAGE_NAMES.includes(n)) return true
  return ABI_PINNED_NAME_PREFIXES.some((p) => n.startsWith(p))
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveVendorNodeModules(env = process.env) {
  const raw = env.OPPTRIX_VENDOR_NODE_MODULES?.trim()
  if (raw) return path.resolve(raw)
  return DEFAULT_VENDOR_NODE_MODULES
}

/**
 * List package names present directly under a node_modules tree (incl. @scope/pkg).
 * @param {string} nodeModulesDir
 * @returns {string[]}
 */
export function listInstalledPackageNames(nodeModulesDir) {
  if (!fs.existsSync(nodeModulesDir) || !fs.statSync(nodeModulesDir).isDirectory()) {
    return []
  }
  /** @type {string[]} */
  const out = []
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

/**
 * @param {string} nodeModulesDir
 * @param {string} packageName  e.g. better-sqlite3 or @duckdb/node-api
 */
export function packageInstallPath(nodeModulesDir, packageName) {
  return path.join(nodeModulesDir, ...packageName.split('/'))
}

/**
 * @param {string} targetPath
 */
function pathExists(targetPath) {
  try {
    fs.lstatSync(targetPath)
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} targetPath
 */
function removePath(targetPath) {
  const st = fs.lstatSync(targetPath)
  if (st.isSymbolicLink() || st.isFile()) {
    fs.unlinkSync(targetPath)
    return
  }
  fs.rmSync(targetPath, { recursive: true, force: true })
}

/**
 * True when `slotPath` is already a symlink to `vendorPath` (or same real path).
 * @param {string} slotPath
 * @param {string} vendorPath
 */
export function isLinkToVendor(slotPath, vendorPath) {
  try {
    const st = fs.lstatSync(slotPath)
    if (!st.isSymbolicLink()) return false
    const resolved = path.resolve(path.dirname(slotPath), fs.readlinkSync(slotPath))
    return path.resolve(resolved) === path.resolve(vendorPath)
  } catch {
    return false
  }
}

/**
 * Remove ABI-pinned packages from nested node_modules (not the slot root),
 * so resolution walks up to the root vendor symlink.
 *
 * @param {string} slotRoot
 * @param {string} slotRootNodeModules
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {string[]} scrubbed package names (may repeat)
 */
export function scrubNestedAbiPinnedCopies(slotRoot, slotRootNodeModules, opts = {}) {
  const absRoot = path.resolve(slotRoot)
  const rootNm = path.resolve(slotRootNodeModules)
  /** @type {string[]} */
  const scrubbed = []

  /**
   * @param {string} dir
   * @param {number} depth
   */
  function walk(dir, depth) {
    if (depth > 24) return
    let ents
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
          // Do not scrub the root node_modules here — handled by force-link.
          continue
        }
        for (const name of listInstalledPackageNames(full)) {
          if (!isAbiPinnedPackageName(name)) continue
          const pkgPath = packageInstallPath(full, name)
          if (!pathExists(pkgPath)) continue
          if (!opts.dryRun) removePath(pkgPath)
          scrubbed.push(name)
        }
        // Continue into nested package contents for deeper node_modules
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
 * Fuse vendor ABI packages into the slot without touching non-ABI hot-update deps.
 *
 * @param {string} slotRoot  runtime slot / boot root (contains node_modules)
 * @param {string} vendorNodeModules
 * @param {{ dryRun?: boolean, scrubNested?: boolean }} [opts]
 * @returns {{
 *   linked: string[],
 *   replaced: string[],
 *   alreadyLinked: string[],
 *   scrubbed: string[],
 *   missingInVendor: string[],
 *   vendorRoot: string,
 * }}
 */
export function ensureVendorModuleLinks(slotRoot, vendorNodeModules, opts = {}) {
  const scrubNested = opts.scrubNested !== false
  const slotNm = path.join(path.resolve(slotRoot), 'node_modules')
  const vendorNm = path.resolve(vendorNodeModules)
  /** @type {string[]} */
  const linked = []
  /** @type {string[]} */
  const replaced = []
  /** @type {string[]} */
  const alreadyLinked = []
  /** @type {string[]} */
  const missingInVendor = []

  if (!fs.existsSync(vendorNm) || !fs.statSync(vendorNm).isDirectory()) {
    return {
      linked,
      replaced,
      alreadyLinked,
      scrubbed: [],
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
    const slotPath = packageInstallPath(slotNm, name)
    if (!fs.existsSync(vendorPath)) {
      missingInVendor.push(name)
      continue
    }

    if (isLinkToVendor(slotPath, vendorPath)) {
      alreadyLinked.push(name)
      continue
    }

    const existed = pathExists(slotPath)
    if (!opts.dryRun) {
      if (existed) removePath(slotPath)
      fs.mkdirSync(path.dirname(slotPath), { recursive: true })
      fs.symlinkSync(vendorPath, slotPath)
    }
    if (existed) replaced.push(name)
    else linked.push(name)
  }

  for (const name of ABI_PINNED_PACKAGE_NAMES) {
    if (!fs.existsSync(packageInstallPath(vendorNm, name))) {
      if (!missingInVendor.includes(name)) missingInVendor.push(name)
    }
  }

  const scrubbed = scrubNested
    ? scrubNestedAbiPinnedCopies(path.resolve(slotRoot), slotNm, opts)
    : []

  return {
    linked,
    replaced,
    alreadyLinked,
    scrubbed,
    missingInVendor,
    vendorRoot: vendorNm,
  }
}

/**
 * Walk a pack/slot tree and collect ABI-pinned package dirs under any node_modules.
 * @param {string} root
 * @returns {string[]} package names found
 */
export function findAbiPinnedInTree(root) {
  const abs = path.resolve(root)
  /** @type {Set<string>} */
  const found = new Set()

  /**
   * @param {string} dir
   * @param {number} depth
   */
  function walk(dir, depth) {
    if (depth > 24) return
    let ents
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
          if (isAbiPinnedPackageName(name)) found.add(name)
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

/**
 * @param {string} root
 * @throws {Error} when ABI-pinned packages are present
 */
export function assertNoAbiPinnedInTree(root) {
  const found = findAbiPinnedInTree(root)
  if (found.length) {
    throw new Error(
      `ABI-pinned packages must not ship in hot-update packs (found: ${found.join(', ')}). `
        + 'Provide them via Docker vendor ($OPPTRIX_VENDOR_NODE_MODULES) and raise minBaseImage.',
    )
  }
  return true
}

/**
 * Tar --exclude args for ABI-pinned top-level package dirs (best-effort; CI also asserts).
 * @returns {string[]}
 */
export function abiPinnedTarExcludeArgs() {
  /** @type {string[]} */
  const args = []
  for (const name of ABI_PINNED_PACKAGE_NAMES) {
    args.push(`--exclude=**/node_modules/${name}`)
    args.push(`--exclude=node_modules/${name}`)
  }
  for (const prefix of ABI_PINNED_NAME_PREFIXES) {
    void prefix
  }
  args.push('--exclude=**/node_modules/@img/sharp-*')
  args.push('--exclude=**/node_modules/@napi-rs/canvas-*')
  args.push('--exclude=**/node_modules/@node-llama-cpp')
  return args
}
