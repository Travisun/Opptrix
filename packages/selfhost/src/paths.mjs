/**
 * Deploy root + host config for @opptrix/selfhost.
 * Prefer: OPPTRIX_DEPLOY_DIR → monorepo / full clone → ~/.opptrix/instances/default
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/** Package install root (…/node_modules/@opptrix/selfhost or …/packages/selfhost) */
export function resolvePackageRoot() {
  return path.resolve(__dirname, '..')
}

export function resolveBundleRoot(pkgRoot = resolvePackageRoot()) {
  return path.join(pkgRoot, 'bundle')
}

/**
 * @returns {{ name: string, version: string }}
 */
export function readPackageMeta(pkgRoot = resolvePackageRoot()) {
  const pkg = require(path.join(pkgRoot, 'package.json'))
  return { name: String(pkg.name || '@opptrix/selfhost'), version: String(pkg.version || '0.0.0') }
}

/**
 * True when dir can serve as Docker build context (Dockerfile COPY needs apps/packages/…).
 * @param {string} dir
 */
export function isFullSourceTree(dir) {
  return (
    fs.existsSync(path.join(dir, 'docker-compose.yml'))
    && fs.existsSync(path.join(dir, 'Dockerfile'))
    && fs.existsSync(path.join(dir, 'packages'))
    && fs.existsSync(path.join(dir, 'apps'))
    && fs.existsSync(path.join(dir, 'client-ui'))
  )
}

/**
 * True when dir has compose files only (npm bundle / thin tree).
 * @param {string} dir
 */
export function hasComposeFiles(dir) {
  return (
    fs.existsSync(path.join(dir, 'docker-compose.yml'))
    && fs.existsSync(path.join(dir, 'Dockerfile'))
    && fs.existsSync(path.join(dir, 'compose.env.example'))
  )
}

/**
 * Walk upward from start looking for a full monorepo / clone.
 * @param {string} start
 * @param {number} [maxHops]
 */
export function findFullSourceTree(start, maxHops = 8) {
  let cur = path.resolve(start)
  for (let i = 0; i < maxHops; i++) {
    if (isFullSourceTree(cur)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

function defaultInstanceDir() {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (!home) return path.join(process.cwd(), '.opptrix-instance')
  return path.join(home, '.opptrix', 'instances', 'default')
}

/**
 * Directory where `docker compose` runs (must be a full source tree for --build).
 * Alias kept for older call sites.
 */
export function resolveRepoRoot() {
  return resolveDeployRoot()
}

/**
 * @returns {string}
 */
export function resolveDeployRoot() {
  const fromEnv = process.env.OPPTRIX_DEPLOY_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)

  const fromCwd = findFullSourceTree(process.cwd())
  if (fromCwd) return fromCwd

  const pkgRoot = resolvePackageRoot()
  const fromPkg = findFullSourceTree(pkgRoot)
  if (fromPkg) return fromPkg

  return defaultInstanceDir()
}

/**
 * Prefer package bundle compose.env.example when deploy root lacks one (rare).
 * @param {string} root
 */
export function composeEnvExamplePath(root = resolveDeployRoot()) {
  const local = path.join(root, 'compose.env.example')
  if (fs.existsSync(local)) return local
  const bundled = path.join(resolveBundleRoot(), 'compose.env.example')
  return bundled
}

export function composeEnvPath(root = resolveDeployRoot()) {
  return path.join(root, 'compose.env')
}

export function projectEnvPath(root = resolveDeployRoot()) {
  return path.join(root, '.env')
}

export function hostConfigPath(root = resolveDeployRoot()) {
  return path.join(root, '.opptrix.json')
}

/** @deprecated Prefer `.opptrix.json` */
export function legacyHostConfigPath(root = resolveDeployRoot()) {
  return path.join(root, '.opptrix-host.json')
}

/**
 * @param {string} root
 * @returns {{ mirror?: string, skipModels?: boolean }}
 */
export function readHostConfig(root = resolveDeployRoot()) {
  for (const p of [hostConfigPath(root), legacyHostConfigPath(root)]) {
    try {
      const raw = fs.readFileSync(p, 'utf8')
      const data = JSON.parse(raw)
      if (!data || typeof data !== 'object') continue
      return /** @type {{ mirror?: string, skipModels?: boolean }} */ (data)
    } catch {
      // try next
    }
  }
  return {}
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} patch
 */
export function writeHostConfig(root, patch) {
  const prev = readHostConfig(root)
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() }
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(hostConfigPath(root), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

export function ensureComposeEnv(root = resolveDeployRoot(), { force = false } = {}) {
  const dest = composeEnvPath(root)
  const src = composeEnvExamplePath(root)
  if (fs.existsSync(dest) && !force) {
    return { created: false, path: dest }
  }
  if (!fs.existsSync(src)) {
    throw new Error(`缺少 ${src}`)
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  return { created: true, path: dest }
}
