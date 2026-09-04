import type { DomainPackId, PackInfo } from './types.js'
import type { PlatformContext } from '../types.js'

/**
 * Readonly diagnostic: Ingress admit → then `packs.list()` + packEnforce.
 * Proves Ingress ⊥ Inference (no chat / no gate submit).
 */
export function admitPlatformPacks(
  platform: Pick<PlatformContext, 'ingress' | 'packs' | 'info'>,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      packs: PackInfo[]
      packEnforce: boolean
    }
  | { ok: false; error: string } {
  const admitted = platform.ingress.admit(opts?.origin ?? 'web.diagnostic', {
    text: 'platform.packs',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }
  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    packs: platform.packs.list(),
    packEnforce: platform.info().packEnforce,
  }
}

/**
 * Enable/disable a domain pack in the registry only.
 * Does not flip env `OPPTRIX_PLATFORM_PACK_ENFORCE`.
 *
 * In-memory enablement is always applied for known ids. Preference write is soft:
 * on failure returns `ok: false` with `persisted: false` and current packs —
 * memory is not cleared.
 */
export function setPlatformPackEnabled(
  platform: Pick<PlatformContext, 'packs'>,
  id: string,
  enabled: boolean,
):
  | { ok: true; packs: PackInfo[]; persisted: true }
  | { ok: false; error: string; packs: PackInfo[]; persisted: false } {
  const packId = id as DomainPackId
  if (!platform.packs.supports(packId)) {
    return {
      ok: false,
      error: `unsupported pack id: ${id}`,
      packs: platform.packs.list(),
      persisted: false,
    }
  }
  const save = platform.packs.enable(packId, enabled)
  const packs = platform.packs.list()
  if (!save.persisted) {
    return {
      ok: false,
      error: save.error ?? 'preference write failed',
      packs,
      persisted: false,
    }
  }
  return { ok: true, packs, persisted: true }
}
