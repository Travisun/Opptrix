/** 已移除 Provider 的 id 别名 — 配置与自定义方法调用回退到目标 Provider */
export const DEPRECATED_PROVIDER_ALIASES: Record<string, string> = {
  webfeed: 'sinafinance',
}

export function resolveProviderAlias(providerId: string): string {
  return DEPRECATED_PROVIDER_ALIASES[providerId] ?? providerId
}
