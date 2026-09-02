#!/usr/bin/env node
/**
 * Probe CN vs foreign registry mirrors for Docker build / runtime.
 *
 * Build (Dockerfile MIRROR_AUTO=1):
 *   eval "$(node scripts/docker-select-mirrors.mjs --build-eval)"
 *
 * Runtime (entrypoint OPPTRIX_MIRROR_AUTO=1):
 *   eval "$(node scripts/docker-select-mirrors.mjs --runtime-eval)"
 *
 * Pure selection helpers are exported for unit tests.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/** @typedef {'cn' | 'foreign'} MirrorProfile */

/** @typedef {{ group: MirrorProfile, id: string, host: string }} ProbeTarget */

/** @typedef {{ group: MirrorProfile, id: string, host: string, ok: boolean, ms: number }} ProbeResult */

export const PROBE_TARGETS = Object.freeze(
  /** @type {ProbeTarget[]} */ ([
    { group: 'cn', id: 'npm', host: 'mirrors.huaweicloud.com' },
    { group: 'foreign', id: 'npm', host: 'registry.npmjs.org' },
    { group: 'cn', id: 'apt', host: 'mirrors.aliyun.com' },
    { group: 'foreign', id: 'apt', host: 'deb.debian.org' },
  ]),
)

/**
 * Keep in sync with packages/selfhost/src/mirrors.mjs CN_NPM_REGISTRY_CANDIDATES.
 * Huawei → Tencent → official (empty). Do not use npmmirror as primary.
 * Empty string = official registry.npmjs.org.
 */
export const CN_NPM_REGISTRY_CANDIDATES = Object.freeze([
  'https://mirrors.huaweicloud.com/repository/npm/',
  'https://mirrors.cloud.tencent.com/npm/',
  '',
])

/** Keep in sync with packages/selfhost/src/mirrors.mjs CN_MIRROR_DEFAULTS. */
export const CN_BUILD_MIRRORS = Object.freeze({
  // 1ms Hub library/ proxy (DaoCloud invalid for Hub; not bare host; not amd64/).
  dockerImagePrefix: 'docker.1ms.run/library/',
  // Huawei primary; see CN_NPM_REGISTRY_CANDIDATES for Tencent + official fallback.
  npmRegistry: 'https://mirrors.huaweicloud.com/repository/npm/',
  aptMirror: 'mirrors.aliyun.com',
  pipIndexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple',
})

export const FOREIGN_BUILD_MIRRORS = Object.freeze({
  dockerImagePrefix: '',
  npmRegistry: '',
  aptMirror: '',
  pipIndexUrl: '',
})

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
 * @param {ProbeTarget[]} [targets]
 * @param {{ probeFn?: (host: string) => { host: string, ok: boolean, ms: number }, timeoutMs?: number }} [opts]
 * @returns {ProbeResult[]}
 */
export function probeMirrorTargets(targets = PROBE_TARGETS, opts = {}) {
  const probe = typeof opts.probeFn === 'function'
    ? opts.probeFn
    : (host) => probeHostLatency(host, opts.timeoutMs)
  return targets.map((target) => {
    const r = probe(target.host)
    return {
      group: target.group,
      id: target.id,
      host: target.host,
      ok: r.ok,
      ms: r.ms,
    }
  })
}

/**
 * Normalize registry URL (empty = official npmjs).
 * @param {string} raw
 */
export function normalizeNpmRegistryUrl(raw) {
  const v = String(raw ?? '').trim()
  if (!v) return ''
  return v.endsWith('/') ? v : `${v}/`
}

/**
 * First CN npm candidate whose host:443 is reachable (empty = official, always ok).
 * @param {string[]} [candidates]
 * @param {{ probeFn?: (host: string) => { host: string, ok: boolean, ms: number } }} [opts]
 * @returns {{ registry: string, reason: string }}
 */
export function pickCnNpmRegistry(candidates = CN_NPM_REGISTRY_CANDIDATES, opts = {}) {
  const probe = typeof opts.probeFn === 'function' ? opts.probeFn : (host) => probeHostLatency(host)
  for (const raw of candidates) {
    const registry = normalizeNpmRegistryUrl(raw)
    if (!registry) {
      return { registry: '', reason: 'official-npmjs' }
    }
    const host = registry.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    const r = probe(host)
    if (r.ok) {
      return { registry, reason: `reachable:${host}` }
    }
  }
  return { registry: '', reason: 'all-candidates-unreachable' }
}

/**
 * Pick cn when CN endpoints are clearly faster; foreign when tied or CN unreachable.
 * @param {ProbeResult[]} results
 * @returns {MirrorProfile}
 */
