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
 */
export function setPlatformPackEnabled(
  platform: Pick<PlatformContext, 'packs'>,
  id: string,
  enabled: boolean,
): { ok: true } | { ok: false; error: string } {
  const packId = id as DomainPackId
  if (!platform.packs.supports(packId)) {
    return { ok: false, error: `unsupported pack id: ${id}` }
  }
  platform.packs.enable(packId, enabled)
  return { ok: true }
}
