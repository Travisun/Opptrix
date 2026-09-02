/**
 * Adaptive runtime download mirror profile (cn ↔ foreign).
 * Aligned with packages/selfhost mirror detection; usable inside Docker runtime.
 */
import { spawnSync } from 'node:child_process'

export type UpdateMirrorProfile = 'cn' | 'foreign'

export interface MirrorProfileResult {
  profile: UpdateMirrorProfile
  reason: string
}

function localeSuggestsCn(env: NodeJS.ProcessEnv): boolean {
  const blob = [env.TZ, env.LC_ALL, env.LANG, env.LANGUAGE, env.LC_TIME]
    .filter(Boolean)
    .join(' ')
  if (/Shanghai|Chongqing|Urumqi|Harbin|Kashgar|zh_CN|zh-CN|zh\.CN/i.test(blob)) {
    return true
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (/Asia\/(Shanghai|Chongqing|Urumqi|Harbin|Kashgar)/i.test(tz)) return true
  } catch {
    // ignore
  }
  return false
}

export function probeDockerHubAuth(timeoutMs = 2000): boolean {
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

function normalizeExplicitProfile(raw: string): UpdateMirrorProfile | null {
  const v = raw.trim().toLowerCase()
  if (v === 'cn' || v === 'china' || v === 'domestic' || v === 'zh') return 'cn'
  if (v === 'foreign' || v === 'default' || v === 'hub' || v === 'overseas') return 'foreign'
  return null
}

export function resolveUpdateMirrorProfile(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { probeNetwork?: boolean; probeFn?: () => boolean },
): MirrorProfileResult {
  if (env.OPPTRIX_FORCE_CN === '1' || env.OPPTRIX_FORCE_CN === 'true') {
    return { profile: 'cn', reason: 'OPPTRIX_FORCE_CN' }
  }
  if (env.OPPTRIX_FORCE_FOREIGN === '1' || env.OPPTRIX_FORCE_FOREIGN === 'true') {
    return { profile: 'foreign', reason: 'OPPTRIX_FORCE_FOREIGN' }
  }

  const explicitRaw =
    env.OPPTRIX_UPDATE_MIRROR?.trim()
    || env.OPPTRIX_MIRROR?.trim()
    || ''
  const explicit = explicitRaw && explicitRaw.toLowerCase() !== 'auto'
    ? normalizeExplicitProfile(explicitRaw)
    : null
  if (explicit) {
    return { profile: explicit, reason: 'explicit' }
  }

  if (localeSuggestsCn(env)) {
    return { profile: 'cn', reason: 'locale/TZ' }
  }

  const probeNetwork = opts?.probeNetwork !== false
  if (probeNetwork) {
    const ok = typeof opts?.probeFn === 'function' ? opts.probeFn() : probeDockerHubAuth()
    if (!ok) {
      return { profile: 'cn', reason: 'docker-hub-unreachable' }
    }
  }

  return { profile: 'foreign', reason: 'default' }
}
