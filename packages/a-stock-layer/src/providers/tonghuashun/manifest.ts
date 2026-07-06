import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { TONGHUASHUN_SETTINGS } from './settings.js'
import { cnEquityEtfIndex, cnFullSplit } from '../common/bindings.js'

export const TONGHUASHUN_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.STOCK_LIST,
  Capability.STOCK_PROFILE,
  Capability.FINANCIAL_SUMMARY,
  Capability.INCOME_STMT,
  Capability.DIVIDEND,
  Capability.TRADE_CALENDAR,
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
  Capability.DRAGON_TIGER,
  Capability.LIMIT_UPDOWN,
  Capability.SENTIMENT,
]

export const TONGHUASHUN_SPEC: ProviderManifestSpec = {
  id: 'tonghuashun',
  title: '同花顺',
  subtitle: '同花顺金融数据 API（fuyao.aicubes.cn），需 API Key',
  marketGroup: 'CN',
  defaultPriority: 88,
  maxConcurrent: 5,
  capabilities: TONGHUASHUN_CAPS,
  bindingsFor: (p, maxConcurrent) => cnFullSplit(TONGHUASHUN_CAPS, p, maxConcurrent),
  settings: TONGHUASHUN_SETTINGS,
  supportsTest: true,
}

export const TONGHUASHUN_MANIFEST = providerManifestEntry(
  'tonghuashun',
  '同花顺',
  '同花顺金融数据 API（fuyao.aicubes.cn），需 API Key',
  'CN',
  88,
  TONGHUASHUN_SETTINGS,
)
