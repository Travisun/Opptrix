import { getUserDataStore } from '@opptrix/user-store'
import {
  DEFAULT_SANDBOX_SETTINGS,
  normalizeSandboxSettings,
  validateSandboxSettingsInput,
  type SandboxSettings,
  type ValidateSandboxSettingsResult,
} from '@opptrix/shared'

const PREF_NS = 'preference'
const SANDBOX_SETTINGS_KEY = 'sandbox_settings'

let cachedSettings: SandboxSettings | null = null

export function resetSandboxSettingsStoreForTests(): void {
  cachedSettings = null
}

export function getSandboxSettings(): SandboxSettings {
  if (cachedSettings != null) return cachedSettings
  try {
    const raw = getUserDataStore().getDocument<Partial<SandboxSettings>>(
      PREF_NS,
      SANDBOX_SETTINGS_KEY,
    )
    cachedSettings = normalizeSandboxSettings(raw)
  } catch {
    cachedSettings = { ...DEFAULT_SANDBOX_SETTINGS }
  }
  return cachedSettings
}

export function saveSandboxSettings(input: Partial<SandboxSettings>): ValidateSandboxSettingsResult {
  const validated = validateSandboxSettingsInput(input)
  if (!validated.ok) return validated
  getUserDataStore().setDocument(PREF_NS, SANDBOX_SETTINGS_KEY, validated.settings)
  cachedSettings = validated.settings
  return validated
}
