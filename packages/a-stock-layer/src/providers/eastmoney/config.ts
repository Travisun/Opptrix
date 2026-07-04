import { getProviderConfigStore } from '../config-store.js'

export function isEastmoneyEnabled(): boolean {
  try {
    return getProviderConfigStore().getRuntime('eastmoney').enabled
  } catch {
    return true
  }
}
