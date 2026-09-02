/**
 * Pure checks shared by scripts/audit-selfhost-release.mjs and tests.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  buildCheckUpdatePayload,
  buildReleasesManifest,
  resolveHotMultiArchUploadPlan,
} from './hot-cdn.mjs'

/**
 * @param {string} repoRoot
 */
export function verifyDockerBuildContext(repoRoot) {
  const root = path.resolve(repoRoot)
  const dockerfile = path.join(root, 'Dockerfile')
  if (!fs.existsSync(dockerfile)) {
    throw new Error('missing Dockerfile at repo root')
  }
  const df = fs.readFileSync(dockerfile, 'utf8')
  for (const rel of ['docker-compose.yml', 'apps', 'packages', 'client-ui', 'tsconfig.base.json']) {
    const p = path.join(root, rel)
    if (!fs.existsSync(p)) throw new Error(`missing build context path: ${rel}`)
  }
  if (/COPY.*(llms|sensevoice|\/models)/i.test(df)) {
    throw new Error('Dockerfile appears to COPY model paths — self-host image must stay model-free')
  }
  if (!df.includes('tsconfig.base.json')) {
    throw new Error('Dockerfile must COPY tsconfig.base.json')
  }
  if (!df.includes('opptrix-agent')) {
    throw new Error('Dockerfile missing opptrix-agent user (dual-user DAC)')
  }
  if (!df.includes('OPPTRIX_HOME=/opptrix')) {
    throw new Error('Dockerfile missing OPPTRIX_HOME=/opptrix default')
  }
  const entry = path.join(root, 'scripts/docker-entrypoint.sh')
  if (!fs.existsSync(entry)) {
    throw new Error('missing scripts/docker-entrypoint.sh')
  }
  return { ok: true, dockerfile }
}

/**
 * @param {string} selfhostDir  packages/selfhost
 */
export function verifySelfhostBundle(selfhostDir) {
  const root = path.resolve(selfhostDir)
  const bundle = path.join(root, 'bundle')
  const required = [
    'docker-compose.yml',
    'docker-compose.legacy-volumes.yml',
    'Dockerfile',
    'compose.env.example',
    '.dockerignore',
    'scripts/docker-entrypoint.sh',
    'scripts/runtime-update-cli.mjs',
    'BUILD.json',
  ]
  for (const rel of required) {
    const p = path.join(bundle, rel)
    if (!fs.existsSync(p)) throw new Error(`bundle missing ${rel}`)
  }
  const df = fs.readFileSync(path.join(bundle, 'Dockerfile'), 'utf8')
  if (!df.includes('opptrix-agent')) throw new Error('bundle Dockerfile missing opptrix-agent')
  const env = fs.readFileSync(path.join(bundle, 'compose.env.example'), 'utf8')
  if (!env.includes('OPPTRIX_HOME=/opptrix')) {
    throw new Error('compose.env.example missing OPPTRIX_HOME=/opptrix')
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  if (!pkg.bin?.opptrix) throw new Error('package.json missing bin.opptrix')
  if (pkg.name !== '@opptrix/selfhost') throw new Error(`unexpected package name ${pkg.name}`)
  return { ok: true, version: pkg.version, bundle }
}

/**
 * @param {string} distDir
 * @param {string} version
 * @param {string} [cdnBase]
 */
export function verifyRuntimePackLayout(distDir, version, cdnBase = 'https://update.opptrix.org') {
  const plan = resolveHotMultiArchUploadPlan(distDir, version)
  const payload = buildCheckUpdatePayload({
    version: plan.version,
    cdnBase,
    packages: plan.packages,
    description: { features: ['ci smoke'], fixes: [] },
    releases: [],
  })
  if (!payload.latest?.description) throw new Error('check-update payload missing latest.description')
  if (!payload.retention?.max) throw new Error('check-update payload missing retention.max')
  if (!Array.isArray(payload.releases)) throw new Error('check-update payload missing releases[]')
  const manifest = buildReleasesManifest({
    releases: [payload.latest],
  })
  if (manifest.releases.length !== 1) throw new Error('releases manifest unexpected length')
  return { ok: true, plan, payload, manifest }
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} version
 * @param {string[]} [requiredPlatforms]
 */
export function assertCheckUpdateSmokeShape(payload, version, requiredPlatforms) {
  const latest = payload.latest
  if (typeof latest !== 'object' || latest === null) {
    throw new Error('check-update missing latest')
  }
  const row = /** @type {Record<string, unknown>} */ (latest)
  if (row.version !== version) {
    throw new Error(`latest.version ${row.version} !== ${version}`)
  }
  const pkgs = row.packages
  if (typeof pkgs !== 'object' || pkgs === null) {
    throw new Error('latest.packages missing')
  }
  const platforms = requiredPlatforms ?? ['linux-x64', 'linux-arm64']
  for (const key of platforms) {
    const p = /** @type {Record<string, unknown>} */ (pkgs)[key]
    if (!p || typeof p.bin !== 'string' || !String(p.bin).includes(`opptrix-runtime-${key}-v${version}.bin`)) {
      throw new Error(`latest.packages.${key} missing or unexpected`)
    }
    const mirrors = p.mirrors
    if (typeof mirrors !== 'object' || mirrors === null) {
      throw new Error(`latest.packages.${key}.mirrors missing`)
    }
    const m = /** @type {Record<string, unknown>} */ (mirrors)
    const gh = m.github
    const ge = m.gitee
    if (typeof gh !== 'object' || gh === null || typeof ge !== 'object' || ge === null) {
      throw new Error(`latest.packages.${key}.mirrors.github/gitee missing`)
    }
  }
  if (platforms.includes('linux-x64')) {
    if (typeof row.bin !== 'string' || !String(row.bin).includes(`opptrix-runtime-v${version}.bin`)) {
      throw new Error('latest.bin legacy x64 URL unexpected')
    }
    const legacyMirrors = row.mirrors
    if (typeof legacyMirrors !== 'object' || legacyMirrors === null) {
      throw new Error('latest.mirrors missing')
    }
  }
  const desc = row.description
  if (typeof desc !== 'object' || desc === null) {
    throw new Error('latest.description missing')
  }
  if (!Array.isArray(payload.releases)) {
    throw new Error('releases[] missing')
  }
  return true
}
