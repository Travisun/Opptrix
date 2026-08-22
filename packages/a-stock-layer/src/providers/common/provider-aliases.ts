/** 已移除 Provider 的 id 别名 — 保留空表供后续迁移 */
export const DEPRECATED_PROVIDER_ALIASES: Record<string, string> = {}

export function resolveProviderAlias(providerId: string): string {
  return DEPRECATED_PROVIDER_ALIASES[providerId] ?? providerId
}
