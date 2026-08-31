/**
 * Self-host app release refs (opptrix-selfhost-v*) vs CLI npm tags (selfhost-v*).
 * Desktop tags (desktop-v*) are out of scope for this CLI.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Lowest installable self-host app snapshot (code constant; remote may lag). */
export const MIN_APP_TAG = 'opptrix-selfhost-v1.3.6'
export const MIN_APP_VERSION = '1.3.6'
export const APP_TAG_PREFIX = 'opptrix-selfhost-v'
export const RELEASE_CHANNEL_SELFHOST = 'selfhost'

/**
 * @param {string} version
 * @returns {number[] | null}
 */
export function parseSemver(version) {
  const m = String(version ?? '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} -1 | 0 | 1
 */
export function compareSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

/**
 * @param {string} ref
 * @returns {{ tag: string, version: string } | null}
 */
export function parseAppTag(ref) {
  const raw = String(ref ?? '').trim()
  if (!raw.startsWith(APP_TAG_PREFIX)) return null
  const version = raw.slice(APP_TAG_PREFIX.length)
  if (!parseSemver(version)) return null
  return { tag: raw, version }
}

/**
 * @param {string} ref
 */
export function isAppTag(ref) {
  return parseAppTag(ref) != null
}

/**
 * @param {string} ref
 * @param {string} [minVersion]
 */
export function isAppTagAtLeastMin(ref, minVersion = MIN_APP_VERSION) {
  const parsed = parseAppTag(ref)
  if (!parsed) return false
  return compareSemver(parsed.version, minVersion) >= 0
}

/**
 * @param {string} ref
 * @param {string} [minTag]
 */
export function assertAppTagAllowed(ref, minTag = MIN_APP_TAG) {
  const parsed = parseAppTag(ref)
  if (!parsed) return
  const min = parseAppTag(minTag)
  const minVer = min?.version || MIN_APP_VERSION
  if (compareSemver(parsed.version, minVer) < 0) {
    throw new Error(
      `应用快照 ${parsed.tag} 低于最低可用版本 ${minTag}，无法安装。`
        + `请执行 opptrix tags 查看可用版本，或改用合格 tag。`,
    )
  }
}

/**
 * Read opptrixSelfhost block from package.json (with defaults).
 * @param {{ version?: string, opptrixSelfhost?: { minAppTag?: string, preferredAppTag?: string } } | null | undefined} pkg
 */
export function readAppTagMeta(pkg) {
  const block = pkg && typeof pkg === 'object' ? pkg.opptrixSelfhost : null
  const minAppTag = (
    block && typeof block.minAppTag === 'string' && block.minAppTag.trim()
  ) || MIN_APP_TAG
  let preferredAppTag = (
    block && typeof block.preferredAppTag === 'string' && block.preferredAppTag.trim()
  ) || ''
  if (!preferredAppTag) preferredAppTag = minAppTag
  return {
    minAppTag,
    preferredAppTag,
    minVersion: parseAppTag(minAppTag)?.version || MIN_APP_VERSION,
  }
}

/**
 * @typedef {{
 *   ref: string,
 *   source: 'cli' | 'env' | 'config' | 'preferred',
 *   explicit: boolean,
 * }} ResolvedAppRef
 */

/**
 * Resolve which git ref to install.
 * Order: cliRef → OPPTRIX_GIT_REF → OPPTRIX_APP_REF → hostConfig.appRef → preferredAppTag.
 * `main` / non-app refs allowed only when source is cli|env|config (user-chosen), never from preferred alone.
 *
 * @param {{
 *   cliRef?: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   hostConfig?: { appRef?: string },
 *   preferredAppTag?: string,
 *   minAppTag?: string,
 * }} opts
 * @returns {ResolvedAppRef}
 */
export function resolveAppRef(opts = {}) {
  const env = opts.env || process.env
  const minAppTag = opts.minAppTag || MIN_APP_TAG
  const preferred = (opts.preferredAppTag || minAppTag).trim() || MIN_APP_TAG

  /** @type {{ ref: string, source: ResolvedAppRef['source'], explicit: boolean }[]} */
  const candidates = []
  const cli = opts.cliRef != null ? String(opts.cliRef).trim() : ''
  if (cli) candidates.push({ ref: cli, source: 'cli', explicit: true })

  const gitEnv = env.OPPTRIX_GIT_REF?.trim()
  if (gitEnv) candidates.push({ ref: gitEnv, source: 'env', explicit: true })

  const appEnv = env.OPPTRIX_APP_REF?.trim()
  if (appEnv) candidates.push({ ref: appEnv, source: 'env', explicit: true })

  const cfgRef = opts.hostConfig?.appRef != null
    ? String(opts.hostConfig.appRef).trim()
    : ''
  if (cfgRef) candidates.push({ ref: cfgRef, source: 'config', explicit: true })

  candidates.push({ ref: preferred, source: 'preferred', explicit: false })

  const chosen = candidates[0]
  assertAppTagAllowed(chosen.ref, minAppTag)

  if (!chosen.explicit) {
    const parsed = parseAppTag(chosen.ref)
    if (!parsed) {
      throw new Error(
        `默认应用快照无效（${chosen.ref}）。请执行 opptrix tags 选择版本，`
          + `或显式指定 --ref / OPPTRIX_GIT_REF（使用 main 需自行承担风险）。`,
      )
    }
  }

  return chosen
}

/**
 * Build release identity env for Compose / runtime.
 * @param {string} ref
 * @param {{ root?: string, shortSha?: string | null }} [opts]
 * @returns {{
 *   OPPTRIX_APP_VERSION: string,
 *   OPPTRIX_RELEASE_CHANNEL: string,
 *   OPPTRIX_RELEASE_TAG: string,
 * }}
 */
export function resolveReleaseIdentity(ref, opts = {}) {
  const parsed = parseAppTag(ref)
  if (parsed) {
    return {
      OPPTRIX_APP_VERSION: parsed.version,
      OPPTRIX_RELEASE_CHANNEL: RELEASE_CHANNEL_SELFHOST,
      OPPTRIX_RELEASE_TAG: parsed.tag,
    }
  }

  let version = 'unknown'
  const root = opts.root
  if (root) {
    try {
      const pkgPath = path.join(root, 'apps', 'desktop', 'package.json')
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        if (typeof pkg.version === 'string' && pkg.version.trim()) {
          version = pkg.version.trim()
        }
      }
    } catch {
      // keep unknown
    }
  }

  const sha = opts.shortSha ? String(opts.shortSha).trim() : ''
  const releaseTag = ref === 'main' && sha
    ? `main@${sha.slice(0, 7)}`
    : String(ref || 'main')

  return {
    OPPTRIX_APP_VERSION: version,
    OPPTRIX_RELEASE_CHANNEL: RELEASE_CHANNEL_SELFHOST,
    OPPTRIX_RELEASE_TAG: releaseTag,
  }
}

/**
 * @param {string} url
 * @returns {string[]}
 */
export function lsRemoteAppTags(url) {
  const r = spawnSync(
    'git',
    ['ls-remote', '--tags', '--refs', url],
    { encoding: 'utf8', shell: false, timeout: 60_000 },
  )
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim().slice(0, 300)
    throw new Error(`无法读取远端标签（${url}）：${err || `exit ${r.status}`}`)
  }
  /** @type {string[]} */
  const tags = []
  for (const line of (r.stdout || '').split('\n')) {
    const m = line.match(/\trefs\/tags\/(.+)$/)
    if (!m) continue
    const tag = m[1]
    if (parseAppTag(tag)) tags.push(tag)
  }
  return tags
}

