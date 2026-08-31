/**
 * Build-mirror profiles for Opptrix Docker Compose self-host.
 * Shared by `opptrix` CLI and tests.
 */
import { spawnSync } from 'node:child_process'

/** @typedef {'cn' | 'foreign'} BuildMirrorProfile */

export const CN_MIRROR_DEFAULTS = Object.freeze({
  dockerImagePrefix: 'docker.m.daocloud.io/library/',
  npmRegistry: 'https://registry.npmmirror.com',
  aptMirror: 'mirrors.aliyun.com',
})

/** Official GHCR registry host (foreign / default pull). */
export const OFFICIAL_GHCR_HOST = 'ghcr.io'

/**
 * China GHCR pull mirrors (host only, no scheme).
 * Docs often show https://ghcr.nju.edu.cn/ — Docker image refs use the hostname.
 */
export const CN_GHCR_MIRROR_HOSTS = Object.freeze([
  'ghcr.nju.edu.cn',
  'ghcr.1ms.run',
])

/** Default git remotes for source clone (Docker build context). */
export const GIT_CLONE_DEFAULTS = Object.freeze({
  /** 国内默认：Gitee */
  cn: 'https://gitee.com/Travisun/Opptrix.git',
  /** 国外默认：GitHub */
  foreign: 'https://github.com/Travisun/Opptrix.git',
})

/**
 * Explicit cn | foreign (aliases). Does not run auto-detect.
 * @param {string | undefined} raw
 * @returns {BuildMirrorProfile}
 */
export function normalizeMirrorProfile(raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'foreign' || v === 'default' || v === 'hub' || v === 'overseas') {
    return 'foreign'
  }
  if (v === 'cn' || v === 'china' || v === 'domestic' || v === 'zh') {
    return 'cn'
  }
  throw new Error(`未知构建镜像配置：${raw}（请用 cn、foreign 或 auto）`)
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {boolean} [useSystemTimeZone] when true, also read Intl resolved zone
 * @returns {boolean}
 */
function localeSuggestsCn(env = process.env, useSystemTimeZone = true) {
  const blob = [env.TZ, env.LC_ALL, env.LANG, env.LANGUAGE, env.LC_TIME]
    .filter(Boolean)
    .join(' ')
  if (/Shanghai|Chongqing|Urumqi|Harbin|Kashgar|zh_CN|zh-CN|zh\.CN/i.test(blob)) {
    return true
  }
  if (!useSystemTimeZone) return false
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (/Asia\/(Shanghai|Chongqing|Urumqi|Harbin|Kashgar)/i.test(tz)) return true
  } catch {
    // ignore
  }
  return false
}

/**
 * Best-effort: can we open TCP to Docker Hub auth within timeout?
 * Unreachable → likely need CN mirrors.
 * @param {number} [timeoutMs]
 * @returns {boolean} true if reachable
 */
export function probeDockerHubAuth(timeoutMs = 2000) {
  const ms = Math.max(200, Math.min(timeoutMs, 8000))
  const script = `
const net=require('net');
const s=net.connect(443,'auth.docker.io',()=>{try{s.destroy()}catch{};process.exit(0)});
s.on('error',()=>process.exit(1));
setTimeout(()=>{try{s.destroy()}catch{};process.exit(1)},${ms});
`
  const r = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: ms + 800,
    windowsHide: true,
  })
  return r.status === 0
}

/**
 * Auto-detect cn vs foreign (aligned with scripts/bootstrap/linux.sh).
 *
 * Order: OPPTRIX_FORCE_CN / OPPTRIX_FORCE_FOREIGN → locale/TZ → Docker Hub TCP probe.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{
 *   probeNetwork?: boolean,
 *   probeFn?: () => boolean,
 *   useSystemTimeZone?: boolean,
 * }} [opts]
 * @returns {{ profile: BuildMirrorProfile, reason: string }}
 */
export function detectMirrorProfile(env = process.env, opts = {}) {
  if (env.OPPTRIX_FORCE_CN === '1' || env.OPPTRIX_FORCE_CN === 'true') {
    return { profile: 'cn', reason: 'OPPTRIX_FORCE_CN' }
  }
  if (env.OPPTRIX_FORCE_FOREIGN === '1' || env.OPPTRIX_FORCE_FOREIGN === 'true') {
    return { profile: 'foreign', reason: 'OPPTRIX_FORCE_FOREIGN' }
  }
  if (localeSuggestsCn(env, opts.useSystemTimeZone !== false)) {
    return { profile: 'cn', reason: 'locale/TZ' }
  }
  const probeNetwork = opts.probeNetwork !== false
  if (probeNetwork) {
    const ok = typeof opts.probeFn === 'function' ? opts.probeFn() : probeDockerHubAuth()
    if (!ok) {
      return { profile: 'cn', reason: 'docker-hub-unreachable' }
    }
  }
  return { profile: 'foreign', reason: 'default' }
}

