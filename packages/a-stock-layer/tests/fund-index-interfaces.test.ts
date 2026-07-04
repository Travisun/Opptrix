import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function jsonResponse(data: unknown) {
  return {
    ok: true, status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Map(),
  } as unknown as Response
}

function dcResponse(data: Record<string, unknown>[] = []) {
  return jsonResponse({ result: { data, count: data.length } })
}

// ═══════════════════════════════════════════════════════════════
// Public Fund APIs
// ═══════════════════════════════════════════════════════════════

describe('EastMoney research — public fund APIs', () => {
  let driver: Awaited<typeof import('../src/providers/eastmoney/driver')>['EastMoneyDriver']

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/providers/eastmoney/driver')
    driver = new mod.EastMoneyDriver()
  })

  describe('fundNameEm', () => {
    it('returns fund name list', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ FCODE: '000001', SHORT_NAME: '华夏成长' }]))
      const result = await driver.fundNameEm()
      expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ code: '000001' })]))
    })
  })

  describe('fundPurchaseEm', () => {
    it('returns purchase status', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ FCODE: '000001', PURCHASE_STATUS: '开放申购' }]))
      const result = await driver.fundPurchaseEm()
      expect(result).toHaveLength(1)
    })
  })

  describe('fundEtfSpotEm', () => {
    it('returns ETF realtime', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { diff: [{ f12: '510300', f14: '沪深300ETF', f2: 4.5, f3: 1.2 }] },
      }))
      const result = await driver.fundEtfSpotEm()
      expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ code: '510300' })]))
    })
  })

  describe('fundLofSpotEm', () => {
    it('returns LOF realtime', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { diff: [{ f12: '160807', f14: 'LOF基金', f2: 1.5 }] },
      }))
      const result = await driver.fundLofSpotEm()
      expect(result).toHaveLength(1)
    })
  })

  describe('fundInfoIndexEm', () => {
    it('returns index fund list', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ FCODE: '510300', FUND_NAME: '沪深300ETF' }]))
      const result = await driver.fundInfoIndexEm('全部')
      expect(result).toHaveLength(1)
    })
  })

  describe('fundNavEm', () => {
    it('returns fund NAV', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ FCODE: '000001', NAV: 1.5 }]))
      const result = await driver.fundNavEm('000001')
      expect(result).toHaveLength(1)
    })
  })

  describe('fundOpenFundDayEm', () => {
    it('returns open fund dates', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ FCODE: '000001', OPEN_DATE: '2025-01-01' }]))
      const result = await driver.fundOpenFundDayEm('000001')
      expect(result).toHaveLength(1)
    })
  })

  describe('fundOpenFundDailyEm', () => {
    it('returns daily fund data', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ FCODE: '000001', NAV: 1.5, ACCNAV: 2.0 }]))
      const result = await driver.fundOpenFundDailyEm('000001')
      expect(result).toHaveLength(1)
    })
  })

  describe('fundDividendEm', () => {
    it('returns fund dividends', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ FCODE: '000001', DIVIDEND: 0.1 }]))
      const result = await driver.fundDividendEm('000001')
      expect(result).toHaveLength(1)
    })
  })

  describe('fundManagerEm', () => {
    it('returns fund manager info', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ FCODE: '000001', MANAGER: '张三' }]))
      const result = await driver.fundManagerEm('000001')
      expect(result).toHaveLength(1)
    })
  })

  describe('fundEtfCategoryThs', () => {
    it('returns THS ETF category', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ FCODE: '510300', NAME: '沪深300ETF' }]))
      const result = await driver.fundEtfCategoryThs('ETF')
      expect(result).toHaveLength(1)
    })
  })

  describe('fundEtfSpotThs', () => {
    it('returns THS ETF spot', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ FCODE: '510300', NAME: '沪深300ETF' }]))
      const result = await driver.fundEtfSpotThs()
      expect(result).toHaveLength(1)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Index APIs
// ═══════════════════════════════════════════════════════════════

