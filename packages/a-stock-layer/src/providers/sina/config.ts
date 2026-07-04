import { getProviderConfigStore } from '../config-store.js'

export function isSinaEnabled(): boolean {
  try {
    return getProviderConfigStore().getRuntime('sina').enabled
  } catch {
    return true
  }
}