/**
 * Resolve cn|foreign|auto|empty → concrete profile.
 * Empty / `auto` → {@link detectMirrorProfile}.
 *
 * @param {string | undefined | null} raw
 * @param {NodeJS.ProcessEnv} [env]
 * @param {Parameters<typeof detectMirrorProfile>[1]} [detectOpts]
 * @returns {{ profile: BuildMirrorProfile, reason: string, auto: boolean }}
 */
export function resolveMirrorProfile(raw, env = process.env, detectOpts) {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v || v === 'auto') {
    const d = detectMirrorProfile(env, detectOpts)
    return { profile: d.profile, reason: d.reason, auto: true }
  }
  return { profile: normalizeMirrorProfile(v), reason: 'explicit', auto: false }
}

/**
 * Ordered git clone URLs for a mirror profile (primary first, then fallback).
 * Env:
 *   OPPTRIX_GIT_URL_OVERRIDE — single URL, no fallback
 *   OPPTRIX_GIT_URL_CN / OPPTRIX_GIT_URL — override defaults
 *
 * @param {BuildMirrorProfile | string} profile
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function resolveGitCloneUrls(profile, env = process.env) {
  const override = env.OPPTRIX_GIT_URL_OVERRIDE?.trim()
  if (override) return [override]

  const normalized = resolveMirrorProfile(profile, env, { probeNetwork: false }).profile
  const cn = env.OPPTRIX_GIT_URL_CN?.trim() || GIT_CLONE_DEFAULTS.cn
  const foreign = env.OPPTRIX_GIT_URL?.trim() || GIT_CLONE_DEFAULTS.foreign

  if (normalized === 'cn') {
    return cn === foreign ? [cn] : [cn, foreign]
  }
  return foreign === cn ? [foreign] : [foreign, cn]
}

/**
 * @param {string} prefix
 * @returns {string}
 */
export function ensureTrailingSlash(prefix) {
  const p = String(prefix ?? '').trim()
  if (!p) return ''
  return p.endsWith('/') ? p : `${p}/`
}

/**
 * Resolve env vars for Compose build-args. Explicit process.env overrides win.
 * @param {BuildMirrorProfile | string} profile
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   profile: BuildMirrorProfile,
 *   OPPTRIX_DOCKER_IMAGE_PREFIX: string,
 *   OPPTRIX_NPM_REGISTRY: string,
 *   OPPTRIX_APT_MIRROR: string,
 * }}
 */
export function resolveBuildMirrorEnv(profile, env = process.env) {
  const normalized = resolveMirrorProfile(profile, env, { probeNetwork: false }).profile
  if (normalized === 'cn') {
    return {
      profile: 'cn',
      OPPTRIX_DOCKER_IMAGE_PREFIX: ensureTrailingSlash(
        env.OPPTRIX_DOCKER_IMAGE_PREFIX?.trim()
          || CN_MIRROR_DEFAULTS.dockerImagePrefix,
      ),
      OPPTRIX_NPM_REGISTRY: (
        env.OPPTRIX_NPM_REGISTRY?.trim()
        || CN_MIRROR_DEFAULTS.npmRegistry
      ),
      OPPTRIX_APT_MIRROR: (
        env.OPPTRIX_APT_MIRROR?.trim()
        || CN_MIRROR_DEFAULTS.aptMirror
      ),
    }
  }
  return {
    profile: 'foreign',
    OPPTRIX_DOCKER_IMAGE_PREFIX: env.OPPTRIX_DOCKER_IMAGE_PREFIX?.trim() || '',
    OPPTRIX_NPM_REGISTRY: env.OPPTRIX_NPM_REGISTRY?.trim() || '',
    OPPTRIX_APT_MIRROR: env.OPPTRIX_APT_MIRROR?.trim() || '',
  }
}

/**
 * TCP connect latency to host:443 (ms). Infinity when unreachable.
 * @param {string} host
 * @param {number} [timeoutMs]
 * @returns {{ host: string, ok: boolean, ms: number }}
 */
export function probeHostLatency(host, timeoutMs = 2500) {
  const h = String(host ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  if (!h) return { host: '', ok: false, ms: Number.POSITIVE_INFINITY }
  const msCap = Math.max(200, Math.min(timeoutMs, 10000))
  const started = Date.now()
  const script = `
const net=require('net');
const host=${JSON.stringify(h)};
const t0=Date.now();
const s=net.connect(443,host,()=>{const ms=Date.now()-t0;try{s.destroy()}catch{};process.stdout.write(String(ms));process.exit(0)});
s.on('error',()=>process.exit(1));
setTimeout(()=>{try{s.destroy()}catch{};process.exit(1)},${msCap});
`
  const r = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: msCap + 1000,
    windowsHide: true,
  })
  if (r.status !== 0) {
    return { host: h, ok: false, ms: Number.POSITIVE_INFINITY }
  }
  const parsed = Number.parseInt(String(r.stdout || '').trim(), 10)
  const ms = Number.isFinite(parsed) ? parsed : Date.now() - started
  return { host: h, ok: true, ms }
}

/**
 * @param {string} host
 */
