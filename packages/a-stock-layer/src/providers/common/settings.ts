import type { MarketGroup, ProviderSettingsDefinition } from '@opptrix/shared'

/** Free / no-secret provider — settings page shows enable toggle only */
export function enabledOnlySettings(
  providerId: string,
  title: string,
  marketGroup: MarketGroup,
  opts: {
    keywords?: string[]
    defaultEnabled?: boolean
  } = {},
): ProviderSettingsDefinition {
  return {
    providerId,
    title,
    marketGroup,
    keywords: opts.keywords ?? [providerId, title],
    enableAffectsPriority: true,
    supportsTest: false,
    fields: [
      {
        key: 'enabled',
        type: 'boolean',
        label: '启用',
        default: opts.defaultEnabled ?? true,
      },
    ],
  }
}

export function secretKeySettings(
  providerId: string,
  title: string,
  marketGroup: MarketGroup,
  opts: {
    secretKey?: string
    secretLabel?: string
    placeholder?: string
    keywords?: string[]
    defaultEnabled?: boolean
  } = {},
): ProviderSettingsDefinition {
  const key = opts.secretKey ?? 'apiKey'
  return {
    providerId,
    title,
    marketGroup,
    keywords: opts.keywords ?? [providerId, title],
    enableAffectsPriority: true,
    supportsTest: true,
    fields: [
      { key: 'enabled', type: 'boolean', label: '启用', default: opts.defaultEnabled ?? false },
      {
        key,
        type: 'secret',
        label: opts.secretLabel ?? 'API Key',
        required: true,
        masked: true,
        placeholder: opts.placeholder ?? `粘贴 ${title} API Key`,
      },
    ],
  }
}
