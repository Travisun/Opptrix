/**
 * Structured audit log for opptrix base/runtime update operations.
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveDeployRoot } from './paths.mjs'

export const AUDIT_FILENAME = 'update-audit.jsonl'

/**
 * @param {string} [deployRoot]
 */
export function resolveAuditPath(deployRoot = resolveDeployRoot()) {
  return path.join(deployRoot, '.opptrix', AUDIT_FILENAME)
}

/**
 * @param {{
 *   action: string,
 *   layer: 'base' | 'runtime' | 'combined' | 'cli',
 *   via?: 'docker-exec' | 'compose-run' | 'compose' | 'host',
 *   targetVersion?: string | null,
 *   fromVersion?: string | null,
 *   ok: boolean,
 *   exitCode?: number,
 *   message?: string,
 *   details?: Record<string, unknown>,
 *   deployRoot?: string,
 * }} entry
 */
export function appendUpdateAudit(entry) {
  const deployRoot = entry.deployRoot ?? resolveDeployRoot()
  const dir = path.join(deployRoot, '.opptrix')
  fs.mkdirSync(dir, { recursive: true })
  const row = {
    ts: new Date().toISOString(),
    action: entry.action,
    layer: entry.layer,
    via: entry.via ?? 'host',
    targetVersion: entry.targetVersion ?? null,
    fromVersion: entry.fromVersion ?? null,
    ok: entry.ok,
    exitCode: entry.exitCode ?? (entry.ok ? 0 : 1),
    message: entry.message ?? '',
    details: entry.details ?? {},
  }
  fs.appendFileSync(resolveAuditPath(deployRoot), `${JSON.stringify(row)}\n`, 'utf8')
  return row
}

/**
 * @param {{ deployRoot?: string, tail?: number }} [opts]
 * @returns {Array<Record<string, unknown>>}
 */
export function readUpdateAudit(opts = {}) {
  const file = resolveAuditPath(opts.deployRoot ?? resolveDeployRoot())
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  const parsed = lines.map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return { ts: '', action: 'parse_error', raw: line }
    }
  })
  const tail = opts.tail ?? 0
  if (tail > 0) return parsed.slice(-tail)
  return parsed
}