export function selectMirrorProfile(results) {
  /** @type {Record<MirrorProfile, { sum: number, count: number }>} */
  const stats = {
    cn: { sum: 0, count: 0 },
    foreign: { sum: 0, count: 0 },
  }
  for (const row of results) {
    if (!row.ok || !Number.isFinite(row.ms)) continue
    stats[row.group].sum += row.ms
    stats[row.group].count += 1
  }
  const cnAvg = stats.cn.count ? stats.cn.sum / stats.cn.count : Number.POSITIVE_INFINITY
  const foreignAvg = stats.foreign.count
    ? stats.foreign.sum / stats.foreign.count
    : Number.POSITIVE_INFINITY
  if (cnAvg === Number.POSITIVE_INFINITY && foreignAvg === Number.POSITIVE_INFINITY) {
    return 'foreign'
  }
  if (foreignAvg === Number.POSITIVE_INFINITY) return 'cn'
  if (cnAvg === Number.POSITIVE_INFINITY) return 'foreign'
  // Prefer foreign when latencies are close (within 15%).
  return cnAvg < foreignAvg * 0.85 ? 'cn' : 'foreign'
}

/**
 * @param {MirrorProfile} profile
 * @returns {{
 *   profile: MirrorProfile,
 *   dockerImagePrefix: string,
 *   npmRegistry: string,
 *   aptMirror: string,
 *   pipIndexUrl: string,
 * }}
 */
export function mirrorsForProfile(profile) {
  if (profile === 'cn') {
    return { profile: 'cn', ...CN_BUILD_MIRRORS }
  }
  return { profile: 'foreign', ...FOREIGN_BUILD_MIRRORS }
}

/**
 * @param {ProbeResult[]} [results]
 * @param {{ probeNetwork?: boolean, probeFn?: (host: string) => { host: string, ok: boolean, ms: number } }} [opts]
 */
export function resolveDockerMirrors(opts = {}) {
  const probeNetwork = opts.probeNetwork !== false
  const results = probeNetwork
    ? probeMirrorTargets(PROBE_TARGETS, { probeFn: opts.probeFn })
    : []
  const profile = probeNetwork ? selectMirrorProfile(results) : 'foreign'
  const mirrors = mirrorsForProfile(profile)
  if (profile === 'cn' && probeNetwork) {
    const picked = pickCnNpmRegistry(CN_NPM_REGISTRY_CANDIDATES, { probeFn: opts.probeFn })
    mirrors.npmRegistry = picked.registry
  }
  return {
    profile,
    mirrors,
    probes: results,
  }
}

/**
 * @param {MirrorProfile} profile
 */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

/**
 * @param {'build' | 'runtime'} mode
 * @param {ReturnType<typeof resolveDockerMirrors>} resolved
 */
function formatEval(mode, resolved) {
  const { profile, mirrors } = resolved
  const lines = [`export OPPTRIX_MIRROR_PROFILE=${shellQuote(profile)}`]
  if (mode === 'build') {
    lines.push(`export APT_MIRROR=${shellQuote(mirrors.aptMirror)}`)
    lines.push(`export NPM_REGISTRY=${shellQuote(mirrors.npmRegistry)}`)
    lines.push(`export NODE_IMAGE_PREFIX=${shellQuote(mirrors.dockerImagePrefix)}`)
  } else {
    if (mirrors.pipIndexUrl) {
      lines.push(`export PIP_INDEX_URL=${shellQuote(mirrors.pipIndexUrl)}`)
    }
    if (mirrors.npmRegistry) {
      lines.push(`export NPM_CONFIG_REGISTRY=${shellQuote(mirrors.npmRegistry)}`)
    }
  }
  return `${lines.join('\n')}\n`
}

function main() {
  const args = new Set(process.argv.slice(2))
  const resolved = resolveDockerMirrors({
    probeNetwork: !args.has('--no-probe'),
    probeFn: args.has('--no-probe') ? () => ({ host: '', ok: false, ms: Number.POSITIVE_INFINITY }) : undefined,
  })

  if (args.has('--json')) {
    process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`)
    return
  }
  if (args.has('--build-eval')) {
    process.stdout.write(formatEval('build', resolved))
    return
  }
  if (args.has('--runtime-eval')) {
    process.stdout.write(formatEval('runtime', resolved))
    return
  }

  console.log(`docker-select-mirrors: profile=${resolved.profile}`)
  for (const row of resolved.probes) {
    const status = row.ok ? `${row.ms}ms` : 'unreachable'
    console.log(`  ${row.group}/${row.id} ${row.host} → ${status}`)
  }
}

const __filename = fileURLToPath(import.meta.url)
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isMain) {
  main()
}
