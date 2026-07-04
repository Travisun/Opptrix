import { getProviderConfigStore } from '../config-store.js'

export function isTdxEnabled(): boolean {
  try {
    return getProviderConfigStore().getRuntime('tdx').enabled
  } catch {
    return true
  }
}
