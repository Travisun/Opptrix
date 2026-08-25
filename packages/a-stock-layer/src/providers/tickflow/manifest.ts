import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { TICKFLOW_SETTINGS } from './settings.js'
import {
  usEquityBindings,
  cnEquityEtfIndex,
  regionalEquityBindings,
} from '../common/bindings.js'
import { FREE_CN_ETF_CAPABILITIES } from '../common/etf-capabilities.js'

const TICKFLOW_EQUITY_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.STOCK_LIST,
  Capability.STOCK_BASIC,
  Capability.STOCK_PROFILE,
]

const TICKFLOW_CN_EXPERT_CAPS = [
  Capability.FINANCIAL_SUMMARY,
  Capability.BALANCE_SHEET,
  Capability.INCOME_STMT,
  Capability.CASH_FLOW,
  Capability.SHAREHOLDER,
  Capability.GLOBAL_INDEX,
]

const TICKFLOW_CN_INDEX_CAPS = [
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
]

/** A 股 / 美股 / 港股分时（TickFlow /v1/klines/intraday，仅当日） */
const TICKFLOW_INTRADAY_CAPS = [Capability.INTRADAY_TICK]

const TICKFLOW_FREE_ETF_CAPS = [
  ...FREE_CN_ETF_CAPABILITIES,
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
]

export const TICKFLOW_CAPS = [
  ...TICKFLOW_EQUITY_CAPS,
  ...TICKFLOW_CN_EXPERT_CAPS,
  ...TICKFLOW_CN_INDEX_CAPS,
  ...TICKFLOW_INTRADAY_CAPS,
  ...FREE_CN_ETF_CAPABILITIES,
]

export const TICKFLOW_SPEC: ProviderManifestSpec = {
  id: 'tickflow',
  title: 'TickFlow',
  subtitle: '多市场行情；免费可用日线，填密钥可看实时',
  marketGroup: 'GLOBAL',
  /** 目录默认 110（第 3）；CN binding 仍封顶 100，低于 tonghuashun(120) */
  defaultPriority: 110,
  maxConcurrent: 5,
  capabilities: TICKFLOW_CAPS,
  bindingsFor: (p, maxConcurrent) => {
    /** US/HK 明显高于其它跨市源，保证右侧美港主路径 */
    const crossMarketPriority = Math.max(p, 200)
    /** CN 封顶 100，避免抢 Fuyao / Opptrix量化 目录顺位 */
    const cnPriority = Math.min(p, 100)
    const equityCaps = [...TICKFLOW_EQUITY_CAPS]
    return [
      // 美港不展示/不绑分时：公开免费档与右侧产品均只做日周月季年 K
      ...usEquityBindings(equityCaps, crossMarketPriority, maxConcurrent),
      ...cnEquityEtfIndex(
        [...equityCaps, ...TICKFLOW_CN_EXPERT_CAPS, ...TICKFLOW_INTRADAY_CAPS],
        TICKFLOW_CN_INDEX_CAPS,
        cnPriority,
        TICKFLOW_FREE_ETF_CAPS,
        maxConcurrent,
      ),
      ...regionalEquityBindings('HK', equityCaps, crossMarketPriority, maxConcurrent),
    ]
  },
  settings: TICKFLOW_SETTINGS,
  supportsTest: true,
}

export const TICKFLOW_MANIFEST = providerManifestEntry(
  'tickflow',
  'TickFlow',
  '多市场行情；免费可用日线，填密钥可看实时',
  'GLOBAL',
  110,
  TICKFLOW_SETTINGS,
)
