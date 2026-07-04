import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock fetch globally ──
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Map(),
  } as unknown as Response
}

// ═══════════════════════════════════════════════════════════════
// MiscDataHandler tests
// ═══════════════════════════════════════════════════════════════

describe('MiscDataHandler — new interfaces', () => {
  let handler: Awaited<typeof import('../src/providers/misc-data/markets/cn/handler')>['MiscDataHandler']

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/providers/misc-data/markets/cn/handler')
    handler = new mod.MiscDataHandler()
  })

  describe('szseSectorSummary', () => {
    it('returns SZSE sector data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [{ item: '制造业', amount: 1000 }] }))
      const result = await handler.szseSectorSummary()
      expect(result).toEqual([{ item: '制造业', amount: 1000 }])
    })

    it('returns null on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'))
      const result = await handler.szseSectorSummary()
      expect(result).toBeNull()
    })
  })

  describe('marginDetailSzse', () => {
    it('returns SZSE margin data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        result: { data: [{ SECURITY_CODE: '000001', MARGIN_BALANCE: 1e9 }] },
      }))
      const result = await handler.marginDetailSzse()
      expect(result).toEqual([{ SECURITY_CODE: '000001', MARGIN_BALANCE: 1e9 }])
    })

    it('returns null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('timeout'))
      const result = await handler.marginDetailSzse()
      expect(result).toBeNull()
    })
  })

  describe('stockTradeSuspension', () => {
    it('returns suspension data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        result: { data: [{ SECURITY_CODE: '000001', SUSPEND_START_DATE: '2025-01-01' }] },
      }))
      const result = await handler.stockTradeSuspension()
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ SECURITY_CODE: '000001' }),
      ]))
    })
  })

  describe('goodwillMarketOverview', () => {
    it('returns goodwill overview', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        result: { data: [{ GOODWILL_MARKET_CAP: 5e11 }] },
      }))
      const result = await handler.goodwillMarketOverview()
      expect(result).toHaveLength(1)
    })
  })

  describe('goodwillDetail', () => {
    it('returns per-stock goodwill', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        result: { data: [{ SECURITY_CODE: '000001', GOODWILL: 1e9 }] },
      }))
      const result = await handler.goodwillDetail('000001')
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ SECURITY_CODE: '000001' }),
      ]))
    })

    it('returns null for empty code', async () => {
      const result = await handler.goodwillDetail('')
      expect(result).toBeNull()
    })
  })

  describe('accountStatistics', () => {
    it('returns account stats', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        result: { data: [{ STATISTICS_DATE: '2025-01', NEW_ACCOUNTS: 500000 }] },
      }))
      const result = await handler.accountStatistics()
      expect(result).toHaveLength(1)
    })
  })

  describe('riskStockList', () => {
    it('returns risk stock list', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        result: { data: [{ SECURITY_CODE: '000001' }] },
      }))
      const result = await handler.riskStockList()
      expect(result).toHaveLength(1)
    })
  })

  describe('twoNetList', () => {
    it('returns delisted stocks', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        result: { data: [{ SECURITY_CODE: '000001' }] },
      }))
      const result = await handler.twoNetList()
      expect(result).toHaveLength(1)
    })
  })

  describe('blockTradeMarketStats', () => {
    it('returns block trade stats', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        result: { data: [{ TRADE_DATE: '2025-01-01', TOTAL_AMOUNT: 1e10 }] },
      }))
      const result = await handler.blockTradeMarketStats()
      expect(result).toHaveLength(1)
    })
  })

  describe('shareholderChangeStats', () => {
    it('returns shareholder change data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        result: { data: [{ SECURITY_CODE: '000001', HOLDNUM_CHANGE_RATE: 10 }] },
      }))
      const result = await handler.shareholderChangeStats()
      expect(result).toHaveLength(1)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// EastMoney research methods tests
// ═══════════════════════════════════════════════════════════════

