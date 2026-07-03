import type { Market } from '@opptrix/shared'

export interface RegionalListSeed {
  code: string
  name: string
  exchange?: string | null
  industry?: string
}

/** MVP 种子列表 — 供 jp_list / kr_list / hk_list 首次同步写入本地库 */
const JP_SEEDS: RegionalListSeed[] = [
  { code: '7203', name: '丰田汽车', industry: '汽车' },
  { code: '6758', name: '索尼集团', industry: '电子' },
  { code: '9984', name: '软银集团', industry: '通信' },
  { code: '6861', name: '基恩士', industry: '机械' },
  { code: '8306', name: '三菱UFJ金融', industry: '银行' },
  { code: '9432', name: '日本电信电话', industry: '通信' },
  { code: '4063', name: '信越化学', industry: '化工' },
  { code: '6902', name: '电装', industry: '汽车' },
  { code: '7974', name: '任天堂', industry: '游戏' },
  { code: '8058', name: '三菱商事', industry: '贸易' },
  { code: '8035', name: '东京电子', industry: '半导体设备' },
  { code: '6501', name: '日立制作所', industry: '综合电机' },
  { code: '7267', name: '本田汽车', industry: '汽车' },
  { code: '4519', name: '中外制药', industry: '医药' },
  { code: '6098', name: 'Recruit', industry: '人力资源' },
  { code: '9433', name: 'KDDI', industry: '通信' },
  { code: '6367', name: '大金工业', industry: '机械' },
  { code: '7741', name: 'HOYA', industry: '光学' },
  { code: '6981', name: '村田制作所', industry: '电子元件' },
  { code: '4568', name: '第一三共', industry: '医药' },
]

const KR_SEEDS: RegionalListSeed[] = [
  { code: '005930', name: '三星电子', industry: '半导体' },
  { code: '000660', name: 'SK海力士', industry: '半导体' },
  { code: '035420', name: 'NAVER', industry: '互联网' },
  { code: '051910', name: 'LG化学', industry: '化工' },
  { code: '006400', name: '三星SDI', industry: '电池' },
  { code: '207940', name: '三星生物', industry: '医药' },
  { code: '035720', name: 'Kakao', industry: '互联网' },
  { code: '005380', name: '现代汽车', industry: '汽车' },
  { code: '068270', name: 'Celltrion', industry: '医药' },
  { code: '105560', name: 'KB金融', industry: '银行' },
  { code: '055550', name: '新韩金融', industry: '银行' },
  { code: '003550', name: 'LG', industry: '综合' },
  { code: '012330', name: '现代摩比斯', industry: '汽车' },
  { code: '028260', name: '三星物産', industry: '贸易' },
  { code: '066570', name: 'LG电子', industry: '电子' },
  { code: '096770', name: 'SK创新', industry: '能源' },
  { code: '032830', name: '三星生命', industry: '保险' },
  { code: '034730', name: 'SK', industry: '综合' },
  { code: '015760', name: '韩国电力', industry: '公用事业' },
  { code: '000270', name: '起亚', industry: '汽车' },
]

const HK_SEEDS: RegionalListSeed[] = [
  { code: '00700', name: '腾讯控股', industry: '互联网' },
  { code: '09988', name: '阿里巴巴', industry: '互联网' },
  { code: '03690', name: '美团', industry: '互联网' },
  { code: '01810', name: '小米集团', industry: '消费电子' },
  { code: '01299', name: '友邦保险', industry: '保险' },
  { code: '00941', name: '中国移动', industry: '通信' },
  { code: '02318', name: '中国平安', industry: '保险' },
  { code: '01398', name: '工商银行', industry: '银行' },
  { code: '03988', name: '中国银行', industry: '银行' },
  { code: '02020', name: '安踏体育', industry: '消费' },
  { code: '00939', name: '建设银行', industry: '银行' },
  { code: '02628', name: '中国人寿', industry: '保险' },
  { code: '01024', name: '快手', industry: '互联网' },
  { code: '02269', name: '药明生物', industry: '医药' },
  { code: '00883', name: '中国海洋石油', industry: '能源' },
  { code: '00388', name: '香港交易所', industry: '金融' },
  { code: '00005', name: '汇丰控股', industry: '银行' },
  { code: '01109', name: '华润置地', industry: '地产' },
  { code: '00241', name: '阿里健康', industry: '医药' },
  { code: '09618', name: '京东集团', industry: '互联网' },
]

const SEED_BY_MARKET: Record<'JP' | 'KR' | 'HK', RegionalListSeed[]> = {
  JP: JP_SEEDS,
  KR: KR_SEEDS,
  HK: HK_SEEDS,
}

export function getRegionalListSeeds(market: 'JP' | 'KR' | 'HK'): readonly RegionalListSeed[] {
  return SEED_BY_MARKET[market]
}

export function regionalListJobMarket(job: string): 'JP' | 'KR' | 'HK' | null {
  if (job === 'jp_list') return 'JP'
  if (job === 'kr_list') return 'KR'
  if (job === 'hk_list') return 'HK'
  return null
}

export function isRegionalListJob(job: string): job is 'jp_list' | 'kr_list' | 'hk_list' {
  return regionalListJobMarket(job) != null
}

export function regionalQuotesJobMarket(job: string): 'JP' | 'KR' | 'HK' | null {
  if (job === 'jp_quotes') return 'JP'
  if (job === 'kr_quotes') return 'KR'
  if (job === 'hk_quotes') return 'HK'
  return null
}

export function isRegionalQuotesJob(job: string): job is 'jp_quotes' | 'kr_quotes' | 'hk_quotes' {
  return regionalQuotesJobMarket(job) != null
}
