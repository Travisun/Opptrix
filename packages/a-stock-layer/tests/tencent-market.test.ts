import { describe, expect, it } from 'vitest'
import {
  mapTencentBigOrderRows,
  mapTencentFundFlowSeries,
  mapTencentIndustryBoardRows,
  mapTencentIndustryConstituentRows,
  mapTencentKlineAppNodes,
  mapTencentMinuteKlines,
  mapTencentMinuteTicks,
  mapTencentPlateTagRows,
  mapTencentSmartboxStocks,
  mapTencentSqtRealtime,
  parseTencentScopedMarket,
} from '../src/providers/tencent/normalize/market.js'
import {
  mapTencentGlobalFuturesRows,
  pickTencentGlobalFuturesRows,
  sortTencentGlobalFuturesRows,
} from '../src/providers/tencent/api/global-futures-service.js'
import {
  resolveTencentIndustryBoardType,
  resolveTencentIndustrySortField,
  resolveTencentGlobalFuturesCategory,
} from '../src/providers/tencent/api/proxy.js'
import {
  mapTencentGlobalIndexRankRows,
  pickTencentGlobalIndexRows,
  sortTencentGlobalIndexRows,
} from '../src/providers/tencent/api/global-index-service.js'

describe('mapTencentSqtRealtime', () => {
  it('maps utf8 json array to realtime', () => {
    const q = mapTencentSqtRealtime('300308', [
      '51', '中际旭创', '300308', '1121.90', '1098.92', '1098.00', '292864',
    ])
    expect(q?.code).toBe('300308')
    expect(q?.price).toBe(1121.9)
    expect(q?.preClose).toBe(1098.92)
  })
})

describe('mapTencentMinuteTicks', () => {
  it('parses HHMM price volume amount', () => {
    const rows = mapTencentMinuteTicks('300308', ['0930 1098.00 1435 157563000.00'], '2026-07-07')
    expect(rows[0]?.time).toBe('09:30')
    expect(rows[0]?.price).toBe(1098)
  })
})

describe('mapTencentKlineAppNodes', () => {
  it('maps open/high/low/last nodes', () => {
    const rows = mapTencentKlineAppNodes('300308', [{
      open: '1130.00',
      last: '1116.00',
      high: '1188.01',
      low: '1115.00',
      volume: '32861800',
      amount: '37702362949',
      date: '2026-07-03',
      exchange: '2.96',
    }])
    expect(rows[0]?.date).toBe('2026-07-03')
    expect(rows[0]?.close).toBe(1116)
  })
})

describe('mapTencentFundFlowSeries', () => {
  it('merges today and history by date', () => {
    const rows = mapTencentFundFlowSeries('300308', {
      todayFundFlow: { mainNetIn: '100' },
      fiveDayFundFlow: {
        DayMainNetInList: [{ date: '2026-07-01', mainNetIn: '200' }],
      },
    })
    expect(rows.some(r => r.mainNet === 100)).toBe(true)
    expect(rows.some(r => r.date === '2026-07-01' && r.mainNet === 200)).toBe(true)
  })
})

describe('mapTencentPlateTagRows', () => {
  it('tags industry and concept separately', () => {
    const rows = mapTencentPlateTagRows('300308', {
      plate: [{ id: '1', name: '通信设备' }],
      concept: [{ id: '2', name: '5G概念', zdf: '1.2' }],
    })
    expect(rows.find(r => r.plateType === 'industry')?.plateName).toBe('通信设备')
    expect(rows.find(r => r.plateType === 'concept')?.plateName).toBe('5G概念')
  })
})

describe('mapTencentBigOrderRows', () => {
  it('maps dadan tuple rows', () => {
    const rows = mapTencentBigOrderRows('300308', {
      summary: { date: '20260707' },
      detail: [['15:00:00', '1121.90', '2113', 'S']],
    })
    expect(rows[0]?.side).toBe('S')
    expect(rows[0]?.date).toBe('2026-07-07')
  })
})

