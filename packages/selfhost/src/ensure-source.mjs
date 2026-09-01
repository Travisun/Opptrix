/**
 * Ensure a full Opptrix source tree exists for Docker build context.
 * npm package ships CLI + compose templates; local image build still needs apps/packages/client-ui.
 * Prebuilt GHCR path only needs a thin deploy (compose/Dockerfile overlay) — see ensureThinDeploy.
 *
 * App snapshots use `opptrix-selfhost-v*` tags (not CLI `selfhost-v*` / not silent main).
 * Clone remotes (see resolveGitCloneUrls):
 *   cn      → Gitee first, then GitHub
 *   foreign → GitHub first, then Gitee
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  assertAppTagAllowed,
  parseAppTag,
  readShortSha,
  resolveAppRef,
  resolveReleaseIdentity,
} from './app-refs.mjs'
import { resolveGitCloneUrls } from './mirrors.mjs'
import {
  isFullSourceTree,
  readHostConfig,
  readPackageMeta,
  resolveBundleRoot,
  resolveDeployRoot,
  resolvePackageRoot,
} from './paths.mjs'

/** Operator state that must survive thin→full clone fallback. */
const PRESERVE_ON_CLONE = [
  'compose.env',
  '.env',
  '.opptrix.json',
  '.opptrix-host.json',
  'docker-compose.override.yml',
]

function log(msg) {
  console.log(`[opptrix] ${msg}`)
}

function warn(msg) {
  console.warn(`[opptrix] WARN: ${msg}`)
}

/**
 * True when deploy root is this checkout's monorepo (do not force tag checkout).
 * @param {string} root
 */
export function isDevMonorepoRoot(root) {
  const pkgRoot = resolvePackageRoot()
  const mono = path.resolve(pkgRoot, '../..')
  return path.resolve(root) === mono
}

/**
 * @param {string} root
 * @returns {{ dir: string, files: string[] } | null}
 */
function stashOperatorState(root) {
  /** @type {string[]} */
  const files = []
  for (const rel of PRESERVE_ON_CLONE) {
    const p = path.join(root, rel)
    if (fs.existsSync(p)) files.push(rel)
  }
  if (!files.length) return null
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-state-'))
  for (const rel of files) {
    fs.copyFileSync(path.join(root, rel), path.join(dir, rel))
  }
  return { dir, files }
}

/**
 * @param {string} root
 * @param {{ dir: string, files: string[] } | null} stash
 */
function restoreOperatorState(root, stash) {
  if (!stash) return
  try {
    for (const rel of stash.files) {
      const from = path.join(stash.dir, rel)
      if (fs.existsSync(from)) {
        fs.copyFileSync(from, path.join(root, rel))
      }
    }
  } finally {
    try {
      fs.rmSync(stash.dir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

/**
 * @param {string} root
 * @param {string} ref
 * @returns {boolean}
 */
export function syncCheckout(root, ref) {
  if (!fs.existsSync(path.join(root, '.git'))) return false

  if (ref === 'main' || (!parseAppTag(ref) && !ref.startsWith('opptrix-selfhost-v'))) {
    log(`同步分支 ${ref}（fetch + pull）→ ${root}`)
    const fetch = spawnSync('git', ['fetch', 'origin', ref], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    })
    if (fetch.status !== 0) {
      warn(`git fetch 失败: ${(fetch.stderr || fetch.stdout || '').trim().slice(0, 200)}`)
    }
    const checkout = spawnSync('git', ['checkout', ref], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    })
    if (checkout.status !== 0) {
      warn(`git checkout ${ref} 失败: ${(checkout.stderr || '').trim().slice(0, 200)}`)
      return false
    }
    const pull = spawnSync('git', ['pull', '--ff-only', 'origin', ref], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    })
    if (pull.status !== 0) {
      warn(`git pull 失败: ${(pull.stderr || pull.stdout || '').trim().slice(0, 200)}`)
      return false
    }
    return true
  }

  log(`检出应用快照 ${ref} → ${root}`)
  const fetchTag = spawnSync(
    'git',
    ['fetch', 'origin', `refs/tags/${ref}:refs/tags/${ref}`, '--force'],
    { cwd: root, encoding: 'utf8', shell: false },
  )
  if (fetchTag.status !== 0) {
    // try remote-tracking fetch without force-local
    const alt = spawnSync('git', ['fetch', '--tags', 'origin', ref], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    })
    if (alt.status !== 0) {
      warn(`获取标签失败: ${(fetchTag.stderr || alt.stderr || '').trim().slice(0, 200)}`)
      return false
    }
  }
  const checkout = spawnSync('git', ['checkout', '--force', ref], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  })
  if (checkout.status !== 0) {
    warn(`检出 ${ref} 失败: ${(checkout.stderr || '').trim().slice(0, 200)}`)
    return false
  }
  log(`已检出 ${ref}`)
  return true
}

/**
 * @param {string} root
 * @param {string} url
 * @param {string} ref
 * @returns {boolean}
 */
function tryCloneRef(root, url, ref) {
  const stash = stashOperatorState(root)
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(root), { recursive: true })
  log(`git clone --branch ${ref} ← ${url}`)
  const attempt = spawnSync(
    'git',
    ['clone', '--depth', '1', '--branch', ref, url, root],
    { encoding: 'utf8', shell: false },
  )
  if (attempt.status === 0) {
    restoreOperatorState(root, stash)
    log(`已检出 ${ref}`)
    return true
  }
  warn(`检出 ${ref} 失败: ${(attempt.stderr || '').trim().slice(0, 200)}`)
  // Restore operator state into a recreated empty root so compose.env is not lost
  fs.mkdirSync(root, { recursive: true })
  restoreOperatorState(root, stash)
  return false
}

