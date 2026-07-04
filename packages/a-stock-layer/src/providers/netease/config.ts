import { getProviderConfigStore } from '../config-store.js'

export function isNeteaseEnabled(): boolean {
  try {
    return getProviderConfigStore().getRuntime('netease').enabled
  } catch {
    return true
  }
}
