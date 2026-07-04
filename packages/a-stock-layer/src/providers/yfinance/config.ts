import { getProviderConfigStore } from '../config-store.js'

export function isYfinanceEnabled(): boolean {
  try {
    return getProviderConfigStore().getRuntime('yfinance').enabled
  } catch {
    return true
  }
}