describe('mapTencentSmartboxStocks', () => {
  it('strips symbol prefix', () => {
    const rows = mapTencentSmartboxStocks([{ code: 'sz300308', name: '中际旭创', type: 'GP-A-CYB' }])
    expect(rows[0]?.code).toBe('300308')
  })
})

describe('parseTencentScopedMarket', () => {
  it('detects search and stock scopes', () => {
    expect(parseTencentScopedMarket('search:300308').kind).toBe('search')
    expect(parseTencentScopedMarket('stock:600519').value).toBe('600519')
    expect(parseTencentScopedMarket('cyb').kind).toBe('board')
  })
})

describe('mapTencentMinuteKlines', () => {
  it('builds minute bars with datetime', () => {
    const rows = mapTencentMinuteKlines('300308', ['0931 1098.56 9770 1072314709.32'], '2026-07-07')
    expect(rows[0]?.date).toBe('2026-07-07 09:31:00')
    expect(rows[0]?.close).toBe(1098.56)
  })
})

describe('tencent shenwan industry APIs', () => {
  it('maps industry board row with leading stock', () => {
    const rows = mapTencentIndustryBoardRows([{
      code: 'pt01801780',
      name: '银行',
      zxj: '3808.55',
      zdf: '0.20',
      stock_type: 'BK-HY-1',
      lzg: { code: 'sh601939', name: '建设银行', zdf: '2.59', zxj: '9.92' },
    }])
    expect(rows[0]?.industryCode).toBe('pt01801780')
    expect(rows[0]?.level).toBe(1)
    expect(rows[0]?.leadingStock).toMatchObject({ code: '601939', name: '建设银行', changePct: 2.59 })
  })

  it('maps industry constituent quote fields', () => {
    const rows = mapTencentIndustryConstituentRows([{
      code: 'sh601939',
      name: '建设银行',
      zxj: '9.92',
      zdf: '2.59',
      pe_ttm: '7.59',
    }])
    expect(rows[0]?.code).toBe('601939')
    expect(rows[0]?.price).toBe(9.92)
    expect(rows[0]?.peTtm).toBe(7.59)
  })

  it('resolves mstats level and sort params', () => {
    expect(resolveTencentIndustryBoardType('first')).toBe('hy')
    expect(resolveTencentIndustryBoardType('second')).toBe('hy2')
    expect(resolveTencentIndustrySortField(2)).toBe('price')
    expect(resolveTencentIndustrySortField(3)).toBe('priceRatio')
    expect(resolveTencentIndustrySortField('priceRatioD5')).toBe('priceRatioD5')
  })
})

describe('tencent global index rank API', () => {
  const sampleData = {
    common: [{ qtcode: 's_usDJI', code: 'DJI', name: '道琼斯', zxj: '100', zdf: '-1' }],
    america: [{ qtcode: 's_usDJI', code: 'DJI', name: '道琼斯', zxj: '100', zdf: '-1' }],
    europe: [{ qtcode: 's_ukFTSE', code: 'FTSE', name: '富时100', zxj: '200', zdf: '0.5' }],
    asia: [{ qtcode: 's_sh000001', code: '000001', name: '上证指数', zxj: '3000', zdf: '0.2' }],
    other: [{ qtcode: 's_auXJO', code: 'XJO', name: '澳大利亚标普200', zxj: '7000', zdf: '0.1' }],
  }

  it('dedupes ALL region by qtcode', () => {
    const rows = pickTencentGlobalIndexRows(sampleData, 'ALL')
    expect(rows).toHaveLength(4)
    expect(rows.some(r => r.code === 'DJI')).toBe(true)
  })

  it('filters single region bucket', () => {
    const rows = pickTencentGlobalIndexRows(sampleData, 'EU')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('富时100')
  })

  it('sorts by changePct desc and maps trade state', () => {
    const sorted = sortTencentGlobalIndexRows(
      pickTencentGlobalIndexRows(sampleData, 'ALL'),
      2,
      'desc',
    )
    expect(Number(sorted[0]?.zdf)).toBeGreaterThan(Number(sorted.at(-1)?.zdf))
    const mapped = mapTencentGlobalIndexRankRows(sorted.slice(0, 1), 'ALL')
    expect(mapped[0]).toMatchObject({
      code: 'FTSE',
      tradeStateLabel: '--',
      market: 'global',
    })
  })
})

