export type SettingsSection =
  | 'general'
  | 'models'
  | 'data_providers'
  | 'mcp_servers'
  | 'news_feed'
  | 'translation'
  | 'multimodal'
  | 'about'

const SETTINGS_SECTION_IDS: readonly SettingsSection[] = [
  'general',
  'models',
  'data_providers',
  'mcp_servers',
  'news_feed',
  'translation',
  'multimodal',
  'about',
]

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string'
    && (SETTINGS_SECTION_IDS as readonly string[]).includes(value)
}

/** Coerce navigation targets; invalid or missing values fall back to 常规. */
export function normalizeSettingsSection(section?: unknown): SettingsSection {
  return isSettingsSection(section) ? section : 'general'
}
