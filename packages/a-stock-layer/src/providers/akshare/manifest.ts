import { type ProviderManifest, type ProviderSettingsDefinition } from '@opptrix/shared'

const AKSHARE_SETTINGS: ProviderSettingsDefinition = {
  providerId: 'akshare',
  title: 'AKShare 数据设置',
  marketGroup: 'CN',
  fields: [
    {
      key: 'enabled',
      type: 'boolean',
      label: '启用 AKShare 数据',
      default: true,
    },
  ],
}

export const AKSHARE_MANIFEST: ProviderManifest = {
  providerId: 'akshare',
  title: 'AKShare',
  subtitle: '债券、期货、汇率、碳排放、中国宏观（CPI/PPI/PMI/GDP/LPR）等 AKShare 接口',
  marketGroup: 'CN',
  defaultPriority: 30,
  settings: AKSHARE_SETTINGS,
}
