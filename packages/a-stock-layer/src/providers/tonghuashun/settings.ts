import { secretKeySettings } from '../common/settings.js'

export const TONGHUASHUN_SETTINGS = secretKeySettings(
  'tonghuashun',
  '同花顺',
  'CN',
  {
    keywords: ['tonghuashun', '同花顺', 'fuyao', 'aicubes'],
    secretLabel: 'API Key',
    placeholder: '粘贴 fuyao.aicubes.cn 控制台签发的 API Key',
    defaultEnabled: false,
  },
)