describe('EastMoney research — new interfaces', () => {
  let driver: Awaited<typeof import('../src/providers/eastmoney/driver')>['EastMoneyDriver']

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/providers/eastmoney/driver')
    driver = new mod.EastMoneyDriver()
  })

  // Helper: mock the dcFetch chain (dcAll calls this)
  function mockDcFetch(data: Record<string, unknown>[]) {
    // dcFetch calls fetchDataCenterReport which calls fetch
    mockFetch.mockResolvedValueOnce(jsonResponse({
      result: { data, count: data.length },
    }))
  }

  describe('stockRankCxgThs', () => {
    it('returns new-high stock list', async () => {
      mockDcFetch([{ SECURITY_CODE: '600001', SECURITY_NAME_ABBR: '测试', CLOSE_PRICE: 10, CHANGE_RATE: 5 }])
      const result = await driver.stockRankCxgThs()
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: '600001', name: '测试' }),
      ]))
    })
  })

  describe('stockRankCxdThs', () => {
    it('returns new-low stock list', async () => {
      mockDcFetch([{ SECURITY_CODE: '600002', SECURITY_NAME_ABBR: '测试B', CLOSE_PRICE: 5, CHANGE_RATE: -3 }])
      const result = await driver.stockRankCxdThs()
      expect(result).toHaveLength(1)
    })
  })

  describe('stockRankLxszThs', () => {
    it('returns consecutive up list', async () => {
      mockDcFetch([{ SECURITY_CODE: '600003', CLOSE_PRICE: 20, CONSECUTIVE_DAYS: 5 }])
      const result = await driver.stockRankLxszThs()
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: '600003', consecutiveDays: 5 }),
      ]))
    })
  })

  describe('stockRankLxxdThs', () => {
    it('returns consecutive down list', async () => {
      mockDcFetch([{ SECURITY_CODE: '600004', CLOSE_PRICE: 8, CONSECUTIVE_DAYS: 3 }])
      const result = await driver.stockRankLxxdThs()
      expect(result).toHaveLength(1)
    })
  })

  describe('stockRankCxflThs', () => {
    it('returns vol increase list', async () => {
      mockDcFetch([{ SECURITY_CODE: '600005', VOLUME_RATIO: 2.5 }])
      const result = await driver.stockRankCxflThs()
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: '600005', volumeRatio: 2.5 }),
      ]))
    })
  })

  describe('stockRankCxslThs', () => {
    it('returns vol decrease list', async () => {
      mockDcFetch([{ SECURITY_CODE: '600006', VOLUME_RATIO: 0.3 }])
      const result = await driver.stockRankCxslThs()
      expect(result).toHaveLength(1)
    })
  })

  describe('stockRankXstpThs', () => {
    it('returns breakout-up list', async () => {
      mockDcFetch([{ SECURITY_CODE: '600007', CHANGE_RATE: 3 }])
      const result = await driver.stockRankXstpThs()
      expect(result).toHaveLength(1)
    })
  })

  describe('stockRankXxtpThs', () => {
    it('returns breakout-down list', async () => {
      mockDcFetch([{ SECURITY_CODE: '600008', CHANGE_RATE: -2 }])
      const result = await driver.stockRankXxtpThs()
      expect(result).toHaveLength(1)
    })
  })

  describe('stockRankLjqsThs', () => {
    it('returns vol-price up list', async () => {
      mockDcFetch([{ SECURITY_CODE: '600009', CHANGE_RATE: 4 }])
      const result = await driver.stockRankLjqsThs()
      expect(result).toHaveLength(1)
    })
  })

  describe('stockRankLjqdThs', () => {
    it('returns vol-price down list', async () => {
      mockDcFetch([{ SECURITY_CODE: '600010', CHANGE_RATE: -3 }])
      const result = await driver.stockRankLjqdThs()
      expect(result).toHaveLength(1)
    })
  })

  describe('stockBidAsk', () => {
    it('returns bid/ask data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { f43: 1050, f57: '000001', f58: '平安银行', f170: 120 },
      }))
      const result = await driver.stockBidAsk('000001')
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: '000001', name: '平安银行' }),
      ]))
    })
  })

  describe('stockFinancialReportDisclosure', () => {
    it('returns report disclosure dates', async () => {
      mockDcFetch([{ SECURITY_CODE: '000001', SECURITY_NAME_ABBR: '平安', REPORT_DATE: '2025-03-31', DISCLOSURE_DATE: '2025-04-30' }])
      const result = await driver.stockFinancialReportDisclosure('000001')
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: '000001', disclosureDate: '2025-04-30' }),
      ]))
    })
  })

  describe('stockGoodwillDetail', () => {
    it('returns goodwill detail', async () => {
      mockDcFetch([{ SECURITY_CODE: '000001', GOODWILL: 1e9, REPORT_DATE: '2025-03-31' }])
      const result = await driver.stockGoodwillDetail('000001')
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: '000001', goodwill: 1e9 }),
      ]))
    })
  })

  describe('stockGoodwillIndustry', () => {
    it('returns industry goodwill', async () => {
      mockDcFetch([{ INDUSTRY_NAME: '房地产', GOODWILL: 5e10 }])
      const result = await driver.stockGoodwillIndustry()
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ industry: '房地产' }),
      ]))
    })
  })

  describe('stockPledgeStats', () => {
    it('returns pledge stats', async () => {
      mockDcFetch([{ TRADE_DATE: '2025-01-01', PLEDGE_RATIO: 15 }])
      const result = await driver.stockPledgeStats()
      expect(result).toHaveLength(1)
    })
  })

  describe('stockPledgeCompanyStats', () => {
    it('returns company pledge ratios', async () => {
      mockDcFetch([{ SECURITY_CODE: '000001', PLEDGE_RATIO: 30 }])
      const result = await driver.stockPledgeCompanyStats()
      expect(result).toHaveLength(1)
    })
  })

  describe('stockAnalystRank', () => {
    it('returns analyst rankings', async () => {
      mockDcFetch([{ RANK: 1, ANALYST_NAME: '张三', ORG_NAME: '中信' }])
      const result = await driver.stockAnalystRank()
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ analystName: '张三', orgName: '中信' }),
      ]))
    })
  })

  describe('blockTradeActiveStats', () => {
    it('returns active brokerage stats', async () => {
      mockDcFetch([{ BROKERAGE_NAME: '中信证券', TRADE_COUNT: 50 }])
      const result = await driver.blockTradeActiveStats()
      expect(result).toHaveLength(1)
    })
  })

  describe('blockTradeBranchRank', () => {
    it('returns branch rankings', async () => {
      mockDcFetch([{ RANK: 1, BRANCH_NAME: '上海分公司' }])
      const result = await driver.blockTradeBranchRank()
      expect(result).toHaveLength(1)
    })
  })

  describe('stockAhList', () => {
    it('returns A+H stock list', async () => {
      mockDcFetch([{ SECURITY_CODE: '601318', SECURITY_NAME_ABBR: '中国平安', AH_PREMIUM_RATIO: 25 }])
      const result = await driver.stockAhList()
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: '601318', ahPremiumRatio: 25 }),
      ]))
    })
  })

  describe('stockBShareList', () => {
    it('returns B-share list', async () => {
      mockDcFetch([{ SECURITY_CODE: '200001', SECURITY_NAME_ABBR: '万科B', CURRENCY: 'HKD' }])
      const result = await driver.stockBShareList()
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: '200001', currency: 'HKD' }),
      ]))
    })
  })

  describe('hkConnectHoldings', () => {
    it('returns HK Connect holdings', async () => {
      mockDcFetch([{ SECURITY_CODE: '000001', HOLD_SHARES: 1e8, HOLD_SHARES_RATIO: 5 }])
      const result = await driver.hkConnectHoldings('000001')
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: '000001', heldShares: 1e8 }),
      ]))
    })
  })

  describe('hkConnectTop10', () => {
    it('returns top 10 HK Connect', async () => {
      mockDcFetch([{ SECURITY_CODE: '000001', HOLD_SHARES: 1e8 }])
      const result = await driver.hkConnectTop10()
      expect(result).toHaveLength(1)
    })
  })

  describe('marginTradeSz', () => {
    it('returns SZ margin trade data', async () => {
      mockDcFetch([{ SECURITY_CODE: '000001', MARGIN_BALANCE: 5e8 }])
      const result = await driver.marginTradeSz('000001')
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: '000001', marginBalance: 5e8 }),
      ]))
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Error handling tests
// ═══════════════════════════════════════════════════════════════

