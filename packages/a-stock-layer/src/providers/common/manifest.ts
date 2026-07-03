import type { MarketGroup, ProviderManifest, ProviderSettingsDefinition } from '@opptrix/shared'

export function providerManifestEntry(
  providerId: string,
  title: string,
  subtitle: string,
  marketGroup: MarketGroup,
  defaultPriority: number,
  settings?: ProviderSettingsDefinition,
): ProviderManifest {
  return { providerId, title, subtitle, marketGroup, defaultPriority, settings }
}