describe('tencent global futures API', () => {
  const sampleData = {
    agriculture: [{ qtcode: 'fuZC', code: 'ZC', name: 'CBOT玉米', zxj: '461.25', zde: '-3', zdf: '-0.65', state: 'open' }],
    energy: [{ qtcode: 'fuCL', code: 'CL', name: 'WTI原油', zxj: '72.13', zde: '1.69', zdf: '2.40', state: 'open' }],
    preciousMetal: [{ qtcode: 'fuGC', code: 'GC', name: 'COMEX黄金', zxj: '4132.9', zde: '-24.5', zdf: '-0.59', state: 'open' }],
  }

  it('merges ALL categories in mstats order', () => {
    const rows = pickTencentGlobalFuturesRows(sampleData, 'ALL')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.code).toBe('ZC')
  })

  it('filters single category bucket', () => {
    const rows = pickTencentGlobalFuturesRows(sampleData, 'energy')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('WTI原油')
  })

  it('sorts by changePct and maps fields', () => {
    const sorted = sortTencentGlobalFuturesRows(
      pickTencentGlobalFuturesRows(sampleData, 'ALL'),
      3,
      'desc',
    )
    expect(Number(sorted[0]?.zdf)).toBeGreaterThan(Number(sorted.at(-1)?.zdf))
    const mapped = mapTencentGlobalFuturesRows(sorted.slice(0, 1), 'energy')
    expect(mapped[0]).toMatchObject({
      code: 'CL',
      market: 'global_futures',
      tradeStateLabel: '开市',
      categoryLabel: '能源',
    })
  })

  it('resolves category aliases', () => {
    expect(resolveTencentGlobalFuturesCategory('能源')).toBe('energy')
    expect(resolveTencentGlobalFuturesCategory('preciousMetal')).toBe('preciousMetal')
  })
})

describe('tencent cn index snapshot API', () => {
  it('maps qt index parts and resolves preset', async () => {
    const { pickTencentCnIndexSymbols, resolveTencentCnIndexPreset, mapTencentCnIndexSnapshotRows } =
      await import('../src/providers/tencent/api/cn-index-service.js')
    expect(resolveTencentCnIndexPreset('mstats_home')).toBe('mstats_home')
    expect(pickTencentCnIndexSymbols({ preset: 'major' })).toContain('sh000001')
    expect(pickTencentCnIndexSymbols({ preset: 'mstats_home' })).toContain('r_hkHSI')
    const mapped = mapTencentCnIndexSnapshotRows([{
      qtCode: 'sh000001',
      code: '000001',
      name: '上证指数',
      price: 3996.81,
      preClose: 3990.24,
      open: 3996.81,
      high: 3996.81,
      low: 3990.24,
      changeAmt: 6.57,
      changePct: 0.16,
      volume: 3462322,
      amount: 8048267553,
      quoteTime: '09:27',
      market: 'CN',
    }])
    expect(mapped[0]).toMatchObject({
      code: '000001',
      qtCode: 'sh000001',
      market: 'CN',
      source: 'tencent_qt_index',
    })
  })
})

describe('tencent industry heat API', () => {
  it('maps heat rows and resolves type/order', async () => {
    const {
      mapTencentIndustryHeatRows,
      mapTencentIndustryHeatOutputRows,
      resolveTencentIndustryHeatType,
      resolveTencentIndustryHeatOrder,
    } = await import('../src/providers/tencent/api/industry-heat-service.js')
    expect(resolveTencentIndustryHeatType('01/averatio')).toBe('01/averatio')
    expect(resolveTencentIndustryHeatOrder('asc')).toBe('1')
    expect(resolveTencentIndustryHeatOrder('desc')).toBe('0')
    const rows = mapTencentIndustryHeatRows([{
      bd_name: '旅游及景区',
      bd_code: 'pt01801993',
      bd_zxj: '1853.63',
      bd_zdf: '3.33',
      nzg_code: 'sz000524',
      nzg_name: '岭南控股',
      nzg_zdf: '10.06',
    }])
    expect(rows[0]?.boardName).toBe('旅游及景区')
    expect(rows[0]?.leadingCode).toBe('000524')
    const out = mapTencentIndustryHeatOutputRows(rows, 'averatio', '0')
    expect(out[0]).toMatchObject({
      industryCode: 'pt01801993',
      leadingStock: { code: '000524', name: '岭南控股', changePct: 10.06 },
      source: 'tencent_industry_heat',
    })
  })
})

