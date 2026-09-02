/**
 * Pure helpers for self-host lifecycle smoke (unit-testable without Docker).
 */
import { spawnSync } from 'node:child_process'

export const DEFAULT_LIFECYCLE_IMAGE = 'opptrix:local-smoke'
export const CI_LIFECYCLE_IMAGE = 'opptrix:ci-smoke'

/** Clean semver slots used by the lifecycle smoke. */
export const LIFECYCLE_APP_VERSIONS = Object.freeze({
  start: '1.0.0',
  hot: '1.0.1',
  base: '1.1.0',
})

export const LIFECYCLE_BASE_VERSIONS = Object.freeze({
  start: 'opptrix-selfhost-v1.0.0',
  next: 'opptrix-selfhost-v1.1.0',
})

export const LIFECYCLE_PORT_RANGE = Object.freeze({ min: 18711, max: 18999 })

/** Marker under OPPTRIX_HOME proving private data survives upgrades. */
export const LIFECYCLE_MARKER_REL = 'private/lifecycle-smoke-marker'
export const LIFECYCLE_MARKER_CONTENT = 'lifecycle-data-ok'

/**
 * @param {number} [pid]
 * @returns {{ container: string, volume: string }}
 */
export function resourceNames(pid = process.pid) {
  const id = Number.isFinite(pid) ? Math.trunc(pid) : 0
  return {
    container: `opptrix-lc-${id}-ctr`,
    volume: `opptrix-lc-${id}-vol`,
  }
}

/**
 * Pick a host publish port in [min, max] (inclusive).
 * @param {{ min?: number, max?: number, random?: () => number }} [opts]
 */
export function pickHostPort(opts = {}) {
  const min = opts.min ?? LIFECYCLE_PORT_RANGE.min
  const max = opts.max ?? LIFECYCLE_PORT_RANGE.max
  if (!(max >= min) || !Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error(`invalid port range: ${min}..${max}`)
  }
  const rand = typeof opts.random === 'function' ? opts.random() : Math.random()
  const span = max - min + 1
  return min + Math.floor(Math.min(Math.max(rand, 0), 0.999999) * span)
}

/**
 * @param {string} text
 * @returns {Record<string, unknown> | null}
 */
export function parseHealthBody(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return /** @type {Record<string, unknown>} */ (parsed)
  } catch {
    return null
  }
}

/**
 * @param {unknown} body
 */
export function isHealthOk(body) {
  return Boolean(
    body
    && typeof body === 'object'
    && !Array.isArray(body)
    && /** @type {{ status?: unknown }} */ (body).status === 'ok',
  )
}

/**
 * Classify activate-pending stderr/stdout.
 * @param {string} output
 * @returns {'activated' | 'skipped-base' | 'noop' | 'unknown'}
 */
export function classifyActivatePendingOutput(output) {
  const text = String(output ?? '')
  if (/needsBaseRefresh/i.test(text) || /activate-pending:\s*skip/i.test(text)) {
    return 'skipped-base'
  }
  if (/no pendingVersion/i.test(text)) return 'noop'
  if (/activated\s*→/i.test(text) || /activate-pending:\s*\d/i.test(text)) {
    return 'activated'
  }
  return 'unknown'
}

/**
 * @param {string} image
 * @param {{ inspect?: (args: string[]) => { status: number | null } }} [deps]
 */
export function dockerImageExists(image, deps = {}) {
  const name = String(image ?? '').trim()
  if (!name) return false
  const inspect = deps.inspect
    ?? ((args) => spawnSync('docker', args, { encoding: 'utf8', shell: false }))
  const r = inspect(['image', 'inspect', name])
  return (r.status ?? 1) === 0
}
