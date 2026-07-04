import { type ProviderManifest, type ProviderSettingsDefinition } from '@opptrix/shared'

const MISC_DATA_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'misc-data',
  title: '杂项数据设置',
  marketGroup: 'CN',
  fields: [
    {
      key: 'enabled',
      type: 'boolean',
      label: '启用杂项数据',
      default: false,
    },
  ],
}

export const MISC_DATA_MANIFEST: ProviderManifest = {
  providerId: 'misc-data',
  title: '杂项数据',
  subtitle: '龙虎榜、股东户数、估值等补充数据',
  marketGroup: 'CN',
  defaultPriority: 30,
  settings: MISC_DATA_SETTINGS,
}
