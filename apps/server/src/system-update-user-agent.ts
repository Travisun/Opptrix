import { resolveOpptrixAppVersion } from '@opptrix/shared'
import { readState } from '@opptrix/system-update'
import {
  resolveLinuxRuntimeArchKey,
  type LinuxRuntimeArchKey,
} from './system-update-arch.js'

const UA_PRODUCT = 'Opptrix-system-update'

/** User-Agent for hot-update CDN requests; includes runtime version + linux arch key. */
export function buildSystemUpdateUserAgent(
  version?: string | null,
  archKey: LinuxRuntimeArchKey = resolveLinuxRuntimeArchKey(),
): string {
  const raw = (version ?? readState().currentVersion ?? resolveOpptrixAppVersion()).trim()
  const normalized = raw.replace(/^v/i, '')
  if (!normalized || normalized === 'unknown') {
    return `${UA_PRODUCT} (${archKey})`
  }
  return `${UA_PRODUCT}/${normalized} (${archKey})`
}
