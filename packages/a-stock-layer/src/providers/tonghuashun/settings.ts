import { secretKeySettings } from '../common/settings.js'

export const TONGHUASHUN_SETTINGS = secretKeySettings(
  'tonghuashun',
  '同花顺',
  'CN',
  {
    keywords: ['tonghuashun', '同花顺', 'fuyao', 'aicubes'],
    secretLabel: '数据密钥',
    placeholder: '粘贴同花顺数据密钥',
    subtitle: '同花顺行情与基本面数据',
    description: '在同花顺开放平台获取后填入即可使用',
    helpUrl: 'https://opptrix.net/t/topic/199',
    defaultEnabled: false,
  },
)
