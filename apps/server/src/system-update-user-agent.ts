import { resolveOpptrixAppVersion } from '@opptrix/shared'
import { readState } from '@opptrix/system-update'

const UA_PRODUCT = 'Opptrix-system-update'

/** User-Agent for hot-update CDN requests; includes the running runtime version. */
export function buildSystemUpdateUserAgent(version?: string | null): string {
  const raw = (version ?? readState().currentVersion ?? resolveOpptrixAppVersion()).trim()
  const normalized = raw.replace(/^v/i, '')
  if (!normalized || normalized === 'unknown') return UA_PRODUCT
  return `${UA_PRODUCT}/${normalized}`
}
