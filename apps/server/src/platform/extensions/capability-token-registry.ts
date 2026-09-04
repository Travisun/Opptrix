/**
 * Phase A Capability Token Registry.
 *
 * Single source of truth mapping capability tokens → required permission + pack.
 * The CapabilityGate enforces: (1) manifest declares the required permission,
 * (2) the token's pack is enabled, (3) quota not exceeded.
 *
 * ADR-02 amendment: extensions run in a shared worker + vm sandbox; the gate is
 * the sole enforcement point for what an extension may do.
 */

import type { ExtensionPermission } from './types.js'

/** Which domain pack (if any) gates this token. null = primitive (always available). */
type PackGate = 'research' | null

export type CapabilityTokenRule = {
  /** Canonical token string, e.g. "storage.get". */
  token: string
  /** Permission the extension's manifest must declare. */
  permission: ExtensionPermission
  /** Domain pack that must be enabled, or null for primitives. */
  pack: PackGate
  /** Human-readable description for audit logs / docs. */
  description: string
}

/**
 * Phase A capability token rules.
 * Token matching: exact match, or prefix match for wildcard tokens (storage.*, llm.*, shell.*, schedule.*).
 */
export const CAPABILITY_TOKEN_RULES: readonly CapabilityTokenRule[] = [
  // ── Primitives (pack: null, always available with permission) ──────────────
  { token: 'storage.get', permission: 'storage', pack: null, description: 'Read extension private KV' },
  { token: 'storage.set', permission: 'storage', pack: null, description: 'Write extension private KV' },
  { token: 'storage.delete', permission: 'storage', pack: null, description: 'Delete extension private KV' },
  { token: 'storage.list', permission: 'storage', pack: null, description: 'List extension private KV keys' },
  { token: 'storage.export', permission: 'storage', pack: null, description: 'Export all extension private data' },
  { token: 'llm.chat', permission: 'llm', pack: null, description: 'Invoke LLM chat/completions' },
  { token: 'sessions.read', permission: 'sessions.read', pack: null, description: 'Read session metadata and messages' },
  { token: 'shell.run', permission: 'shell', pack: null, description: 'Run sandboxed shell command (thin)' },
  { token: 'schedule.register', permission: 'schedule', pack: null, description: 'Register a scheduled job kind' },
  { token: 'schedule.list', permission: 'schedule', pack: null, description: 'List scheduled jobs' },
  { token: 'events.subscribe', permission: 'events.subscribe', pack: null, description: 'Subscribe to system events' },
  { token: 'events.emit', permission: 'events.emit', pack: null, description: 'Emit ext.{id}.* events' },
  { token: 'platform.info', permission: 'platform.info', pack: null, description: 'Read deployment + pack snapshot' },
  // Contribution management tokens (fail-closed: every callable token must
  // carry a permission mapping). Hooks observe lifecycle events; routes are
  // the extension's own HTTP surface under /api/ext/{id}/*.
  { token: 'hooks.register', permission: 'events.subscribe', pack: null, description: 'Register a read-only lifecycle hook' },
  { token: 'hooks.unregister', permission: 'events.subscribe', pack: null, description: 'Unregister a lifecycle hook' },
  { token: 'routes.register', permission: 'platform.info', pack: null, description: 'Register an HTTP sub-route' },
  { token: 'routes.unregister', permission: 'platform.info', pack: null, description: 'Unregister an HTTP sub-route' },

  // ── Research domain pack (pack: 'research', requires pack enabled) ────────
  { token: 'data.query', permission: 'data.query', pack: 'research', description: 'Query instrument data (quotes, profile)' },
  { token: 'data.search', permission: 'data.query', pack: 'research', description: 'Search instruments' },
  { token: 'data.subscribe', permission: 'data.query', pack: 'research', description: 'Subscribe to market data plane quote updates' },
] as const

/** All Phase A permissions. */
export const ALL_EXTENSION_PERMISSIONS: readonly ExtensionPermission[] = [
  'storage',
  'llm',
  'sessions.read',
  'data.query',
  'shell',
  'schedule',
  'events.subscribe',
  'events.emit',
  'platform.info',
]

/** Fast lookup: token → rule. Built once. */
const TOKEN_RULE_MAP = new Map<string, CapabilityTokenRule>()
for (const rule of CAPABILITY_TOKEN_RULES) {
  TOKEN_RULE_MAP.set(rule.token, rule)
}

/**
 * Resolve the capability rule for a token.
 * Exact match first, then longest-prefix match against prefix-style rules
 * (e.g. rule token `storage.get` also governs `storage.anything` because the
 * capability host dispatches `storage.` by prefix — the permission check must
 * use the same granularity or variant tokens would bypass it).
 * Returns null if the token is not a recognized Phase A capability.
 */
export function resolveCapabilityRule(token: string): CapabilityTokenRule | null {
  // Exact match first.
  const exact = TOKEN_RULE_MAP.get(token)
  if (exact) return exact

  // Longest-prefix match (mirrors capability-host matchHandler granularity).
  let best: { len: number; rule: CapabilityTokenRule } | undefined
  for (const rule of CAPABILITY_TOKEN_RULES) {
    const dotIdx = rule.token.lastIndexOf('.')
    if (dotIdx <= 0) continue
    const prefix = rule.token.slice(0, dotIdx + 1) // e.g. "storage."
    if (!token.startsWith(prefix)) continue
    if (!best || prefix.length > best.len) {
      best = { len: prefix.length, rule }
    }
  }
  return best?.rule ?? null
}

/**
 * Check whether a declared permission satisfies a required permission.
 * Handles the legacy `capabilities[]` → permissions[] mapping.
 */
export function permissionSatisfies(
  declared: ExtensionPermission[] | undefined,
  required: ExtensionPermission,
): boolean {
  if (!declared || declared.length === 0) return false
  return declared.includes(required)
}

/**
 * Map legacy `capabilities[]` strings to Phase A ExtensionPermission[].
 * Unknown strings are dropped (fail-closed for permissions).
 */
export function mapLegacyCapabilities(caps: string[] | undefined): ExtensionPermission[] {
  if (!caps) return []
  const out: ExtensionPermission[] = []
  for (const raw of caps) {
    const t = raw.trim()
    if ((ALL_EXTENSION_PERMISSIONS as readonly string[]).includes(t)) {
      out.push(t as ExtensionPermission)
    }
  }
  return out
}
