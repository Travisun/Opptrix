import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { cnEquityBindings } from '../../core/bindings.js'
import { EASTMONEY_SETTINGS } from './settings.js'

/** 东方财富资金流 / 两融 / 宏观 / 机构持仓公开接口 */
export const EASTMONEY_CAPS = [
  Capability.STOCK_MONEY_FLOW,
  Capability.SECTOR_MONEY_FLOW,
  Capability.MARKET_MONEY_FLOW,
  Capability.MARGIN_TRADE,
  Capability.MACRO_INDICATOR,
  Capability.INST_HOLDING,
]

export const EASTMONEY_SPEC: ProviderManifestSpec = {
  id: 'eastmoney',
  title: '东方财富',
  subtitle: '资金流 / 两融 / 宏观 cjsj / 机构持仓 zlsj',
  marketGroup: 'CN',
  defaultPriority: 75,
  maxConcurrent: 4,
  capabilities: EASTMONEY_CAPS,
  bindingsFor: (p, maxConcurrent) => cnEquityBindings(EASTMONEY_CAPS, p, maxConcurrent),
  settings: EASTMONEY_SETTINGS,
  supportsTest: true,
}

export const EASTMONEY_MANIFEST = providerManifestEntry(
  'eastmoney',
  '东方财富',
  '资金流、融资融券、宏观与机构持仓公开接口（data.eastmoney.com）',
  'CN',
  75,
  EASTMONEY_SETTINGS,
)
