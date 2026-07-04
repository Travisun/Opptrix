import { getProviderConfigStore } from '../config-store.js'

export function isCninfoEnabled(): boolean {
  try {
    return getProviderConfigStore().getRuntime('cninfo').enabled
  } catch {
    return true
  }
}