export function normalizeRegistryHost(host) {
  return String(host ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .split('/')[0] || ''
}

/**
 * Replace registry host in `ghcr.io/owner/name` (or already-mirrored) → `newHost/owner/name`.
 * @param {string} repository no tag
 * @param {string} host
 */
export function applyRegistryHost(repository, host) {
  const repo = String(repository ?? '').trim().replace(/\/$/, '')
  const h = normalizeRegistryHost(host)
  if (!repo || !h) return repo
  const parts = repo.split('/')
  if (parts.length >= 2 && parts[0].includes('.')) {
    parts[0] = h
    return parts.join('/')
  }
  return `${h}/${repo}`
}

/**
 * Rank hosts by TCP latency (fastest first). Unreachable hosts sort last.
 * @param {string[]} hosts
 * @param {{
 *   probeFn?: (host: string) => { host: string, ok: boolean, ms: number },
 *   timeoutMs?: number,
 * }} [opts]
 * @returns {{
 *   ranked: string[],
 *   winner: string | null,
 *   results: Array<{ host: string, ok: boolean, ms: number }>,
 * }}
 */
export function rankHostsByLatency(hosts, opts = {}) {
  const list = [...new Set(
    (hosts || []).map(normalizeRegistryHost).filter(Boolean),
  )]
  const probe = typeof opts.probeFn === 'function'
    ? opts.probeFn
    : (host) => probeHostLatency(host, opts.timeoutMs)
  const results = list.map((host) => probe(host))
  const okSorted = [...results].filter((r) => r.ok).sort((a, b) => a.ms - b.ms)
  const failHosts = results.filter((r) => !r.ok).map((r) => r.host)
  const ranked = [...okSorted.map((r) => r.host), ...failHosts]
  return {
    ranked,
    winner: okSorted[0]?.host || null,
    results,
  }
}

/**
 * Resolve ordered GHCR pull repository bases (no tag) for a mirror profile.
 * - foreign → official ghcr.io/…
 * - cn → speed-test among NJU / 1ms.run (then optional official fallback)
 * Env:
 *   OPPTRIX_GHCR_MIRROR — force registry host (e.g. ghcr.nju.edu.cn)
 *   OPPTRIX_IMAGE_REPO — full repo override before host rewrite (still rewritten unless OPPTRIX_IMAGE set at CLI)
 *
 * @param {{
 *   profile: BuildMirrorProfile | string,
 *   imageRepository?: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   probeFn?: (host: string) => { host: string, ok: boolean, ms: number },
 *   includeOfficialFallback?: boolean,
 * }} opts
 * @returns {{
 *   profile: BuildMirrorProfile,
 *   repositories: string[],
 *   winnerHost: string,
 *   probeResults: Array<{ host: string, ok: boolean, ms: number }>,
 *   reason: string,
 * }}
 */
export function resolveGhcrPullRepositories(opts) {
  const env = opts.env || process.env
  const profile = resolveMirrorProfile(opts.profile, env, { probeNetwork: false }).profile
  const baseRepo = String(
    opts.imageRepository
      || env.OPPTRIX_IMAGE_REPO
      || 'ghcr.io/travisun/opptrix',
  )
    .trim()
    .replace(/\/$/, '') || 'ghcr.io/travisun/opptrix'

  const forced = normalizeRegistryHost(env.OPPTRIX_GHCR_MIRROR || '')
  if (forced) {
    const repo = applyRegistryHost(baseRepo, forced)
    return {
      profile,
      repositories: [repo],
      winnerHost: forced,
      probeResults: [],
      reason: 'OPPTRIX_GHCR_MIRROR',
    }
  }

  if (profile === 'foreign') {
    const repo = applyRegistryHost(baseRepo, OFFICIAL_GHCR_HOST)
    return {
      profile: 'foreign',
      repositories: [repo],
      winnerHost: OFFICIAL_GHCR_HOST,
      probeResults: [],
      reason: 'official-ghcr',
    }
  }

  const ranked = rankHostsByLatency([...CN_GHCR_MIRROR_HOSTS], {
    probeFn: opts.probeFn,
  })
  const includeOfficial = opts.includeOfficialFallback !== false
  /** @type {string[]} */
  const hosts = ranked.ranked.length
    ? [...ranked.ranked]
    : [...CN_GHCR_MIRROR_HOSTS]
  if (includeOfficial && !hosts.includes(OFFICIAL_GHCR_HOST)) {
    hosts.push(OFFICIAL_GHCR_HOST)
  }
  const repositories = [...new Set(hosts.map((h) => applyRegistryHost(baseRepo, h)))]
  const winnerHost = ranked.winner || hosts[0] || CN_GHCR_MIRROR_HOSTS[0]
  return {
    profile: 'cn',
    repositories,
    winnerHost,
    probeResults: ranked.results,
    reason: ranked.winner
      ? `cn-speed-test:${ranked.winner}`
      : 'cn-mirrors-try-ordered',
  }
}

/**
 * Format probe table for doctor / logs.
 * @param {Array<{ host: string, ok: boolean, ms: number }>} results
 */
export function formatGhcrProbeResults(results) {
  if (!results?.length) return '(skipped)'
  return results
    .map((r) => (r.ok ? `${r.host} ${r.ms}ms` : `${r.host} unreachable`))
    .join(' · ')
}
