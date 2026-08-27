import type { Market } from '@opptrix/shared'

export type YfinanceSectorBoard = {
  code: string
  name: string
  yahoo: string
  market: Market
  tag?: string
}

/** 美股 GICS 板块 ETF（SPDR） */
const US_SECTOR_BOARDS: YfinanceSectorBoard[] = [
  { code: 'XLK', name: '科技', yahoo: 'XLK', market: 'US', tag: 'sector' },
  { code: 'XLF', name: '金融', yahoo: 'XLF', market: 'US', tag: 'sector' },
  { code: 'XLE', name: '能源', yahoo: 'XLE', market: 'US', tag: 'sector' },
  { code: 'XLV', name: '医疗', yahoo: 'XLV', market: 'US', tag: 'sector' },
  { code: 'XLY', name: '可选消费', yahoo: 'XLY', market: 'US', tag: 'sector' },
  { code: 'XLP', name: '必需消费', yahoo: 'XLP', market: 'US', tag: 'sector' },
  { code: 'XLI', name: '工业', yahoo: 'XLI', market: 'US', tag: 'sector' },
  { code: 'XLB', name: '材料', yahoo: 'XLB', market: 'US', tag: 'sector' },
  { code: 'XLU', name: '公用事业', yahoo: 'XLU', market: 'US', tag: 'sector' },
  { code: 'XLRE', name: '房地产', yahoo: 'XLRE', market: 'US', tag: 'sector' },
  { code: 'XLC', name: '通信', yahoo: 'XLC', market: 'US', tag: 'sector' },
]

/** 港股行业 ETF / 代表性板块 */
const HK_SECTOR_BOARDS: YfinanceSectorBoard[] = [
  { code: '2828', name: '恒生中国企业', yahoo: '2828.HK', market: 'HK', tag: 'sector' },
  { code: '3067', name: '恒生科技', yahoo: '3067.HK', market: 'HK', tag: 'sector' },
  { code: '2800', name: '盈富基金', yahoo: '2800.HK', market: 'HK', tag: 'sector' },
  { code: '3033', name: '南方恒生科技', yahoo: '3033.HK', market: 'HK', tag: 'sector' },
]

/** 日本板块 ETF */
const JP_SECTOR_BOARDS: YfinanceSectorBoard[] = [
  { code: '1321', name: '日经225 ETF', yahoo: '1321.T', market: 'JP', tag: 'sector' },
  { code: '1306', name: 'TOPIX ETF', yahoo: '1306.T', market: 'JP', tag: 'sector' },
  { code: '2644', name: '半导体', yahoo: '2644.T', market: 'JP', tag: 'sector' },
]

/** 韩国板块 ETF */
const KR_SECTOR_BOARDS: YfinanceSectorBoard[] = [
  { code: '069500', name: 'KOSPI 200 ETF', yahoo: '069500.KS', market: 'KR', tag: 'sector' },
  { code: '091160', name: 'KODEX 半导体', yahoo: '091160.KS', market: 'KR', tag: 'sector' },
  { code: '122630', name: 'KODEX 杠杆', yahoo: '122630.KS', market: 'KR', tag: 'sector' },
]

const BY_MARKET: Record<string, YfinanceSectorBoard[]> = {
  US: US_SECTOR_BOARDS,
  HK: HK_SECTOR_BOARDS,
  JP: JP_SECTOR_BOARDS,
  KR: KR_SECTOR_BOARDS,
}

export function parseYfinanceSectorMarket(plateType = ''): Market | null {
  const raw = plateType.trim()
  const m = raw.match(/^(?:boards|industries):([A-Z]{2})/i)?.[1]?.toUpperCase()
  if (m === 'US' || m === 'HK' || m === 'JP' || m === 'KR') return m
  return null
}

export function listYfinanceSectorBoards(plateType = 'boards:US'): YfinanceSectorBoard[] {
  const market = parseYfinanceSectorMarket(plateType)
  if (!market) return []
  return BY_MARKET[market] ?? []
}