/**
 * @param {string[]} urls
 * @param {{ minVersion?: string }} [opts]
 * @returns {{ tags: string[], url: string }}
 */
export function fetchAppTagNames(urls, opts = {}) {
  const minVersion = opts.minVersion || MIN_APP_VERSION
  const errors = []
  for (const url of urls) {
    try {
      const all = lsRemoteAppTags(url)
      const tags = all
        .filter((t) => isAppTagAtLeastMin(t, minVersion))
        .sort((a, b) => {
          const va = parseAppTag(a)?.version || '0.0.0'
          const vb = parseAppTag(b)?.version || '0.0.0'
          return compareSemver(vb, va)
        })
      return { tags, url }
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : err}`)
    }
  }
  throw new Error(
    `无法列出应用版本（网络或镜像不可达）。\n`
      + errors.map((e) => `  · ${e}`).join('\n')
      + `\n可采取：换 --mirror cn|foreign、检查网络，或设置 OPPTRIX_GIT_URL_OVERRIDE。`,
  )
}

/**
 * Enrich tags with creatordate / committerdate (ISO) via temporary fetch.
 * Best-effort; missing dates become ''.
 *
 * @param {string} url
 * @param {string[]} tags
 * @returns {Map<string, string>}
 */
export function fetchAppTagDates(url, tags) {
  /** @type {Map<string, string>} */
  const dates = new Map()
  if (!tags.length) return dates

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-tags-'))
  try {
    let r = spawnSync('git', ['init', '--bare'], {
      cwd: tmp,
      encoding: 'utf8',
      shell: false,
    })
    if (r.status !== 0) return dates

    const refspecs = tags.map((t) => `refs/tags/${t}:refs/tags/${t}`)
    r = spawnSync(
      'git',
      ['fetch', '--depth', '1', '--no-tags', url, ...refspecs],
      { cwd: tmp, encoding: 'utf8', shell: false, timeout: 120_000 },
    )
    if (r.status !== 0) {
      // Partial failure is OK — try for-each-ref anyway for what landed
    }

    r = spawnSync(
      'git',
      [
        'for-each-ref',
        '--format=%(refname:short)|%(creatordate:iso-strict)|%(committerdate:iso-strict)',
        'refs/tags/',
      ],
      { cwd: tmp, encoding: 'utf8', shell: false },
    )
    if (r.status !== 0) return dates
    for (const line of (r.stdout || '').split('\n')) {
      if (!line.trim()) continue
      const [tag, creator, committer] = line.split('|')
      if (!tag) continue
      const iso = (creator && creator !== '') ? creator : (committer || '')
      dates.set(tag, iso)
    }
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
  return dates
}

/**
 * @param {'upgrade' | 'rollback' | 'current' | 'other'} relation
 */
function relationLabel(relation) {
  switch (relation) {
    case 'upgrade':
      return '可升级'
    case 'rollback':
      return '可回退'
    case 'current':
      return '当前'
    default:
      return ''
  }
}

/**
 * @param {string} tag
 * @param {string | null | undefined} currentRef
 * @returns {'upgrade' | 'rollback' | 'current' | 'other'}
 */
export function classifyTagRelation(tag, currentRef) {
  const cur = String(currentRef || '').trim()
  if (!cur) return 'other'
  if (cur === tag) return 'current'
  const a = parseAppTag(tag)
  const b = parseAppTag(cur)
  if (!a || !b) return 'other'
  const cmp = compareSemver(a.version, b.version)
  if (cmp > 0) return 'upgrade'
  if (cmp < 0) return 'rollback'
  return 'current'
}

/**
 * @typedef {{
 *   tag: string,
 *   version: string,
 *   date: string,
 *   relation: 'upgrade' | 'rollback' | 'current' | 'other',
 *   relationLabel: string,
 * }} AppTagRow
 */

/**
 * @param {{
 *   urls: string[],
 *   currentRef?: string | null,
 *   minVersion?: string,
 *   withDates?: boolean,
 * }} opts
 * @returns {{ rows: AppTagRow[], url: string }}
 */
export function listAppTags(opts) {
  const { tags, url } = fetchAppTagNames(opts.urls, { minVersion: opts.minVersion })
  const dates = opts.withDates === false
    ? new Map()
    : fetchAppTagDates(url, tags)

  /** @type {AppTagRow[]} */
  const rows = tags.map((tag) => {
    const version = parseAppTag(tag)?.version || ''
    const relation = classifyTagRelation(tag, opts.currentRef)
    return {
      tag,
      version,
      date: dates.get(tag) || '',
      relation,
      relationLabel: relationLabel(relation),
    }
  })
  return { rows, url }
}

/**
 * Short HEAD sha for releaseTag when on a branch.
 * @param {string} root
 * @returns {string | null}
 */
export function readShortSha(root) {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  })
  if (r.status !== 0) return null
  const sha = (r.stdout || '').trim()
  return sha || null
}
