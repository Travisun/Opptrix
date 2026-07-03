import { enabledOnlySettings } from '../common/settings.js'

export const TDX_SETTINGS = enabledOnlySettings(
  'tdx',
  '通达信 TCP',
  'CN',
  {
    keywords: ['tdx', '通达信', 'mootdx', 'pytdx', 'PyTDX'],
    defaultEnabled: true,
  },
)
