import { getUserDataStore } from '@opptrix/user-store'
import {
  DEFAULT_PYTHON_SETTINGS,
  normalizePythonSettings,
  validatePythonSettingsInput,
  type PythonSettings,
  type ValidatePythonSettingsResult,
} from '@opptrix/shared'

const PREF_NS = 'preference'
const PYTHON_SETTINGS_KEY = 'python_settings'

let cachedSettings: PythonSettings | null = null

export function resetPythonSettingsStoreForTests(): void {
  cachedSettings = null
}

export function getPythonSettings(): PythonSettings {
  if (cachedSettings != null) return cachedSettings
  try {
    const raw = getUserDataStore().getDocument<Partial<PythonSettings>>(
      PREF_NS,
      PYTHON_SETTINGS_KEY,
    )
    cachedSettings = normalizePythonSettings(raw)
    // 存量 prefer_opptrix_python:false → 一次性迁移为托管优先
    if (cachedSettings.prefer_opptrix_python === false) {
      const migrated: PythonSettings = {
        ...cachedSettings,
        prefer_opptrix_python: true,
      }
      try {
        getUserDataStore().setDocument(PREF_NS, PYTHON_SETTINGS_KEY, migrated)
      } catch {
        /* 持久化失败仍返回迁移后的内存值 */
      }
      cachedSettings = migrated
    }
  } catch {
    cachedSettings = { ...DEFAULT_PYTHON_SETTINGS }
  }
  return cachedSettings
}

export function savePythonSettings(input: Partial<PythonSettings>): ValidatePythonSettingsResult {
  const validated = validatePythonSettingsInput(input)
  if (!validated.ok) return validated
  getUserDataStore().setDocument(PREF_NS, PYTHON_SETTINGS_KEY, validated.settings)
  cachedSettings = validated.settings
  return validated
}