/**
 * Clone exact ref only — never silent fallback to main.
 * @param {string} root
 * @param {string[]} urls
 * @param {string} ref
 */
function cloneInto(root, urls, ref) {
  const errors = []
  for (const url of urls) {
    if (tryCloneRef(root, url, ref)) return
    errors.push(url)
  }
  throw new Error(
    `无法获取应用快照 ${ref}（已试: ${errors.join(', ')}）。\n`
      + `请执行 opptrix tags 查看可用版本；确认网络或换 --mirror。\n`
      + `若需跟踪开发分支，请显式指定 --ref main 或 OPPTRIX_GIT_REF=main（风险自担）。\n`
      + `手动: git clone --branch ${ref} ${urls[0]} ${root}`,
  )
}

/**
 * Overlay published compose/Dockerfile onto a clone (not when deploy root is this monorepo).
 * Never touches user state: `compose.env`, `.env`, `.opptrix.json`, `docker-compose.override.yml`
 * (operator mounts/config). Named Docker volumes are outside this tree and also preserved.
 * @param {string} root
 */
export function overlayBundleCompose(root) {
  const bundle = resolveBundleRoot()
  if (!fs.existsSync(path.join(bundle, 'docker-compose.yml'))) return
  if (isDevMonorepoRoot(root)) return

  for (const rel of ['docker-compose.yml', 'docker-compose.legacy-volumes.yml', 'Dockerfile', 'compose.env.example', '.dockerignore']) {
    const src = path.join(bundle, rel)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(root, rel))
  }
  const epSrc = path.join(bundle, 'scripts', 'docker-entrypoint.sh')
  const epDest = path.join(root, 'scripts', 'docker-entrypoint.sh')
  if (fs.existsSync(epSrc)) {
    fs.mkdirSync(path.dirname(epDest), { recursive: true })
    fs.copyFileSync(epSrc, epDest)
  }
  for (const name of ['system-boot.mjs', 'opptrix-node-supervisor.mjs']) {
    const src = path.join(bundle, 'scripts', name)
    const dest = path.join(root, 'scripts', name)
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
    }
  }
}

/**
 * Thin deploy: compose/Dockerfile only (no git clone). Used for prebuilt image pull path.
 * @param {string} [root]
 * @returns {string}
 */
export function ensureThinDeploy(root = resolveDeployRoot()) {
  fs.mkdirSync(root, { recursive: true })
  overlayBundleCompose(root)
  if (!fs.existsSync(path.join(root, 'docker-compose.yml'))) {
    throw new Error(
      `缺少 docker-compose.yml。请确认 @opptrix/selfhost 包已执行 build（含 bundle），或设置 OPPTRIX_DEPLOY_DIR。`,
    )
  }
  return root
}

/**
 * Resolve app ref for this ensure invocation.
 * @param {{
 *   ref?: string | null,
 *   root?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} [opts]
 */
export function resolveEnsureAppRef(opts = {}) {
  const root = opts.root || resolveDeployRoot()
  const meta = readPackageMeta()
  const hostConfig = readHostConfig(root)
  return resolveAppRef({
    cliRef: opts.ref,
    env: opts.env || process.env,
    hostConfig,
    preferredAppTag: meta.preferredAppTag,
    minAppTag: meta.minAppTag,
  })
}

/**
 * @param {string} [root]
 * @param {{
 *   mirror?: 'cn' | 'foreign',
 *   ref?: string | null,
 *   env?: NodeJS.ProcessEnv,
 * }} [opts]
 * @returns {string}
 */
export function ensureBuildContext(root = resolveDeployRoot(), opts = {}) {
  const mirror = opts.mirror || 'foreign'
  const resolved = resolveEnsureAppRef({ root, ref: opts.ref, env: opts.env })
  assertAppTagAllowed(resolved.ref, readPackageMeta().minAppTag)

  const urls = resolveGitCloneUrls(mirror, opts.env || process.env)
  log(
    `应用源码 ref=${resolved.ref}（来源 ${resolved.source}`
      + `${resolved.explicit ? '·显式' : '·默认'}） mirror=${mirror}`
      + ` primary=${urls[0]}${urls[1] ? ` fallback=${urls[1]}` : ''}`,
  )

  if (isFullSourceTree(root)) {
    if (!isDevMonorepoRoot(root) && fs.existsSync(path.join(root, '.git'))) {
      const ok = syncCheckout(root, resolved.ref)
      if (!ok && parseAppTag(resolved.ref)) {
        throw new Error(
          `无法检出 ${resolved.ref}。请执行 opptrix tags 确认远端标签，或换 --mirror / 检查网络。`,
        )
      }
    }
    overlayBundleCompose(root)
    return root
  }

  if (fs.existsSync(path.join(root, '.git'))) {
    const ok = syncCheckout(root, resolved.ref)
    if (ok && isFullSourceTree(root)) {
      overlayBundleCompose(root)
      return root
    }
    warn('现有目录无法对齐到目标版本，将重新克隆…')
  }

  log('Docker 构建需要完整源码树，正在克隆…')
  cloneInto(root, urls, resolved.ref)

  if (!isFullSourceTree(root)) {
    throw new Error(`克隆后仍缺少 apps/packages/client-ui，请检查 ${root}`)
  }
  overlayBundleCompose(root)
  return root
}

/**
 * Env injected into Compose for runtime version/channel identification.
 * @param {string} root
 * @param {string} ref
 */
export function buildReleaseEnv(root, ref) {
  const sha = ref === 'main' || !parseAppTag(ref) ? readShortSha(root) : null
  return resolveReleaseIdentity(ref, { root, shortSha: sha })
}