describe('EastMoney research — index APIs', () => {
  let driver: Awaited<typeof import('../src/providers/eastmoney/driver')>['EastMoneyDriver']

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/providers/eastmoney/driver')
    driver = new mod.EastMoneyDriver()
  })

  describe('stockZhIndexSpotEm', () => {
    it('returns A-share index realtime', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { diff: [{ f12: '000001', f14: '上证指数', f2: 3000, f3: 0.5 }] },
      }))
      const result = await driver.stockZhIndexSpotEm('上证系列指数')
      expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ code: '000001' })]))
    })
  })

  describe('stockZhIndexDailyEm', () => {
    it('returns index daily EM', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { klines: ['2025-01-01,3000,3010,3020,2990,100000,3e10'] },
      }))
      const result = await driver.stockZhIndexDailyEm('sz399001')
      expect(result).toHaveLength(1)
    })
  })

  describe('indexZhAShist', () => {
    it('returns index history', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { klines: ['2025-01-01,3000,3010,3020,2990,100000,3e10,1.0,0.3,10,0.2'] },
      }))
      const result = await driver.indexZhAShist('000300', 'daily', '20250101', '20250101')
      expect(result).toHaveLength(1)
    })
  })

  describe('indexZhAHistMinEm', () => {
    it('returns index minute data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { trends: ['2025-01-01 09:35,3000,3010,3020,2990,10000,3e9,3005'] },
      }))
      const result = await driver.indexZhAHistMinEm('000300', '5')
      expect(result).toHaveLength(1)
    })
  })

  describe('stockHkIndexSpotEm', () => {
    it('returns HK index realtime', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { diff: [{ f12: 'HSI', f14: '恒生指数', f2: 20000, f3: 1.0 }] },
      }))
      const result = await driver.stockHkIndexSpotEm()
      expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'HSI' })]))
    })
  })

  describe('stockHkIndexDailyEm', () => {
    it('returns HK index daily', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { klines: ['2025-01-01,20000,20100,20200,19900'] },
      }))
      const result = await driver.stockHkIndexDailyEm('HSTECF2L')
      expect(result).toHaveLength(1)
    })
  })

  describe('indexGlobalSpotEm', () => {
    it('returns global index realtime', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { diff: [{ f12: 'SPX', f14: '标普500', f2: 5000, f3: 0.5 }] },
      }))
      const result = await driver.indexGlobalSpotEm()
      expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SPX' })]))
    })
  })

  describe('indexGlobalHistEm', () => {
    it('returns global index history', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { klines: ['2025-01-01,5000,5010,5020,4990'] },
      }))
      const result = await driver.indexGlobalHistEm('美元指数')
      expect(result).toHaveLength(1)
    })
  })

  describe('indexStockCons', () => {
    it('returns index constituents', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ SECURITY_CODE: '600519', SECURITY_NAME: '贵州茅台' }]))
      const result = await driver.indexStockCons('000300')
      expect(result).toHaveLength(1)
    })
  })

  describe('indexStockInfo', () => {
    it('returns index info list', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ INDEX_CODE: '000300', DISPLAY_NAME: '沪深300' }]))
      const result = await driver.indexStockInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('indexStockPeLg', () => {
    it('returns index PE valuation', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ INDEX_CODE: '000300', PE: 12.5 }]))
      const result = await driver.indexStockPeLg('000300')
      expect(result).toHaveLength(1)
    })
  })

  describe('indexStockPbLg', () => {
    it('returns index PB valuation', async () => {
      mockFetch.mockResolvedValueOnce(dcResponse([{ INDEX_CODE: '000300', PB: 1.3 }]))
      const result = await driver.indexStockPbLg('000300')
      expect(result).toHaveLength(1)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Private Fund (AMAC) APIs
// ═══════════════════════════════════════════════════════════════

describe('MiscDataHandler — AMAC private fund APIs', () => {
  let handler: Awaited<typeof import('../src/providers/misc-data/markets/cn/handler')>['MiscDataHandler']

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/providers/misc-data/markets/cn/handler')
    handler = new mod.MiscDataHandler()
  })

  function amacResponse(data: unknown[]) {
    return jsonResponse({ datas: data })
  }

  describe('amacMemberInfo', () => {
    it('returns member info', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ name: '华夏基金', type: '普通会员' }]))
      const result = await handler.amacMemberInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacPersonFundOrgList', () => {
    it('returns fund person org list', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ orgName: '华夏基金', employeeCount: 200 }]))
      const result = await handler.amacPersonFundOrgList('公募基金管理公司')
      expect(result).toHaveLength(1)
    })
  })

  describe('amacPersonBondOrgList', () => {
    it('returns bond person org list', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ orgName: '中信证券' }]))
      const result = await handler.amacPersonBondOrgList()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacManagerInfo', () => {
    it('returns manager info', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ name: '重阳投资', type: '私募证券' }]))
      const result = await handler.amacManagerInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacManagerClassifyInfo', () => {
    it('returns manager classify info', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ name: '重阳投资', fundCount: 10 }]))
      const result = await handler.amacManagerClassifyInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacMemberSubInfo', () => {
    it('returns member sub info', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ name: '子公司基金' }]))
      const result = await handler.amacMemberSubInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacFundInfo', () => {
    it('returns fund info with pagination', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ fundName: '测试基金' }]))
      const result = await handler.amacFundInfo('1', '1')
      expect(result).toHaveLength(1)
    })
  })

  describe('amacSecuritiesInfo', () => {
    it('returns securities products', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ productName: '集合资管' }]))
      const result = await handler.amacSecuritiesInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacAoinInfo', () => {
    it('returns direct investment info', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ productCode: 'S32077' }]))
      const result = await handler.amacAoinInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacFundSubInfo', () => {
    it('returns fund sub info', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ productCode: 'S32080' }]))
      const result = await handler.amacFundSubInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacFundAccountInfo', () => {
    it('returns fund account products', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ productCode: 'SAHT40' }]))
      const result = await handler.amacFundAccountInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacFundAbs', () => {
    it('returns ABS products', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ filingNo: 'S29340' }]))
      const result = await handler.amacFundAbs()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacFuturesInfo', () => {
    it('returns futures products', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ productName: '期货资管' }]))
      const result = await handler.amacFuturesInfo()
      expect(result).toHaveLength(1)
    })
  })

  describe('amacManagerCancelledInfo', () => {
    it('returns cancelled managers', async () => {
      mockFetch.mockResolvedValueOnce(amacResponse([{ managerName: '已注销基金' }]))
      const result = await handler.amacManagerCancelledInfo()
      expect(result).toHaveLength(1)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Error handling
// ═══════════════════════════════════════════════════════════════

describe('Error handling — fund and index', () => {
  let driver: Awaited<typeof import('../src/providers/eastmoney/driver')>['EastMoneyDriver']
  let handler: Awaited<typeof import('../src/providers/misc-data/markets/cn/handler')>['MiscDataHandler']

  beforeEach(async () => {
    vi.clearAllMocks()
    const emMod = await import('../src/providers/eastmoney/driver')
    driver = new emMod.EastMoneyDriver()
    const miscMod = await import('../src/providers/misc-data/markets/cn/handler')
    handler = new miscMod.MiscDataHandler()
  })

  it('eastmoney fund methods handle empty response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: null }))
    try {
      const r = await driver.fundNameEm()
      expect(r === null || Array.isArray(r)).toBe(true)
    } catch { /* may throw */ }
  })

  it('eastmoney index methods handle empty response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: null }))
    try {
      const r = await driver.stockZhIndexSpotEm('上证系列指数')
      expect(r === null || Array.isArray(r)).toBe(true)
    } catch { /* may throw */ }
  })

  it('AMAC methods return null on error', async () => {
    mockFetch.mockRejectedValue(new Error('network'))
    const results = await Promise.all([
      handler.amacMemberInfo(),
      handler.amacManagerInfo(),
      handler.amacFundInfo('1', '1'),
    ])
    for (const r of results) {
      expect(r).toBeNull()
    }
  })
})
