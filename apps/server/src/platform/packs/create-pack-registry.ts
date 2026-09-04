import { getUserDataStore } from '@opptrix/user-store'
import {
  getUserPreference,
  setUserPreference,
} from '../../user-preferences.js'
import type { DomainPackId, PackEnableResult, PackInfo, PackRegistry } from './types.js'

const PACK_LABELS: Record<DomainPackId, string> = {
  research: 'Research',
  coding: 'Coding',
}

const ALL_IDS: DomainPackId[] = ['research', 'coding']

/** user-store preference key for domain pack enablement (C4). */
export const PLATFORM_DOMAIN_PACKS_PREF_KEY = 'platform_domain_packs'

export type DomainPackEnablement = Record<DomainPackId, boolean>

const DEFAULT_ENABLEMENT: DomainPackEnablement = {
  research: true,
  coding: false,
}

function isKnown(id: string): id is DomainPackId {
  return id === 'research' || id === 'coding'
}

function normalizeEnablement(raw: unknown): DomainPackEnablement {
  const out: DomainPackEnablement = { ...DEFAULT_ENABLEMENT }
  if (raw == null || typeof raw !== 'object') return out
  const r = raw as Partial<Record<DomainPackId, unknown>>
  for (const id of ALL_IDS) {
    if (typeof r[id] === 'boolean') out[id] = r[id]
  }
  return out
}

function loadEnablement(): DomainPackEnablement {
  try {
    const raw = getUserPreference<unknown>(PLATFORM_DOMAIN_PACKS_PREF_KEY, null)
    return normalizeEnablement(raw)
  } catch {
    return { ...DEFAULT_ENABLEMENT }
  }
}

/**
 * Persist pack enablement to user preference.
 * Soft fail: on write error returns `{ persisted: false }` — caller must keep in-memory map.
 * Never clears or reverts the in-memory enablement map.
 */
function saveEnablement(enabled: Map<DomainPackId, boolean>): PackEnableResult {
  const payload: DomainPackEnablement = {
    research: enabled.get('research') === true,
    coding: enabled.get('coding') === true,
  }
  try {
    setUserPreference(PLATFORM_DOMAIN_PACKS_PREF_KEY, payload)
    return { persisted: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(
      '[platform.packs] preference write soft-failed; in-memory enablement kept:',
      message,
    )
    return { persisted: false, error: message }
  }
}

/** Tests only — delete persisted domain-pack enables so suites do not leak. */
export function clearDomainPackPreferencesForTests(): void {
  try {
    getUserDataStore().deleteDocument('preference', PLATFORM_DOMAIN_PACKS_PREF_KEY)
  } catch {
    // soft
  }
}

/**
 * Create a pack registry. Default: research on, coding off.
 * C4: loads/saves enablement via user-store preference `platform_domain_packs`.
 * Preference write failures are soft: in-memory stays authoritative for the process.
 */
export function createPackRegistry(): PackRegistry {
  const loaded = loadEnablement()
  const enabled = new Map<DomainPackId, boolean>([
    ['research', loaded.research],
    ['coding', loaded.coding],
  ])

  return {
    list(): PackInfo[] {
      return ALL_IDS.map((id) => ({
        id,
        enabled: enabled.get(id) === true,
        label: PACK_LABELS[id],
      }))
    },
    supports(id: DomainPackId): boolean {
      return isKnown(id)
    },
    enable(id: DomainPackId, next: boolean): PackEnableResult {
      if (!isKnown(id)) {
        return { persisted: false, error: `unsupported pack id: ${id}` }
      }
      enabled.set(id, next)
      return saveEnablement(enabled)
    },
    isEnabled(id: DomainPackId): boolean {
      return enabled.get(id) === true
    },
  }
}
