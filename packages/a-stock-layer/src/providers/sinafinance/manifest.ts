import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { cnEquityEtfIndex } from '../common/bindings.js'
import { SINA_CN_ETF_CAPABILITIES } from '../common/etf-capabilities.js'
import { SINAFINANCE_SETTINGS } from './settings.js'

/** 新浪财经 F10 + 行情中心公开接口 */
export const SINAFINANCE_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
  Capability.STOCK_LIST,
  Capability.MARKET_BREADTH,
  Capability.GLOBAL_INDEX,
  Capability.NEWS,
  Capability.STOCK_PROFILE,
  Capability.STOCK_MONEY_FLOW,
  Capability.INTRADAY_TICK,
  Capability.SHAREHOLDER,
  Capability.SECTOR_LIST,
  Capability.PEER_COMPANY,
  Capability.DIVIDEND,
  Capability.FINANCIAL_SUMMARY,
  Capability.INCOME_STMT,
  Capability.BALANCE_SHEET,
  Capability.CASH_FLOW,
  Capability.DRAGON_TIGER,
  Capability.BLOCK_TRADE,
  Capability.LOCKUP_EXPIRY,
  Capability.MARGIN_TRADE,
  Capability.PERF_FORECAST,
  ...SINA_CN_ETF_CAPABILITIES,
]

const INDEX_CAPS = [
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
]

const EQUITY_CAPS = SINAFINANCE_CAPS.filter(c => !INDEX_CAPS.includes(c))

export const SINAFINANCE_SPEC: ProviderManifestSpec = {
  id: 'sinafinance',
  title: '新浪财经',
  subtitle: '新浪财经行情与 F10 公司资料（vip.stock.finance.sina.com.cn）',
  marketGroup: 'CN',
  defaultPriority: 56,
  capabilities: SINAFINANCE_CAPS,
  bindingsFor: (p, maxConcurrent) => cnEquityEtfIndex(
    EQUITY_CAPS.filter(c => ![
      Capability.GLOBAL_INDEX,
      Capability.MARKET_BREADTH,
    ].includes(c)),
    INDEX_CAPS,
    p,
    [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.NEWS,
      Capability.STOCK_PROFILE,
      Capability.STOCK_MONEY_FLOW,
      Capability.SHAREHOLDER,
      Capability.FINANCIAL_SUMMARY,
      Capability.DIVIDEND,
      ...SINA_CN_ETF_CAPABILITIES,
    ],
    maxConcurrent,
  ),
  settings: SINAFINANCE_SETTINGS,
  supportsTest: true,
}

export const SINAFINANCE_MANIFEST = providerManifestEntry(
  'sinafinance',
  '新浪财经',
  '行情、F10 资料、财务、龙虎榜、解禁、融资融券等公开接口',
  'CN',
  56,
  SINAFINANCE_SETTINGS,
)
