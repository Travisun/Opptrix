/**
 * Phase A late-bound capability handlers — llm / data.query / shell / schedule.
 *
 * These require services constructed in index.ts (hub, scheduleService).
 * `bindLateBoundServices()` is called post-construction to make them available;
 * `registerLateBoundHandlers()` registers the token handlers on the host.
 *
 * Phase A scope (per ARCHITECTURE §10.1):
 *   - data.query / data.search → real (hub.dispatch instrument features)
 *   - schedule.list            → real (ScheduleService.listJobs)
 *   - llm.chat                 → thin (requires agent session; Phase B wires direct provider)
 *   - shell.run                → thin (design: "A thin / B grant UI")
 */

import type { CapabilityHost, CapabilityHandler } from './capability-host.js'
import { getMarketPlane } from '../../market-data-plane.js'

export type LateBoundHub = {
  dispatch: (feature: string, params: unknown) => Promise<unknown>
}

export type LateBoundSchedule = {
  listJobs: () => Array<Record<string, unknown>>
}

/** Module-level service registry — populated by bindLateBoundServices(). */
const lateBound: {
  hub?: LateBoundHub
  schedule?: LateBoundSchedule
} = {}

export type BindLateBoundOptions = {
  hub?: LateBoundHub
  schedule?: LateBoundSchedule
}

/**
 * Bind real service instances. Called from index.ts after hub + scheduleService
 * are constructed. Always overwrites (pass undefined to unbind).
 */
export function bindLateBoundServices(opts: BindLateBoundOptions): void {
  lateBound.hub = opts.hub
  lateBound.schedule = opts.schedule
}

// ── data.query / data.search ────────────────────────────────────────────────

const dataQueryHandler: CapabilityHandler = async (args) => {
  if (!lateBound.hub) {
    return { error: 'data service unavailable (hub not bound)', code: 'service_unavailable' }
  }
  const feature = String(args.feature ?? 'instrument_quotes')
  // Allowlist hub features callable by extensions (fail-closed).
  const allowed = new Set([
    'instrument_quotes',
    'instrument_quote',
    'instrument_snapshot',
    'instrument_search',
  ])
  if (!allowed.has(feature)) {
    return { error: `hub feature not allowed for extensions: ${feature}`, code: 'feature_denied' }
  }
  const params = (args.params ?? {}) as unknown
  const result = await lateBound.hub.dispatch(feature, params)
  return result
}

// ── schedule.list ───────────────────────────────────────────────────────────

const scheduleHandler: CapabilityHandler = async (args) => {
  if (!lateBound.schedule) {
    return { error: 'schedule service unavailable', code: 'service_unavailable' }
  }
  const op = String(args.op ?? 'list')
  if (op === 'list') {
    const jobs = lateBound.schedule.listJobs()
    // Project to a safe subset (no internal handles).
    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        kind: j.kind,
        title: j.title,
        enabled: j.enabled,
      })),
    }
  }
  return { error: `unknown schedule op: ${op}`, code: 'invalid_args' }
}

// ── llm.chat (thin — Phase A) ───────────────────────────────────────────────

const llmChatHandler: CapabilityHandler = async (_args, ctx) => {
  // Phase A: LLM inference requires an agent session (model routing, tool loop,
  // usage metering). Direct provider access is Phase B (agentLoop default off).
  return {
    error:
      'llm.chat requires an agent session in Phase A. Direct provider access lands in Phase B.',
    code: 'phase_a_thin',
    pluginId: ctx.pluginId,
  }
}

// ── shell.run (thin — Phase A) ──────────────────────────────────────────────

const shellRunHandler: CapabilityHandler = async (_args, ctx) => {
  // Phase A: shell is explicitly "thin" per ARCHITECTURE §10.1 (grant UI in Phase B).
  return {
    error: 'shell.run is thin in Phase A (grant UI lands in Phase B).',
    code: 'phase_a_thin',
    pluginId: ctx.pluginId,
  }
}

/**
 * Register late-bound token handlers on the capability host.
 * Called once at host construction (platform context); services may be bound
 * later via bindLateBoundServices().
 */
export function registerLateBoundHandlers(host: CapabilityHost): void {
  host.register('data.subscribe', async (args, ctx) => {
    if (!getMarketPlane) {
      return { error: 'market plane unavailable', code: 'service_unavailable' }
    }
    const instruments = Array.isArray(args.instruments) ? args.instruments : []
    if (instruments.length === 0) {
      return { error: 'instruments required', code: 'invalid_args' }
    }
    const plane = getMarketPlane()
    const count = plane.subscribe(ctx.pluginId, instruments as never[])
    return {
      ok: true,
      subscribed: count,
      topic: 'market.quote.updated',
      note: 'listen via events.subscribe topic market.quote.* (events.subscribe permission)',
    }
  })

  host.register('data.', dataQueryHandler)
  host.register('schedule.', scheduleHandler)
  host.register('llm.', llmChatHandler)
  host.register('shell.', shellRunHandler)
}
