import { spawn, spawnSync } from 'node:child_process'
// spawnSync used by gitPull for tag fetch
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { resolveBuildMirrorEnv } from './mirrors.mjs'
import { composeEnvPath, readHostConfig, resolvePackageRoot, resolveRepoRoot } from './paths.mjs'
import { readComposeEnvMap } from './compose-env.mjs'

/**
 * @returns {{ ok: boolean, docker?: string, compose?: string, message: string }}
 */
export function detectDocker() {
  const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    shell: false,
  })
  if (docker.status !== 0) {
    return {
      ok: false,
      message:
        '未检测到可用的 Docker。Linux 服务器可运行 scripts/bootstrap/linux.sh；macOS/Windows 请自行安装 Docker 后重试。',
    }
  }
  const compose = spawnSync('docker', ['compose', 'version'], {
    encoding: 'utf8',
    shell: false,
  })
  if (compose.status !== 0) {
    return {
      ok: false,
      docker: docker.stdout.trim(),
      message: '已找到 Docker，但 `docker compose` 不可用。请升级到 Compose V2。',
    }
  }
  return {
    ok: true,
    docker: docker.stdout.trim(),
    compose: (compose.stdout || compose.stderr || '').trim().split('\n')[0],
    message: 'Docker 与 Compose 可用',
  }
}

/**
 * @param {string[]} args
 * @param {{
 *   root?: string,
 *   mirror?: import('./mirrors.mjs').BuildMirrorProfile,
 *   env?: NodeJS.ProcessEnv,
 *   skipModels?: boolean,
 *   inheritStdio?: boolean,
 *   releaseEnv?: Record<string, string>,
 * }} [opts]
 * @returns {Promise<number>}
 */
export function runCompose(args, opts = {}) {
  const root = opts.root || resolveRepoRoot()
  const mirror = opts.mirror || 'foreign'
  const mirrorEnv = resolveBuildMirrorEnv(mirror, opts.env || process.env)
  /** @type {NodeJS.ProcessEnv} */
  const env = {
    ...process.env,
    ...(opts.env || {}),
    OPPTRIX_DOCKER_IMAGE_PREFIX: mirrorEnv.OPPTRIX_DOCKER_IMAGE_PREFIX,
    OPPTRIX_NPM_REGISTRY: mirrorEnv.OPPTRIX_NPM_REGISTRY,
    OPPTRIX_APT_MIRROR: mirrorEnv.OPPTRIX_APT_MIRROR,
  }
  if (opts.releaseEnv) {
    Object.assign(env, opts.releaseEnv)
  }
  if (opts.skipModels === true) {
    env.OPPTRIX_SKIP_MODEL_FETCH = '1'
  }

  console.log(`[opptrix] mirror=${mirrorEnv.profile}`)
  if (mirrorEnv.profile === 'cn') {
    console.log(`[opptrix]   NODE_IMAGE_PREFIX=${mirrorEnv.OPPTRIX_DOCKER_IMAGE_PREFIX}`)
    console.log(`[opptrix]   NPM_REGISTRY=${mirrorEnv.OPPTRIX_NPM_REGISTRY}`)
    console.log(`[opptrix]   APT_MIRROR=${mirrorEnv.OPPTRIX_APT_MIRROR}`)
  }
  if (env.OPPTRIX_RELEASE_TAG) {
    console.log(
      `[opptrix] release channel=${env.OPPTRIX_RELEASE_CHANNEL || 'selfhost'}`
        + ` tag=${env.OPPTRIX_RELEASE_TAG}`
        + ` version=${env.OPPTRIX_APP_VERSION || ''}`,
    )
  }
  console.log(`[opptrix] docker compose ${args.join(' ')}`)

  const inherit = opts.inheritStdio !== false
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['compose', ...args], {
      cwd: root,
      env,
      stdio: inherit ? 'inherit' : 'pipe',
      shell: false,
      windowsHide: true,
    })
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}

/**
 * @param {string} [root]
 * @returns {{ url: string, proto: 'https' | 'http', port: number }}
 */
export function resolveHealthProbe(root = resolveRepoRoot()) {
  let port = 8712
  /** @type {'https' | 'http'} */
  let proto = 'https'
  try {
    const cfg = readHostConfig(root)
    if (typeof cfg.httpsPort === 'number' && cfg.httpsPort > 0) {
      port = cfg.httpsPort
      proto = 'https'
    }
    const envFile = composeEnvPath(root)
    if (fs.existsSync(envFile)) {
      const map = readComposeEnvMap(fs.readFileSync(envFile, 'utf8'))
      const httpsPort = Number(map.get('OPPTRIX_HOST_HTTPS_PORT') || '')
      if (Number.isInteger(httpsPort) && httpsPort > 0) {
        port = httpsPort
        proto = 'https'
      }
    }
  } catch {
    // keep defaults
  }
  return { url: `${proto}://127.0.0.1:${port}/api/health`, proto, port }
}

/**
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<{ status: number, body: string }>}
 */
function requestHealth(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const req = lib.get(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      (res) => {
        /** @type {Buffer[]} */
        const chunks = []
        res.on('data', (c) => chunks.push(Buffer.from(c)))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.on('error', reject)
  })
}

/**
 * @param {string} [root]
 * @returns {Promise<{ ok: boolean, status?: number, body?: string, error?: string, url?: string }>}
 */
export async function probeHealth(root = resolveRepoRoot()) {
  const { url } = resolveHealthProbe(root)
  try {
    const resp = await requestHealth(url, 8000)
    return { ok: resp.status >= 200 && resp.status < 300, status: resp.status, body: resp.body, url }
  } catch (err) {
    return {
      ok: false,
      url,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Checkout / pull a specific ref (update path). Prefer ensure-source.syncCheckout.
 * @param {string} root
 * @param {string} [ref]
 * @returns {Promise<number>}
 */
export function gitPull(root = resolveRepoRoot(), ref) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.join(root, '.git'))) {
      console.log('[opptrix] 当前目录不是 git 仓库，跳过源码同步（请自行更新后 build）')
      resolve(0)
      return
    }
    const target = ref || 'main'
    if (target === 'main' || !String(target).startsWith('opptrix-selfhost-v')) {
      const child = spawn('git', ['pull', '--ff-only', 'origin', target], {
        cwd: root,
        stdio: 'inherit',
        shell: false,
        windowsHide: true,
      })
      child.on('error', reject)
      child.on('close', (code) => resolve(code ?? 1))
      return
    }
    const fetch = spawnSync('git', ['fetch', 'origin', `refs/tags/${target}:refs/tags/${target}`, '--force'], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    })
    if (fetch.status !== 0) {
      console.warn(`[opptrix] WARN: 获取 ${target} 失败: ${(fetch.stderr || '').trim().slice(0, 200)}`)
    }
    const child = spawn('git', ['checkout', '--force', target], {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    })
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}

/**
 * Link @opptrix/selfhost so `opptrix` is on PATH (monorepo: link this package).
 * @param {string} [_root]
 */
export function npmLinkCli(_root = resolveRepoRoot()) {
  const pkgRoot = resolvePackageRoot()
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['link', '--no-fund', '--no-audit'], {
      cwd: pkgRoot,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    })
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}

/**
 * @param {string} [_root]
 */
export function npmUnlinkCli(_root = resolveRepoRoot()) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['unlink', '-g', '@opptrix/selfhost'], {
      cwd: resolvePackageRoot(),
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    })
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}
