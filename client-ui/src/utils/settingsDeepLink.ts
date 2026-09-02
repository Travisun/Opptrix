import {
  isSettingsSection,
  normalizeSettingsSection,
  type SettingsSection,
} from '../pages/settings/settingsTypes'

const SETTINGS_QUERY_KEY = 'settings'
/** Legacy Electron deep-link alias (`opptrix://settings?section=…`). */
const SECTION_QUERY_ALIAS = 'section'
const SYSTEM_UPDATE_TAB_QUERY_KEY = 'update_tab'

export type SettingsDeepLinkWriteMode = 'push' | 'replace'
export type SystemUpdateTab = 'online' | 'offline'

const LEGACY_SETTINGS_SECTIONS: Record<string, SettingsSection> = {
  software_update: 'system_update',
  offline_update: 'system_update',
}

function currentPathWithSearch(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function resolveSettingsSectionParam(raw: string): SettingsSection | null {
  if (isSettingsSection(raw)) return raw
  return LEGACY_SETTINGS_SECTIONS[raw] ?? null
}

/** Active tab when `?settings=system_update` (or legacy offline/software ids). */
export function readSystemUpdateTab(): SystemUpdateTab {
  if (typeof window === 'undefined') return 'online'
  const params = new URLSearchParams(window.location.search)
  const tab = params.get(SYSTEM_UPDATE_TAB_QUERY_KEY)
  if (tab === 'offline') return 'offline'
  const raw = params.get(SETTINGS_QUERY_KEY) ?? params.get(SECTION_QUERY_ALIAS)
  if (raw === 'offline_update') return 'offline'
  return 'online'
}

/** Read `?settings=` or `?section=` from the current URL. */
export function readSettingsDeepLink(): SettingsSection | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const raw = params.get(SETTINGS_QUERY_KEY) ?? params.get(SECTION_QUERY_ALIAS)
  if (!raw) return null
  return resolveSettingsSectionParam(raw)
}

function buildSettingsUrl(
  section: SettingsSection | null,
  options?: { systemUpdateTab?: SystemUpdateTab },
): string {
  const url = new URL(window.location.href)
  url.searchParams.delete(SECTION_QUERY_ALIAS)
  if (section) {
    url.searchParams.set(SETTINGS_QUERY_KEY, section)
  } else {
    url.searchParams.delete(SETTINGS_QUERY_KEY)
  }

  if (section === 'system_update' && options?.systemUpdateTab === 'offline') {
    url.searchParams.set(SYSTEM_UPDATE_TAB_QUERY_KEY, 'offline')
  } else {
    url.searchParams.delete(SYSTEM_UPDATE_TAB_QUERY_KEY)
  }

  return `${url.pathname}${url.search}${url.hash}`
}

/** Sync settings section into the browser URL without reloading. */
export function writeSettingsDeepLink(
  section: SettingsSection | null,
  mode: SettingsDeepLinkWriteMode = 'replace',
  options?: { systemUpdateTab?: SystemUpdateTab },
): void {
  if (typeof window === 'undefined') return
  const next = buildSettingsUrl(section, options)
  if (next === currentPathWithSearch()) return
  if (mode === 'push') {
    window.history.pushState({ opptrixSettings: section }, '', next)
  } else {
    window.history.replaceState({ opptrixSettings: section }, '', next)
  }
}

export function clearSettingsDeepLink(): void {
  writeSettingsDeepLink(null, 'replace')
}

/** Map legacy section ids and optional tab for navigation / deep links. */
export function resolveSettingsNavigationTarget(section?: unknown): {
  section: SettingsSection
  systemUpdateTab?: SystemUpdateTab
} {
  if (section === 'offline_update') {
    return { section: 'system_update', systemUpdateTab: 'offline' }
  }
  if (section === 'software_update') {
    return { section: 'system_update', systemUpdateTab: 'online' }
  }
  const normalized = normalizeSettingsSection(section)
  return { section: normalized }
}

/** Normalize arbitrary input; invalid values fall back to 常规. */
export function settingsSectionFromQuery(value: string | null | undefined): SettingsSection {
  if (!value) return normalizeSettingsSection(undefined)
  const resolved = resolveSettingsSectionParam(value)
  return resolved ?? normalizeSettingsSection(undefined)
}
