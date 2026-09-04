export type SettingsSection =
  | 'general'
  | 'account_security'
  | 'models'
  | 'data_providers'
  | 'mcp_servers'
  | 'agent_skills'
  | 'self_evolve'
  | 'news_feed'
  | 'sandbox'
  | 'capability_packs'
  | 'schedule'
  | 'python'
  | 'translation'
  | 'doc_library'
  | 'multimodal'
  | 'portfolio_fees'
  | 'system_update'
  | 'about'

const SETTINGS_SECTION_IDS: readonly SettingsSection[] = [
  'general',
  'account_security',
  'portfolio_fees',
  'models',
  'data_providers',
  'news_feed',
  'doc_library',
  'translation',
  'multimodal',
  'mcp_servers',
  'agent_skills',
  'self_evolve',
  'sandbox',
  'capability_packs',
  'schedule',
  'python',
  'system_update',
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