describe('Error handling', () => {
  let miscHandler: Awaited<typeof import('../src/providers/misc-data/markets/cn/handler')>['MiscDataHandler']
  let emDriver: Awaited<typeof import('../src/providers/eastmoney/driver')>['EastMoneyDriver']

  beforeEach(async () => {
    vi.clearAllMocks()
    const miscMod = await import('../src/providers/misc-data/markets/cn/handler')
    miscHandler = new miscMod.MiscDataHandler()
    const emMod = await import('../src/providers/eastmoney/driver')
    emDriver = new emMod.EastMoneyDriver()
  })

  it('misc-data methods return null on network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const results = await Promise.all([
      miscHandler.marginDetailSzse(),
      miscHandler.stockTradeSuspension(),
      miscHandler.goodwillMarketOverview(),
      miscHandler.accountStatistics(),
      miscHandler.riskStockList(),
      miscHandler.twoNetList(),
      miscHandler.blockTradeMarketStats(),
      miscHandler.shareholderChangeStats(),
    ])
    for (const r of results) {
      expect(r).toBeNull()
    }
  })

  it('misc-data methods return null or empty on HTTP error', async () => {
    // dcGet parses JSON regardless of status code; returns [] for malformed/empty responses
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ result: null }) })
    const result = await miscHandler.marginDetailSzse()
    expect(result === null || (Array.isArray(result) && result.length === 0)).toBe(true)
  })

  it('eastmoney tech rank methods handle empty response', async () => {
    // eastmoneyGet returns null for empty/malformed responses
    mockFetch.mockResolvedValue(jsonResponse({ data: null }))
    const r = await emDriver.stockRankCxgThs()
    expect(r === null || Array.isArray(r)).toBe(true)
  })
})