describe('tencent HK stock list API', () => {
  it('resolves board and maps hk rank page_data rows', async () => {
    const {
      resolveTencentHkBoard,
      resolveTencentHkSortMetric,
      mapTencentHkStockRows,
    } = await import('../src/providers/tencent/api/hk-rank-service.js')
    expect(resolveTencentHkBoard('MB')).toBe('main_all')
    expect(resolveTencentHkBoard('GEM')).toBe('gem_all')
    expect(resolveTencentHkSortMetric(32)).toBe('change_rate')
    expect(resolveTencentHkSortMetric('price')).toBe('price')
    const mapped = mapTencentHkStockRows([{
      code: '00700',
      name: '腾讯控股',
      price: 520.5,
      preClose: 515,
      open: 516,
      high: 522,
      low: 514,
      buy: 520,
      sell: 520.5,
      changeAmt: 5.5,
      changePct: 1.07,
      volume: 12000000,
      amount: 6200000000,
      market: 'HK',
    }])
    expect(mapped[0]).toMatchObject({
      code: '00700',
      market: 'HK',
      source: 'tencent_hk_rank',
    })
  })
})

describe('tencent exchange rate API', () => {
  const sampleRows = [
    {
      symbol: 'whUSDCNY',
      pair: 'USDCNY',
      name: '美元人民币',
      price: 6.7942,
      preClose: 6.7924,
      open: 6.791,
      high: 6.7996,
      low: 6.7867,
      bid: 6.7942,
      ask: 6.7975,
      changeAmt: 0.0018,
      changePct: 0.03,
      quoteTime: '02:59',
      category: 'BASE' as const,
    },
    {
      symbol: 'whEURJPY',
      pair: 'EURJPY',
      name: '欧元/日元',
      price: 185.14,
      preClose: 184.84,
      open: 184.84,
      high: 185.21,
      low: 184.83,
      bid: 185.14,
      ask: 185.24,
      changeAmt: 0.3,
      changePct: 0.16,
      quoteTime: '09:09',
      category: 'CROSS' as const,
    },
  ]

  it('resolves category and forex symbol', async () => {
    const { resolveTencentExchangeRateCategory, resolveTencentForexSymbol } =
      await import('../src/providers/tencent/api/exchange-rate-service.js')
    expect(resolveTencentExchangeRateCategory('基本汇率')).toBe('BASE')
    expect(resolveTencentExchangeRateCategory('cross')).toBe('CROSS')
    expect(resolveTencentForexSymbol('USDCNY')).toBe('whUSDCNY')
    expect(resolveTencentForexSymbol('eurjpy')).toBe('whEURJPY')
  })

  it('sorts by changePct desc and maps forex fields', async () => {
    const { sortTencentExchangeRateRows, mapTencentExchangeRateRows } =
      await import('../src/providers/tencent/api/exchange-rate-service.js')
    const sorted = sortTencentExchangeRateRows(sampleRows, 3, 'desc')
    expect(sorted[0]?.pair).toBe('EURJPY')
    const mapped = mapTencentExchangeRateRows(sorted.slice(0, 1), 'ALL')
    expect(mapped[0]).toMatchObject({
      code: 'EURJPY',
      qtCode: 'whEURJPY',
      market: 'forex',
      categoryLabel: '交叉汇率',
      source: 'tencent_wh_forex',
    })
  })
})
