/**
 * Ensure a full Opptrix source tree exists for Docker build context.
 * npm package ships CLI + compose templates; image build still needs apps/packages/client-ui.
 *
 * Clone remotes (see resolveGitCloneUrls):
 *   cn      → Gitee first, then GitHub
 *   foreign → GitHub first, then Gitee
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { resolveGitCloneUrls } from './mirrors.mjs'
import {
  isFullSourceTree,
  readPackageMeta,
  resolveBundleRoot,
  resolveDeployRoot,
  resolvePackageRoot,
} from './paths.mjs'

function log(msg) {
  console.log(`[opptrix] ${msg}`)
}

function warn(msg) {
  console.warn(`[opptrix] WARN: ${msg}`)
}

/**
 * @param {string} root
 * @param {string} url
 * @param {string[]} refs
 * @returns {boolean}
 */
function tryCloneInto(root, url, refs) {
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(root), { recursive: true })

  for (const r of refs) {
    log(`git clone --branch ${r} ← ${url}`)
    const attempt = spawnSync(
      'git',
      ['clone', '--depth', '1', '--branch', r, url, root],
      { encoding: 'utf8', shell: false },
    )
    if (attempt.status === 0) {
      log(`已检出 ${r}`)
      return true
    }
    warn(`检出 ${r} 失败: ${(attempt.stderr || '').trim().slice(0, 200)}`)
    fs.rmSync(root, { recursive: true, force: true })
  }

  log(`git clone (default branch) ← ${url}`)
  const plain = spawnSync('git', ['clone', '--depth', '1', url, root], {
    encoding: 'utf8',
    shell: false,
  })
  if (plain.status === 0) return true
  warn(`clone 失败: ${(plain.stderr || '').trim().slice(0, 200)}`)
  fs.rmSync(root, { recursive: true, force: true })
  return false
}

/**
 * @param {string} root
 * @param {string[]} urls
 * @param {string[]} refs
 */
function cloneInto(root, urls, refs) {
  const errors = []
  for (const url of urls) {
    if (tryCloneInto(root, url, refs)) return
    errors.push(url)
  }
  throw new Error(
    `无法克隆 Opptrix 源码（已试: ${errors.join(', ')}）。\n`
      + `国内请确认可访问 Gitee；或设置 OPPTRIX_GIT_URL_OVERRIDE=…\n`
      + `手动: git clone ${urls[0]} ${root}`,
  )
}

/**
 * Overlay published compose/Dockerfile onto a clone (not when deploy root is this monorepo).
 * @param {string} root
 */
function overlayBundleCompose(root) {
  const bundle = resolveBundleRoot()
  if (!fs.existsSync(path.join(bundle, 'docker-compose.yml'))) return
  const pkgRoot = resolvePackageRoot()
  const mono = path.resolve(pkgRoot, '../..')
  if (path.resolve(root) === path.resolve(mono)) return

  for (const rel of ['docker-compose.yml', 'Dockerfile', 'compose.env.example', '.dockerignore']) {
    const src = path.join(bundle, rel)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(root, rel))
  }
  const epSrc = path.join(bundle, 'scripts', 'docker-entrypoint.sh')
  const epDest = path.join(root, 'scripts', 'docker-entrypoint.sh')
  if (fs.existsSync(epSrc)) {
    fs.mkdirSync(path.dirname(epDest), { recursive: true })
    fs.copyFileSync(epSrc, epDest)
  }
}

/**
 * @param {string} root
 * @param {{ mirror?: 'cn' | 'foreign' }} [opts]
 * @returns {string}
 */
export function ensureBuildContext(root = resolveDeployRoot(), opts = {}) {
  if (isFullSourceTree(root)) {
    return root
  }

  const mirror = opts.mirror || 'foreign'
  const meta = readPackageMeta()
  const urls = resolveGitCloneUrls(mirror)
  const preferred = process.env.OPPTRIX_GIT_REF
    || process.env.OPPTRIX_SELFHOST_REF
    || `selfhost-v${meta.version}`
  const refs = [...new Set([preferred, 'main'])]

  log(`clone mirror=${mirror} primary=${urls[0]}${urls[1] ? ` fallback=${urls[1]}` : ''}`)

  if (fs.existsSync(path.join(root, '.git'))) {
    log(`更新构建上下文 git pull → ${root}`)
    const pull = spawnSync('git', ['pull', '--ff-only'], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    })
    if (pull.status !== 0) {
      warn(`git pull 失败: ${(pull.stderr || pull.stdout || '').trim()}`)
    }
    if (isFullSourceTree(root)) {
      overlayBundleCompose(root)
      return root
    }
  }

  log(`Docker 构建需要完整源码树，正在克隆…`)
  cloneInto(root, urls, refs)

  if (!isFullSourceTree(root)) {
    throw new Error(`克隆后仍缺少 apps/packages/client-ui，请检查 ${root}`)
  }
  overlayBundleCompose(root)
  return root
}
